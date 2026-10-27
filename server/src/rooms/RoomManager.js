import { randomUUID } from 'node:crypto';
import {
  createCar,
  DEFAULT_MAP_ID,
  GameError,
  getRaceOrder,
  getTrack,
  LAPS_TO_WIN,
  MAPS,
  RACE_TICK_MS,
  stepCar,
  updateCheckpoints,
  validateControls,
} from '../games/race.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 7;
const ROOM_CODE_LENGTH = 5;

export class RoomError extends Error {
  constructor(message, code = 'INVALID_ACTION') {
    super(message);
    this.name = 'RoomError';
    this.code = code;
  }
}

export class RoomManager {
  constructor({ onUpdate = () => {}, onStats = () => {}, now = Date.now, random = Math.random } = {}) {
    this.rooms = new Map();
    this.onUpdate = onUpdate;
    this.onStats = onStats;
    this.now = now;
    this.random = random;
  }

  createRoom(nickname, token, socketId) {
    const normalizedName = this.validateNickname(nickname);
    this.validateToken(token);
    let code = this.generateCode();
    while (this.rooms.has(code)) code = this.generateCode();

    const room = {
      code,
      status: 'lobby',
      players: [],
      hostId: null,
      selectedMapId: DEFAULT_MAP_ID,
      finishingOrder: [],
      countdown: null,
      startedAt: null,
      goUntil: null,
      countdownTimer: null,
      raceTimer: null,
    };
    const player = this.makePlayer(normalizedName, token, socketId, 0);
    room.players.push(player);
    room.hostId = player.id;
    this.rooms.set(code, room);
    this.notify(room);
    return { room: this.serialize(room), playerId: player.id, code };
  }

  joinRoom(codeInput, nickname, token, socketId) {
    const code = this.validateCode(codeInput);
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('Room not found. Check the five-character code.', 'ROOM_NOT_FOUND');
    if (room.status !== 'lobby') throw new RoomError('This room has already started.', 'ROOM_STARTED');

    const normalizedName = this.validateNickname(nickname);
    this.validateToken(token);
    const existing = room.players.find((player) => player.token === token);
    if (existing) {
      if (existing.connected) throw new RoomError('This player is already in the room.', 'ALREADY_JOINED');
      existing.socketId = socketId;
      existing.connected = true;
      existing.disconnectedAt = null;
      this.notify(room);
      return { room: this.serialize(room), playerId: existing.id, code };
    }

    if (room.players.some((player) => player.nickname.toLowerCase() === normalizedName.toLowerCase())) {
      throw new RoomError('That nickname is already in use in this room.', 'DUPLICATE_NAME');
    }
    if (room.players.length >= MAX_PLAYERS) throw new RoomError('This room is full (maximum 7 players).', 'ROOM_FULL');

    const player = this.makePlayer(normalizedName, token, socketId, room.players.length);
    room.players.push(player);
    this.notify(room);
    return { room: this.serialize(room), playerId: player.id, code };
  }

  reconnectRoom(codeInput, token, socketId) {
    const code = this.validateCode(codeInput);
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('Your previous room no longer exists.', 'ROOM_NOT_FOUND');
    this.validateToken(token);
    const player = room.players.find((entry) => entry.token === token);
    if (!player) throw new RoomError('Your player session could not be restored.', 'PLAYER_NOT_FOUND');
    if (player.connected) throw new RoomError('This player is already connected.', 'ALREADY_JOINED');
    if (room.status === 'finished' && player.disconnected) {
      throw new RoomError('The race ended before you reconnected.', 'RACE_DISCONNECTED');
    }
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    player.disconnected = false;
    if (player.car) {
      player.car.disconnected = false;
      player.car.throttle = false;
      player.car.brake = false;
      player.car.steer = 0;
    }
    this.notify(room);
    return { room: this.serialize(room), playerId: player.id, code };
  }

  startRace(code, playerId, socketId) {
    const room = this.getMemberRoom(code, playerId, socketId);
    if (room.status !== 'lobby') throw new RoomError('The race can only start from the lobby.', 'ROOM_STARTED');
    if (room.hostId !== playerId) throw new RoomError('Only the host can start the race.', 'HOST_ONLY');
    if (room.players.filter((player) => player.connected).length < 2) {
      throw new RoomError('At least two connected players are needed to start.', 'NEED_MORE_PLAYERS');
    }

    room.status = 'countdown';
    room.countdown = 3;
    room.finishingOrder = [];
    const track = getTrack(room.selectedMapId);
    room.players.forEach((player, index) => {
      player.car = createCar(player.id, player.nickname, index, track);
      player.disconnected = !player.connected;
      player.car.disconnected = player.disconnected;
    });
    room.countdownTimer = setInterval(() => {
      if (!this.rooms.has(room.code) || room.status !== 'countdown') return;
      if (room.countdown > 1) {
        room.countdown -= 1;
      } else {
        room.countdown = 0;
        room.status = 'racing';
        room.startedAt = this.now();
        room.goUntil = room.startedAt + 900;
        clearInterval(room.countdownTimer);
        room.countdownTimer = null;
        room.raceTimer = setInterval(() => this.tick(room), RACE_TICK_MS);
      }
      this.notify(room);
    }, 1000);
    this.notify(room);
    return this.serialize(room);
  }

