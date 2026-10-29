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
import {
  BOMB_ARENA,
  createBombTag,
  tickBombTag,
  validateBombControls,
} from '../games/bombTag.js';
import {
  BLASTER_ARENA,
  createBlasterGame,
  disconnectBlasterPlayer,
  setBlasterControls,
  tickBlaster,
  validateBlasterControls,
} from '../games/blaster.js';

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

test('Tic-Tac-Toe rooms enforce their game type and two-player capacity', () => {
  const { manager } = createManager();
  assert.throws(
    () => manager.createRoom('Host', 'host-session-123456', 'socket-host', 'other-game'),
    /Choose an available game/,
  );
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'tic-tac-toe');
  manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  assert.equal(host.room.gameId, 'tic-tac-toe');
  assert.equal(host.room.maxPlayers, 2);
  assert.throws(
    () => manager.joinRoom(host.code, 'Third', 'third-session-123456', 'socket-third'),
    /maximum 2 players/,
  );
  assert.throws(
    () => manager.startRace(host.code, host.playerId, 'socket-host'),
    /not playing Mini Car Race/,
  );
  manager.deleteRoom(host.code);
});

test('Tic-Tac-Toe requires the host to start with exactly two connected players', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'tic-tac-toe');
  assert.throws(
    () => manager.startTicTacToe(host.code, host.playerId, 'socket-host'),
    /Two connected players/,
  );
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  assert.throws(
    () => manager.startTicTacToe(host.code, guest.playerId, 'socket-guest'),
    /Only the host/,
  );
  const started = manager.startTicTacToe(host.code, host.playerId, 'socket-host');
  assert.equal(started.status, 'playing');
  assert.deepEqual(started.ticTacToe.board, Array(9).fill(null));
  assert.equal(started.ticTacToe.symbols[host.playerId], 'X');
  assert.equal(started.ticTacToe.turnPlayerId, host.playerId);
  manager.deleteRoom(host.code);
});

test('Tic-Tac-Toe validates turns, membership, cell bounds, and occupied cells', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'tic-tac-toe');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  manager.startTicTacToe(host.code, host.playerId, 'socket-host');

  assert.throws(
    () => manager.playTicTacToeMove(host.code, guest.playerId, 'socket-guest', 0),
    /Wait for your turn/,
  );
  assert.throws(
    () => manager.playTicTacToeMove(host.code, host.playerId, 'socket-host', 9),
    /valid square/,
  );
  assert.throws(
    () => manager.playTicTacToeMove(host.code, host.playerId, 'wrong-socket', 0),
    /no longer connected/,
  );
  manager.playTicTacToeMove(host.code, host.playerId, 'socket-host', 0);
  assert.throws(
    () => manager.playTicTacToeMove(host.code, guest.playerId, 'socket-guest', 0),
    /already taken/,
  );
  assert.equal(manager.getRoom(host.code).ticTacToe.board[0], 'X');
  manager.deleteRoom(host.code);
});

test('Tic-Tac-Toe detects wins and draws and host can start a rematch', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'tic-tac-toe');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  manager.startTicTacToe(host.code, host.playerId, 'socket-host');
  const moves = [[host, 0], [guest, 3], [host, 1], [guest, 4], [host, 2]];
  for (const [player, cell] of moves) {
    manager.playTicTacToeMove(host.code, player.playerId, player === host ? 'socket-host' : 'socket-guest', cell);
  }
  const won = manager.getRoom(host.code);
  assert.equal(won.status, 'finished');
  assert.equal(won.ticTacToe.winnerId, host.playerId);
  assert.deepEqual(won.ticTacToe.winningLine, [0, 1, 2]);
  assert.deepEqual(won.finishingOrder, [host.playerId]);
  assert.throws(
    () => manager.resetTicTacToe(host.code, guest.playerId, 'socket-guest'),
    /Only the host/,
  );
  const rematch = manager.resetTicTacToe(host.code, host.playerId, 'socket-host');
  assert.equal(rematch.status, 'lobby');
  assert.equal(rematch.ticTacToe, null);

  manager.startTicTacToe(host.code, host.playerId, 'socket-host');
  const drawMoves = [[host, 0], [guest, 1], [host, 2], [guest, 4], [host, 3], [guest, 5], [host, 7], [guest, 6], [host, 8]];
  for (const [player, cell] of drawMoves) {
    manager.playTicTacToeMove(host.code, player.playerId, player === host ? 'socket-host' : 'socket-guest', cell);
  }
  assert.equal(manager.getRoom(host.code).status, 'finished');
  assert.equal(manager.getRoom(host.code).ticTacToe.draw, true);
  assert.equal(manager.getRoom(host.code).ticTacToe.winnerId, null);
  manager.deleteRoom(host.code);
});

