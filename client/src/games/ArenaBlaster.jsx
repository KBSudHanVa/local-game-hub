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
const PLAYER_COLORS = ['#70c8ff', '#ff8b76', '#75dfb1', '#ffd166', '#c4a0ff', '#f28db0', '#73ded5', '#ffaf62'];

export function ArenaBlaster({ room, playerId, connected, error, onInput, onReset, onLeave }) {
  const controls = useRef({ ...EMPTY_CONTROLS });
  const game = room.blaster;
  const localEntity = game?.entities[playerId];
  const isHost = room.hostId === playerId;
  const isParticipant = Boolean(game?.participantIds.includes(playerId));
  const isSpectator = !isParticipant;
  const finished = room.status === 'finished';
  const secondsLeft = game
    ? Math.max(0, Math.ceil((game.endsAt - room.serverTime) / 1000))
    : 0;
  const winner = game?.winnerId ? game.entities[game.winnerId] : null;
  const active = connected && room.status === 'playing' && Boolean(localEntity?.alive) && !localEntity?.disconnected;

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
    if (!localEntity) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * game.arena.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * game.arena.height;
    controls.current.aimAngle = Math.atan2(y - localEntity.y, x - localEntity.x);
  };

  const setDirection = (direction, pressed) => {
    controls.current[direction] = pressed;
  };
  const statusText = finished
    ? game.draw ? 'The match ended in a draw.' : game.winningTeam ? `${teamName(game.winningTeam)} wins the match.` : `${winner?.nickname || 'A player'} wins the match.`
    : room.status === 'countdown' ? `Match starts in ${room.countdown}…`
      : isSpectator ? 'Spectating this round. Extra players rotate in next round.'
        : localEntity?.alive ? 'Move, aim, and fire.'
          : 'Respawning…';
  const rankedEntities = game
    ? Object.values(game.entities).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    : [];
  const playersById = new Map(room.players.map((player) => [player.id, player]));

  return (
    <section className="blaster-page">
      <header className="blaster-header">
        <div>
          <div className="eyebrow">ARENA BLASTER · ROOM {room.code}</div>
          <h1>{finished ? 'Match complete.' : 'Aim. Tag. Repeat.'}</h1>
        </div>
        <div className={`connection-pill ${connected ? 'online' : 'offline'}`}>
          <span className="status-dot" />{connected ? 'Connected' : 'Reconnecting'}
        </div>
      </header>

      {!connected && <div className="alert error-alert" role="alert">Connection lost. Your match state is reconnecting.</div>}
      {error && <div className="alert error-alert" role="alert">{error}</div>}

      <div className="blaster-hud">
        {game.mode === 'teams' ? (
          <>
            <div className="blaster-score-card blue-score"><span>BLUE TEAM</span><strong>{game.teamScores.blue}</strong></div>
            <div className="blaster-clock-card"><span>TIME LEFT</span><strong>{room.status === 'countdown' ? room.countdown : `${secondsLeft}s`}</strong></div>
            <div className="blaster-score-card red-score"><span>RED TEAM</span><strong>{game.teamScores.red}</strong></div>
          </>
        ) : (
          <>
            <div className="blaster-score-card personal-score"><span>{localEntity?.nickname || 'Spectating'}</span><strong>{localEntity?.kills ?? 0}<small> tags</small></strong></div>
            <div className="blaster-clock-card"><span>{room.status === 'countdown' ? 'GET READY' : 'TIME LEFT'}</span><strong>{room.status === 'countdown' ? room.countdown : `${secondsLeft}s`}</strong></div>
            <div className="blaster-score-card target-score"><span>FIRST TO</span><strong>{game.scoreToWin}<small> tags</small></strong></div>
          </>
        )}
      </div>

      <div className="blaster-layout">
        <div className="blaster-arena-column">
          <div className={`blaster-arena-frame ${active ? 'aiming' : ''}`}>
            <Arena room={room} playerId={playerId} onAim={updateAim} onFireStart={() => setDirection('shoot', true)} onFireEnd={() => setDirection('shoot', false)} />
            {room.status === 'countdown' && (
              <div className="countdown-overlay"><span>{room.countdown}</span><small>GET READY</small></div>
            )}
            {finished && (
              <div className="finished-overlay blaster-finished-overlay">
                <span>{game.draw ? '↔' : '★'}</span>
                <h2>{game.draw ? 'It’s a draw!' : game.winningTeam ? `${teamName(game.winningTeam)} wins!` : `${winner?.nickname || 'Player'} wins!`}</h2>
                <p>{game.mode === 'teams'
                  ? `Blue ${game.teamScores.blue} · Red ${game.teamScores.red}`
                  : `First to ${game.scoreToWin} tags`}</p>
              </div>
            )}
          </div>
          <div className="blaster-control-row">
            <p className="blaster-instructions"><strong>{statusText}</strong>Move with WASD or arrows. Aim with your mouse; hold click or Space to fire.</p>
            <MobileControls title="Touch movement and fire controls">
              <p className="mobile-controls-help">Hold the arrows to move. Drag on the arena to aim, or hold FIRE to shoot in your current direction.</p>
              <TouchDpad className="blaster-touch-controls" dpadClassName="blaster-dpad" active={active} onDirection={setDirection} includeFire />
            </MobileControls>
          </div>
        </div>

        <aside className="blaster-sidebar">
          <section className="blaster-roster">
            <div className="panel-heading">
              <div><h2>{game.mode === 'teams' ? 'Battle roster' : 'Arena roster'}</h2><span>{game.participantIds.length} playing · {game.spectatorIds.length} rotating</span></div>
              <span className="panel-live"><i /> LIVE</span>
            </div>
            <ul>
              {rankedEntities.map((entity) => {
                const player = playersById.get(entity.id);
                return (
                  <li key={entity.id} className={!entity.alive || entity.disconnected ? 'entity-out' : ''}>
                    <span className={`blaster-team-dot ${entity.team || `ffa-${game.participantIds.indexOf(entity.id) % PLAYER_COLORS.length}`}`} />
                    <span className="blaster-roster-name">{entity.nickname}{entity.id === playerId && <small>YOU</small>}{entity.isBot && <small>BOT</small>}</span>
                    <span className="blaster-kd">{entity.kills}/{entity.deaths}</span>
                    {!entity.isBot && player && !player.connected && <span className="blaster-roster-state">OFFLINE</span>}
                    {!entity.alive && !entity.disconnected && !finished && <span className="blaster-roster-state">OUT</span>}
                  </li>
                );
              })}
              {game.spectatorIds.map((id) => {
                const player = playersById.get(id);
                if (!player) return null;
                return <li key={id} className="blaster-spectator"><span className="blaster-team-dot spectator-dot" /><span className="blaster-roster-name">{player.nickname}{id === playerId && <small>YOU</small>}</span><span className="blaster-roster-state">NEXT UP</span></li>;
              })}
            </ul>
          </section>

          <div className="blaster-rules-card">
            <div className="eyebrow">{game.mode === 'solo' ? 'SOLO PRACTICE · MEDIUM' : game.mode === 'teams' ? `${game.teamSize}V${game.teamSize} TEAM BATTLE` : 'FREE-FOR-ALL'}</div>
            <p>Three hits take a player out temporarily. Respawn quickly and score tags; friendly fire is off in team matches.</p>
          </div>

          {finished && isHost && (
            <button className="button primary wide blaster-rematch" onClick={onReset}>Play another round <span>→</span></button>
          )}
          {finished && !isHost && <p className="wait-host">Waiting for the host to start another round.</p>}
          {finished && <button className="button secondary wide blaster-leave" onClick={onLeave}>Leave room</button>}
        </aside>
      </div>
    </section>
  );
}