  selectMap(code, playerId, socketId, mapId) {
    const room = this.getMemberRoom(code, playerId, socketId);
    if (room.status !== 'lobby') throw new RoomError('Maps can only be changed from the lobby.', 'ROOM_STARTED');
    if (room.hostId !== playerId) throw new RoomError('Only the host can choose the race map.', 'HOST_ONLY');
    try {
      getTrack(mapId);
    } catch (error) {
      if (error instanceof GameError) throw new RoomError(error.message, error.code);
      throw error;
    }
    room.selectedMapId = mapId;
    this.notify(room);
    return this.serialize(room);
  }

  setControls(code, playerId, socketId, controls) {
    const room = this.getMemberRoom(code, playerId, socketId);
    if (room.status !== 'racing') throw new RoomError('Driving controls are only accepted during a race.', 'RACE_NOT_ACTIVE');
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player.car || player.car.finishedAt !== null || player.disconnected) {
      throw new RoomError('This player is not currently racing.', 'PLAYER_NOT_RACING');
    }
    Object.assign(player.car, validateControls(controls));
  }

  returnToLobby(code, playerId, socketId) {
    const room = this.getMemberRoom(code, playerId, socketId);
    if (room.status !== 'finished') throw new RoomError('The race must be finished before returning to the lobby.', 'RACE_NOT_FINISHED');
    if (room.hostId !== playerId) throw new RoomError('Only the host can return the room to the lobby.', 'HOST_ONLY');
    return this.resetRoom(room);
  }

  resetRace(code, playerId, socketId) {
    const room = this.getMemberRoom(code, playerId, socketId);
    if (room.hostId !== playerId) throw new RoomError('Only the host can reset the race.', 'HOST_ONLY');
    if (room.status !== 'finished' && (room.status !== 'racing' || room.finishingOrder.length === 0)) {
      throw new RoomError('The race can be reset after the first driver finishes.', 'RACE_NOT_READY_TO_RESET');
    }
    return this.resetRoom(room);
  }

  resetRoom(room) {
    this.clearTimers(room);
    room.status = 'lobby';
    room.countdown = null;
    room.startedAt = null;
    room.goUntil = null;
    room.finishingOrder = [];
    for (const player of room.players) {
      player.car = null;
      player.disconnected = false;
    }
    this.notify(room);
    return this.serialize(room);
  }

  removePlayer(codeInput, hostId, socketId, targetPlayerId) {
    const room = this.getMemberRoom(codeInput, hostId, socketId);
    if (room.hostId !== hostId) throw new RoomError('Only the host can remove a player.', 'HOST_ONLY');
    if (targetPlayerId === hostId) throw new RoomError('The host cannot remove themselves.', 'INVALID_TARGET');
    const target = room.players.find((player) => player.id === targetPlayerId);
    if (!target) throw new RoomError('That player is no longer in the room.', 'PLAYER_NOT_FOUND');
    if (room.status !== 'lobby' && target.connected) {
      throw new RoomError('Only disconnected players can be removed after the race starts.', 'PLAYER_CONNECTED');
    }

    room.players = room.players.filter((player) => player.id !== targetPlayerId);
    room.finishingOrder = room.finishingOrder.filter((id) => id !== targetPlayerId);
    room.finishingOrder.forEach((id, index) => {
      const finisher = room.players.find((player) => player.id === id);
      if (finisher?.car) finisher.car.finishPosition = index + 1;
    });
    this.finishIfComplete(room);
    this.notify(room);
    return {
      room: this.serialize(room),
      removedPlayerId: target.id,
      removedSocketId: target.socketId,
    };
  }

  leaveRoom(codeInput, playerId, socketId) {
    const room = this.getMemberRoom(codeInput, playerId, socketId);
    if (room.status !== 'lobby') throw new RoomError('You cannot leave while a race is in progress.', 'RACE_ACTIVE');
    room.players = room.players.filter((player) => player.id !== playerId);
    if (room.players.length === 0 || !room.players.some((player) => player.connected)) {
      this.deleteRoom(room.code);
      return { code: room.code };
    }
    if (room.hostId === playerId) room.hostId = room.players.find((player) => player.connected)?.id ?? null;
    this.notify(room);
    return { code: room.code };
  }

  disconnect(socketId) {
    for (const room of this.rooms.values()) {
      const player = room.players.find((entry) => entry.socketId === socketId && entry.connected);
      if (!player) continue;
      player.connected = false;
      player.disconnectedAt = this.now();
      if (room.status === 'racing' || room.status === 'countdown') {
        player.disconnected = true;
        if (player.car) {
          player.car.disconnected = true;
          player.car.throttle = false;
          player.car.brake = false;
          player.car.steer = 0;
        }
        this.finishIfComplete(room);
      }

      const connected = room.players.filter((entry) => entry.connected);
      if (connected.length === 0) {
        this.deleteRoom(room.code);
        return room.code;
      }
      if (room.hostId === player.id) room.hostId = connected[0].id;
      this.notify(room);
      return null;
    }
    return null;
  }

  connectedPlayerCount() {
    let count = 0;
    for (const room of this.rooms.values()) {
      count += room.players.filter((player) => player.connected).length;
    }
    return count;
  }

  getRoom(code) {
    return this.rooms.get(code) ?? null;
  }

  tick(room) {
    if (!this.rooms.has(room.code) || room.status !== 'racing') return;
    const deltaSeconds = RACE_TICK_MS / 1000;
    const now = this.now();
    const track = getTrack(room.selectedMapId);
    for (const player of room.players) {
      if (!player.connected || !player.car || player.car.finishedAt !== null) continue;
      stepCar(player.car, deltaSeconds, track);
      updateCheckpoints(player.car, now, room.finishingOrder, track);
    }
    this.finishIfComplete(room);
    this.notify(room);
  }

  finishIfComplete(room) {
    const racers = room.players.filter((player) => player.car);
    if (racers.length > 0 && racers.every((player) => player.disconnected || player.car.finishedAt !== null)) {
      room.status = 'finished';
      this.clearTimers(room);
    }
  }

  makePlayer(nickname, token, socketId, index) {
    return {
      id: randomUUID(),
      token,
      socketId,
      nickname,
      connected: true,
      disconnected: false,
      disconnectedAt: null,
      car: null,
      index,
    };
  }

  generateCode() {
    let code = '';
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      code += CODE_CHARS[Math.floor(this.random() * CODE_CHARS.length)];
    }
    return code;
  }

  validateNickname(nickname) {
    if (typeof nickname !== 'string') throw new RoomError('Enter a nickname first.', 'INVALID_NAME');
    const value = nickname.trim();
    if (!value) throw new RoomError('Enter a nickname first.', 'INVALID_NAME');
    if (value.length > 16) throw new RoomError('Nicknames must be 16 characters or fewer.', 'INVALID_NAME');
    return value;
  }

  validateToken(token) {
    if (typeof token !== 'string' || token.length < 16 || token.length > 80) {
      throw new RoomError('Player session is invalid. Refresh the page and try again.', 'INVALID_SESSION');
    }
  }

  validateCode(code) {
    if (typeof code !== 'string' || !/^[A-Z2-9]{5}$/.test(code.trim().toUpperCase())) {
      throw new RoomError('Room codes must be five letters or numbers.', 'INVALID_CODE');
    }
    return code.trim().toUpperCase();
  }

  getMemberRoom(codeInput, playerId, socketId) {
    const code = this.validateCode(codeInput);
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('Room not found. Check the five-character code.', 'ROOM_NOT_FOUND');
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player || !player.connected || player.socketId !== socketId) {
      throw new RoomError('You are no longer connected to this room.', 'NOT_A_MEMBER');
    }
    return room;
  }

  serialize(room) {
    const cars = room.players.filter((player) => player.car).map((player) => player.car);
    const track = getTrack(room.selectedMapId);
    const order = room.status === 'countdown' || room.status === 'racing' || room.status === 'finished'
      ? getRaceOrder(cars, room.finishingOrder, track)
      : [];
    return {
      code: room.code,
      status: room.status,
      hostId: room.hostId,
      selectedMapId: room.selectedMapId,
      maps: MAPS,
      countdown: room.countdown,
      startedAt: room.startedAt,
      goUntil: room.goUntil,
      lapsToWin: LAPS_TO_WIN,
      track,
      players: room.players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        connected: player.connected,
        disconnected: player.disconnected,
        car: player.car ? { ...player.car } : null,
      })),
      finishingOrder: [...room.finishingOrder],
      leaderboard: order.map((car, index) => ({
        id: car.id,
        nickname: car.nickname,
        lap: Math.min(car.lap, LAPS_TO_WIN),
        position: car.finishPosition ?? index + 1,
        finished: car.finishedAt !== null,
        disconnected: car.disconnected,
        elapsed: car.finishedAt === null || room.startedAt === null
          ? null
          : Math.max(0, car.finishedAt - room.startedAt),
      })),
      serverTime: this.now(),
    };
  }

  notify(room) {
    this.onUpdate(room.code, this.serialize(room));
    this.onStats(this.connectedPlayerCount());
  }

  clearTimers(room) {
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    if (room.raceTimer) clearInterval(room.raceTimer);
    room.countdownTimer = null;
    room.raceTimer = null;
  }

  deleteRoom(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    this.clearTimers(room);
    this.rooms.delete(code);
    this.onStats(this.connectedPlayerCount());
  }
}

export { MAX_PLAYERS, ROOM_CODE_LENGTH };
