import { randomUUID } from 'node:crypto';

export const SPACE_ARENA = Object.freeze({
  width: 900,
  height: 560,
  tickMs: 50,
  maxPlayers: 7,
  playerSpeed: 220,
  playerHealth: 3,
  playerLives: 3,
  respawnMs: 1_200,
  invulnerabilityMs: 900,
  projectileSpeed: 440,
  projectileCooldownMs: 260,
  projectileRadius: 5,
  scoreToWin: 10,
  roundDurationMs: 90_000,
});

const EMPTY_CONTROLS = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
  aimAngle: 0,
});
const PLAYER_COLORS = ['#70c8ff', '#ff8b76', '#75dfb1', '#ffd166', '#c4a0ff', '#f28db0', '#73ded5'];
const ENEMY_COLORS = ['#ff8b76', '#f28db0', '#ffd166', '#c4a0ff'];

export function validateSpaceShooterSettings(settings) {
  if (!settings || !['coop', 'free-for-all'].includes(settings.mode)) {
    throw new Error('Choose a valid Space Shooting mode.');
  }
  return { mode: settings.mode };
}

export function validateSpaceShooterControls(controls) {
  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) {
    throw new Error('Invalid ship controls.');
  }
  const keys = Object.keys(controls);
  if (keys.length !== 6 || Object.keys(EMPTY_CONTROLS).some((key) => !keys.includes(key))) {
    throw new Error('Invalid ship controls.');
  }
  if (['up', 'down', 'left', 'right', 'shoot'].some((key) => typeof controls[key] !== 'boolean') ||
      typeof controls.aimAngle !== 'number' || !Number.isFinite(controls.aimAngle) ||
      controls.aimAngle < -Math.PI || controls.aimAngle > Math.PI) {
    throw new Error('Invalid ship controls.');
  }
  return { ...controls };
}

export function createSpaceShooter(players, settings, now, random = Math.random) {
  const { mode } = validateSpaceShooterSettings(settings);
  const connectedPlayers = players.filter((player) => player.connected);
  if (connectedPlayers.length < 2) throw new Error('At least two connected players are needed to start Space Shooting.');
  if (connectedPlayers.length > SPACE_ARENA.maxPlayers) throw new Error('Space Shooting supports at most seven players.');

  const game = {
    mode,
    arena: { width: SPACE_ARENA.width, height: SPACE_ARENA.height },
    players: Object.fromEntries(connectedPlayers.map((player, index) => {
      const angle = index * Math.PI * 2 / connectedPlayers.length;
      return [player.id, {
        id: player.id,
        nickname: player.nickname,
        color: PLAYER_COLORS[index % PLAYER_COLORS.length],
        x: SPACE_ARENA.width / 2 + Math.cos(angle) * 145,
        y: SPACE_ARENA.height / 2 + Math.sin(angle) * 115,
        angle: Math.PI,
        health: SPACE_ARENA.playerHealth,
        lives: SPACE_ARENA.playerLives,
        kills: 0,
        deaths: 0,
        connected: true,
        alive: true,
        respawnAt: null,
        invulnerableUntil: 0,
        nextDamageAt: now,
        nextShotAt: now,
        controls: { ...EMPTY_CONTROLS },
      }];
    })),
    enemies: [],
    projectiles: [],
    wave: 0,
    score: 0,
    nextWaveAt: mode === 'coop' ? now : null,
    startedAt: null,
    endsAt: null,
    scoreToWin: SPACE_ARENA.scoreToWin,
    winnerId: null,
    draw: false,
    finished: false,
    projectileSequence: 0,
  };
  if (mode === 'coop') startNextWave(game, now, random);
  return game;
}

export function setSpaceShooterControls(game, playerId, controls) {
  const player = game?.players[playerId];
  if (!player) throw new Error('This player is not in the Space Shooting match.');
  if (!player.connected || !player.alive) throw new Error('This ship cannot move right now.');
  player.controls = validateSpaceShooterControls(controls);
}