function teamName(team) {
  return team === 'blue' ? 'Blue team' : 'Red team';
}

function Arena({ room, playerId, onAim, onFireStart, onFireEnd }) {
  const game = room.blaster;
  const playerIds = game.participantIds;
  const entities = Object.values(game.entities);
  return (
    <svg
      className="blaster-arena-svg"
      viewBox={`0 0 ${game.arena.width} ${game.arena.height}`}
      role="img"
      aria-label="Arena Blaster game arena"
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
        <pattern id="blaster-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#293540" strokeWidth="1" />
        </pattern>
        <radialGradient id="blaster-center-glow">
          <stop offset="0%" stopColor="#5fc4e8" stopOpacity=".13" />
          <stop offset="100%" stopColor="#5fc4e8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="900" height="560" fill="#121b25" />
      <rect width="900" height="560" fill="url(#blaster-grid)" />
      <rect x="13" y="13" width="874" height="534" rx="28" fill="none" stroke="#45535f" strokeWidth="4" />
      <circle cx="450" cy="280" r="220" fill="url(#blaster-center-glow)" />
      <circle cx="450" cy="280" r="95" fill="none" stroke="#30414b" strokeWidth="2" strokeDasharray="8 12" />
      {game.mode === 'teams' && <><line x1="450" y1="28" x2="450" y2="532" stroke="#53616a" strokeOpacity=".35" strokeDasharray="7 12" /><text x="35" y="48" fill="#74caff" fontSize="12" fontWeight="700" letterSpacing="2">BLUE</text><text x="865" y="48" textAnchor="end" fill="#ff927f" fontSize="12" fontWeight="700" letterSpacing="2">RED</text></>}
      {game.projectiles.map((projectile) => (
        <circle key={projectile.id} cx={projectile.x} cy={projectile.y} r="6" fill={projectile.team === 'red' ? '#ff8b76' : '#80d8ff'} stroke="#fff" strokeOpacity=".5" strokeWidth="1" />
      ))}
      {entities.filter((entity) => entity.alive && !entity.disconnected).map((entity) => {
        const index = Math.max(0, playerIds.indexOf(entity.id));
        const color = entity.team === 'red' ? '#ff8b76' : entity.team === 'blue' ? '#70c8ff' : PLAYER_COLORS[index % PLAYER_COLORS.length];
        const local = entity.id === playerId;
        const barrelX = Math.cos(entity.aimAngle) * 28;
        const barrelY = Math.sin(entity.aimAngle) * 28;
        return (
          <g key={entity.id} transform={`translate(${entity.x} ${entity.y})`}>
            {local && <circle r="26" fill="none" stroke="#f6e8aa" strokeOpacity=".65" strokeWidth="2" strokeDasharray="4 5" />}
            <circle r="21" fill={color} fillOpacity=".18" />
            <circle r="17" fill={color} stroke="#f3f2ec" strokeWidth={local ? 2.5 : 1.5} />
            <line x1="0" y1="0" x2={barrelX} y2={barrelY} stroke="#f3f2ec" strokeWidth="5" strokeLinecap="round" />
            <text textAnchor="middle" y="5" fill="#121820" fontSize="12" fontWeight="800">{entity.isBot ? 'B' : entity.nickname.slice(0, 1).toUpperCase()}</text>
            <text y="34" textAnchor="middle" fill="#f3f2ec" stroke="#121820" strokeWidth="4" paintOrder="stroke" fontSize="11" fontWeight="700">{entity.nickname}</text>
            <text y="-25" textAnchor="middle" fill="#ffd166" fontSize="9" fontWeight="700">{'●'.repeat(entity.health)}{'○'.repeat(Math.max(0, 3 - entity.health))}</text>
          </g>
        );
      })}
    </svg>
  );
}
