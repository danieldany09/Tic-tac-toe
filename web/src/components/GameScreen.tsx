import type { CellValue, GameOverPayload, PlayerReadyPayload } from '../gameProtocol';

const TURN_SECS = 30; // must match backend TURN_TIME_SECS

type Props = {
  userId: string;
  displayName: string;
  players: PlayerReadyPayload['players'];
  displayUsernames: Record<string, string>;
  board: CellValue[];
  marks: Record<string, 'X' | 'O'>;
  currentTurn: string;
  playing: boolean;
  gameOver: GameOverPayload | null;
  winningLine: number[] | null;
  mySymbol: 'X' | 'O' | null;
  status: string;
  statusErr: boolean;
  turnSecondsLeft: number;
  busy: boolean;
  onCellClick: (i: number) => void;
  onLeave: () => void;
  onViewLeaderboard: () => void;
  onPlayAgain: () => void;
};

function labelFor(
  userId: string,
  localDisplayName: string,
  players: PlayerReadyPayload['players'],
  displayUsernames: Record<string, string>
): { you: string; opp: string; oppId: string | null } {
  const ids = Object.keys(players);
  const youEntry = ids.find((id) => id === userId);
  const oppId = ids.find((id) => id !== userId) ?? null;
  const you = localDisplayName || (youEntry && (players[youEntry]?.username || displayUsernames[youEntry])) || 'You';
  const opp =
    (oppId && (players[oppId]?.username || displayUsernames[oppId])) || 'Opponent';
  return { you, opp, oppId };
}

function TurnTimer({ seconds, total, yourTurn }: { seconds: number; total: number; yourTurn: boolean }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (seconds / total) * 100)) : 0;
  const urgent = seconds <= 10 && seconds > 0;
  const circumference = 2 * Math.PI * 22; // r=22
  const dash = (pct / 100) * circumference;

  return (
    <div className={`timer-wrap ${urgent ? 'timer-urgent' : ''} ${yourTurn ? 'timer-yours' : 'timer-opp'}`}>
      <svg className="timer-ring" viewBox="0 0 52 52" aria-hidden="true">
        <circle className="timer-ring-track" cx="26" cy="26" r="22" />
        <circle
          className="timer-ring-fill"
          cx="26"
          cy="26"
          r="22"
          strokeDasharray={`${dash} ${circumference}`}
          strokeDashoffset="0"
        />
      </svg>
      <span className="timer-label">{seconds}</span>
    </div>
  );
}

export function GameScreen({
  userId,
  displayName,
  players,
  displayUsernames,
  board,
  marks,
  currentTurn,
  playing,
  gameOver,
  winningLine,
  mySymbol,
  status,
  statusErr,
  turnSecondsLeft,
  busy,
  onCellClick,
  onLeave,
  onViewLeaderboard,
  onPlayAgain,
}: Props) {
  const { you, opp, oppId } = labelFor(userId, displayName, players, displayUsernames);
  const oppSymbol = oppId ? marks[oppId] : null;
  const yourTurn = playing && !gameOver && currentTurn === userId;
  const turnLabel = gameOver
    ? 'Game over'
    : yourTurn
      ? 'Your turn'
      : playing
        ? `${marks[currentTurn] ?? '?'}'s turn`
        : 'Starting…';

  return (
    <div className="screen screen-game">
      <header className="game-header">
        <div className="game-players">
          <div className="player-pill player-you">
            <span className="player-name">{you}</span>
            <span className="player-symbol">{mySymbol ?? '—'}</span>
            <span className="player-tag">you</span>
          </div>
          <div className="player-pill player-opp">
            <span className="player-name">{opp}</span>
            <span className="player-symbol">{oppSymbol ?? '—'}</span>
            <span className="player-tag">opp</span>
          </div>
        </div>
        <div className="turn-row">
          <span className={`turn-badge ${yourTurn ? 'turn-badge-active' : ''}`}>{turnLabel}</span>
        </div>
        {playing && !gameOver && (
          <TurnTimer seconds={turnSecondsLeft} total={TURN_SECS} yourTurn={yourTurn} />
        )}
      </header>

      {gameOver && (
        <div className="outcome-banner" role="status">
          {gameOver.winner === 'draw' && <span>It&apos;s a draw</span>}
          {gameOver.winner === userId && <span>You won</span>}
          {gameOver.winner && gameOver.winner !== 'draw' && gameOver.winner !== userId && (
            <span>{opp} won</span>
          )}
          {!gameOver.winner && <span>Match ended</span>}
        </div>
      )}

      {status && !gameOver && (
        <p className={`banner banner-compact ${statusErr ? 'banner-error' : ''}`}>{status}</p>
      )}

      <div className="board-wrap">
        <div className="board" aria-label="Tic-tac-toe board">
          {board.map((cell, i) => {
            const isWin = winningLine?.includes(i);
            const disabled =
              !playing || !!gameOver || cell !== '' || currentTurn !== userId || !players;
            return (
              <button
                key={i}
                type="button"
                className={`cell ${cell === 'X' ? 'x' : cell === 'O' ? 'o' : ''} ${isWin ? 'win' : ''} ${disabled && !cell ? 'cell-muted' : ''}`}
                disabled={disabled}
                onClick={() => onCellClick(i)}
                aria-label={`Cell ${i + 1} ${cell || 'empty'}`}
              >
                {cell}
              </button>
            );
          })}
        </div>
      </div>

      <footer className="game-footer">
        {gameOver ? (
          <div className="game-end-actions">
            <button type="button" className="btn-primary btn-block" disabled={busy} onClick={onViewLeaderboard}>
              Leaderboard
            </button>
            <button type="button" className="btn-outline btn-block" disabled={busy} onClick={onPlayAgain}>
              Play again
            </button>
          </div>
        ) : (
          <button type="button" className="btn-outline btn-block" disabled={busy} onClick={onLeave}>
            Leave room
          </button>
        )}
      </footer>
    </div>
  );
}
