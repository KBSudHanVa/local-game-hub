import { useEffect, useRef } from 'react';

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

const COLORS = ['#ff8068', '#67d8ad', '#6eb8ff', '#f4c968', '#c99df5', '#f28ead', '#72d9d4'];
const EMPTY_CONTROLS = { up: false, down: false, left: false, right: false };

export function BombTag({ room, playerId, connected, error, onInput, onReset, onLeave }) {
  const controls = useRef({ ...EMPTY_CONTROLS });
  const game = room.bombTag;
  const localState = game?.players[playerId];
  const isHost = room.hostId === playerId;
  const holder = room.players.find((player) => player.id === game?.bombHolderId);
  const winner = room.players.find((player) => player.id === game?.winnerId);
  const fuseRemaining = game && room.status === 'playing'
    ? Math.max(0, (game.bombExplodesAt - room.serverTime) / 1000)
    : null;

  useEffect(() => {
    const active = connected && room.status === 'playing' && localState?.alive;
    const sendControls = () => {
      if (active) onInput({ ...controls.current });
    };
    const keyDown = (event) => {
      const direction = KEY_MAP[event.code];
      if (!direction || !active) return;
      event.preventDefault();
      controls.current[direction] = true;
    };
    const keyUp = (event) => {
      const direction = KEY_MAP[event.code];
      if (!direction) return;
      event.preventDefault();
      controls.current[direction] = false;
    };
    const clearControls = () => {
      controls.current = { ...EMPTY_CONTROLS };
      sendControls();
    };

    controls.current = { ...EMPTY_CONTROLS };
    if (active) {
      window.addEventListener('keydown', keyDown);
      window.addEventListener('keyup', keyUp);
      window.addEventListener('blur', clearControls);
      window.addEventListener('visibilitychange', clearControls);
      const interval = window.setInterval(sendControls, 75);
      return () => {
        window.removeEventListener('keydown', keyDown);
        window.removeEventListener('keyup', keyUp);
        window.removeEventListener('blur', clearControls);
        window.removeEventListener('visibilitychange', clearControls);
        window.clearInterval(interval);
        controls.current = { ...EMPTY_CONTROLS };
      };
    }

    return () => {
      controls.current = { ...EMPTY_CONTROLS };
    };
  }, [connected, localState?.alive, onInput, room.status]);

  const setDirection = (direction, pressed) => {
    controls.current[direction] = pressed;
  };
  const active = connected && room.status === 'playing' && Boolean(localState?.alive);
  const roundFinished = room.status === 'finished';

  return (
    <section className="bomb-page">
      <header className="bomb-header">
        <div>
          <div className="eyebrow">BOMB TAG · ROOM {room.code}</div>
          <h1>{roundFinished ? 'Round over.' : 'Don’t hold it.'}</h1>
        </div>
        <div className={`connection-pill ${connected ? 'online' : 'offline'}`}>
          <span className="status-dot" />{connected ? 'Connected' : 'Reconnecting'}
        </div>
      </header>

      {!connected && <div className="alert error-alert" role="alert">Connection lost. Your player is out while we try to reconnect.</div>}
      {error && <div className="alert error-alert" role="alert">{error}</div>}

      <div className="bomb-hud">
        <div className={`bomb-holder-card ${holder?.id === playerId ? 'holding-bomb' : ''}`}>
          <span className="bomb-icon" aria-hidden="true">✹</span>
          <div><span className="stat-label">BOMB HOLDER</span><strong>{holder?.nickname || (roundFinished ? 'Round complete' : 'Waiting for start')}</strong></div>
        </div>
        <div className="bomb-fuse-card">
          <span className="stat-label">{room.status === 'countdown' ? 'GET READY' : roundFinished ? 'RESULT' : 'FUSE'}</span>
          <strong>{room.status === 'countdown' ? room.countdown : fuseRemaining === null ? (winner ? 'WINNER' : '—') : `${fuseRemaining.toFixed(1)}s`}</strong>
        </div>
        <div className="bomb-round-card">
          <span className="stat-label">PLAYERS LEFT</span>
          <strong>{room.players.filter((player) => player.connected && game?.players[player.id]?.alive).length}<small> / {room.players.length}</small></strong>
        </div>
      </div>

      <div className="bomb-layout">
        <div className="bomb-arena-column">
          <div className="bomb-arena-frame">
            <Arena room={room} />
            {room.status === 'countdown' && (
              <div className="countdown-overlay"><span>{room.countdown}</span><small>GET READY</small></div>
            )}
            {roundFinished && (
              <div className="finished-overlay bomb-finished-overlay">
                <span>{winner ? '★' : '✹'}</span>
                <h2>{winner ? `${winner.nickname} wins!` : 'Round complete'}</h2>
                <p>{winner ? 'Last player standing.' : 'No players remain in the arena.'}</p>
              </div>
            )}
          </div>
          <div className="bomb-control-row">
            <p className="bomb-instructions"><strong>Tag to pass the bomb.</strong> Move with WASD or the arrow keys. The holder when the fuse runs out is eliminated.</p>
            <div className="bomb-dpad" aria-label="Touch movement controls">
              <button type="button" aria-label="Move up" disabled={!active} onPointerDown={(event) => { event.preventDefault(); setDirection('up', true); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={() => setDirection('up', false)} onPointerCancel={() => setDirection('up', false)}>↑</button>
              <button type="button" aria-label="Move left" disabled={!active} onPointerDown={(event) => { event.preventDefault(); setDirection('left', true); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={() => setDirection('left', false)} onPointerCancel={() => setDirection('left', false)}>←</button>
              <button type="button" aria-label="Move down" disabled={!active} onPointerDown={(event) => { event.preventDefault(); setDirection('down', true); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={() => setDirection('down', false)} onPointerCancel={() => setDirection('down', false)}>↓</button>
              <button type="button" aria-label="Move right" disabled={!active} onPointerDown={(event) => { event.preventDefault(); setDirection('right', true); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={() => setDirection('right', false)} onPointerCancel={() => setDirection('right', false)}>→</button>
            </div>
          </div>
        </div>

        <aside className="bomb-sidebar">
          <section className="player-panel bomb-player-panel">
            <div className="panel-heading">
              <div><h2>Arena players</h2><span>{room.players.filter((player) => player.connected).length} / {room.maxPlayers} connected</span></div>
              <span className="panel-live"><i /> LIVE</span>
            </div>
            <ul className="player-list bomb-player-list">
              {room.players.map((player, index) => {
                const state = game?.players[player.id];
                const isHolding = game?.bombHolderId === player.id && room.status === 'playing';
                return (
                  <li key={player.id} className={!player.connected || (state && !state.alive) ? 'player-offline' : ''}>
                    <span className="avatar" style={{ backgroundColor: COLORS[index % COLORS.length] }}>{player.nickname.slice(0, 1).toUpperCase()}</span>
                    <span className="player-name">{player.nickname}{player.id === playerId && <small>YOU</small>}</span>
                    {player.id === room.hostId && <span className="host-tag">HOST ✦</span>}
                    <span className={`bomb-player-state ${isHolding ? 'is-holder' : ''}`}>
                      {isHolding ? 'BOMB' : !player.connected ? 'OFFLINE' : state && !state.alive ? 'OUT' : 'SAFE'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          {roundFinished && (
            <div className="bomb-result-card">
              <div className="eyebrow">ROUND RESULTS</div>
              <ol>
                {[...(game?.eliminationOrder || [])].reverse().map((id) => {
                  const player = room.players.find((entry) => entry.id === id);
                  return player ? <li key={id}><span>{player.nickname}</span><small>ELIMINATED</small></li> : null;
                })}
                {winner && <li className="bomb-winner-row"><span>{winner.nickname}</span><small>WINNER</small></li>}
              </ol>
            </div>
          )}
          {roundFinished && isHost && (
            <button className="button primary wide bomb-rematch" onClick={onReset}>
              {room.players.filter((player) => player.connected).length >= 2 ? 'Play another round' : 'Return to lobby'} <span>→</span>
            </button>
          )}
          {roundFinished && !isHost && <p className="wait-host">Waiting for the host to start another round.</p>}
          {roundFinished && <button className="button secondary wide bomb-leave" onClick={onLeave}>Leave room</button>}
        </aside>
      </div>
    </section>
  );
}

function Arena({ room }) {
  const game = room.bombTag;
  const colors = new Map(room.players.map((player, index) => [player.id, COLORS[index % COLORS.length]]));

  return (
    <svg
      className="bomb-arena-svg"
      viewBox={`0 0 ${game?.arena.width || 900} ${game?.arena.height || 560}`}
      role="img"
      aria-label="Bomb Tag arena"
    >
      <defs>
        <pattern id="bomb-grid" width="36" height="36" patternUnits="userSpaceOnUse">
          <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#29333d" strokeWidth="1" />
        </pattern>
        <radialGradient id="bomb-glow">
          <stop offset="0%" stopColor="#ff866b" stopOpacity=".4" />
          <stop offset="100%" stopColor="#ff866b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="900" height="560" fill="#121b25" />
      <rect width="900" height="560" fill="url(#bomb-grid)" />
      <rect x="12" y="12" width="876" height="536" rx="28" fill="none" stroke="#43515c" strokeWidth="4" />
      <rect x="23" y="23" width="854" height="514" rx="20" fill="none" stroke="#26343b" strokeWidth="2" strokeDasharray="9 12" />
      <circle cx="450" cy="280" r="115" fill="url(#bomb-glow)" opacity=".26" />
      <circle cx="450" cy="280" r="70" fill="none" stroke="#293a40" strokeWidth="2" strokeDasharray="6 10" />
      {[...Array(8)].map((_, index) => {
        const x = 130 + (index % 4) * 215;
        const y = index < 4 ? 125 : 435;
        return <circle key={index} cx={x} cy={y} r="5" fill="#52625e" opacity=".65" />;
      })}
      {room.players.map((player) => {
        const state = game?.players[player.id];
        if (!state?.alive) return null;
        const holding = game.bombHolderId === player.id && room.status === 'playing';
        return (
          <g key={player.id} transform={`translate(${state.x} ${state.y})`}>
            {holding && <circle r="33" fill="none" stroke="#ff866b" strokeWidth="3" strokeDasharray="5 6" className="bomb-holder-ring" />}
            <circle r="22" fill={colors.get(player.id)} stroke="#f1eee8" strokeWidth={holding ? 3 : 1.5} />
            <text textAnchor="middle" y="5" fill="#121820" fontSize="14" fontWeight="800">{player.nickname.slice(0, 1).toUpperCase()}</text>
            {holding && (
              <g transform="translate(0 -38)" aria-label="Bomb">
                <circle r="13" fill="#171c22" stroke="#ffd166" strokeWidth="2" />
                <text textAnchor="middle" y="5" fill="#ffd166" fontSize="16" fontWeight="800">!</text>
              </g>
            )}
            <text y="40" textAnchor="middle" fill="#f3f2ec" stroke="#121820" strokeWidth="4" paintOrder="stroke" fontSize="12" fontWeight="700">{player.nickname}</text>
          </g>
        );
      })}
      <text x="450" y="285" textAnchor="middle" fill="#677a75" fontSize="12" fontWeight="700" letterSpacing="3">BOMB TAG</text>
    </svg>
  );
}
