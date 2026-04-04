type OpenMatch = { match_id: string; size: number };

type Props = {
  busy: boolean;
  joiningMatch: boolean;
  status: string;
  statusErr: boolean;
  displayName: string;
  openMatches: OpenMatch[];
  onFindMatch: () => void;
  onCreateMatch: () => void;
  onListOpen: () => void;
  onJoinListed: (id: string) => void;
  onOpenLeaderboard: () => void;
};

export function LobbyScreen({
  busy,
  joiningMatch,
  status,
  statusErr,
  displayName,
  openMatches,
  onFindMatch,
  onCreateMatch,
  onListOpen,
  onJoinListed,
  onOpenLeaderboard,
}: Props) {
  return (
    <div className="screen screen-lobby">
      <header className="app-header">
        <h1 className="app-title">Tic-Tac-Toe</h1>
        <p className="app-tagline">Playing as · {displayName || '…'}</p>
      </header>

      {status ? (
        <p className={`banner ${statusErr ? 'banner-error' : ''}`} role="status">
          {status}
        </p>
      ) : null}

      <section className="card">
        <h2 className="card-title">Matchmaking</h2>
        <div className="stack">
          <button
            type="button"
            className="btn-primary btn-block"
            disabled={busy || joiningMatch}
            onClick={onFindMatch}
          >
            {joiningMatch ? 'Connecting…' : 'Find match'}
          </button>
          <button
            type="button"
            className="btn-secondary btn-block"
            disabled={busy || joiningMatch}
            onClick={onCreateMatch}
          >
            Create room
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Join a room</h2>
        <button
          type="button"
          className="btn-secondary btn-block"
          disabled={busy || joiningMatch}
          onClick={onListOpen}
        >
          Refresh open rooms
        </button>
        {openMatches.length > 0 && (
          <ul className="room-list">
            {openMatches.map((m) => (
              <li key={m.match_id} className="room-row">
                <span className="room-id" title={m.match_id}>
                  Open room
                  <span className="room-meta"> · {m.size}/2</span>
                </span>
                <button
                  type="button"
                  className="btn-small"
                  disabled={busy || joiningMatch}
                  onClick={() => onJoinListed(m.match_id)}
                >
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" className="btn-link" onClick={onOpenLeaderboard}>
        Leaderboard
      </button>
    </div>
  );
}
