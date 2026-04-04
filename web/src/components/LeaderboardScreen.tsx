import { useEffect, useState } from 'react';
import type { Client, LeaderboardRecord, Session } from '@heroiclabs/nakama-js';
import { formatApiError } from '../formatApiError';
import { LEADERBOARD_ID } from '../leaderboardConfig';

type Props = {
  client: Client;
  session: Session | null;
  ensureSession: () => Promise<Session>;
  onBack: () => void;
};

export function LeaderboardScreen({ client, session, ensureSession, onBack }: Props) {
  const [rows, setRows] = useState<LeaderboardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const sess = session ?? (await ensureSession());
        const list = await client.listLeaderboardRecords(sess, LEADERBOARD_ID, undefined, 25);
        if (!cancelled) setRows(list.records ?? []);
      } catch (e) {
        if (!cancelled) setErr(await formatApiError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, session, ensureSession]);

  return (
    <div className="screen screen-leaderboard">
      <header className="lb-header">
        <button type="button" className="btn-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <h1 className="lb-title">Leaderboard</h1>
      </header>
      <p className="lb-sub">Total wins (authoritative)</p>

      {loading && <p className="lb-status">Loading…</p>}
      {err && <p className="lb-status lb-err">{err}</p>}

      {!loading && !err && rows.length === 0 && (
        <p className="lb-status">No wins recorded yet. Play a match!</p>
      )}

      {!loading && rows.length > 0 && (
        <ol className="lb-list">
          {rows.map((r, i) => (
            <li key={r.owner_id ?? String(i)} className="lb-row">
              <span className="lb-rank">{r.rank ?? i + 1}</span>
              <span className="lb-name">{r.username?.trim() || r.owner_id?.slice(0, 8) || 'Player'}</span>
              <span className="lb-score">{r.score ?? 0}</span>
            </li>
          ))}
        </ol>
      )}

      <button type="button" className="btn-primary btn-block lb-play" onClick={onBack}>
        Play
      </button>
    </div>
  );
}
