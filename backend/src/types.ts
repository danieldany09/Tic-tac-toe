// ─── Op Codes ────────────────────────────────────────────────────────────────
// Direction: C→S = Client to Server, S→C = Server to Client

// var instead of const — required for esbuild es5 target compatibility with goja
export var OP_CODES = {
  MOVE: 1,          // C→S  Player submits a move
  STATE_UPDATE: 2,  // S→C  Full game state after every valid move
  GAME_OVER: 3,     // S→C  Game has ended (win / draw / forfeit)
  PLAYER_READY: 4,  // S→C  Both players have joined; game is starting
  PLAYER_LEFT: 5,   // S→C  A player disconnected mid-game
  ERROR: 6,         // S→C  Move was rejected; includes reason code
};

// ─── Game constants ───────────────────────────────────────────────────────────

export var TICK_RATE = 5;
export var TURN_TIME_SECS = 30;
export var DEADLINE_TICKS = TURN_TIME_SECS * TICK_RATE;
export var POST_GAME_TICKS = 5 * TICK_RATE;
export var MAX_EMPTY_TICKS = 30 * TICK_RATE;

// ─── Domain types ─────────────────────────────────────────────────────────────

export type CellValue = 'X' | 'O' | '';

export interface MatchLabel {
  open: 0 | 1; // 1 = waiting for second player, 0 = full / ended
}

export interface PlayerLeftPayload {
  userId: string;
  username: string;
}

// Internal server-side match state (in-memory, not sent to clients directly)
export interface TicTacToeState {
  board: CellValue[];
  marks: { [userId: string]: 'X' | 'O' };
  usernames: { [userId: string]: string };
  presences: { [userId: string]: boolean }; // plain booleans — Presence objects are Go-backed and break goja Export()
  joinsInProgress: number;
  playing: boolean;
  winner: string | null;          // userId, 'draw', or null
  winnerSymbol: CellValue | null;
  winningLine: number[] | null;
  deadlineRemainingTicks: number;
  postGameTicks: number;
  emptyTicks: number;
  /** Plain strings only — nested objects in state can break goja export between ticks */
  pendingLeftUserId: string;
  pendingLeftUsername: string;
  /** displayName from client match join metadata, keyed by userId until matchJoin consumes it */
  pendingDisplayNames: { [userId: string]: string };
}

// ─── Client → Server messages ─────────────────────────────────────────────────

export interface MoveMessage {
  position: number; // 0–8, maps to board cells left-to-right, top-to-bottom
}

// ─── Server → Client payloads ─────────────────────────────────────────────────

export interface StateUpdatePayload {
  board: CellValue[];
  marks: { [userId: string]: 'X' | 'O' };
  usernames: { [userId: string]: string };
  currentTurn: string;              // userId of the player whose turn it is
  playing: boolean;
  deadlineRemainingTicks: number;
}

export interface GameOverPayload {
  winner: string | null;            // userId, 'draw', or null (timeout with no opponent)
  winnerSymbol: CellValue | null;
  winningLine: number[] | null;
  board: CellValue[];
  usernames: { [userId: string]: string };
  marks: { [userId: string]: 'X' | 'O' };
}

export interface PlayerReadyPayload {
  players: {
    [userId: string]: {
      username: string;
      symbol: 'X' | 'O';
    };
  };
  firstTurn: string; // userId
}

export interface ErrorPayload {
  code: 'NOT_YOUR_TURN' | 'CELL_OCCUPIED' | 'INVALID_POSITION' | 'GAME_NOT_STARTED';
  message: string;
}

// ─── Player statistics ────────────────────────────────────────────────────────

/** Nakama storage collection for persisted per-player performance stats. */
export var STATS_COLLECTION = 'player_stats';
/** Per-user storage record key for the full stats document. */
export var STATS_RECORD_KEY = 'stats';
/** Nakama leaderboard ID for ranking by best win streak. */
export var STREAK_LEADERBOARD_ID = 'tic_tac_toe_streak';

/** Full performance stats stored per player in Nakama storage. */
export interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  gamesPlayed: number;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

/** Nakama storage collection for tracking a player's active match session. */
export var ACTIVE_MATCH_COLLECTION = 'player_sessions';
/** Per-user storage record key holding the active match ID and timestamp. */
export var ACTIVE_MATCH_RECORD_KEY = 'active_match';

// ─── Capacity ─────────────────────────────────────────────────────────────────

/**
 * Soft cap on total simultaneous authoritative matches (open + playing).
 * find_match rejects new match creation above this threshold.
 */
export var MAX_CONCURRENT_MATCHES = 500;
