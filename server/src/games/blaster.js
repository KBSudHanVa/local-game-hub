export const BLASTER_ARENA = {
  width: 900,
  height: 560,
  playerRadius: 18,
  playerSpeed: 210,
  projectileSpeed: 460,
  projectileRadius: 6,
  projectileLifetimeMs: 1_100,
  shotCooldownMs: 360,
  botShotCooldownMs: 820,
  respawnDelayMs: 1_200,
  tickMs: 50,
  maxHealth: 3,
  scoreToWin: 8,
  roundDurationMs: 90_000,
  botCount: 3,
  maxTeamSize: 4,
  maxPlayers: 8,
};

const EMPTY_CONTROLS = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
  aimAngle: 0,
};

const MODES = new Set(['solo', 'free-for-all', 'teams']);

function randomIndex(random, length) {
  return Math.min(length - 1, Math.floor(random() * length));
}

function makeEntity({ id, nickname, index, team = null, isBot = false, now }) {
  let x;
  let y;
  if (team === 'blue') {
    x = 130;
    y = BLASTER_ARENA.height / 2 + (index - 1.5) * 62;
  } else if (team === 'red') {
    x = BLASTER_ARENA.width - 130;
    y = BLASTER_ARENA.height / 2 + (index - 1.5) * 62;
  } else {
    const angle = (Math.PI * 2 * index) / 8;
    x = BLASTER_ARENA.width / 2 + Math.cos(angle) * 270;
    y = BLASTER_ARENA.height / 2 + Math.sin(angle) * 190;
  }

  return {
    id,
    nickname,
    isBot,
    team,
    spawnIndex: index,
    x: Math.max(BLASTER_ARENA.playerRadius, Math.min(BLASTER_ARENA.width - BLASTER_ARENA.playerRadius, x)),
    y: Math.max(BLASTER_ARENA.playerRadius, Math.min(BLASTER_ARENA.height - BLASTER_ARENA.playerRadius, y)),
    aimAngle: team === 'red' ? Math.PI : 0,
    health: BLASTER_ARENA.maxHealth,
    alive: true,
    disconnected: false,
    respawnAt: null,
    kills: 0,
    deaths: 0,
    nextShotAt: now,
    shotCooldownMs: isBot ? BLASTER_ARENA.botShotCooldownMs : BLASTER_ARENA.shotCooldownMs,
    nextBotThinkAt: now,
    controls: { ...EMPTY_CONTROLS },
  };
}

export function validateBlasterSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Choose a valid game mode.');
  }
  const { mode, teamSize } = settings;
  if (!MODES.has(mode)) throw new Error('Choose Solo Practice, Free-for-all, or Team Battle.');
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > BLASTER_ARENA.maxTeamSize) {
    throw new Error('Team size must be from 1v1 through 4v4.');
  }
  return { mode, teamSize };
}

