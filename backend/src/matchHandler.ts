import {
  OP_CODES,
  DEADLINE_TICKS,
  POST_GAME_TICKS,
  MAX_EMPTY_TICKS,
  TicTacToeState,
  MatchLabel,
  MoveMessage,
  StateUpdatePayload,
  GameOverPayload,
  PlayerReadyPayload,
  PlayerLeftPayload,
  ErrorPayload,
  ACTIVE_MATCH_COLLECTION,
  ACTIVE_MATCH_RECORD_KEY,
} from './types';
import { checkWinner, checkDraw, isValidPosition, createEmptyBoard } from './gameLogic';
import { updatePlayerStats } from './leaderboard';

// Ensure new fields exist as strings — undefined values break Nakama goja state export
function normalizeState(s: TicTacToeState): TicTacToeState {
  if (typeof s.pendingLeftUserId !== 'string') s.pendingLeftUserId = '';
  if (typeof s.pendingLeftUsername !== 'string') s.pendingLeftUsername = '';
  if (!s.pendingDisplayNames || typeof s.pendingDisplayNames !== 'object') s.pendingDisplayNames = {};
  return s;
}

/** Client sends join metadata { displayName: "..." } so UI name is used instead of Nakama auto-username. */
function readJoinDisplayName(metadata: { [key: string]: any } | null | undefined): string {
  if (!metadata) return '';
  var v = metadata.displayName;
  if (typeof v !== 'string') v = metadata.display_name;
  if (typeof v !== 'string') return '';
  v = v.trim();
  if (v.length > 64) v = v.substring(0, 64);
  return v;
}

/** Nakama passes match data as ArrayBuffer in goja; String(buf) is not JSON. */
function matchDataToString(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  var buf = new Uint8Array(data as ArrayBuffer);
  var s = '';
  for (var i = 0; i < buf.length; i++) {
    s += String.fromCharCode(buf[i]);
  }
  return s;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentTurnUserId(state: TicTacToeState): string {
  var xId = '';
  var oId = '';
  var ids = Object.keys(state.marks);
  for (var i = 0; i < ids.length; i++) {
    if (state.marks[ids[i]] === 'X') xId = ids[i];
    if (state.marks[ids[i]] === 'O') oId = ids[i];
  }
  if (!xId || !oId) return '';
  var xCount = 0;
  var oCount = 0;
  for (var j = 0; j < state.board.length; j++) {
    if (state.board[j] === 'X') xCount++;
    if (state.board[j] === 'O') oCount++;
  }
  return xCount <= oCount ? xId : oId;
}

function getOpponentId(state: TicTacToeState, userId: string): string | null {
  var ids = Object.keys(state.presences);
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] !== userId) return ids[i];
  }
  return null;
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

function broadcastStateUpdate(dispatcher: nkruntime.MatchDispatcher, state: TicTacToeState): void {
  var payload: StateUpdatePayload = {
    board: state.board,
    marks: state.marks,
    usernames: state.usernames,
    currentTurn: getCurrentTurnUserId(state),
    playing: state.playing,
    deadlineRemainingTicks: state.deadlineRemainingTicks,
  };
  dispatcher.broadcastMessage(OP_CODES.STATE_UPDATE, JSON.stringify(payload), null, null, true);
}

function broadcastGameOver(dispatcher: nkruntime.MatchDispatcher, state: TicTacToeState): void {
  var payload: GameOverPayload = {
    winner: state.winner,
    winnerSymbol: state.winnerSymbol,
    winningLine: state.winningLine,
    board: state.board,
    usernames: state.usernames,
    marks: state.marks,
  };
  dispatcher.broadcastMessage(OP_CODES.GAME_OVER, JSON.stringify(payload), null, null, true);
}


// ─── Match handlers ───────────────────────────────────────────────────────────

export function matchInit(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _params: { [key: string]: string }
): { state: nkruntime.MatchState; tickRate: number; label: string } {
  // All state values must be plain JS primitives/arrays/objects.
  // Never store goja-backed Go objects (like Presence) in state —
  // they break goja's Export() when Nakama reads the return value.
  var state: TicTacToeState = {
    board: createEmptyBoard(),
    marks: {},
    usernames: {},
    presences: {},
    joinsInProgress: 0,
    playing: false,
    winner: null,
    winnerSymbol: null,
    winningLine: null,
    deadlineRemainingTicks: DEADLINE_TICKS,
    postGameTicks: POST_GAME_TICKS,
    emptyTicks: 0,
    pendingLeftUserId: '',
    pendingLeftUsername: '',
    pendingDisplayNames: {},
  };
  logger.debug('TicTacToe: match initialised');
  return { state: state, tickRate: 5, label: JSON.stringify({ open: 1 }) };
}

