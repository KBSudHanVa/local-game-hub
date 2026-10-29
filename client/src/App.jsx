import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Race } from './games/Race.jsx';
import { TicTacToe } from './games/TicTacToe.jsx';
import { BombTag } from './games/BombTag.jsx';
import { ArenaBlaster } from './games/ArenaBlaster.jsx';

const SESSION_KEY = 'office-game-session';
const NAME_LIMIT = 16;

function loadSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (saved && typeof saved.token === 'string' && typeof saved.code === 'string') return saved;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
  return { token: createToken(), code: null };
}

function createToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function formatError(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

export default function App() {
  const [session, setSession] = useState(loadSession);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [screen, setScreen] = useState('home');
  const [formMode, setFormMode] = useState('create');
  const [selectedGameId, setSelectedGameId] = useState('mini-car-race');
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectedPlayers, setConnectedPlayers] = useState(0);
  const [serverError, setServerError] = useState('');
  const reconnectStarted = useRef(false);

  useEffect(() => {
    const nextSocket = io({ autoConnect: false, reconnectionAttempts: Infinity });
    setSocket(nextSocket);
    nextSocket.on('connect', () => {
      setConnected(true);
      setServerError('');
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!saved?.code || reconnectStarted.current) return;
      reconnectStarted.current = true;
      nextSocket.emit('room:reconnect', { code: saved.code, token: saved.token }, (result) => {
        reconnectStarted.current = false;
        if (result?.ok) {
          setRoom(result.room);
          setScreen('room');
          setSession({ ...saved, playerId: result.playerId });
        } else {
          sessionStorage.removeItem(SESSION_KEY);
          const newSession = { token: createToken(), code: null };
          setSession(newSession);
          setRoom(null);
          setScreen('home');
          setError(result?.error || 'Your previous room is no longer available.');
        }
      });
    });
    nextSocket.on('disconnect', () => setConnected(false));
    nextSocket.on('connect_error', () => setServerError('Cannot reach the game server. Check that the app is running.'));
    nextSocket.on('room:state', (state) => setRoom(state));
    nextSocket.on('room:closed', () => {
      setRoom(null);
      setScreen('home');
      setError('The room closed because everyone disconnected.');
      sessionStorage.removeItem(SESSION_KEY);
    });
    nextSocket.on('room:removed', (message) => {
      sessionStorage.removeItem(SESSION_KEY);
      setSession({ token: createToken(), code: null });
      setRoom(null);
      setScreen('home');
      setError(message?.message || 'The host removed you from the room.');
    });
    nextSocket.on('stats:update', (stats) => setConnectedPlayers(stats.connectedPlayers));
    nextSocket.on('action:error', (message) => setError(message.error || 'The server rejected that action.'));
    fetch('/api/stats')
      .then((response) => {
        if (!response.ok) throw new Error('Could not load player count.');
        return response.json();
      })
      .then((stats) => setConnectedPlayers(stats.connectedPlayers))
      .catch(() => setConnectedPlayers(0));
    nextSocket.connect();
    return () => nextSocket.disconnect();
  }, []);

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }, [session]);

  const send = useCallback((eventName, payload = {}) => new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ ok: false, error: 'Not connected to the game server. Reconnecting…' });
      return;
    }
    socket.timeout(7000).emit(eventName, payload, (timeoutError, result) => {
      if (timeoutError) {
        resolve({ ok: false, error: 'The server did not respond. Please try again.' });
        return;
      }
      resolve(result);
    });
  }), [socket]);

  const clearAlerts = () => {
    setError('');
    setNotice('');
  };

  const startFlow = (mode, gameId = selectedGameId) => {
    clearAlerts();
    setFormMode(mode);
    setSelectedGameId(gameId);
    setScreen('form');
  };

  const enterRoom = async (mode) => {
    clearAlerts();
    const cleanName = nickname.trim();
    if (!cleanName) return setError('Enter a nickname before continuing.');
    if (cleanName.length > NAME_LIMIT) return setError(`Nicknames must be ${NAME_LIMIT} characters or fewer.`);
    const token = session.token || createToken();
    setBusy(true);
    const result = mode === 'create'
      ? await send('room:create', { nickname: cleanName, token, gameId: selectedGameId })
      : await send('room:join', { code: roomCode.trim().toUpperCase(), nickname: cleanName, token });
    setBusy(false);
    if (!result?.ok) {
      setError(result?.error || 'The room action could not be completed.');
      return;
    }
    const nextSession = { token, code: result.code, playerId: result.playerId };
    setSession(nextSession);
    setRoom(result.room);
    setScreen('room');
  };

  const startRace = async () => {
    clearAlerts();
    const gameStartEvents = {
      'mini-car-race': 'race:start',
      'tic-tac-toe': 'game:start',
      'bomb-tag': 'bomb:start',
      'arena-blaster': 'blaster:start',
    };
    const result = await send(gameStartEvents[room?.gameId]);
    if (!result?.ok) setError(result?.error || 'Could not start the game.');
  };

  const selectMap = async (mapId) => {
    clearAlerts();
    const result = await send('room:select-map', { mapId });
    if (!result?.ok) {
      setError(result?.error || 'Could not select that map.');
      return;
    }
    setRoom(result.room);
  };

  const returnToLobby = async () => {
    clearAlerts();
    const result = await send('race:return-to-lobby');
    if (!result?.ok) setError(result?.error || 'Could not return to the lobby.');
  };

  const resetRace = async () => {
    clearAlerts();
    const result = await send('race:reset');
    if (!result?.ok) {
      setError(result?.error || 'Could not reset the race.');
      return;
    }
    setRoom(result.room);
  };

  const resetTicTacToe = async () => {
    clearAlerts();
    const result = await send('game:reset');
    if (!result?.ok) {
      setError(result?.error || 'Could not start a rematch.');
      return;
    }
    setRoom(result.room);
  };

  const makeTicTacToeMove = async (cell) => {
    clearAlerts();
    const result = await send('game:move', { cell });
    if (!result?.ok) setError(result?.error || 'Could not place your mark.');
  };

  const resetBombTag = async () => {
    clearAlerts();
    const result = await send('bomb:reset');
    if (!result?.ok) setError(result?.error || 'Could not start another Bomb Tag round.');
  };

  const moveBombTag = useCallback(async (controls) => {
    const result = await send('bomb:input', { controls });
    if (!result?.ok && !['GAME_NOT_ACTIVE', 'PLAYER_ELIMINATED', 'INPUT_RATE_LIMIT'].includes(result.code)) {
      setError(result?.error || 'Could not send movement controls.');
    }
  }, [send]);

  const configureBlaster = async (mode, teamSize) => {
    clearAlerts();
    const result = await send('blaster:configure', { mode, teamSize });
    if (!result?.ok) {
      setError(result?.error || 'Could not update Arena Blaster settings.');
      return;
    }
    setRoom(result.room);
  };

  const moveBlaster = useCallback(async (controls) => {
    const result = await send('blaster:input', { controls });
    if (!result?.ok && !['GAME_NOT_ACTIVE', 'PLAYER_INACTIVE', 'SPECTATOR', 'INPUT_RATE_LIMIT'].includes(result.code)) {
      setError(result?.error || 'Could not send blaster controls.');
    }
  }, [send]);

  const resetBlaster = async () => {
    clearAlerts();
    const result = await send('blaster:reset');
    if (!result?.ok) setError(result?.error || 'Could not start another blaster round.');
  };

  const removePlayer = async (targetPlayerId) => {
    const result = await send('room:remove-player', { playerId: targetPlayerId });
    if (!result?.ok) {
      setError(result?.error || 'Could not remove that player.');
      return;
    }
    setRoom(result.room);
    setNotice('Player removed from the room.');
  };

  const leaveRoom = async () => {
    const result = await send('room:leave');
    if (!result?.ok && connected) {
      setError(result?.error || 'Could not leave the room.');
      return;
    }
    sessionStorage.removeItem(SESSION_KEY);
    const freshSession = { token: createToken(), code: null };
    setSession(freshSession);
    setRoom(null);
    setScreen('home');
    setNickname('');
    setError('');
    setNotice('');
    setTimeout(() => socket?.connect(), 50);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => room ? setScreen('room') : setScreen('home')} aria-label="Office Game Hub home">
          <span className="brand-mark">OG</span>
          <span>OFFICE GAME HUB</span>
        </button>
        <div className={`connection-pill ${connected ? 'online' : 'offline'}`}>
          <span className="status-dot" />
          {connected ? 'Connected' : 'Reconnecting'}
        </div>
      </header>

      {serverError && <div className="connection-banner">{serverError}</div>}
      {!connected && room && (
        <div className="connection-banner">Connection lost. We’re trying to reconnect you to room {room.code}…</div>
      )}

      {screen === 'home' && (
        <Home
          connectedPlayers={connectedPlayers}
          onCreate={(gameId) => startFlow('create', gameId)}
          onJoin={() => startFlow('join')}
          error={error}
          notice={notice}
        />
      )}
      {screen === 'form' && (
        <section className="form-page">
          <button className="back-link" onClick={() => setScreen('home')}>← Back to games</button>
          <div className="form-card">
            <div className="eyebrow">{formMode === 'create' ? 'START A NEW ROOM' : 'JOIN YOUR TEAM'}</div>
            <h1>{formMode === 'create' ? 'Choose your nickname' : 'Join a room'}</h1>
            <p className="muted">
              {formMode === 'create'
                ? `Create a ${selectedGameId === 'tic-tac-toe' ? 'Tic-Tac-Toe' : selectedGameId === 'bomb-tag' ? 'Bomb Tag' : selectedGameId === 'arena-blaster' ? 'Arena Blaster' : 'Mini Car Race'} room and invite your friends.`
                : 'No accounts, no setup. Enter your nickname and the room code to join your friends.'}
            </p>
            <label className="field-label" htmlFor="nickname">Nickname</label>
            <input
              id="nickname"
              maxLength={NAME_LIMIT + 1}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="e.g. Speedy Sam"
              autoComplete="nickname"
              onKeyDown={(event) => event.key === 'Enter' && enterRoom(formMode)}
            />
            {formMode === 'join' && (
              <>
                <label className="field-label" htmlFor="room-code">Room code</label>
                <input
                  id="room-code"
                  className="code-input"
                  maxLength={5}
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="ABCDE"
                  autoComplete="off"
                  onKeyDown={(event) => event.key === 'Enter' && enterRoom(formMode)}
                />
              </>
            )}
            {error && <div className="alert error-alert" role="alert">{error}</div>}
            {notice && <div className="alert info-alert" role="status">{notice}</div>}
            <button className="button primary wide" disabled={busy || !connected} onClick={() => enterRoom(formMode)}>
              {busy ? 'Connecting…' : formMode === 'create' ? 'Create room' : 'Join room'}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
            <div className="form-footnote">Your nickname is only visible to people in your room.</div>
          </div>
        </section>
      )}
      {screen === 'room' && room && (
        room.status === 'lobby'
          ? <Lobby room={room} playerId={session.playerId} error={error} notice={notice} onStart={startRace} onSelectMap={selectMap} onConfigureBlaster={configureBlaster} onRemovePlayer={removePlayer} onLeave={leaveRoom} onClear={clearAlerts} />
          : room.gameId === 'tic-tac-toe'
            ? <TicTacToe
                room={room}
                playerId={session.playerId}
                connected={connected}
                error={error}
                onMove={makeTicTacToeMove}
                onRematch={resetTicTacToe}
                onLeave={leaveRoom}
                onRemovePlayer={removePlayer}
              />
            : room.gameId === 'bomb-tag'
              ? <BombTag
                  room={room}
                  playerId={session.playerId}
                  connected={connected}
                  error={error}
                  onInput={moveBombTag}
                  onReset={resetBombTag}
                  onLeave={leaveRoom}
                />
              : room.gameId === 'arena-blaster'
                ? <ArenaBlaster
                    room={room}
                    playerId={session.playerId}
                    connected={connected}
                    error={error}
                    onInput={moveBlaster}
                    onReset={resetBlaster}
                    onLeave={leaveRoom}
                  />
              : <Race
              room={room}
              playerId={session.playerId}
              connected={connected}
              error={error}
              onClear={clearAlerts}
              onReturn={returnToLobby}
              onReset={resetRace}
              onRemovePlayer={removePlayer}
              send={send}
            />
      )}
    </main>
  );
}