export function createBlasterGame(players, hostId, settings, now, random = Math.random, rotationOffset = 0) {
  const config = validateBlasterSettings(settings);
  const connectedPlayers = players.filter((player) => player.connected);
  let participants;
  let spectatorIds = [];

  if (config.mode === 'solo') {
    if (connectedPlayers.length !== 1 || connectedPlayers[0].id !== hostId) {
      throw new Error('Solo Practice needs the host to be the only connected player.');
    }
    participants = connectedPlayers;
  } else if (config.mode === 'free-for-all') {
    if (connectedPlayers.length < 2) throw new Error('Free-for-all needs at least two connected players.');
    participants = connectedPlayers;
  } else {
    const teamPlayerCount = config.teamSize * 2;
    if (connectedPlayers.length < teamPlayerCount) {
      throw new Error(`Team Battle ${config.teamSize}v${config.teamSize} needs ${teamPlayerCount} connected players.`);
    }
    const offset = connectedPlayers.length ? rotationOffset % connectedPlayers.length : 0;
    const rotatedPlayers = [...connectedPlayers.slice(offset), ...connectedPlayers.slice(0, offset)];
    participants = rotatedPlayers.slice(0, teamPlayerCount);
    spectatorIds = rotatedPlayers.slice(teamPlayerCount).map((player) => player.id);
  }

  const entities = {};
  participants.forEach((player, index) => {
    const team = config.mode === 'teams'
      ? index < config.teamSize ? 'blue' : 'red'
      : null;
    entities[player.id] = makeEntity({
      id: player.id,
      nickname: player.nickname,
      index: team === 'red' ? index - config.teamSize : index,
      team,
      now,
    });
  });

  if (config.mode === 'solo') {
    entities[hostId].x = 145;
    entities[hostId].y = BLASTER_ARENA.height / 2;
    for (let index = 0; index < BLASTER_ARENA.botCount; index += 1) {
      const id = `bot-${index + 1}`;
      const bot = makeEntity({
        id,
        nickname: `Practice Bot ${index + 1}`,
        index: index + 4,
        isBot: true,
        now,
      });
      bot.x = 690 + (index % 2) * 35;
      bot.y = 125 + index * 150;
      entities[id] = bot;
    }
  }

  return {
    arena: { ...BLASTER_ARENA },
    mode: config.mode,
    teamSize: config.teamSize,
    rotationOffset,
    participantIds: participants.map((player) => player.id),
    spectatorIds,
    entities,
    projectiles: [],
    nextProjectileId: 1,
    teamScores: { blue: 0, red: 0 },
    scoreToWin: BLASTER_ARENA.scoreToWin,
    startedAt: now,
    endsAt: now + BLASTER_ARENA.roundDurationMs,
    winnerId: null,
    winningTeam: null,
    draw: false,
  };
}

export function validateBlasterControls(controls) {
  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) {
    throw new Error('Invalid blaster controls.');
  }
  const keys = Object.keys(controls);
  if (keys.length !== Object.keys(EMPTY_CONTROLS).length ||
      keys.some((key) => !Object.hasOwn(EMPTY_CONTROLS, key)) ||
      ['up', 'down', 'left', 'right', 'shoot'].some((key) => typeof controls[key] !== 'boolean') ||
      !Number.isFinite(controls.aimAngle) ||
      controls.aimAngle < -Math.PI ||
      controls.aimAngle > Math.PI) {
    throw new Error('Invalid blaster controls.');
  }
  return { ...controls };
}

function setWinner(game, { winnerId = null, winningTeam = null, draw = false } = {}) {
  game.winnerId = winnerId;
  game.winningTeam = winningTeam;
  game.draw = draw;
  return true;
}

function connectedEntities(game) {
  return Object.values(game.entities).filter((entity) => !entity.disconnected);
}

function endIfOnlySideRemains(game) {
  const active = connectedEntities(game);
  if (game.mode === 'solo') {
    if (game.entities[game.participantIds[0]]?.disconnected) return setWinner(game, { draw: true });
    return false;
  }

  if (game.mode === 'teams') {
    const blueAlive = active.some((entity) => entity.team === 'blue');
    const redAlive = active.some((entity) => entity.team === 'red');
    if (!blueAlive && redAlive) return setWinner(game, { winningTeam: 'red' });
    if (!redAlive && blueAlive) return setWinner(game, { winningTeam: 'blue' });
    if (!blueAlive && !redAlive) return setWinner(game, { draw: true });
    return false;
  }

  const remainingHumans = active.filter((entity) => !entity.isBot);
  if (remainingHumans.length <= 1) {
    return setWinner(game, { winnerId: remainingHumans[0]?.id ?? null, draw: remainingHumans.length === 0 });
  }
  return false;
}

function finishByTime(game) {
  if (game.mode === 'teams') {
    if (game.teamScores.blue === game.teamScores.red) return setWinner(game, { draw: true });
    return setWinner(game, { winningTeam: game.teamScores.blue > game.teamScores.red ? 'blue' : 'red' });
  }

  const contenders = Object.values(game.entities).filter((entity) =>
    !entity.disconnected && (game.mode === 'solo' || game.participantIds.includes(entity.id)));
  const highestScore = Math.max(0, ...contenders.map((entity) => entity.kills));
  const leaders = contenders.filter((entity) => entity.kills === highestScore);
  return setWinner(game, leaders.length === 1
    ? { winnerId: leaders[0].id }
    : { draw: true });
}

