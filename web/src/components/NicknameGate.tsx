import { useState } from 'react';
import { formatApiError } from '../formatApiError';

type Props = {
  onDone: () => void;
  onSubmit: (username: string) => Promise<void>;
};

const MIN_LEN = 2;
const MAX_LEN = 64;

export function NicknameGate({ onDone, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    const trimmed = value.trim();
    if (trimmed.length < MIN_LEN) {
      setError(`Enter at least ${MIN_LEN} characters so other players know who you are.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onDone();
    } catch (e) {
      const msg = await formatApiError(e);
      if (/username|already|taken|exists|409|conflict/i.test(msg)) {
        setError('That name is already taken. Try a different one.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nickname-overlay" role="dialog" aria-labelledby="nickname-title">
      <div className="nickname-card">
        <div className="nickname-card-head">
          <h1 id="nickname-title" className="nickname-title">
            Who are you?
          </h1>
        </div>
        <p className="nickname-hint">Choose a unique name. It&apos;s shown to opponents in-game.</p>
        <input
          type="text"
          className="nickname-input"
          placeholder="Your player name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={MAX_LEN}
          minLength={MIN_LEN}
          autoComplete="nickname"
          disabled={busy}
          onKeyDown={(e) => e.key === 'Enter' && finish()}
        />
        {error && <p className="nickname-error">{error}</p>}
        <div className="nickname-actions">
          <button type="button" className="btn-primary nickname-continue" disabled={busy} onClick={finish}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
