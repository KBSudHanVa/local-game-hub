import { useEffect, useRef } from 'react';

const KEY_MAP = {
  ArrowUp: 'throttle',
  KeyW: 'throttle',
  ArrowDown: 'brake',
  KeyS: 'brake',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

export function Race({ room, playerId, connected, error, onClear, onReturn, onReset, onRemovePlayer, send }) {
  const pressed = useRef(new Set());
  const throttleRef = useRef(null);
  const me = room.players.find((player) => player.id === playerId);
  const controlsActive = connected && room.status === 'racing' && me?.connected && !me?.car?.finishedAt && !me?.disconnected;

  useEffect(() => {
    const update = () => {
      const controls = {
        throttle: pressed.current.has('throttle'),
        brake: pressed.current.has('brake'),
        steer: Number(pressed.current.has('right')) - Number(pressed.current.has('left')),
      };
      send('race:input', controls);
    };
    const keyDown = (event) => {
      const action = KEY_MAP[event.code];
      if (!action || !controlsActive) return;
      event.preventDefault();
      pressed.current.add(action);
    };
    const keyUp = (event) => {
      const action = KEY_MAP[event.code];
      if (!action) return;
      event.preventDefault();
      pressed.current.delete(action);
    };
    const clear = () => {
      pressed.current.clear();
      if (room.status === 'racing') update();
    };
    if (controlsActive) {
      window.addEventListener('keydown', keyDown);
      window.addEventListener('keyup', keyUp);
      window.addEventListener('blur', clear);
      throttleRef.current = window.setInterval(update, 50);
    }
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clear);
      if (throttleRef.current) window.clearInterval(throttleRef.current);
      throttleRef.current = null;
      pressed.current.clear();
    };
  }, [controlsActive, room.status, send]);

  const finished = room.status === 'finished';
  const countdown = room.status === 'countdown';
  const raceStarted = room.startedAt && Date.now() - room.startedAt < 900;
  const board = room.leaderboard || [];
  const hasWinner = (room.finishingOrder?.length || 0) > 0;
  const canReset = room.hostId === playerId &&
    (room.status === 'finished' || (room.status === 'racing' && hasWinner));
  const myStanding = board.findIndex((player) => player.id === playerId) + 1;
  const elapsed = room.startedAt ? Math.max(0, (room.serverTime - room.startedAt) / 1000) : 0;

  return (
    <section className="race-page" onPointerDown={onClear}>
      <div className="race-header">
        <div><div className="eyebrow">ROOM {room.code} · {room.track.name}</div><h1>{finished ? 'Checkered flag!' : countdown ? 'Get ready, drivers.' : 'Race day.'}</h1></div>
        <div className="race-header-right">
          <div className="race-status"><i />{connected ? room.status.toUpperCase() : 'DISCONNECTED'}</div>
          <span className="lap-setting">{room.lapsToWin} LAPS</span>
        </div>
      </div>
      {!connected && <div className="alert error-alert" role="alert">Connection lost. Your car is paused while we reconnect.</div>}
      {error && <div className="alert error-alert" role="alert">{error}</div>}
      <div className="race-layout">
        <div className="track-column">
          <div className="track-frame">
            <Track room={room} />
            {countdown && <div className="countdown-overlay"><span>{room.countdown > 0 ? room.countdown : 'GO!'}</span><small>GET READY</small></div>}
            {!countdown && raceStarted && !finished && <div className="go-flash">GO!</div>}
            {finished && <div className="finished-overlay"><span>🏁</span><h2>Race complete!</h2><p>{board[0]?.finished ? `${board[0].nickname} takes the win.` : 'No drivers finished this race.'}</p></div>}
          </div>
          <div className="race-bottom-bar">
            <div><span className="stat-label">YOUR POSITION</span><strong>{myStanding ? `P${myStanding}` : '—'} <small>/ {room.players.length}</small></strong></div>
            <div><span className="stat-label">YOUR LAPS</span><strong>{me?.car?.lap ?? 0}<small> / {room.lapsToWin}</small></strong></div>
            <div><span className="stat-label">ELAPSED</span><strong>{elapsed.toFixed(1)}<small> sec</small></strong></div>
            <div className="key-help"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd><span>or WASD to drive</span></div>
          </div>
          <div className="race-instructions"><span>✦</span> Follow every checkpoint in order. The finish line only counts when you’ve completed the full circuit.</div>
        </div>
        <aside className="leaderboard-card">
          <div className="panel-heading"><div><h2>Leaderboard</h2><span>{board.length} drivers on track</span></div><span className="panel-live"><i /> LIVE</span></div>
          <ol className="leaderboard-list">
            {board.map((player, index) => {
              const details = room.players.find((entry) => entry.id === player.id);
              return (
                <li key={player.id} className={player.id === playerId ? 'leaderboard-me' : ''}>
                  <span className={`position-number ${index === 0 && player.finished ? 'winner' : ''}`}>{player.finished ? `#${player.position}` : `0${index + 1}`}</span>
                  <span className="leaderboard-avatar" style={{ backgroundColor: details?.car?.color || '#516176' }}>{player.nickname.slice(0, 1).toUpperCase()}</span>
                  <span className="leaderboard-name">{player.nickname}{player.id === playerId && <small>YOU</small>}<small>{player.disconnected ? 'DISCONNECTED' : player.finished ? 'FINISHED' : `${player.lap}/${room.lapsToWin} LAPS`}</small></span>
                  <span className="leaderboard-time">{player.elapsed !== null ? `${(player.elapsed / 1000).toFixed(1)}s` : player.finished ? '—' : 'RACING'}</span>
                  {room.hostId === playerId && player.disconnected && (
                    <button className="remove-player-button race-remove-button" type="button" onClick={() => onRemovePlayer(player.id)} aria-label={`Remove disconnected player ${player.nickname}`}>Remove</button>
                  )}
                </li>
              );
            })}
          </ol>
          {room.hostId === playerId && (room.status === 'racing' || finished) && (
            <>
              <button className="button primary wide" disabled={!canReset} onClick={onReset}>Reset race <span>↻</span></button>
              {room.status === 'racing' && !hasWinner && <p className="wait-host">Reset becomes available when the first driver finishes.</p>}
            </>
          )}
          {room.status === 'racing' && hasWinner && room.hostId !== playerId && <p className="wait-host">The first driver finished! Waiting for the host to reset the race.</p>}
          {finished && room.hostId !== playerId && <p className="wait-host">Waiting for the host to reset the race.</p>}
          <div className="leaderboard-footer">PLAY FAIR. TALK SMACK AFTER. <span>✦</span></div>
        </aside>
      </div>
    </section>
  );
}