test('Tic-Tac-Toe disconnect awards the connected opponent a win', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'tic-tac-toe');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  manager.startTicTacToe(host.code, host.playerId, 'socket-host');
  manager.disconnect('socket-guest');

  const room = manager.getRoom(host.code);
  assert.equal(room.status, 'finished');
  assert.equal(room.ticTacToe.winnerId, host.playerId);
  assert.equal(room.players.find((player) => player.id === guest.playerId).connected, false);
  assert.equal(manager.resetTicTacToe(host.code, host.playerId, 'socket-host').status, 'lobby');
  manager.deleteRoom(host.code);
});

test('Bomb Tag rooms enforce 2-7 players and host-only start', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'bomb-tag');
  assert.equal(host.room.gameId, 'bomb-tag');
  assert.equal(host.room.maxPlayers, 7);
  assert.throws(
    () => manager.startBombTag(host.code, host.playerId, 'socket-host'),
    /At least two connected players/,
  );
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  assert.throws(
    () => manager.startBombTag(host.code, guest.playerId, 'socket-guest'),
    /Only the host/,
  );
  const started = manager.startBombTag(host.code, host.playerId, 'socket-host');
  assert.equal(started.status, 'countdown');
  assert.equal(started.bombTag.arena.width, BOMB_ARENA.width);
  assert.ok(started.bombTag.players[host.playerId].alive);
  assert.ok(started.bombTag.players[guest.playerId].alive);
  assert.ok(started.bombTag.bombExplodesAt > started.serverTime);
  manager.deleteRoom(host.code);
});

test('Bomb Tag rooms reject an eighth player', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'bomb-tag');
  for (let index = 2; index <= 7; index += 1) {
    manager.joinRoom(host.code, `Player${index}`, `player-session-${index}-12345`, `socket-${index}`);
  }
  assert.equal(manager.getRoom(host.code).players.length, 7);
  assert.throws(
    () => manager.joinRoom(host.code, 'Extra', 'extra-session-12345678', 'socket-extra'),
    /maximum 7 players/,
  );
  manager.deleteRoom(host.code);
});

test('Bomb Tag server validates controls and simulates bounded movement', () => {
  const players = [
    { id: 'one', connected: true },
    { id: 'two', connected: true },
  ];
  assert.throws(() => validateBombControls({ up: true }), /Invalid movement controls/);
  assert.throws(
    () => validateBombControls({ up: 1, down: false, left: false, right: false }),
    /Invalid movement controls/,
  );

  const game = createBombTag(players, 1_000, () => 0);
  const holder = game.bombHolderId;
  const target = players.find((player) => player.id !== holder).id;
  game.players[holder].controls = validateBombControls({
    up: false, down: false, left: false, right: true,
  });
  game.tagAvailableAt = 10_000;
  game.players[holder].x = 100;
  game.players[holder].y = 100;
  game.players[target].x = 500;
  game.players[target].y = 100;
  tickBombTag(game, players, 1_050, () => 0);
  assert.equal(game.players[holder].x, 111);
  assert.equal(game.players[holder].y, 100);

  game.players[holder].x = BOMB_ARENA.width - BOMB_ARENA.playerRadius;
  game.players[holder].y = BOMB_ARENA.height / 2;
  tickBombTag(game, players, 1_100, () => 0);
  assert.equal(game.players[holder].x, BOMB_ARENA.width - BOMB_ARENA.playerRadius);
  assert.equal(game.players[holder].y, BOMB_ARENA.height / 2);
  assert.equal(game.players[target].x, 500);
});