function Home({ connectedPlayers, onCreate, onJoin, error, notice }) {
  return (
    <section className="home-page">
      {error && <div className="alert error-alert" role="alert">{error}</div>}
      {notice && <div className="alert info-alert" role="status">{notice}</div>}
      <div className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-star">✦</span> YOUR NEXT COFFEE BREAK, SORTED</div>
          <h1>Big fun.<br /><span>Small breaks.</span></h1>
          <p>Quick games for your office crew. Pick a game, pull your teammates in, and let the friendly rivalry begin.</p>
          <div className="hero-actions">
            <button className="button primary" onClick={() => onCreate('mini-car-race')}>Create a room <span>↗</span></button>
            <button className="button secondary" onClick={onJoin}>Join with a code</button>
          </div>
          <div className="online-count"><span className="online-indicator" />{connectedPlayers} {connectedPlayers === 1 ? 'player' : 'players'} online right now</div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-glow" />
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-dash dash-one" />
          <div className="art-dash dash-two" />
          <div className="art-car"><span /><i /><b /></div>
          <span className="art-star star-one">✦</span>
          <span className="art-star star-two">✳</span>
          <span className="art-label">READY, SET, GO!</span>
        </div>
      </div>

      <div className="games-heading">
        <div><div className="eyebrow">THE GAME SHELF</div><h2>Pick your next obsession</h2></div>
        <span className="shelf-count">04 GAMES READY</span>
      </div>
      <article className="game-card">
        <div className="game-art">
          <div className="mini-track"><span className="track-car">➤</span><i>START</i></div>
          <span className="game-art-badge">MULTIPLAYER</span>
        </div>
        <div className="game-info">
          <div className="game-type">ARCADE · 2–7 PLAYERS</div>
          <h3>Mini Car Race</h3>
          <p>Take the turns, hit every checkpoint, and leave your coworkers in the dust.</p>
          <button className="text-button" onClick={() => onCreate('mini-car-race')}>Play now <span>→</span></button>
        </div>
        <div className="game-number">01</div>
      </article>
      <article className="game-card">
        <div className="game-art ttt-game-art">
          <div className="ttt-art-board" aria-hidden="true">
            <span>X</span><span /><span>O</span>
            <span /><span>X</span><span />
            <span>O</span><span /><span>X</span>
          </div>
          <span className="game-art-badge">2-PLAYER</span>
        </div>
        <div className="game-info">
          <div className="game-type ttt-game-type">CLASSIC · 2 PLAYERS</div>
          <h3>Tic-Tac-Toe</h3>
          <p>Take turns, make a line of three, and claim the bragging rights.</p>
          <button className="text-button" onClick={() => onCreate('tic-tac-toe')}>Play now <span>→</span></button>
        </div>
        <div className="game-number">02</div>
      </article>
      <article className="game-card">
        <div className="game-art bomb-game-art">
          <div className="bomb-art-arena" aria-hidden="true">
            <span className="bomb-art-player player-one">A</span>
            <span className="bomb-art-player player-two">B</span>
            <span className="bomb-art-icon">✹</span>
          </div>
          <span className="game-art-badge">2–7 PLAYERS</span>
        </div>
        <div className="game-info">
          <div className="game-type bomb-game-type">ARCADE · 2–7 PLAYERS</div>
          <h3>Bomb Tag</h3>
          <p>Pass the bomb, dodge the blast, and be the last player standing.</p>
          <button className="text-button" onClick={() => onCreate('bomb-tag')}>Play now <span>→</span></button>
        </div>
        <div className="game-number">03</div>
      </article>
      <article className="game-card">
        <div className="game-art blaster-game-art">
          <div className="blaster-art-arena" aria-hidden="true">
            <span className="blaster-art-player blue">A</span>
            <span className="blaster-art-player red">B</span>
            <i />
          </div>
          <span className="game-art-badge">1–8 PLAYERS</span>
        </div>
        <div className="game-info">
          <div className="game-type blaster-game-type">ARCADE · SOLO & MULTIPLAYER</div>
          <h3>Arena Blaster</h3>
          <p>Practice against bots, battle free-for-all, or team up for balanced matches.</p>
          <button className="text-button" onClick={() => onCreate('arena-blaster')}>Play now <span>→</span></button>
        </div>
        <div className="game-number">04</div>
      </article>
      <footer className="home-footer">
        <span>MADE FOR THE MOMENTS BETWEEN MEETINGS</span>
        <span>LOCAL GAMES, GOOD VIBES <b>✦</b></span>
      </footer>
    </section>
  );
}