function Track({ room }) {
  const path = `${room.track.centerline.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`;
  const finishLine = room.track.startLine;

return (
  <svg
    className="track-svg"
    viewBox="0 0 1000 620"
    role="img"
    aria-label="Top-down Mini Car Race circuit"
  >
    <defs>
      {/* Background grid */}
      <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
        <path
          d="M 32 0 L 0 0 0 32"
          fill="none"
          stroke="#1b2532"
          strokeWidth="1"
        />
      </pattern>

      {/* Checkered finish line */}
      <pattern
        id="checks"
        width="16"
        height="16"
        patternUnits="userSpaceOnUse"
      >
        <rect width="16" height="16" fill="#f3f0e9" />
        <rect width="8" height="8" fill="#202a35" />
        <rect x="8" y="8" width="8" height="8" fill="#202a35" />
      </pattern>

      {/* Road surface texture */}
      <pattern
        id="road-texture"
        width="24"
        height="24"
        patternUnits="userSpaceOnUse"
      >
        <circle cx="5" cy="6" r="0.8" fill="#ffffff" opacity="0.08" />
        <circle cx="17" cy="18" r="0.8" fill="#ffffff" opacity="0.08" />
      </pattern>

      {/* Car shadow */}
      <filter id="car-shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow
          dx="0"
          dy="3"
          stdDeviation="3"
          floodColor="#000000"
          floodOpacity="0.6"
        />
      </filter>
    </defs>

    {/* Background */}
    <rect width="1000" height="620" fill="#111a24" />
    <rect width="1000" height="620" fill="url(#grid)" />

    {/* Track outer border */}
    <path
      d={path}
      fill="none"
      stroke="#0a0e14"
      strokeWidth={room.track.roadWidth + 22}
      strokeLinejoin="round"
      strokeLinecap="round"
    />

    {/* Outer road edge */}
    <path
      d={path}
      fill="none"
      stroke="#d8ded7"
      strokeWidth={room.track.roadWidth + 10}
      strokeLinejoin="round"
      strokeLinecap="round"
    />

    {/* Kerbs */}
    <path
      d={path}
      fill="none"
      stroke="#e85d52"
      strokeWidth={room.track.roadWidth + 5}
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray="18 18"
    />

    {/* Road surface */}
    <path
      d={path}
      fill="none"
      stroke="#3b4651"
      strokeWidth={room.track.roadWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    />

    {/* Asphalt texture */}
    <path
      d={path}
      fill="none"
      stroke="url(#road-texture)"
      strokeWidth={room.track.roadWidth - 2}
      strokeLinejoin="round"
      strokeLinecap="round"
    />

    {/* Center lane markings */}
    <path
      d={path}
      fill="none"
      stroke="#eef3e9"
      strokeWidth="3"
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray="15 14"
    />

    {/* Inner road boundary */}
    <path
      d={path}
      fill="none"
      stroke="#cad3d6"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      opacity="0.65"
    />

    {/* Checkered start / finish line */}
    <g
      transform={`translate(${finishLine[0].x} ${finishLine[0].y})`}
    >
      <rect
        x={-8}
        y={-room.track.roadWidth / 2}
        width="16"
        height={room.track.roadWidth}
        fill="url(#checks)"
        stroke="#ffffff"
        strokeWidth="1"
        transform={`rotate(${
          Math.atan2(
            finishLine[1].y - finishLine[0].y,
            finishLine[1].x - finishLine[0].x
          ) * 180 / Math.PI + 90
        })`}
      />
    </g>

    {/* Checkpoints */}
    {room.track.checkpoints.map((checkpoint, index) => (
      <g key={checkpoint.label}>
        <circle
          cx={checkpoint.x}
          cy={checkpoint.y}
          r="24"
          fill="#141d26"
          fillOpacity="0.85"
          stroke={index === 3 ? "#ff795e" : "#71848c"}
          strokeWidth="2"
          strokeDasharray="4 4"
        />

        <circle
          cx={checkpoint.x}
          cy={checkpoint.y}
          r="17"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.12"
          strokeWidth="1"
        />

        <text
          x={checkpoint.x}
          y={checkpoint.y + 4}
          textAnchor="middle"
          fill="#f4f2e9"
          fontSize="11"
          fontWeight="800"
        >
          {index + 1}
        </text>
      </g>
    ))}

    {/* Track information */}
    <text
      x="500"
      y="306"
      textAnchor="middle"
      fill="#81978d"
      fontSize="12"
      fontWeight="800"
      letterSpacing="4"
    >
      {room.track.name.toUpperCase()}
    </text>

    <text
      x="500"
      y="328"
      textAnchor="middle"
      fill="#62766d"
      fontSize="10"
      letterSpacing="2"
    >
      CHECKPOINTS IN ORDER · START / FINISH
    </text>

    {/* Player cars */}
    {room.players
      .filter((player) => player.car)
      .map((player) => (
        <g
          key={player.id}
          transform={`translate(${player.car.x} ${player.car.y})`}
          opacity={player.disconnected ? 0.45 : 1}
          filter="url(#car-shadow)"
        >
          <g
            transform={`rotate(${
              player.car.angle * 180 / Math.PI
            })`}
          >
            {/* Car body */}
            <rect
              x="-18"
              y="-10"
              width="36"
              height="20"
              rx="6"
              fill={player.car.color}
              stroke="#ffffff"
              strokeWidth="1.5"
            />

            {/* Windshield */}
            <path
              d="M 1 -7 L 11 -5 L 11 5 L 1 7 Z"
              fill="#17212b"
              opacity="0.85"
            />

            {/* Rear windshield */}
            <path
              d="M -12 -5 L -5 -7 L -5 7 L -12 5 Z"
              fill="#17212b"
              opacity="0.65"
            />

            {/* Wheels */}
            <rect x="-12" y="-13" width="8" height="5" rx="2" fill="#080b10" />
            <rect x="7" y="-13" width="8" height="5" rx="2" fill="#080b10" />
            <rect x="-12" y="8" width="8" height="5" rx="2" fill="#080b10" />
            <rect x="7" y="8" width="8" height="5" rx="2" fill="#080b10" />

            {/* Headlights */}
            <rect x="14" y="-6" width="3" height="4" rx="1" fill="#fff3b0" />
            <rect x="14" y="2" width="3" height="4" rx="1" fill="#fff3b0" />
          </g>

          {/* Player nickname */}
          <text
            x="0"
            y="-22"
            textAnchor="middle"
            fill="#ffffff"
            stroke="#121820"
            strokeWidth="4"
            paintOrder="stroke"
            fontSize="13"
            fontWeight="800"
          >
            {player.nickname}
          </text>
        </g>
      ))}
  </svg>
);

  // return (
  //   <svg className="track-svg" viewBox="0 0 1000 620" role="img" aria-label="Top-down Mini Car Race circuit">
  //     <defs>
  //       <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
  //         <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#1b2532" strokeWidth="1" />
  //       </pattern>
  //       <pattern id="checks" width="16" height="16" patternUnits="userSpaceOnUse">
  //         <rect width="8" height="8" fill="#f3f0e9" />
  //         <rect x="8" y="8" width="8" height="8" fill="#f3f0e9" />
  //       </pattern>
  //     </defs>
  //     <rect width="1000" height="620" fill="#111a24" />
  //     <rect width="1000" height="620" fill="url(#grid)" />
  //     <path d={path} fill="#192c30" stroke="#0a0e14" strokeWidth={room.track.roadWidth + 18} strokeLinejoin="round" />
  //     <path d={path} fill="none" stroke="#3b4651" strokeWidth={room.track.roadWidth} strokeLinejoin="round" />
  //     <path d={path} fill="none" stroke="#eef3e9" strokeWidth="3" strokeLinejoin="round" strokeDasharray="15 14" />
  //     <path d={path} fill="none" stroke="#cad3d6" strokeWidth="2" strokeLinejoin="round" />
  //     <path d={`M ${finishLine[0].x} ${finishLine[0].y} L ${finishLine[1].x} ${finishLine[1].y}`} stroke="#f8f6f0" strokeWidth="9" />
  //     {room.track.checkpoints.map((checkpoint, index) => (
  //       <g key={checkpoint.label}>
  //         <circle cx={checkpoint.x} cy={checkpoint.y} r="24" fill="#141d26" stroke={index === 3 ? '#ff795e' : '#71848c'} strokeWidth="2" strokeDasharray="4 4" />
  //         <text x={checkpoint.x} y={checkpoint.y + 4} textAnchor="middle" fill="#f4f2e9" fontSize="11" fontWeight="800">{index + 1}</text>
  //       </g>
  //     ))}
  //     <text x="500" y="306" textAnchor="middle" fill="#81978d" fontSize="12" fontWeight="800" letterSpacing="4">{room.track.name.toUpperCase()}</text>
  //     <text x="500" y="328" textAnchor="middle" fill="#62766d" fontSize="10" letterSpacing="2">CHECKPOINTS IN ORDER · START / FINISH</text>
  //     {room.players.filter((player) => player.car).map((player) => (
  //       <g key={player.id} transform={`translate(${player.car.x} ${player.car.y})`} opacity={player.disconnected ? 0.45 : 1}>
  //         <g transform={`rotate(${player.car.angle * 180 / Math.PI})`}>
  //           <rect x="-18" y="-10" width="36" height="20" rx="6" fill={player.car.color} stroke="#fff" strokeWidth="2" />
  //           <path d="M 1 -7 L 11 -5 L 11 5 L 1 7 Z" fill="#17212b" opacity="0.8" />
  //           <circle cx="-10" cy="-12" r="3" fill="#18202a" /><circle cx="10" cy="-12" r="3" fill="#18202a" />
  //           <circle cx="-10" cy="12" r="3" fill="#18202a" /><circle cx="10" cy="12" r="3" fill="#18202a" />
  //         </g>
  //         <text x="0" y="-18" textAnchor="middle" fill="#fff" stroke="#121820" strokeWidth="4" paintOrder="stroke" fontSize="13" fontWeight="800">{player.nickname}</text>
  //       </g>
  //     ))}
  //   </svg>
  // );
}
