import { useState } from 'react';

export function TicTacToe({ room, playerId, connected, error, onMove, onRematch, onLeave, onRemovePlayer }) {
  const game = room.ticTacToe;
  const players = room.players;
  const currentPlayer = players.find((player) => player.id === playerId);
  const isHost = room.hostId === playerId;
  const winner = players.find((player) => player.id === game?.winnerId);
  const turnPlayer = players.find((player) => player.id === game?.turnPlayerId);
  const [pendingCell, setPendingCell] = useState(null);
  const winningCells = new Set(game?.winningLine || []);

  const play = async (cell) => {
    if (pendingCell !== null) return;
    setPendingCell(cell);
    try {
      await onMove(cell);
    } finally {
      setPendingCell(null);
    }
  };

  let statusMessage = 'Waiting for the game to start.';
  if (room.status === 'playing') {
    statusMessage = game.turnPlayerId === playerId ? 'Your turn' : `${turnPlayer?.nickname || 'Opponent'} is choosing`;
  } else if (game.draw) {
    statusMessage = 'It’s a draw!';
  } else if (winner) {
    statusMessage = winner.id === playerId ? 'You win!' : `${winner.nickname} wins!`;
  }

  return (
    <section className="ttt-page">
      <div className="ttt-topline">
        <div>
          <div className="eyebrow">TIC-TAC-TOE · ROOM {room.code}</div>
          <h1>Three in a row<span>.</span></h1>
        </div>
        <div className={`connection-pill ${connected ? 'online' : 'offline'}`}>
          <span className="status-dot" />{connected ? 'Connected' : 'Reconnecting'}
        </div>
      </div>
      <div className="ttt-layout">
        <div className="ttt-main">
          <div className={`ttt-status ${room.status === 'finished' ? 'finished' : ''}`} role="status">
            <span className="ttt-status-symbol">{game?.draw ? '＝' : winner ? game.symbols[winner.id] : '✦'}</span>
            <div>
              <strong>{statusMessage}</strong>
              <span>{room.status === 'finished' ? 'The board is final.' : 'Take turns choosing a square.'}</span>
            </div>
          </div>
          <div className="ttt-board" role="group" aria-label="Tic-Tac-Toe board">
            {(game?.board || Array(9).fill(null)).map((mark, cell) => {
              const label = mark ? `Square ${cell + 1}, ${mark}` : `Square ${cell + 1}, empty`;
              return (
                <button
                  type="button"
                  key={cell}
                  className={`ttt-cell ${mark ? `mark-${mark.toLowerCase()}` : ''} ${winningCells.has(cell) ? 'winning-cell' : ''}`}
                  aria-label={label}
                  disabled={!connected || room.status !== 'playing' || game.turnPlayerId !== playerId || Boolean(mark) || pendingCell !== null}
                  onClick={() => play(cell)}
                >
                  {mark || ''}
                </button>
              );
            })}
          </div>
          <div className="ttt-actions">
            {room.status === 'finished' && isHost && (
              <button className="button primary" onClick={onRematch}>
                {players.length === 2 && players.every((player) => player.connected) ? 'Play again' : 'Return to lobby'} <span>→</span>
              </button>
            )}
            {room.status === 'finished' && !isHost && <p className="wait-host">Waiting for the host to start a rematch.</p>}
            {room.status === 'finished' && (
              <button className="button secondary" onClick={onLeave}>Leave room</button>
            )}
          </div>
          {error && <div className="alert error-alert" role="alert">{error}</div>}
        </div>
        <aside className="ttt-sidebar">
          <section className="player-panel ttt-players">
            <div className="panel-heading"><div><h2>Players</h2><span>{players.filter((player) => player.connected).length} / 2 connected</span></div><span className="panel-live"><i /> LIVE</span></div>
            <ul className="player-list">
              {players.map((player, index) => (
                <li key={player.id} className={!player.connected ? 'player-offline' : ''}>
                  <span className={`avatar avatar-${index}`}>{game?.symbols[player.id] || '?'}</span>
                  <span className="player-name">{player.nickname}{player.id === playerId && <small>YOU</small>}</span>
                  <span className="ttt-player-mark">{game?.symbols[player.id] || '—'}</span>
                  {player.id === room.hostId && <span className="host-tag">HOST ✦</span>}
                  {!player.connected && isHost && (
                    <button className="remove-player-button" type="button" onClick={() => onRemovePlayer(player.id)} aria-label={`Remove ${player.nickname} from room`}>Remove</button>
                  )}
                  {!player.connected && <span className="player-state">Disconnected</span>}
                </li>
              ))}
            </ul>
          </section>
          <div className="lobby-hint"><span className="hint-icon">✕</span><div><strong>How to play</strong><p>Host is X and starts. The first player to make a row of three wins; a full board is a draw.</p></div></div>
        </aside>
      </div>
    </section>
  );
}
