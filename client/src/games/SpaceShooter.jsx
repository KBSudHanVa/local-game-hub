import { useEffect, useRef } from 'react';
import { MobileControls, TouchDpad } from '../components/MobileControls.jsx';

const KEY_MAP = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

const EMPTY_CONTROLS = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
  aimAngle: 0,
};

export function SpaceShooter({ room, playerId, connected, error, onInput, onReset, onLeave }) {
  const controls = useRef({ ...EMPTY_CONTROLS });
  const game = room.spaceShooter;
  const localPlayer = game.players[playerId];
  const isHost = room.hostId === playerId;
  const finished = room.status === 'finished';
  const active = connected && room.status === 'playing' && Boolean(localPlayer?.alive) && localPlayer?.connected;
  const secondsLeft = game.endsAt === null
    ? null
    : Math.max(0, Math.ceil((game.endsAt - room.serverTime) / 1000));
  const winner = game.winnerId ? game.players[game.winnerId] : null;
  const leaderboard = Object.values(game.players).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const statusText = finished
    ? game.mode === 'coop'
      ? 'The crew has been overrun.'
      : game.draw ? 'The match ended in a draw.' : `${winner?.nickname || 'A player'} wins the match.`
    : room.status === 'countdown'
      ? `Match starts in ${room.countdown}…`
      : game.mode === 'coop'
        ? `Wave ${game.wave} · ${localPlayer?.lives ?? 0} lives remaining`
        : localPlayer?.alive
          ? 'Move, aim, and fire.'
          : 'Respawning…';

  useEffect(() => {
    const sendControls = () => {
      if (active) onInput({ ...controls.current });
    };
    const keyDown = (event) => {
      if (!active) return;
      const direction = KEY_MAP[event.code];
      if (direction) {
        event.preventDefault();
        controls.current[direction] = true;
      } else if (event.code === 'Space') {
        event.preventDefault();
        controls.current.shoot = true;
      }
    };
    const keyUp = (event) => {
      const direction = KEY_MAP[event.code];
      if (direction) {
        event.preventDefault();
        controls.current[direction] = false;
      } else if (event.code === 'Space') {
        event.preventDefault();
        controls.current.shoot = false;
      }
    };
    const clearControls = () => {
      controls.current = { ...EMPTY_CONTROLS };
      sendControls();
    };

    controls.current = { ...EMPTY_CONTROLS };
    if (!active) return clearControls;

    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clearControls);
    window.addEventListener('visibilitychange', clearControls);
    const interval = window.setInterval(sendControls, 80);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clearControls);
      window.removeEventListener('visibilitychange', clearControls);
      window.clearInterval(interval);
      controls.current = { ...EMPTY_CONTROLS };
    };
  }, [active, onInput]);

  const updateAim = (event) => {
    if (!localPlayer) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * game.arena.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * game.arena.height;
    controls.current.aimAngle = Math.atan2(y - localPlayer.y, x - localPlayer.x);
  };

  const setDirection = (direction, pressed) => {
    controls.current[direction] = pressed;
  };

  return (
    <section className="space-page">
      <header className="space-header">
        <div>
          <div className="eyebrow">SPACE SHOOTING · ROOM {room.code}</div>
          <h1>{finished ? 'Mission complete.' : 'Make some space.'}</h1>
        </div>
        <div className={`connection-pill ${connected ? 'online' : 'offline'}`}>
          <span className="status-dot" />{connected ? 'Connected' : 'Reconnecting'}
        </div>
      </header>

      {!connected && <div className="alert error-alert" role="alert">Connection lost. Your match state is reconnecting.</div>}
      {error && <div className="alert error-alert" role="alert">{error}</div>}

      <div className="space-hud">
        <div className="space-stat-card"><span>{game.mode === 'coop' ? 'TEAM SCORE' : 'YOUR ELIMINATIONS'}</span><strong>{game.mode === 'coop' ? game.score : localPlayer.kills}</strong></div>
        <div className="space-stat-card space-stat-center"><span>{room.status === 'countdown' ? 'GET READY' : game.mode === 'coop' ? 'WAVE' : 'TIME LEFT'}</span><strong>{room.status === 'countdown' ? room.countdown : game.mode === 'coop' ? game.wave : `${secondsLeft}s`}</strong></div>
        <div className="space-stat-card space-stat-right"><span>{game.mode === 'coop' ? 'YOUR SHIP' : 'TARGET'}</span><strong>{game.mode === 'coop' ? `${localPlayer.lives} ♥` : `${game.scoreToWin} tags`}</strong></div>
      </div>

      <div className="space-layout">
        <div className="space-arena-column">
          <div className="space-arena-frame">
            <Arena game={game} playerId={playerId} onAim={updateAim} onFireStart={() => setDirection('shoot', true)} onFireEnd={() => setDirection('shoot', false)} />
            {room.status === 'countdown' && (
              <div className="countdown-overlay"><span>{room.countdown}</span><small>GET READY</small></div>
            )}
            {finished && (
              <div className="finished-overlay space-finished-overlay">
                <span>{game.mode === 'coop' ? '✦' : game.draw ? '↔' : '★'}</span>
                <h2>{game.mode === 'coop' ? 'Mission over' : game.draw ? 'It’s a draw!' : `${winner?.nickname || 'Player'} wins!`}</h2>
                <p>{game.mode === 'coop' ? `Wave ${game.wave} · ${game.score} points` : `${winner?.kills ?? 0} eliminations`}</p>
              </div>
            )}
          </div>
          <div className="space-control-row">
            <p className="space-instructions"><strong>{statusText}</strong>Move with WASD or arrows. Aim with your mouse; hold click or Space to shoot.</p>
            <MobileControls title="Touch movement and fire controls">
              <p className="mobile-controls-help">Hold the arrows to move, drag on the arena to aim, or hold FIRE to shoot.</p>
              <TouchDpad className="space-touch-controls" dpadClassName="space-dpad" active={active} onDirection={setDirection} includeFire />
            </MobileControls>
          </div>
        </div>

        <aside className="space-sidebar">
          <section className="space-roster">
            <div className="panel-heading">
              <div><h2>{game.mode === 'coop' ? 'Crew' : 'Leaderboard'}</h2><span>{Object.values(game.players).filter((player) => player.connected).length} connected</span></div>
              <span className="panel-live"><i /> LIVE</span>
            </div>
            <ol>
              {leaderboard.map((player, index) => (
                <li key={player.id} className={!player.connected || !player.alive ? 'space-player-out' : ''}>
                  <span className="space-rank">{index + 1}</span>
                  <span className="space-player-dot" style={{ backgroundColor: player.color }} />
                  <span className="space-player-name">{player.nickname}{player.id === playerId && <small>YOU</small>}</span>
                  <span className="space-player-score">{game.mode === 'coop' ? `${player.lives} ♥` : `${player.kills} K`}</span>
                  {!player.connected && <small className="space-player-state">OFFLINE</small>}
                </li>
              ))}
            </ol>
          </section>
          <div className="space-rules-card">
            <div className="eyebrow">{game.mode === 'coop' ? 'CO-OP WAVE SURVIVAL' : 'FREE-FOR-ALL'}</div>
            <p>{game.mode === 'coop'
              ? 'Destroy the enemy waves together. Aliens chase your ships; each pilot has three lives.'
              : 'Score eliminations with server-validated shots. First to ten wins, or lead when 90 seconds run out.'}</p>
          </div>
          {finished && isHost && (
            <button className="button primary wide space-rematch" onClick={onReset}>Play another match <span>→</span></button>
          )}
          {finished && !isHost && <p className="wait-host">Waiting for the host to start another match.</p>}
          {finished && <button className="button secondary wide space-leave" onClick={onLeave}>Leave room</button>}
        </aside>
      </div>
    </section>
  );
}

