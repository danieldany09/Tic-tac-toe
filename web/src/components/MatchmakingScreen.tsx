type Props = {
  onCancel: () => void;
  busy: boolean;
};

export function MatchmakingScreen({ onCancel, busy }: Props) {
  return (
    <div className="screen screen-matchmaking">
      <div className="matchmaking-inner">
        <p className="matchmaking-title">Finding a random player…</p>
        <p className="matchmaking-sub">It usually takes about 30 seconds.</p>
        <button type="button" className="btn-outline" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