export function tickSpaceShooter(game, now, random = Math.random) {
  if (!game || game.finished || game.startedAt === null) return Boolean(game?.finished);
  const deltaSeconds = SPACE_ARENA.tickMs / 1000;

  for (const player of Object.values(game.players)) {
    if (!player.connected) continue;
    if (!player.alive) {
      if (player.respawnAt !== null && player.respawnAt <= now &&
          (game.mode === 'free-for-all' || player.lives > 0)) {
        player.alive = true;
        player.health = SPACE_ARENA.playerHealth;
        player.respawnAt = null;
        player.invulnerableUntil = now + SPACE_ARENA.invulnerabilityMs;
        player.x = 60 + random() * (SPACE_ARENA.width - 120);
        player.y = 60 + random() * (SPACE_ARENA.height - 120);
      }
    }
    if (!player.alive) continue;

    const horizontal = Number(player.controls.right) - Number(player.controls.left);
    const vertical = Number(player.controls.down) - Number(player.controls.up);
    const magnitude = Math.hypot(horizontal, vertical) || 1;
    player.x = clamp(player.x + horizontal / magnitude * SPACE_ARENA.playerSpeed * deltaSeconds, 24, SPACE_ARENA.width - 24);
    player.y = clamp(player.y + vertical / magnitude * SPACE_ARENA.playerSpeed * deltaSeconds, 24, SPACE_ARENA.height - 24);
    player.angle = player.controls.aimAngle;

    if (player.controls.shoot && player.nextShotAt <= now) {
      const directionX = Math.cos(player.angle);
      const directionY = Math.sin(player.angle);
      game.projectiles.push({
        id: `${game.projectileSequence += 1}`,
        ownerId: player.id,
        x: player.x + directionX * 24,
        y: player.y + directionY * 24,
        velocityX: directionX * SPACE_ARENA.projectileSpeed,
        velocityY: directionY * SPACE_ARENA.projectileSpeed,
        expiresAt: now + 1_500,
      });
      player.nextShotAt = now + SPACE_ARENA.projectileCooldownMs;
    }
  }

  moveProjectiles(game, deltaSeconds, now);
  if (game.mode === 'coop') {
    moveEnemies(game, deltaSeconds, now);
    if (game.enemies.length === 0 && game.nextWaveAt !== null && game.nextWaveAt <= now) {
      startNextWave(game, now, random);
    }
    if (!Object.values(game.players).some((player) => player.connected && player.lives > 0)) {
      game.finished = true;
    }
  } else {
    if (now >= game.endsAt) {
      finishFreeForAll(game);
    } else {
      const remainingPlayers = Object.values(game.players).filter((player) => player.connected);
      if (remainingPlayers.length <= 1) {
        game.winnerId = remainingPlayers[0]?.id ?? null;
        game.draw = remainingPlayers.length === 0;
        game.finished = true;
      }
    }
  }
  return game.finished;
}

export function disconnectSpaceShooterPlayer(game, playerId) {
  const player = game?.players[playerId];
  if (!player) return Boolean(game?.finished);
  const wasFinished = game.finished;
  player.connected = false;
  player.controls = { ...EMPTY_CONTROLS };
  player.alive = false;
  player.respawnAt = null;
  if (!wasFinished && game.mode === 'free-for-all') {
    const remaining = Object.values(game.players).filter((entry) => entry.connected);
    if (remaining.length <= 1) {
      game.winnerId = remaining[0]?.id ?? null;
      game.draw = remaining.length === 0;
      game.finished = true;
    }
  } else if (!wasFinished && !Object.values(game.players).some((entry) => entry.connected && entry.lives > 0)) {
    game.finished = true;
  }
  return game.finished;
}

export function reconnectSpaceShooterPlayer(game, playerId, now) {
  const player = game?.players[playerId];
  if (!player || game.finished) return false;
  player.connected = true;
  player.controls = { ...EMPTY_CONTROLS };
  if (game.mode === 'coop' && player.lives > 0 && !player.alive) {
    player.alive = true;
    player.health = SPACE_ARENA.playerHealth;
    player.respawnAt = null;
    player.invulnerableUntil = now + SPACE_ARENA.invulnerabilityMs;
  }
  return true;
}

export function removeSpaceShooterPlayer(game, playerId) {
  if (!game?.players[playerId]) return Boolean(game?.finished);
  disconnectSpaceShooterPlayer(game, playerId);
  delete game.players[playerId];
  game.projectiles = game.projectiles.filter((projectile) => projectile.ownerId !== playerId);
  return game.finished;
}

export function serializeSpaceShooter(game) {
  if (!game) return null;
  return {
    ...game,
    arena: { ...game.arena },
    players: Object.fromEntries(Object.entries(game.players).map(([id, player]) => [id, {
      ...player,
      controls: { ...player.controls },
    }])),
    enemies: game.enemies.map((enemy) => ({ ...enemy })),
    projectiles: game.projectiles.map((projectile) => ({ ...projectile })),
  };
}

