/** Mirrors [backend/src/types.ts](backend/src/types.ts) op codes and payloads */

export const OP = {
  MOVE: 1,
  STATE_UPDATE: 2,
  GAME_OVER: 3,
  PLAYER_READY: 4,
  PLAYER_LEFT: 5,
  ERROR: 6,
} as const;

export type CellValue = 'X' | 'O' | '';

export interface StateUpdatePayload {
  board: CellValue[];
  marks: Record<string, 'X' | 'O'>;
  usernames: Record<string, string>;
  currentTurn: string;
  playing: boolean;
  deadlineRemainingTicks: number;
}

export interface GameOverPayload {
  winner: string | null;
  winnerSymbol: CellValue | null;
  winningLine: number[] | null;
  board: CellValue[];
  usernames: Record<string, string>;
  marks: Record<string, 'X' | 'O'>;
}

export interface PlayerReadyPayload {
  players: Record<string, { username: string; symbol: 'X' | 'O' }>;
  firstTurn: string;
}

export interface PlayerLeftPayload {
  userId: string;
  username: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export function decodeMatchData(data: unknown): unknown {
  if (data == null) return {};
  if (typeof data === 'string') return JSON.parse(data);
  if (data instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(data));
  return data;
}