function updateBots(game, now, random) {
  if (game.mode !== 'solo') return;
  const human = game.entities[game.participantIds[0]];
  if (!human?.alive || human.disconnected) return;

  for (const bot of Object.values(game.entities).filter((entity) => entity.isBot && !entity.disconnected)) {
    if (now < bot.nextBotThinkAt || !bot.alive) continue;
    const dx = human.x - bot.x;
    const dy = human.y - bot.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const approach = distance > 250 ? 1 : distance < 135 ? -1 : 0;
    const perpendicular = distance > 190 ? 0 : 0.5;
    const horizontal = (dx / distance) * approach - (dy / distance) * perpendicular;
    const vertical = (dy / distance) * approach + (dx / distance) * perpendicular;
    bot.controls.up = vertical < -0.15;
    bot.controls.down = vertical > 0.15;
    bot.controls.left = horizontal < -0.15;
    bot.controls.right = horizontal > 0.15;
    bot.controls.aimAngle = Math.atan2(dy, dx) + (random() - 0.5) * 0.65;
    bot.controls.shoot = distance < 400 && random() > 0.5;
    bot.nextBotThinkAt = now + 300 + Math.floor(random() * 160);
  }
}

function spawnProjectile(game, entity, now) {
  const cosine = Math.cos(entity.aimAngle);
  const sine = Math.sin(entity.aimAngle);
  game.projectiles.push({
    id: game.nextProjectileId++,
    ownerId: entity.id,
    team: entity.team,
    x: entity.x + cosine * (BLASTER_ARENA.playerRadius + 5),
    y: entity.y + sine * (BLASTER_ARENA.playerRadius + 5),
    velocityX: cosine * BLASTER_ARENA.projectileSpeed,
    velocityY: sine * BLASTER_ARENA.projectileSpeed,
    expiresAt: now + BLASTER_ARENA.projectileLifetimeMs,
  });
  entity.nextShotAt = now + entity.shotCooldownMs;
}

function applyHit(game, projectile, target, now) {
  target.health -= 1;
  if (target.health > 0) return;

  const shooter = game.entities[projectile.ownerId];
  if (shooter) shooter.kills += 1;
  target.deaths += 1;
  target.health = 0;
  target.alive = false;
  target.respawnAt = now + BLASTER_ARENA.respawnDelayMs;
  target.controls = { ...EMPTY_CONTROLS };

  if (game.mode === 'teams') {
    if (shooter?.team) game.teamScores[shooter.team] += 1;
    const targetScore = game.teamScores.blue >= game.scoreToWin || game.teamScores.red >= game.scoreToWin;
    if (targetScore) {
      setWinner(game, { winningTeam: game.teamScores.blue > game.teamScores.red ? 'blue' : 'red' });
    }
  } else if (shooter && shooter.kills >= game.scoreToWin) {
    setWinner(game, { winnerId: shooter.id });
  }
}

function respawnEntities(game, now, random) {
  for (const entity of Object.values(game.entities)) {
    if (entity.disconnected || entity.alive || entity.respawnAt === null || now < entity.respawnAt) continue;
    entity.alive = true;
    entity.health = BLASTER_ARENA.maxHealth;
    entity.respawnAt = null;
    entity.controls = { ...EMPTY_CONTROLS };
    if (entity.team === 'blue') {
      entity.x = 130;
      entity.y = BLASTER_ARENA.height / 2 + (entity.spawnIndex - 1.5) * 62;
    } else if (entity.team === 'red') {
      entity.x = BLASTER_ARENA.width - 130;
      entity.y = BLASTER_ARENA.height / 2 + (entity.spawnIndex - 1.5) * 62;
    } else {
      entity.x = entity.isBot ? 680 : 150;
      entity.y = BLASTER_ARENA.height / 2 + (randomIndex(random, 5) - 2) * 45;
    }
  }
}

export function setBlasterControls(game, playerId, controls) {
  const entity = game.entities[playerId];
  if (!entity || entity.isBot || !game.participantIds.includes(playerId)) {
    throw new Error('Spectators cannot control a blaster.');
  }
  if (!entity.alive || entity.disconnected) throw new Error('This player cannot move right now.');
  entity.controls = validateBlasterControls(controls);
  entity.aimAngle = entity.controls.aimAngle;
}