function Lobby({ room, playerId, error, notice, onStart, onSelectMap, onConfigureBlaster, onRemovePlayer, onLeave, onClear }) {
  const currentPlayer = room.players.find((player) => player.id === playerId);
  const isHost = room.hostId === playerId;
  const [copied, setCopied] = useState(false);
  const [selectingMap, setSelectingMap] = useState(false);
  const maps = room.maps || [];
  const selectedMap = maps.find((map) => map.id === room.selectedMapId);
  const isTicTacToe = room.gameId === 'tic-tac-toe';
  const isBombTag = room.gameId === 'bomb-tag';
  const isBlaster = room.gameId === 'arena-blaster';
  const isRace = room.gameId === 'mini-car-race';
  const connectedCount = room.players.filter((player) => player.connected).length;
  const blasterMode = room.blasterSettings?.mode || 'solo';
  const blasterTeamSize = room.blasterSettings?.teamSize || 1;
  const blasterRequiredPlayers = blasterTeamSize * 2;
  const blasterCanStart = blasterMode === 'solo'
    ? connectedCount === 1
    : blasterMode === 'free-for-all'
      ? connectedCount >= 2
      : connectedCount >= blasterRequiredPlayers;
  const enoughPlayers = isTicTacToe
    ? connectedCount === 2
    : isBlaster
      ? blasterCanStart
      : connectedCount >= 2;
  const canStart = isHost && enoughPlayers;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const chooseMap = async (mapId) => {
    if (selectingMap || mapId === room.selectedMapId) return;
    setSelectingMap(true);
    await onSelectMap(mapId);
    setSelectingMap(false);
  };

  return (
    <section className="lobby-page">
      <div className="lobby-topline">
        <button className="back-link" onClick={onLeave}>← Leave room</button>
        <span className="lobby-stage"><i /> WAITING LOBBY</span>
      </div>
      <div className="lobby-layout">
        <div className="lobby-main">
          <div className="eyebrow">ROOM {room.code}</div>
          <h1>
            {isTicTacToe
              ? <>Ready to<br />make a move<span>?</span></>
              : isBombTag
                ? <>The bomb is<br />waiting<span>!</span></>
                : isBlaster
                  ? <>Lock and<br />load<span>.</span></>
                : <>Drivers, start<br />your engines<span>.</span></>}
          </h1>
          <p className="muted">
            {isTicTacToe
              ? 'Invite one opponent. Players alternate X and O each game; X takes the first turn.'
              : isBombTag
                ? 'Invite 1–6 opponents. Move around the arena, tag another player to pass the bomb, and avoid holding it when it explodes.'
                : isBlaster
                  ? 'Pick a mode, then challenge bots or your crew in a bright, non-stop arena battle.'
                  : 'Get your crew in. The host can start when at least two drivers are ready.'}
          </p>
          <div className="room-code-card">
            <div><span className="field-label">SHARE THIS ROOM CODE</span><strong>{room.code}</strong></div>
            <button className="button secondary copy-button" onClick={copyCode}>{copied ? 'Copied!' : 'Copy code'}</button>
          </div>
          {isRace && <div className="map-picker">
            <div className="map-picker-heading">
              <div><h2>Choose your track</h2><span>{isHost ? 'Select a map before the race starts.' : `${selectedMap?.name || 'A map'} selected by the host`}</span></div>
              <span className="map-count">{maps.length} MAPS</span>
            </div>
            <div className="map-options">
              {maps.map((map) => (
                <button
                  type="button"
                  key={map.id}
                  className={`map-option ${room.selectedMapId === map.id ? 'selected' : ''}`}
                  aria-pressed={room.selectedMapId === map.id}
                  disabled={!isHost || selectingMap}
                  onClick={() => chooseMap(map.id)}
                >
                  <MapPreview mapId={map.id} />
                  <span className="map-option-name">{map.name}</span>
                  <span className="map-option-description">{map.description}</span>
                  {room.selectedMapId === map.id && <span className="map-selected-tag">SELECTED</span>}
                </button>
              ))}
            </div>
          </div>}
          {isBlaster && (
            <section className="blaster-mode-picker">
              <div className="map-picker-heading">
                <div><h2>Choose your mode</h2><span>{isHost ? 'The host sets the match rules.' : 'Mode selected by the host.'}</span></div>
                <span className="map-count">MEDIUM</span>
              </div>
              <label className="field-label" htmlFor="blaster-mode">GAME MODE</label>
              <select
                id="blaster-mode"
                value={blasterMode}
                disabled={!isHost}
                onChange={(event) => onConfigureBlaster(event.target.value, blasterTeamSize)}
              >
                <option value="solo">Solo Practice · medium bots</option>
                <option value="free-for-all">Free-for-all</option>
                <option value="teams">Team Battle</option>
              </select>
              {blasterMode === 'teams' && (
                <>
                  <label className="field-label" htmlFor="blaster-team-size">TEAM SIZE</label>
                  <select
                    id="blaster-team-size"
                    value={blasterTeamSize}
                    disabled={!isHost}
                    onChange={(event) => onConfigureBlaster('teams', Number(event.target.value))}
                  >
                    {[1, 2, 3, 4].map((size) => <option key={size} value={size}>{size}v{size}</option>)}
                  </select>
                </>
              )}
              <p className="blaster-mode-help">
                {blasterMode === 'solo'
                  ? 'One player practices against three medium-difficulty bots.'
                  : blasterMode === 'free-for-all'
                    ? 'Every connected player competes individually; first to 8 tags wins.'
                    : `${blasterTeamSize}v${blasterTeamSize} teams. Extra players spectate and rotate into the next round.`}
              </p>
            </section>
          )}
          <div className="player-panel">
            <div className="panel-heading"><div><h2>{isTicTacToe || isBombTag || isBlaster ? 'Players' : 'On the grid'}</h2><span>{connectedCount} / {room.maxPlayers} connected</span></div><span className="panel-live"><i /> LIVE</span></div>
            <ul className="player-list">
              {room.players.map((player, index) => (
                <li key={player.id} className={!player.connected ? 'player-offline' : ''}>
                  <span className={`avatar avatar-${index % 7}`}>{player.nickname.slice(0, 1).toUpperCase()}</span>
                  <span className="player-name">{player.nickname}{player.id === playerId && <small>YOU</small>}</span>
                  {player.id === room.hostId && <span className="host-tag">HOST ✦</span>}
                  <span className="player-state"><i />{player.connected ? 'Ready' : 'Disconnected'}</span>
                  {isHost && player.id !== playerId && (
                    <button className="remove-player-button" type="button" onClick={() => onRemovePlayer(player.id)} aria-label={`Remove ${player.nickname} from room`}>Remove</button>
                  )}
                </li>
              ))}
            </ul>
            {!enoughPlayers && (
              <div className="waiting-note"><span>⌛</span>
                {isBlaster
                  ? blasterMode === 'solo'
                    ? 'Solo Practice starts when only the host is connected.'
                    : blasterMode === 'teams'
                      ? `Waiting for ${blasterRequiredPlayers} connected players for ${blasterTeamSize}v${blasterTeamSize}.`
                      : 'Waiting for at least one opponent to join…'
                  : `Waiting for ${isTicTacToe ? 'one opponent' : isBombTag ? 'at least one opponent' : 'another driver'} to join…`}
              </div>
            )}
          </div>
          {(error || notice) && <div className={`alert ${error ? 'error-alert' : 'info-alert'}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
        </div>
        <aside className="lobby-sidebar">
          {isRace && <div className="race-preview">
            <div className="preview-label">UP NEXT</div>
            <div className={`preview-track preview-${room.selectedMapId}`}><MapPreview mapId={room.selectedMapId} /></div>
            <h2>{selectedMap?.name || 'Mini Car Race'}</h2>
            <p>3 laps · checkpoints · bragging rights</p>
          </div>}
          <div className="lobby-hint"><span className="hint-icon">{isTicTacToe ? '✕' : isBombTag ? '✹' : isBlaster ? '✦' : '⌨'}</span><div><strong>{isTicTacToe || isBombTag || isBlaster ? 'How to play' : 'Know the controls'}</strong><p>{isTicTacToe ? 'Take turns choosing an empty square. Three in a row wins.' : isBombTag ? 'Use WASD or arrow keys to run. Touch another player to hand off the bomb.' : isBlaster ? 'Move with WASD, aim with the mouse, and hold click or Space to fire.' : 'WASD or arrow keys to drive once the race begins.'}</p></div></div>
          <button
            className="button primary wide start-button"
            disabled={!canStart}
            onClick={() => { onClear(); onStart(); }}
          >
            {isHost ? (isTicTacToe ? 'Start game' : isBombTag ? 'Start Bomb Tag' : isBlaster ? 'Start Arena Blaster' : 'Start the race') : 'Waiting for host'}
            {isHost && <span>→</span>}
          </button>
          <p className="start-note">{isHost ? 'Ready when your crew is.' : 'The host will start when everyone is ready.'}</p>
          {currentPlayer && <div className="you-are">Playing as <strong>{currentPlayer.nickname}</strong></div>}
        </aside>
      </div>
    </section>
  );
}

function MapPreview({ mapId }) {
  const paths = {
    'grand-oval': 'M 22 35 C 22 13 78 13 78 35 C 78 57 22 57 22 35 Z',
    'corner-cut': 'M 28 15 L 70 15 Q 78 15 78 23 L 78 47 Q 78 55 70 55 L 28 55 Q 20 55 20 47 L 20 23 Q 20 15 28 15 Z',
    'coffee-run': 'M 22 37 C 22 19 43 14 50 31 C 57 48 78 44 78 27 C 78 10 57 13 50 31 C 43 49 22 54 22 37 Z',
    switchback: 'M 17 43 C 13 22 32 12 43 30 C 51 45 67 52 82 25',
    chicane: 'M 17 28 C 28 13 36 51 48 35 C 60 17 68 55 83 37',
    skyline: 'M 20 39 C 22 14 72 8 80 29 C 87 49 39 61 24 42',
  };
  return (
    <svg className="map-preview-svg" viewBox="0 0 100 70" aria-hidden="true">
      <path d={paths[mapId] || paths['grand-oval']} fill="none" stroke="#111922" strokeWidth="17" strokeLinejoin="round" />
      <path d={paths[mapId] || paths['grand-oval']} fill="none" stroke="#68737c" strokeWidth="13" strokeLinejoin="round" />
      <path d={paths[mapId] || paths['grand-oval']} fill="none" stroke="#d7dcd5" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="50" cy="49" r="3" fill="#ff896f" />
    </svg>
  );
}