function Arena({ game, playerId, onAim, onFireStart, onFireEnd }) {
  return (
    <svg
      className="space-arena-svg"
      viewBox={`0 0 ${game.arena.width} ${game.arena.height}`}
      role="img"
      aria-label="Space Shooting arena"
      onPointerMove={onAim}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        onAim(event);
        onFireStart();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={onFireEnd}
      onPointerCancel={onFireEnd}
      onContextMenu={(event) => event.preventDefault()}
    >
      <defs>
        <pattern id="space-grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#283342" strokeWidth="1" />
        </pattern>
        <radialGradient id="space-glow">
          <stop offset="0%" stopColor="#596caa" stopOpacity=".23" />
          <stop offset="100%" stopColor="#596caa" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="900" height="560" fill="#101722" />
      <rect width="900" height="560" fill="url(#space-grid)" />
      <rect x="12" y="12" width="876" height="536" rx="26" fill="none" stroke="#394857" strokeWidth="3" />
      <circle cx="450" cy="280" r="220" fill="url(#space-glow)" />
      <circle cx="450" cy="280" r="96" fill="none" stroke="#344153" strokeWidth="2" strokeDasharray="5 13" />
      <circle cx="450" cy="280" r="4" fill="#9fb4de" opacity=".8" />
      {game.projectiles.map((projectile) => (
        <circle key={projectile.id} cx={projectile.x} cy={projectile.y} r="5" fill="#ffe38b" stroke="#fff4cc" strokeWidth="1" />
      ))}
      {game.enemies.map((enemy) => (
        <g key={enemy.id} transform={`translate(${enemy.x} ${enemy.y})`}>
          <path d="M0 -15 L5 -6 L15 -4 L8 3 L10 13 L0 8 L-10 13 L-8 3 L-15 -4 L-5 -6 Z" fill={enemy.color} stroke="#ffe2d6" strokeWidth="1" />
          <text textAnchor="middle" y="-20" fill="#ffd7c7" fontSize="8">{enemy.health}</text>
        </g>
      ))}
      {Object.values(game.players).filter((player) => player.alive && player.connected).map((player) => (
        <g
          key={player.id}
          transform={`translate(${player.x} ${player.y}) rotate(${player.angle * 180 / Math.PI})`}
        >
          {player.id === playerId && <circle r="23" fill="none" stroke="#fff0a8" strokeOpacity=".7" strokeWidth="2" strokeDasharray="4 5" />}
          <path d="M19 0 L-12 -12 L-7 0 L-12 12 Z" fill={player.color} stroke="#f3f2ec" strokeWidth="1.5" />
          <circle r="4" fill="#fff1b8" />
          <text y="31" textAnchor="middle" fill="#f3f2ec" stroke="#101722" strokeWidth="4" paintOrder="stroke" fontSize="11" fontWeight="700">{player.nickname}</text>
          <text y="-25" textAnchor="middle" fill="#ffd166" fontSize="9">{'●'.repeat(player.health)}{'○'.repeat(Math.max(0, 3 - player.health))}</text>
        </g>
      ))}
    </svg>
  );
}
