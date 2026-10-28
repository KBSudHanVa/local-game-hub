export const BOMB_ARENA = {
  width: 900,
  height: 560,
  playerRadius: 22,
  playerSpeed: 220,
  tickMs: 50,
  minimumFuseMs: 8_000,
  maximumFuseMs: 14_000,
  tagCooldownMs: 850,
};

const EMPTY_CONTROLS = { up: false, down: false, left: false, right: false };

function randomIndex(random, length) {
  return Math.min(length - 1, Math.floor(random() * length));
}

function nextFuse(random) {
  const range = BOMB_ARENA.maximumFuseMs - BOMB_ARENA.minimumFuseMs;
  return BOMB_ARENA.minimumFuseMs + Math.floor(random() * (range + 1));
}

export function restartBombTagFuse(game, now, random = Math.random) {
  game.startedAt = now;
  game.bombExplodesAt = now + nextFuse(random);
  game.tagAvailableAt = now + BOMB_ARENA.tagCooldownMs;
}

export function createBombTag(players, now, random = Math.random) {
  const livingPlayers = players.filter((player) => player.connected);
  const centerX = BOMB_ARENA.width / 2;
  const centerY = BOMB_ARENA.height / 2;
  const spread = Math.min(185, 70 + livingPlayers.length * 18);
  const playerStates = Object.fromEntries(players.map((player, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(players.length, 1) - Math.PI / 2;
    return [player.id, {
      x: centerX + Math.cos(angle) * spread,
      y: centerY + Math.sin(angle) * spread,
      alive: player.connected,
      eliminatedAt: null,
      controls: { ...EMPTY_CONTROLS },
    }];
  }));
  const holder = livingPlayers[randomIndex(random, livingPlayers.length)];

  return {
    arena: { width: BOMB_ARENA.width, height: BOMB_ARENA.height, playerRadius: BOMB_ARENA.playerRadius },
    players: playerStates,
    bombHolderId: holder.id,
    bombExplodesAt: now + nextFuse(random),
    tagAvailableAt: now + BOMB_ARENA.tagCooldownMs,
    startedAt: now,
    winnerId: null,
    eliminationOrder: [],
  };
}

export function validateBombControls(controls) {
  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) {
    throw new Error('Invalid movement controls.');
  }
  const keys = Object.keys(controls);
  if (keys.length !== Object.keys(EMPTY_CONTROLS).length ||
      keys.some((key) => !Object.hasOwn(EMPTY_CONTROLS, key)) ||
      keys.some((key) => typeof controls[key] !== 'boolean')) {
    throw new Error('Invalid movement controls.');
  }
  return { up: controls.up, down: controls.down, left: controls.left, right: controls.right };
}

export function tickBombTag(game, players, now, random = Math.random) {
  if (now >= game.bombExplodesAt) {
    const eliminatedId = game.bombHolderId;
    eliminateBombTagPlayer(game, eliminatedId, now, random);
    return { eliminatedId, passedTo: null };
  }

  const speedPerTick = BOMB_ARENA.playerSpeed * 0.05;
  for (const player of players) {
    const state = game.players[player.id];
    if (!player.connected || !state?.alive) continue;

    let horizontal = Number(state.controls.right) - Number(state.controls.left);
    let vertical = Number(state.controls.down) - Number(state.controls.up);
    const magnitude = Math.hypot(horizontal, vertical);
    if (magnitude > 0) {
      horizontal /= magnitude;
      vertical /= magnitude;
      state.x = Math.max(BOMB_ARENA.playerRadius, Math.min(
        BOMB_ARENA.width - BOMB_ARENA.playerRadius,
        state.x + horizontal * speedPerTick,
      ));
      state.y = Math.max(BOMB_ARENA.playerRadius, Math.min(
        BOMB_ARENA.height - BOMB_ARENA.playerRadius,
        state.y + vertical * speedPerTick,
      ));
    }
  }

  if (now < game.tagAvailableAt) return { eliminatedId: null, passedTo: null };
  const holderState = game.players[game.bombHolderId];
  if (!holderState?.alive) return { eliminatedId: null, passedTo: null };
  const tagDistance = BOMB_ARENA.playerRadius * 2;

  for (const player of players) {
    if (player.id === game.bombHolderId || !player.connected) continue;
    const target = game.players[player.id];
    if (!target?.alive) continue;
    if (Math.hypot(target.x - holderState.x, target.y - holderState.y) <= tagDistance) {
      game.bombHolderId = player.id;
      game.tagAvailableAt = now + BOMB_ARENA.tagCooldownMs;
      return { eliminatedId: null, passedTo: player.id };
    }
  }

  return { eliminatedId: null, passedTo: null };
}

export function eliminateBombTagPlayer(game, playerId, now, random = Math.random) {
  const state = game.players[playerId];
  if (!state?.alive) return { finished: false, winnerId: game.winnerId };

  state.alive = false;
  state.eliminatedAt = now;
  state.controls = { ...EMPTY_CONTROLS };
  game.eliminationOrder.push(playerId);
  const survivors = Object.entries(game.players).filter(([, player]) => player.alive).map(([id]) => id);

  if (survivors.length <= 1) {
    game.bombHolderId = null;
    game.winnerId = survivors[0] ?? null;
    return { finished: true, winnerId: game.winnerId };
  }

  if (game.bombHolderId === playerId) {
    game.bombHolderId = survivors[randomIndex(random, survivors.length)];
    restartBombTagFuse(game, now, random);
  }
  return { finished: false, winnerId: null };
}

export function serializeBombTag(game) {
  if (!game) return null;
  return {
    arena: { ...game.arena },
    players: Object.fromEntries(Object.entries(game.players).map(([id, state]) => [id, {
      x: state.x,
      y: state.y,
      alive: state.alive,
      eliminatedAt: state.eliminatedAt,
    }])),
    bombHolderId: game.bombHolderId,
    bombExplodesAt: game.bombExplodesAt,
    tagAvailableAt: game.tagAvailableAt,
    startedAt: game.startedAt,
    winnerId: game.winnerId,
    eliminationOrder: [...game.eliminationOrder],
  };
}