test('Bomb Tag transfers on contact and eliminates the holder when the fuse expires', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'bomb-tag');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  manager.startBombTag(host.code, host.playerId, 'socket-host');
  const room = manager.getRoom(host.code);
  manager.clearTimers(room);
  room.status = 'playing';
  room.bombTag.players[host.playerId].x = 300;
  room.bombTag.players[host.playerId].y = 280;
  room.bombTag.players[guest.playerId].x = 320;
  room.bombTag.players[guest.playerId].y = 280;
  room.bombTag.bombHolderId = host.playerId;
  room.bombTag.tagAvailableAt = 1_000;
  room.bombTag.bombExplodesAt = 10_000;
  manager.tickBombTag(room);
  assert.equal(room.bombTag.bombHolderId, guest.playerId);

  room.bombTag.bombHolderId = host.playerId;
  room.bombTag.players[host.playerId].x = 100;
  room.bombTag.players[host.playerId].y = 100;
  room.bombTag.players[guest.playerId].x = 700;
  room.bombTag.players[guest.playerId].y = 450;
  room.bombTag.bombExplodesAt = 1_000;
  manager.tickBombTag(room);
  assert.equal(room.status, 'finished');
  assert.equal(room.bombTag.players[host.playerId].alive, false);
  assert.equal(room.bombTag.winnerId, guest.playerId);
  assert.deepEqual(room.finishingOrder, [host.playerId]);
  assert.equal(manager.resetBombTag(host.code, host.playerId, 'socket-host').status, 'lobby');
  assert.equal(manager.getRoom(host.code).bombTag, null);
  manager.deleteRoom(host.code);
});

test('Bomb Tag disconnect forfeits the round to the remaining player', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'bomb-tag');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  manager.startBombTag(host.code, host.playerId, 'socket-host');
  manager.disconnect('socket-host');

  const room = manager.getRoom(host.code);
  assert.equal(room.status, 'finished');
  assert.equal(room.hostId, guest.playerId);
  assert.equal(room.bombTag.players[host.playerId].alive, false);
  assert.equal(room.bombTag.winnerId, guest.playerId);
  assert.equal(room.players.find((player) => player.id === host.playerId).disconnected, true);
  manager.deleteRoom(host.code);
});

test('Arena Blaster supports solo practice with medium bots and an eight-player cap', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'arena-blaster');
  assert.equal(host.room.maxPlayers, 8);
  assert.equal(host.room.blasterSettings.mode, 'solo');

  const started = manager.startBlaster(host.code, host.playerId, 'socket-host');
  assert.equal(started.status, 'countdown');
  assert.equal(started.blaster.mode, 'solo');
  assert.equal(Object.values(started.blaster.entities).filter((entity) => entity.isBot).length, BLASTER_ARENA.botCount);
  manager.deleteRoom(host.code);

  const full = manager.createRoom('Host', 'full-host-session-123456', 'full-host', 'arena-blaster');
  for (let index = 2; index <= BLASTER_ARENA.maxPlayers; index += 1) {
    manager.joinRoom(full.code, `Player${index}`, `blaster-session-${index}-12345`, `blaster-socket-${index}`);
  }
  assert.equal(manager.getRoom(full.code).players.length, 8);
  assert.throws(
    () => manager.joinRoom(full.code, 'Extra', 'extra-session-12345678', 'socket-extra'),
    /maximum 8 players/,
  );
  manager.deleteRoom(full.code);
});

test('Arena Blaster settings and starts are host-authorized and mode-validated', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'arena-blaster');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');

  assert.throws(
    () => manager.configureBlaster(host.code, guest.playerId, 'socket-guest', { mode: 'teams', teamSize: 1 }),
    /Only the host/,
  );
  assert.throws(
    () => manager.configureBlaster(host.code, host.playerId, 'socket-host', { mode: 'unknown', teamSize: 1 }),
    /Choose Solo Practice/,
  );
  assert.throws(
    () => manager.startBlaster(host.code, host.playerId, 'socket-host'),
    /Solo Practice needs the host to be the only connected player/,
  );

  const configured = manager.configureBlaster(
    host.code,
    host.playerId,
    'socket-host',
    { mode: 'free-for-all', teamSize: 1 },
  );
  assert.equal(configured.blasterSettings.mode, 'free-for-all');
  const started = manager.startBlaster(host.code, host.playerId, 'socket-host');
  assert.equal(started.blaster.mode, 'free-for-all');
  assert.equal(started.blaster.participantIds.length, 2);
  manager.deleteRoom(host.code);
});

