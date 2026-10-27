import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager, MAX_PLAYERS } from '../rooms/RoomManager.js';
import {
  createCar,
  DEFAULT_MAP_ID,
  LAPS_TO_WIN,
  MAPS,
  TRACK,
  getTrack,
  stepCar,
  updateCheckpoints,
  validateControls,
} from '../games/race.js';

function createManager() {
  let time = 1_000;
  const manager = new RoomManager({ now: () => time });
  return { manager, advance: (amount) => { time += amount; } };
}

test('creates a five-character room and joins players', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');

  assert.match(host.code, /^[A-Z2-9]{5}$/);
  assert.equal(guest.room.players.length, 2);
  assert.equal(guest.room.hostId, host.playerId);
});

test('enforces duplicate nickname, room capacity, and valid input', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host');
  assert.throws(
    () => manager.joinRoom(host.code, ' host ', 'duplicate-session-12345', 'duplicate-socket'),
    /already in use/,
  );
  for (let index = 2; index <= MAX_PLAYERS; index += 1) {
    manager.joinRoom(host.code, `Player${index}`, `player-session-${index}-12345`, `socket-${index}`);
  }
  assert.throws(
    () => manager.joinRoom(host.code, 'Extra', 'extra-session-12345678', 'socket-extra'),
    /room is full/,
  );
  assert.throws(() => validateControls({ throttle: 1, brake: false, steer: 0 }), /Invalid driving controls/);
});

test('only the host can start a room with at least two players', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host');
  assert.throws(
    () => manager.startRace(host.code, host.playerId, 'socket-host'),
    /At least two connected players/,
  );
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  assert.throws(
    () => manager.startRace(host.code, guest.playerId, 'socket-guest'),
    /Only the host/,
  );
  manager.startRace(host.code, host.playerId, 'socket-host');
  assert.equal(manager.getRoom(host.code).status, 'countdown');
  manager.deleteRoom(host.code);
});

test('host selects a valid map and only that map can be used to start the race', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');

  assert.equal(host.room.selectedMapId, DEFAULT_MAP_ID);
  assert.equal(host.room.maps.length, 6);
  assert.throws(
    () => manager.selectMap(host.code, guest.playerId, 'socket-guest', 'coffee-run'),
    /Only the host/,
  );
  assert.throws(
    () => manager.selectMap(host.code, host.playerId, 'socket-host', 'unknown-map'),
    /available race maps/,
  );

  const selected = manager.selectMap(host.code, host.playerId, 'socket-host', 'coffee-run');
  assert.equal(selected.selectedMapId, 'coffee-run');
  assert.equal(selected.track.name, 'Coffee Run');
  assert.equal(manager.getRoom(host.code).selectedMapId, 'coffee-run');

  manager.startRace(host.code, host.playerId, 'socket-host');
  const track = getTrack('coffee-run');
  const firstCar = manager.getRoom(host.code).players[0].car;
  assert.equal(firstCar.x, track.start.x - Math.cos(track.startAngle) * 54);
  assert.equal(firstCar.y, track.start.y - Math.sin(track.startAngle) * 54);
  manager.deleteRoom(host.code);
});

test('each map has a distinct road and ordered checkpoints', () => {
  const tracks = MAPS.map((map) => getTrack(map.id));
  assert.equal(tracks.length, 6);
  assert.equal(new Set(tracks.map((track) => JSON.stringify(track.centerline.slice(0, 4)))).size, tracks.length);
  for (const track of tracks) {
    assert.equal(track.checkpoints.length, 4);
    assert.equal(track.centerline.length, 128);
    assert.ok(track.startLine.length === 2);
  }
});

test('checkpoints must be visited in sequence before a lap counts', () => {
  const car = createCar('player', 'Driver', 3);
  const finishOrder = [];
  const now = 5_000;
  car.x = TRACK.checkpoints[1].x;
  car.y = TRACK.checkpoints[1].y;
  assert.equal(updateCheckpoints(car, now, finishOrder), false);
  assert.equal(car.lap, 0);

  for (const checkpoint of TRACK.checkpoints) {
    car.x = checkpoint.x;
    car.y = checkpoint.y;
    assert.equal(updateCheckpoints(car, now, finishOrder), true);
  }
  assert.equal(car.lap, 1);
  assert.equal(car.checkpointIndex, 0);
});

test('allows steering while stationary to recover from a track edge', () => {
  const car = createCar('player', 'Driver', 3);
  car.steer = 1;
  stepCar(car, 0.05);
  assert.ok(car.angle > 0);
  assert.equal(car.speed, 0);
});

