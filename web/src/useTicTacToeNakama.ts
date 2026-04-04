import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Client, Session, Socket } from '@heroiclabs/nakama-js';
import {
  OP,
  decodeMatchData,
  type CellValue,
  type GameOverPayload,
  type PlayerLeftPayload,
  type PlayerReadyPayload,
  type StateUpdatePayload,
} from './gameProtocol';
import { TICK_RATE } from './gameConstants';
import { formatApiError } from './formatApiError';
import {
  envHost,
  envKey,
  envPort,
  envSsl,
  getOrCreateDeviceId,
  getStoredDisplayName,
  parseRpcPayload,
  setIntroDoneForThisTab,
  setStoredDisplayName,
} from './nakamaEnv';

export type GamePhase = 'lobby' | 'waiting' | 'playing' | 'ended';

export function useTicTacToeNakama() {
  const [displayName, setDisplayName] = useState(() => getStoredDisplayName());

  const [status, setStatus] = useState('');
  const [statusErr, setStatusErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joiningMatch, setJoiningMatch] = useState(false);

  const [session, setSession] = useState<Session | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);

  const [players, setPlayers] = useState<PlayerReadyPayload['players'] | null>(null);
  const [displayUsernames, setDisplayUsernames] = useState<Record<string, string>>({});
  const [board, setBoard] = useState<CellValue[]>(Array(9).fill(''));
  const [marks, setMarks] = useState<Record<string, 'X' | 'O'>>({});
  const [currentTurn, setCurrentTurn] = useState('');
  const [playing, setPlaying] = useState(false);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);
  const [deadlineRemainingTicks, setDeadlineRemainingTicks] = useState(0);

  const [openMatches, setOpenMatches] = useState<{ match_id: string; size: number }[]>([]);

  // Ensures auto-reconnect runs at most once per hook lifetime (avoids double-firing in StrictMode).
  const reconnectAttempted = useRef(false);

  const client = useMemo(
    () => new Client(envKey(), envHost(), envPort(), envSsl()),
    []
  );

  const userId = session?.user_id ?? '';

  const phase: GamePhase = useMemo(() => {
    if (!matchId) return 'lobby';
    if (gameOver) return 'ended';
    if (!players) return 'waiting';
    return 'playing';
  }, [matchId, gameOver, players]);

  const turnSecondsLeft = Math.max(0, Math.ceil(deadlineRemainingTicks / TICK_RATE));

  const resetBoardUi = useCallback(() => {
    setPlayers(null);
    setDisplayUsernames({});
    setBoard(Array(9).fill(''));
    setMarks({});
    setCurrentTurn('');
    setPlaying(false);
    setGameOver(null);
    setWinningLine(null);
    setDeadlineRemainingTicks(0);
  }, []);

  const disconnectSocket = useCallback(() => {
    try {
      socket?.disconnect();
    } catch {
      /* ignore */
    }
    setSocket(null);
    setMatchId(null);
    resetBoardUi();
  }, [socket, resetBoardUi]);

  /** Apply stored display name so match presence uses the right username. */
  const syncUsername = useCallback(
    async (s: Session) => {
      const name = getStoredDisplayName();
      if (!name) return;
      await client.updateAccount(s, { username: name });
    },
    [client]
  );

  const ensureSession = useCallback(async () => {
    if (session) {
      await syncUsername(session);
      return session;
    }
    const deviceId = getOrCreateDeviceId();
    const s = await client.authenticateDevice(deviceId, true);
    await syncUsername(s);
    setSession(s);
    return s;
  }, [client, session, syncUsername]);

  const completeNicknameGate = useCallback(
    async (username: string) => {
      const trimmed = username.trim();
      setStoredDisplayName(trimmed);
      setDisplayName(trimmed);
      const deviceId = getOrCreateDeviceId();
      const s = await client.authenticateDevice(deviceId, true);
      await client.updateAccount(s, { username: trimmed });
      setSession(s);
      setIntroDoneForThisTab();
    },
    [client]
  );

  const attachSocket = useCallback(
    async (sess: Session, mid: string) => {
      const myUserId = sess.user_id ?? '';
      await syncUsername(sess);
      disconnectSocket();
      const sock = client.createSocket(envSsl(), false);

      sock.onmatchdata = (msg) => {
        const raw = decodeMatchData(msg.data) as Record<string, unknown>;
        switch (msg.op_code) {
          case OP.PLAYER_READY: {
            const p = raw as unknown as PlayerReadyPayload;
            const pl = p.players ?? {};
            setPlayers(pl);
            const names: Record<string, string> = {};
            for (const id of Object.keys(pl)) {
              names[id] = pl[id]?.username ?? '';
            }
            setDisplayUsernames(names);
            setStatus('');
            setStatusErr(false);
            break;
          }
          case OP.STATE_UPDATE: {
            const p = raw as unknown as StateUpdatePayload;
            setBoard([...p.board]);
            setMarks({ ...p.marks });
            setDisplayUsernames({ ...p.usernames });
            setCurrentTurn(p.currentTurn);
            setPlaying(p.playing);
            setDeadlineRemainingTicks(p.deadlineRemainingTicks ?? 0);
            break;
          }
          case OP.GAME_OVER: {
            const p = raw as unknown as GameOverPayload;
            setGameOver(p);
            setBoard([...p.board]);
            setMarks({ ...p.marks });
            setDisplayUsernames({ ...p.usernames });
            setPlaying(false);
            setWinningLine(p.winningLine);
            setDeadlineRemainingTicks(0);
            const youWon = p.winner === myUserId;
            const draw = p.winner === 'draw';
            setStatus(
              draw
                ? 'Draw.'
                : youWon
                  ? 'You win!'
                  : p.winner
                    ? 'You lost — opponent won or left.'
                    : 'Game over.'
            );
            setStatusErr(!youWon && !draw);
            break;
          }
          case OP.PLAYER_LEFT: {
            const pl = raw as unknown as PlayerLeftPayload;
            const who = pl.username?.trim() ? `${pl.username} left` : 'Opponent disconnected';
            setStatus(who);
            setStatusErr(false);
            break;
          }
          case OP.ERROR: {
            const e = raw as { message?: string };
            setStatus(e.message ?? 'Move rejected');
            setStatusErr(true);
            break;
          }
          default:
            break;
        }
      };

      const joinName = getStoredDisplayName();
      const joinMeta = joinName ? { displayName: joinName } : undefined;

      await sock.connect(sess, true);
      await sock.joinMatch(mid, undefined, joinMeta);
      setSocket(sock);
      setMatchId(mid);
    },
    [client, disconnectSocket, syncUsername]
  );

  useEffect(() => {
    return () => {
      try {
        socket?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [socket]);

  useEffect(() => {
    if (!matchId || gameOver || !playing) return;
    const id = window.setInterval(() => {
      setDeadlineRemainingTicks((d) => Math.max(0, d - TICK_RATE));
    }, 1000);
    return () => window.clearInterval(id);
  }, [matchId, gameOver, playing]);

  // Auto-reconnect: when a session becomes available for the first time (after
  // NicknameGate completes), check whether the player has an in-progress match.
  useEffect(() => {
    if (!session || matchId || reconnectAttempted.current) return;
    reconnectAttempted.current = true;
    runRejoinMatch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const runFindMatch = async () => {
    setBusy(true);
    setJoiningMatch(true);
    setStatusErr(false);
    try {
      const sess = await ensureSession();
      const rpc = await client.rpc(sess, 'find_match', {});
      const data = parseRpcPayload(rpc.payload ?? {});
      const mid = data.match_id as string;
      if (!mid) throw new Error('No match_id from server');
      await attachSocket(sess, mid);
      setStatus('');
    } catch (e) {
      setStatus(await formatApiError(e));
      setStatusErr(true);
    } finally {
      setBusy(false);
      setJoiningMatch(false);
    }
  };

  const runCreateMatch = async () => {
    setBusy(true);
    setJoiningMatch(true);
    setStatusErr(false);
    try {
      const sess = await ensureSession();
      const rpc = await client.rpc(sess, 'create_match', {});
      const data = parseRpcPayload(rpc.payload ?? {});
      const mid = data.match_id as string;
      if (!mid) throw new Error('No match_id from server');
      setStatus('Room created — share the id or wait for matchmaking.');
      await attachSocket(sess, mid);
    } catch (e) {
      setStatus(await formatApiError(e));
      setStatusErr(true);
    } finally {
      setBusy(false);
      setJoiningMatch(false);
    }
  };

  const runListOpen = async () => {
    setBusy(true);
    setStatusErr(false);
    try {
      const sess = await ensureSession();
      const rpc = await client.rpc(sess, 'list_open_matches', { limit: 15 });
      const data = parseRpcPayload(rpc.payload ?? {});
      const list = (data.matches as { match_id: string; size: number }[]) ?? [];
      setOpenMatches(list);
      setStatus(list.length ? `${list.length} open room(s).` : 'No open rooms.');
    } catch (e) {
      setStatus(await formatApiError(e));
      setStatusErr(true);
    } finally {
      setBusy(false);
    }
  };

  const joinListed = async (mid: string) => {
    setBusy(true);
    setJoiningMatch(true);
    setStatusErr(false);
    try {
      const sess = await ensureSession();
      await attachSocket(sess, mid);
      setStatus('');
    } catch (e) {
      setStatus(await formatApiError(e));
      setStatusErr(true);
    } finally {
      setBusy(false);
      setJoiningMatch(false);
    }
  };

  const sendMove = async (position: number) => {
    if (!socket || !matchId || !playing || gameOver) return;
    if (currentTurn !== userId) {
      setStatus('Not your turn.');
      setStatusErr(true);
      return;
    }
    try {
      await socket.sendMatchState(matchId, OP.MOVE, JSON.stringify({ position }));
    } catch (e) {
      setStatus(await formatApiError(e));
      setStatusErr(true);
    }
  };

  const leaveRoom = () => {
    disconnectSocket();
    setStatus('');
    setStatusErr(false);
  };

  /**
   * Attempt to reconnect to an in-progress match after a disconnect or page refresh.
   * Calls the rejoin_match RPC to check for a stored active match.
   * If the stored match has ended (join rejected), clears the stale record so the
   * next find_match call proceeds normally.
   */
  const runRejoinMatch = useCallback(async () => {
    if (matchId) return; // already in a match
    setBusy(true);
    setJoiningMatch(true);
    setStatusErr(false);
    try {
      const sess = await ensureSession();
      const rpc = await client.rpc(sess, 'rejoin_match', {});
      const data = parseRpcPayload(rpc.payload ?? {});
      const mid = data.match_id as string | null;
      if (!mid) return; // no active match stored — nothing to do
      setStatus('Reconnecting to your previous match…');
      try {
        await attachSocket(sess, mid);
        setStatus('');
      } catch {
        // The stored match has ended or is unreachable; clear the stale record.
        try { await client.rpc(sess, 'clear_active_match', {}); } catch { /* ignore */ }
        setStatus('');
      }
    } catch (e) {
      // Silently ignore rejoin failures — user stays on the lobby.
      setStatus('');
      setStatusErr(false);
    } finally {
      setBusy(false);
      setJoiningMatch(false);
    }
  }, [client, matchId, ensureSession, attachSocket]);

  const mySymbol = userId && marks[userId] ? marks[userId] : null;

  return {
    client,
    session,
    userId,
    displayName,
    phase,
    joiningMatch,
    status,
    statusErr,
    busy,
    openMatches,
    players,
    displayUsernames,
    board,
    marks,
    currentTurn,
    playing,
    gameOver,
    winningLine,
    mySymbol,
    turnSecondsLeft,
    runFindMatch,
    runCreateMatch,
    runListOpen,
    joinListed,
    sendMove,
    leaveRoom,
    runRejoinMatch,
    completeNicknameGate,
    ensureSession,
  };
}