test('Arena Blaster balances teams, rotates spectators, and supports 4v4', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'arena-blaster');
  for (let index = 2; index <= 7; index += 1) {
    manager.joinRoom(host.code, `Player${index}`, `team-session-${index}-12345`, `team-socket-${index}`);
  }
  const sevenPlayers = manager.getRoom(host.code).players;
  manager.configureBlaster(host.code, host.playerId, 'socket-host', { mode: 'teams', teamSize: 4 });
  assert.throws(
    () => manager.startBlaster(host.code, host.playerId, 'socket-host'),
    /Team Battle 4v4 needs 8 connected players/,
  );
  const configured = manager.configureBlaster(
    host.code,
    host.playerId,
    'socket-host',
    { mode: 'teams', teamSize: 3 },
  );
  assert.equal(configured.blasterSettings.teamSize, 3);
  const firstRound = manager.startBlaster(host.code, host.playerId, 'socket-host');
  assert.equal(firstRound.blaster.participantIds.length, 6);
  assert.equal(firstRound.blaster.spectatorIds.length, 1);
  assert.equal(Object.values(firstRound.blaster.entities).filter((entity) => entity.team === 'blue').length, 3);
  assert.equal(Object.values(firstRound.blaster.entities).filter((entity) => entity.team === 'red').length, 3);
  const firstSpectator = firstRound.blaster.spectatorIds[0];
  const room = manager.getRoom(host.code);
  manager.clearTimers(room);
  room.status = 'finished';
  manager.resetBlaster(host.code, host.playerId, 'socket-host');
  const secondRound = manager.startBlaster(host.code, host.playerId, 'socket-host');
  assert.equal(secondRound.blaster.spectatorIds.length, 1);
  assert.notEqual(secondRound.blaster.spectatorIds[0], firstSpectator);
  manager.deleteRoom(host.code);

  const full = manager.createRoom('Host', 'team-full-host-session', 'team-full-host', 'arena-blaster');
  for (let index = 2; index <= 8; index += 1) {
    manager.joinRoom(full.code, `Player${index}`, `full-team-session-${index}`, `full-team-socket-${index}`);
  }
  manager.configureBlaster(full.code, full.playerId, 'team-full-host', { mode: 'teams', teamSize: 4 });
  const eightPlayerRound = manager.startBlaster(full.code, full.playerId, 'team-full-host');
  assert.equal(eightPlayerRound.blaster.participantIds.length, 8);
  assert.deepEqual(eightPlayerRound.blaster.teamScores, { blue: 0, red: 0 });
  assert.equal(eightPlayerRound.blaster.spectatorIds.length, 0);
  assert.equal(Object.values(eightPlayerRound.blaster.entities).filter((entity) => entity.team === 'blue').length, 4);
  assert.equal(Object.values(eightPlayerRound.blaster.entities).filter((entity) => entity.team === 'red').length, 4);
  assert.equal(sevenPlayers.length, 7);
  manager.deleteRoom(full.code);
});

test('Arena Blaster validates controls, moves players, and awards server-simulated hits', () => {
  const players = [
    { id: 'one', nickname: 'One', connected: true },
    { id: 'two', nickname: 'Two', connected: true },
  ];
  assert.throws(() => validateBlasterControls({ up: true }), /Invalid blaster controls/);
  assert.throws(
    () => validateBlasterControls({
      up: false, down: false, left: false, right: false, shoot: false, aimAngle: 99,
    }),
    /Invalid blaster controls/,
  );

  const game = createBlasterGame(players, 'one', { mode: 'free-for-all', teamSize: 1 }, 1_000, () => 0);
  game.scoreToWin = 1;
  game.entities.one.x = 100;
  game.entities.one.y = 100;
  game.entities.two.x = 250;
  game.entities.two.y = 100;
  game.entities.two.health = 1;
  setBlasterControls(game, 'one', {
    up: false, down: false, left: false, right: true, shoot: false, aimAngle: 0,
  });
  tickBlaster(game, 1_000, () => 0);
  assert.equal(game.entities.one.x, 110.5);
  game.entities.one.x = 100;
  game.entities.one.controls.right = false;
  game.entities.one.controls.shoot = true;
  for (let tick = 0; tick < 10 && game.entities.two.alive; tick += 1) {
    tickBlaster(game, 1_050 + tick * BLASTER_ARENA.tickMs, () => 0);
  }
  assert.equal(game.entities.one.x, 100);
  assert.equal(game.entities.two.alive, false);
  assert.equal(game.entities.one.kills, 1);
  assert.equal(game.entities.two.deaths, 1);
  assert.equal(game.winnerId, 'one');
  assert.equal(tickBlaster(game, 2_000, () => 0), true);
});