export function matchJoinAttempt(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: any }
): { state: nkruntime.MatchState | null; accept: boolean; rejectMessage?: string } | null {
  var s = normalizeState(Object.assign({}, state as TicTacToeState) as TicTacToeState);
  if (Object.keys(s.presences).length + s.joinsInProgress >= 2) {
    return { state: s, accept: false, rejectMessage: 'Match is full' };
  }
  if (s.winner !== null) {
    return { state: s, accept: false, rejectMessage: 'Match has already ended' };
  }
  logger.debug('TicTacToe: join attempt from ' + presence.userId);
  var next = normalizeState(Object.assign({}, s) as TicTacToeState);
  next.pendingDisplayNames = Object.assign({}, s.pendingDisplayNames);
  var dn = readJoinDisplayName(metadata);
  if (dn) {
    next.pendingDisplayNames[presence.userId] = dn;
  }
  next.joinsInProgress = s.joinsInProgress + 1;
  return { state: next, accept: true };
}

export function matchJoin(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  presences: nkruntime.Presence[]
): { state: nkruntime.MatchState | null } | null {
  var s = normalizeState(Object.assign({}, state as TicTacToeState) as TicTacToeState);
  s.marks = Object.assign({}, s.marks);
  s.usernames = Object.assign({}, s.usernames);
  s.presences = Object.assign({}, s.presences);
  s.pendingDisplayNames = Object.assign({}, s.pendingDisplayNames);

  for (var i = 0; i < presences.length; i++) {
    var p = presences[i];
    s.joinsInProgress = s.joinsInProgress - 1;
    s.presences[p.userId] = true;           // store plain boolean, not Presence object
    var customName = s.pendingDisplayNames[p.userId];
    if (customName) {
      delete s.pendingDisplayNames[p.userId];
    }
    s.usernames[p.userId] = customName && customName.length > 0 ? customName : p.username || '';
    s.marks[p.userId] = Object.keys(s.marks).length === 0 ? 'X' : 'O';
    logger.debug('TicTacToe: ' + s.usernames[p.userId] + ' joined as ' + s.marks[p.userId]);
  }

  if (Object.keys(s.presences).length === 2) {
    s.playing = true;
    s.deadlineRemainingTicks = DEADLINE_TICKS;
    dispatcher.matchLabelUpdate(JSON.stringify({ open: 0 } as MatchLabel));

    var players: PlayerReadyPayload['players'] = {};
    var uids = Object.keys(s.presences);
    for (var j = 0; j < uids.length; j++) {
      players[uids[j]] = { username: s.usernames[uids[j]], symbol: s.marks[uids[j]] };
    }
    var readyPayload: PlayerReadyPayload = { players: players, firstTurn: getCurrentTurnUserId(s) };
    dispatcher.broadcastMessage(OP_CODES.PLAYER_READY, JSON.stringify(readyPayload), null, null, true);
    broadcastStateUpdate(dispatcher, s);

    // Record each player's active match in storage so they can reconnect if disconnected.
    var activeMatchId = ctx.matchId || '';
    if (activeMatchId) {
      var storageWrites: nkruntime.StorageWriteRequest[] = [];
      for (var k = 0; k < uids.length; k++) {
        storageWrites.push({
          collection: ACTIVE_MATCH_COLLECTION,
          key: ACTIVE_MATCH_RECORD_KEY,
          userId: uids[k],
          value: { matchId: activeMatchId, storedAt: Date.now() },
          permissionRead: 1,
          permissionWrite: 0,
        });
      }
      try {
        nk.storageWrite(storageWrites);
      } catch (e) {
        logger.warn('TicTacToe: failed to write active match storage: ' + String(e));
      }
    }
  }

  return { state: s };
}

export function matchLeave(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  presences: nkruntime.Presence[]
): { state: nkruntime.MatchState | null } | null {
  // Mutate the passed-in state object — Nakama goja expects this reference back in { state }
  var s = state as TicTacToeState;
  normalizeState(s);
  s.presences = Object.assign({}, s.presences);

  for (var i = 0; i < presences.length; i++) {
    var p = presences[i];
    logger.debug('TicTacToe: ' + (s.usernames[p.userId] || p.userId) + ' left');
    delete s.presences[p.userId];

    // Clear this player's active match record so they can find a new match immediately.
    try {
      nk.storageDelete([{
        collection: ACTIVE_MATCH_COLLECTION,
        key: ACTIVE_MATCH_RECORD_KEY,
        userId: p.userId,
      }]);
    } catch (e) {
      logger.warn('TicTacToe: failed to delete active match storage for ' + p.userId + ': ' + String(e));
    }

    if (s.playing) {
      s.pendingLeftUserId = p.userId;
      s.pendingLeftUsername = s.usernames[p.userId] || p.username;
      var winnerId = getOpponentId(s, p.userId);
      s.playing = false;
      s.winner = winnerId || null;
      s.winnerSymbol = winnerId ? (s.marks[winnerId] || null) : null;
      s.winningLine = null;
      s.postGameTicks = POST_GAME_TICKS;
      // PLAYER_LEFT + GAME_OVER broadcast in matchLoop next tick (safe for dispatcher)
    }
  }

  return { state: state };
}