function moveProjectiles(game, deltaSeconds, now) {
  const activeProjectiles = [];
  for (const projectile of game.projectiles) {
    projectile.x += projectile.velocityX * deltaSeconds;
    projectile.y += projectile.velocityY * deltaSeconds;
    if (projectile.expiresAt <= now || projectile.x < 0 || projectile.x > SPACE_ARENA.width ||
        projectile.y < 0 || projectile.y > SPACE_ARENA.height) continue;

    const hit = game.mode === 'coop'
      ? game.enemies.find((enemy) => distance(enemy, projectile) < 22)
      : Object.values(game.players).find((player) =>
        player.connected && player.alive && player.id !== projectile.ownerId &&
        player.invulnerableUntil <= now && distance(player, projectile) < 23);
    if (!hit) {
      activeProjectiles.push(projectile);
      continue;
    }

    const shooter = game.players[projectile.ownerId];
    if (game.mode === 'coop') {
      hit.health -= 1;
      if (hit.health <= 0) {
        game.score += 100;
        if (shooter) shooter.kills += 1;
        game.enemies = game.enemies.filter((enemy) => enemy.id !== hit.id);
        if (game.enemies.length === 0) game.nextWaveAt = now + 1_800;
      }
    } else {
      hit.health -= 1;
      if (hit.health <= 0) {
        hit.deaths += 1;
        hit.health = 0;
        hit.alive = false;
        hit.respawnAt = now + SPACE_ARENA.respawnMs;
        if (shooter) {
          shooter.kills += 1;
          if (shooter.kills >= game.scoreToWin) {
            game.winnerId = shooter.id;
            game.finished = true;
          }
        }
      }
    }
  }
  game.projectiles = activeProjectiles;
}

function moveEnemies(game, deltaSeconds, now) {
  for (const enemy of game.enemies) {
    const target = Object.values(game.players)
      .filter((player) => player.connected && player.alive)
      .sort((a, b) => distance(a, enemy) - distance(b, enemy))[0];
    if (!target) continue;
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    enemy.x += dx / length * enemy.speed * deltaSeconds;
    enemy.y += dy / length * enemy.speed * deltaSeconds;
    if (distance(enemy, target) >= 25 || target.invulnerableUntil > now || target.nextDamageAt > now) continue;

    target.health -= 1;
    target.nextDamageAt = now + 700;
    enemy.x = clamp(enemy.x - dx / length * 30, 20, SPACE_ARENA.width - 20);
    enemy.y = clamp(enemy.y - dy / length * 30, 20, SPACE_ARENA.height - 20);
    if (target.health <= 0) {
      target.deaths += 1;
      target.lives -= 1;
      target.health = SPACE_ARENA.playerHealth;
      target.alive = false;
      target.respawnAt = target.lives > 0 ? now + SPACE_ARENA.respawnMs : null;
      target.controls = { ...EMPTY_CONTROLS };
    }
  }
}

function startNextWave(game, now, random) {
  game.wave += 1;
  const count = Math.min(3 + game.wave, 12);
  const enemies = [];
  for (let index = 0; index < count; index += 1) {
    const edge = Math.floor(random() * 4);
    const offset = random();
    const x = edge === 0 ? 20 : edge === 1 ? SPACE_ARENA.width - 20 : offset * SPACE_ARENA.width;
    const y = edge === 2 ? 20 : edge === 3 ? SPACE_ARENA.height - 20 : offset * SPACE_ARENA.height;
    enemies.push({
      id: randomUUID(),
      x,
      y,
      health: 2,
      speed: Math.min(70 + game.wave * 5, 120),
      color: ENEMY_COLORS[index % ENEMY_COLORS.length],
    });
  }
  game.enemies = enemies;
  game.nextWaveAt = null;
  game.waveStartedAt = now;
}

function finishFreeForAll(game) {
  const players = Object.values(game.players).filter((player) => player.connected);
  const highScore = Math.max(0, ...players.map((player) => player.kills));
  const leaders = players.filter((player) => player.kills === highScore);
  game.winnerId = highScore > 0 && leaders.length === 1 ? leaders[0].id : null;
  game.draw = leaders.length !== 1 || highScore === 0;
  game.finished = true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