test('Arena Blaster prevents friendly fire, rejects spectators, and awards a team after a forfeit', () => {
  const players = [
    { id: 'blue-1', nickname: 'Blue 1', connected: true },
    { id: 'blue-2', nickname: 'Blue 2', connected: true },
    { id: 'red-1', nickname: 'Red 1', connected: true },
    { id: 'red-2', nickname: 'Red 2', connected: true },
    { id: 'spectator', nickname: 'Spectator', connected: true },
  ];
  const game = createBlasterGame(players, 'blue-1', { mode: 'teams', teamSize: 2 }, 1_000, () => 0);
  assert.deepEqual(game.spectatorIds, ['spectator']);
  assert.throws(
    () => setBlasterControls(game, 'spectator', {
      up: false, down: false, left: false, right: false, shoot: false, aimAngle: 0,
    }),
    /Spectators cannot control/,
  );

  game.entities['blue-1'].x = 100;
  game.entities['blue-1'].y = 100;
  game.entities['blue-2'].x = 250;
  game.entities['blue-2'].y = 100;
  game.entities['blue-1'].health = 1;
  game.entities['blue-2'].health = 1;
  game.entities['blue-1'].nextShotAt = 10_000;
  game.entities['red-1'].nextShotAt = 10_000;
  game.entities['blue-1'].controls = {
    up: false, down: false, left: false, right: false, shoot: true, aimAngle: 0,
  };
  game.projectiles.push({
    id: 1, ownerId: 'blue-1', team: 'blue', x: 225, y: 100,
    velocityX: 460, velocityY: 0, expiresAt: 2_000,
  });
  tickBlaster(game, 1_050, () => 0);
  assert.equal(game.entities['blue-1'].health, 1);
  assert.equal(game.entities['blue-2'].health, 1);

  disconnectBlasterPlayer(game, 'red-1');
  disconnectBlasterPlayer(game, 'red-2');
  assert.equal(game.winningTeam, 'blue');
});

test('Arena Blaster medium bots act autonomously and timed matches resolve ties', () => {
  const players = [{ id: 'human', nickname: 'Human', connected: true }];
  const solo = createBlasterGame(players, 'human', { mode: 'solo', teamSize: 1 }, 1_000, () => 0.6);
  for (let tick = 0; tick < 100; tick += 1) {
    tickBlaster(solo, 1_000 + tick * BLASTER_ARENA.tickMs, () => 0.6);
  }
  assert.ok(Object.values(solo.entities).some((entity) => entity.isBot && entity.controls.shoot));
  assert.ok(solo.projectiles.length > 0);

  const match = createBlasterGame([
    { id: 'one', nickname: 'One', connected: true },
    { id: 'two', nickname: 'Two', connected: true },
  ], 'one', { mode: 'free-for-all', teamSize: 1 }, 1_000);
  assert.equal(tickBlaster(match, match.endsAt, () => 0), true);
  assert.equal(match.draw, true);
});

test('Arena Blaster disconnects end a free-for-all and the host can rematch', () => {
  const { manager } = createManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'arena-blaster');
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  manager.configureBlaster(host.code, host.playerId, 'socket-host', {
    mode: 'free-for-all',
    teamSize: 1,
  });
  manager.startBlaster(host.code, host.playerId, 'socket-host');
  const room = manager.getRoom(host.code);
  manager.clearTimers(room);
  room.status = 'playing';

  manager.disconnect('socket-guest');
  assert.equal(room.status, 'finished');
  assert.equal(room.blaster.winnerId, host.playerId);
  assert.equal(room.players.find((player) => player.id === guest.playerId).disconnected, true);
  assert.equal(manager.resetBlaster(host.code, host.playerId, 'socket-host').status, 'lobby');
  manager.deleteRoom(host.code);
});