test('race completion records deterministic finishing order after all laps', () => {
  const car = createCar('player', 'Driver', 3);
  const finishOrder = [];
  for (let lap = 0; lap < LAPS_TO_WIN; lap += 1) {
    for (const checkpoint of TRACK.checkpoints) {
      car.x = checkpoint.x;
      car.y = checkpoint.y;
      updateCheckpoints(car, 10_000 + lap, finishOrder);
    }
  }
  assert.equal(car.lap, LAPS_TO_WIN);
  assert.equal(car.finishPosition, 1);
  assert.deepEqual(finishOrder, ['player']);
  assert.ok(car.finishedAt !== null);
});

test('promotes a connected host and deletes a room when empty', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  manager.disconnect('socket-host');
  assert.equal(manager.getRoom(host.code).hostId, guest.playerId);
  manager.disconnect('socket-guest');
  assert.equal(manager.getRoom(host.code), null);
});

test('allows lobby reconnection and explicit room departure', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  manager.disconnect('socket-guest');
  const restored = manager.reconnectRoom(host.code, 'guest-session-123456', 'socket-guest-new');
  assert.equal(restored.playerId, guest.playerId);
  assert.equal(restored.room.players.find((player) => player.id === guest.playerId).connected, true);

  manager.leaveRoom(host.code, host.playerId, 'socket-host');
  assert.equal(manager.getRoom(host.code).hostId, guest.playerId);
  manager.leaveRoom(host.code, guest.playerId, 'socket-guest-new');
  assert.equal(manager.getRoom(host.code), null);
});

test('restores a disconnected driver during an active race', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  const room = manager.getRoom(host.code);
  room.status = 'racing';
  room.players.forEach((player, index) => {
    player.car = createCar(player.id, player.nickname, index);
  });

  manager.disconnect('socket-guest');
  const restored = manager.reconnectRoom(host.code, 'guest-session-123456', 'socket-guest-new');
  const player = restored.room.players.find((entry) => entry.id === guest.playerId);
  assert.equal(player.connected, true);
  assert.equal(player.disconnected, false);
  assert.equal(player.car.disconnected, false);
  manager.deleteRoom(host.code);
});

test('host can reset after the first finisher while other players are still racing', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  const room = manager.getRoom(host.code);
  room.status = 'racing';
  room.startedAt = 1_000;
  room.players.forEach((player, index) => {
    player.car = createCar(player.id, player.nickname, index);
  });
  assert.throws(
    () => manager.resetRace(host.code, host.playerId, 'socket-host'),
    /after the first driver finishes/,
  );
  room.players[0].car.finishedAt = 5_000;
  room.players[0].car.finishPosition = 1;
  room.players[0].car.lap = LAPS_TO_WIN;
  room.finishingOrder.push(host.playerId);

  assert.throws(
    () => manager.resetRace(host.code, guest.playerId, 'socket-guest'),
    /Only the host/,
  );
  const reset = manager.resetRace(host.code, host.playerId, 'socket-host');
  assert.equal(reset.status, 'lobby');
  assert.deepEqual(reset.finishingOrder, []);
  assert.ok(reset.players.every((player) => player.car === null));
  assert.equal(reset.selectedMapId, DEFAULT_MAP_ID);
});

test('host removes players in the lobby and disconnected racers during a race', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  const third = manager.joinRoom(host.code, 'Third', 'third-session-123456', 'socket-third');

  assert.throws(
    () => manager.removePlayer(host.code, guest.playerId, 'socket-guest', third.playerId),
    /Only the host/,
  );
  const lobbyRemoval = manager.removePlayer(host.code, host.playerId, 'socket-host', third.playerId);
  assert.equal(lobbyRemoval.removedPlayerId, third.playerId);
  assert.equal(lobbyRemoval.room.players.length, 2);

  const room = manager.getRoom(host.code);
  room.status = 'racing';
  room.players.forEach((player, index) => {
    player.car = createCar(player.id, player.nickname, index);
  });
  assert.throws(
    () => manager.removePlayer(host.code, host.playerId, 'socket-host', guest.playerId),
    /Only disconnected players/,
  );
  manager.disconnect('socket-guest');
  const raceRemoval = manager.removePlayer(host.code, host.playerId, 'socket-host', guest.playerId);
  assert.equal(raceRemoval.removedPlayerId, guest.playerId);
  assert.equal(raceRemoval.room.players.some((player) => player.id === guest.playerId), false);
  manager.deleteRoom(host.code);
});

test('disconnected lobby players do not prevent an active race from completing', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  const offline = manager.joinRoom(host.code, 'Offline', 'offline-session-12345', 'socket-offline');
  manager.disconnect('socket-offline');
  manager.startRace(host.code, host.playerId, 'socket-host');

  const room = manager.getRoom(host.code);
  assert.equal(room.players.find((player) => player.id === offline.playerId).disconnected, true);
  room.status = 'racing';
  for (const player of room.players.filter((entry) => entry.connected)) {
    player.car.lap = LAPS_TO_WIN;
    player.car.finishedAt = 3_000;
  }
  manager.finishIfComplete(room);
  assert.equal(room.status, 'finished');
  manager.deleteRoom(host.code);
});