export function matchLoop(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  messages: nkruntime.MatchMessage[]
): { state: nkruntime.MatchState | null } | null {
  var s = normalizeState(Object.assign({}, state as TicTacToeState) as TicTacToeState);

  if (s.pendingLeftUserId) {
    var pl: PlayerLeftPayload = { userId: s.pendingLeftUserId, username: s.pendingLeftUsername || '' };
    dispatcher.broadcastMessage(OP_CODES.PLAYER_LEFT, JSON.stringify(pl), null, null, true);
    s.pendingLeftUserId = '';
    s.pendingLeftUsername = '';
  }

  // Post-game: broadcast game over once then count down and terminate
  if (!s.playing && s.winner !== null) {
    if (s.postGameTicks === POST_GAME_TICKS) {
      broadcastGameOver(dispatcher, s);
      updatePlayerStats(nk, logger, s);

      // Clear active match storage for any players still present (game ended normally / timeout).
      var remainingIds = Object.keys(s.presences);
      if (remainingIds.length > 0) {
        var deletes: nkruntime.StorageDeleteRequest[] = [];
        for (var di = 0; di < remainingIds.length; di++) {
          deletes.push({
            collection: ACTIVE_MATCH_COLLECTION,
            key: ACTIVE_MATCH_RECORD_KEY,
            userId: remainingIds[di],
          });
        }
        try {
          nk.storageDelete(deletes);
        } catch (e) {
          logger.warn('TicTacToe: failed to clear active match storage on game over: ' + String(e));
        }
      }
    }
    s.postGameTicks = s.postGameTicks - 1;
    if (s.postGameTicks <= 0) return null;
    return { state: s };
  }

  // No players — count empty ticks then terminate
  if (Object.keys(s.presences).length === 0) {
    s.emptyTicks = s.emptyTicks + 1;
    if (s.emptyTicks >= MAX_EMPTY_TICKS) return null;
    return { state: s };
  }
  s.emptyTicks = 0;

  // Waiting for second player
  if (!s.playing) return { state: s };

  // Turn deadline
  s.deadlineRemainingTicks = s.deadlineRemainingTicks - 1;
  if (s.deadlineRemainingTicks <= 0) {
    var timedOutId = getCurrentTurnUserId(s);
    var timeoutWinner = getOpponentId(s, timedOutId);
    s.playing = false;
    s.winner = timeoutWinner || null;
    s.winnerSymbol = timeoutWinner ? (s.marks[timeoutWinner] || null) : null;
    s.winningLine = null;
    s.postGameTicks = POST_GAME_TICKS;
    return { state: s };
  }

  // Process moves
  for (var mi = 0; mi < messages.length; mi++) {
    var message = messages[mi];
    if (message.opCode !== OP_CODES.MOVE) continue;

    var senderId = message.sender.userId;
    if (!s.presences[senderId]) continue;

    if (senderId !== getCurrentTurnUserId(s)) {
      var e1: ErrorPayload = { code: 'NOT_YOUR_TURN', message: 'It is not your turn.' };
      dispatcher.broadcastMessage(OP_CODES.ERROR, JSON.stringify(e1), [message.sender], null, true);
      continue;
    }

    var dataStr: string = matchDataToString(message.data);
    logger.debug('TicTacToe move: ' + dataStr);

    var move: MoveMessage;
    try {
      move = JSON.parse(dataStr) as MoveMessage;
    } catch (_e) {
      logger.debug('TicTacToe JSON.parse failed: ' + String(_e));
      continue;
    }

    if (!isValidPosition(move.position)) {
      var e2: ErrorPayload = { code: 'INVALID_POSITION', message: 'Position must be 0-8.' };
      dispatcher.broadcastMessage(OP_CODES.ERROR, JSON.stringify(e2), [message.sender], null, true);
      continue;
    }

    if (s.board[move.position] !== '') {
      var e3: ErrorPayload = { code: 'CELL_OCCUPIED', message: 'That cell is already taken.' };
      dispatcher.broadcastMessage(OP_CODES.ERROR, JSON.stringify(e3), [message.sender], null, true);
      continue;
    }

    // Apply the move
    var newBoard = s.board.slice();
    newBoard[move.position] = s.marks[senderId];
    s.board = newBoard;
    s.deadlineRemainingTicks = DEADLINE_TICKS;

    var winResult = checkWinner(s.board);
    if (winResult.symbol) {
      s.playing = false;
      s.winner = senderId;
      s.winnerSymbol = winResult.symbol;
      s.winningLine = winResult.line;
      s.postGameTicks = POST_GAME_TICKS;
      return { state: s };
    }

    if (checkDraw(s.board)) {
      s.playing = false;
      s.winner = 'draw';
      s.winnerSymbol = null;
      s.winningLine = null;
      s.postGameTicks = POST_GAME_TICKS;
      return { state: s };
    }

    broadcastStateUpdate(dispatcher, s);
  }

  return { state: s };
}

export function matchTerminate(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  _state: nkruntime.MatchState,
  graceSeconds: number
): { state: nkruntime.MatchState | null } | null {
  logger.debug('TicTacToe: terminating (grace ' + graceSeconds + 's)');
  return { state: null };
}

export function matchSignal(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  _data: string
): { state: nkruntime.MatchState | null; data: string } | null {
  return { state: state, data: '' };
}
