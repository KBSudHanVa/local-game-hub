import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomError, RoomManager } from './rooms/RoomManager.js';
import { GameError } from './games/race.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const clientDist = join(projectRoot, 'client', 'dist');

const roomManager = new RoomManager({
  onUpdate: (code, state) => io.to(code).emit('room:state', state),
  onStats: (connectedPlayers) => io.emit('stats:update', { connectedPlayers }),
});

app.get('/api/stats', (_request, response) => {
  response.json({ connectedPlayers: roomManager.connectedPlayerCount() });
});

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_request, response) => response.sendFile(join(clientDist, 'index.html')));
}

function rejectExpectedError(error, acknowledgement) {
  if (error instanceof RoomError || error instanceof GameError) {
    acknowledgement?.({ ok: false, error: error.message, code: error.code ?? 'INVALID_ACTION' });
    return;
  }
  console.error('Unexpected socket action failure:', error);
  acknowledgement?.({ ok: false, error: 'The server could not complete that action.', code: 'SERVER_ERROR' });
}

function acknowledgeAction(action) {
  return (payload, acknowledgement) => {
    try {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new RoomError('Invalid request payload.', 'INVALID_PAYLOAD');
      }
      const result = action(payload);
      acknowledgement?.({ ok: true, ...result });
    } catch (error) {
      rejectExpectedError(error, acknowledgement);
    }
  };
}