export function disconnectBlasterPlayer(game, playerId) {
  const entity = game.entities[playerId];
  if (!entity || entity.isBot) return false;
  entity.disconnected = true;
  entity.alive = false;
  entity.health = 0;
  entity.respawnAt = null;
  entity.controls = { ...EMPTY_CONTROLS };
  return endIfOnlySideRemains(game);
}

export function tickBlaster(game, now, random = Math.random) {
  if (game.winnerId || game.winningTeam || game.draw) return true;
  if (now >= game.endsAt) return finishByTime(game);

  respawnEntities(game, now, random);
  updateBots(game, now, random);
  const secondsPerTick = BLASTER_ARENA.tickMs / 1000;

  for (const entity of Object.values(game.entities)) {
    if (!entity.alive || entity.disconnected) continue;

    let horizontal = Number(entity.controls.right) - Number(entity.controls.left);
    let vertical = Number(entity.controls.down) - Number(entity.controls.up);
    const magnitude = Math.hypot(horizontal, vertical);
    if (magnitude > 0) {
      horizontal /= magnitude;
      vertical /= magnitude;
      entity.x = Math.max(BLASTER_ARENA.playerRadius, Math.min(
        BLASTER_ARENA.width - BLASTER_ARENA.playerRadius,
        entity.x + horizontal * BLASTER_ARENA.playerSpeed * secondsPerTick,
      ));
      entity.y = Math.max(BLASTER_ARENA.playerRadius, Math.min(
        BLASTER_ARENA.height - BLASTER_ARENA.playerRadius,
        entity.y + vertical * BLASTER_ARENA.playerSpeed * secondsPerTick,
      ));
    }

    entity.aimAngle = entity.controls.aimAngle;
    if (entity.controls.shoot && now >= entity.nextShotAt) spawnProjectile(game, entity, now);
  }

  const remainingProjectiles = [];
  for (const projectile of game.projectiles) {
    if (now >= projectile.expiresAt) continue;
    projectile.x += projectile.velocityX * secondsPerTick;
    projectile.y += projectile.velocityY * secondsPerTick;
    if (projectile.x < 0 || projectile.x > BLASTER_ARENA.width ||
        projectile.y < 0 || projectile.y > BLASTER_ARENA.height) continue;

    const hit = Object.values(game.entities).find((target) => {
      if (!target.alive || target.disconnected) return false;
      if (target.id === projectile.ownerId) return false;
      if (game.mode === 'teams' && target.team === projectile.team) return false;
      return Math.hypot(target.x - projectile.x, target.y - projectile.y) <=
        BLASTER_ARENA.playerRadius + BLASTER_ARENA.projectileRadius;
    });
    if (hit) {
      applyHit(game, projectile, hit, now);
      if (game.winnerId || game.winningTeam || game.draw) return true;
    } else {
      remainingProjectiles.push(projectile);
    }
  }
  game.projectiles = remainingProjectiles;
  return false;
}

export function serializeBlaster(game) {
  if (!game) return null;
  return {
    arena: { ...game.arena },
    mode: game.mode,
    teamSize: game.teamSize,
    participantIds: [...game.participantIds],
    spectatorIds: [...game.spectatorIds],
    entities: Object.fromEntries(Object.entries(game.entities).map(([id, entity]) => [id, {
      id: entity.id,
      nickname: entity.nickname,
      isBot: entity.isBot,
      team: entity.team,
      x: entity.x,
      y: entity.y,
      aimAngle: entity.aimAngle,
      health: entity.health,
      alive: entity.alive,
      disconnected: entity.disconnected,
      respawnAt: entity.respawnAt,
      kills: entity.kills,
      deaths: entity.deaths,
    }])),
    projectiles: game.projectiles.map((projectile) => ({
      id: projectile.id,
      team: projectile.team,
      x: projectile.x,
      y: projectile.y,
    })),
    teamScores: { ...game.teamScores },
    scoreToWin: game.scoreToWin,
    startedAt: game.startedAt,
    endsAt: game.endsAt,
    winnerId: game.winnerId,
    winningTeam: game.winningTeam,
    draw: game.draw,
  };
}