io.on('connection', (socket) => {
  socket.on('room:create', acknowledgeAction((payload = {}) => {
    const result = roomManager.createRoom(payload.nickname, payload.token, socket.id, payload.gameId);
    socket.data.roomCode = result.code;
    socket.data.playerId = result.playerId;
    socket.join(result.code);
    return { ...result, playerId: result.playerId };
  }));

  socket.on('room:join', acknowledgeAction((payload = {}) => {
    const result = roomManager.joinRoom(payload.code, payload.nickname, payload.token, socket.id);
    socket.data.roomCode = result.code;
    socket.data.playerId = result.playerId;
    socket.join(result.code);
    return result;
  }));

  socket.on('room:reconnect', acknowledgeAction((payload = {}) => {
    const result = roomManager.reconnectRoom(payload.code, payload.token, socket.id);
    socket.data.roomCode = result.code;
    socket.data.playerId = result.playerId;
    socket.join(result.code);
    return result;
  }));

  socket.on('room:leave', acknowledgeAction(() => {
    const { roomCode, playerId } = socket.data;
    const result = roomManager.leaveRoom(roomCode, playerId, socket.id);
    socket.leave(roomCode);
    delete socket.data.roomCode;
    delete socket.data.playerId;
    return result;
  }));

  socket.on('race:start', acknowledgeAction(() => ({
    room: roomManager.startRace(socket.data.roomCode, socket.data.playerId, socket.id),
  })));

  socket.on('game:start', acknowledgeAction(() => ({
    room: roomManager.startTicTacToe(socket.data.roomCode, socket.data.playerId, socket.id),
  })));

  socket.on('game:move', acknowledgeAction((payload = {}) => ({
    room: roomManager.playTicTacToeMove(
      socket.data.roomCode,
      socket.data.playerId,
      socket.id,
      payload.cell,
    ),
  })));

  socket.on('game:reset', acknowledgeAction(() => ({
    room: roomManager.resetTicTacToe(socket.data.roomCode, socket.data.playerId, socket.id),
  })));

  socket.on('bomb:start', acknowledgeAction(() => ({
    room: roomManager.startBombTag(socket.data.roomCode, socket.data.playerId, socket.id),
  })));

  socket.on('bomb:input', acknowledgeAction((payload = {}) => {
    const now = Date.now();
    if (socket.data.lastBombInputAt && now - socket.data.lastBombInputAt < 35) {
      throw new RoomError('Movement inputs are arriving too quickly.', 'INPUT_RATE_LIMIT');
    }
    socket.data.lastBombInputAt = now;
    roomManager.setBombTagControls(
      socket.data.roomCode,
      socket.data.playerId,
      socket.id,
      payload.controls,
    );
    return {};
  }));

  socket.on('bomb:reset', acknowledgeAction(() => ({
    room: roomManager.resetBombTag(socket.data.roomCode, socket.data.playerId, socket.id),
  })));

  socket.on('blaster:configure', acknowledgeAction((payload = {}) => ({
    room: roomManager.configureBlaster(
      socket.data.roomCode,
      socket.data.playerId,
      socket.id,
      { mode: payload.mode, teamSize: payload.teamSize },
    ),
  })));

  socket.on('blaster:start', acknowledgeAction(() => ({
    room: roomManager.startBlaster(socket.data.roomCode, socket.data.playerId, socket.id),
  })));

  socket.on('blaster:input', acknowledgeAction((payload = {}) => {
    const now = Date.now();
    if (socket.data.lastBlasterInputAt && now - socket.data.lastBlasterInputAt < 40) {
      throw new RoomError('Blaster inputs are arriving too quickly.', 'INPUT_RATE_LIMIT');
    }
    socket.data.lastBlasterInputAt = now;
    roomManager.setBlasterControls(
      socket.data.roomCode,
      socket.data.playerId,
      socket.id,
      payload.controls,
    );
    return {};
  }));

  socket.on('blaster:reset', acknowledgeAction(() => ({
    room: roomManager.resetBlaster(socket.data.roomCode, socket.data.playerId, socket.id),
  })));

  socket.on('space:configure', acknowledgeAction((payload = {}) => ({
    room: roomManager.configureSpaceShooter(
      socket.data.roomCode,
      socket.data.playerId,
      socket.id,
      { mode: payload.mode },
    ),
  })));

  socket.on('space:start', acknowledgeAction(() => ({
    room: roomManager.startSpaceShooter(socket.data.roomCode, socket.data.playerId, socket.id),
  })));

  socket.on('space:input', acknowledgeAction((payload = {}) => {
    const now = Date.now();
    if (socket.data.lastSpaceInputAt && now - socket.data.lastSpaceInputAt < 40) {
      throw new RoomError('Ship inputs are arriving too quickly.', 'INPUT_RATE_LIMIT');
    }
    socket.data.lastSpaceInputAt = now;
    roomManager.setSpaceShooterControls(
      socket.data.roomCode,
      socket.data.playerId,
      socket.id,
      payload.controls,
    );
    return {};
  }));

  socket.on('space:reset', acknowledgeAction(() => ({
    room: roomManager.resetSpaceShooter(socket.data.roomCode, socket.data.playerId, socket.id),
  })));

  socket.on('room:select-map', acknowledgeAction((payload = {}) => ({
    room: roomManager.selectMap(
      socket.data.roomCode,
      socket.data.playerId,
      socket.id,
      payload.mapId,
    ),
  })));

  socket.on('race:return-to-lobby', acknowledgeAction(() => ({
    room: roomManager.returnToLobby(socket.data.roomCode, socket.data.playerId, socket.id),
  })));

  socket.on('race:reset', acknowledgeAction(() => ({
    room: roomManager.resetRace(socket.data.roomCode, socket.data.playerId, socket.id),
  })));

  socket.on('room:remove-player', acknowledgeAction((payload = {}) => {
    const { roomCode, playerId } = socket.data;
    const result = roomManager.removePlayer(roomCode, playerId, socket.id, payload.playerId);
    const removedSocket = io.sockets.sockets.get(result.removedSocketId);
    if (removedSocket) {
      removedSocket.leave(roomCode);
      delete removedSocket.data.roomCode;
      delete removedSocket.data.playerId;
      removedSocket.emit('room:removed', { message: 'The host removed you from the room.' });
    }
    return { room: result.room, removedPlayerId: result.removedPlayerId };
  }));

  socket.on('race:input', (controls) => {
    try {
      const now = Date.now();
      if (socket.data.lastInputAt && now - socket.data.lastInputAt < 25) {
        throw new GameError('Driving inputs are arriving too quickly.');
      }
      socket.data.lastInputAt = now;
      roomManager.setControls(socket.data.roomCode, socket.data.playerId, socket.id, controls);
    } catch (error) {
      socket.emit('action:error', {
        error: error instanceof RoomError || error instanceof GameError
          ? error.message
          : 'The server could not process driving input.',
      });
      if (!(error instanceof RoomError || error instanceof GameError)) {
        console.error('Unexpected driving input failure:', error);
      }
    }
  });

  socket.on('disconnect', () => {
    const code = roomManager.disconnect(socket.id);
    if (code) io.to(code).emit('room:closed');
  });
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Office Game Hub server listening on http://0.0.0.0:${port}`);
});
