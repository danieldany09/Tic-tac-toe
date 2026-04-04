import { CellValue } from './types';

var WINNING_LINES: Array<[number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function checkWinner(board: CellValue[]): { symbol: CellValue | null; line: number[] | null } {
  for (var i = 0; i < WINNING_LINES.length; i++) {
    var a = WINNING_LINES[i][0];
    var b = WINNING_LINES[i][1];
    var c = WINNING_LINES[i][2];
    if (board[a] !== '' && board[a] === board[b] && board[a] === board[c]) {
      return { symbol: board[a], line: [a, b, c] };
    }
  }
  return { symbol: null, line: null };
}

export function checkDraw(board: CellValue[]): boolean {
  for (var i = 0; i < board.length; i++) {
    if (board[i] === '') return false;
  }
  return true;
}

export function isValidPosition(position: unknown): position is number {
  return (
    typeof position === 'number' &&
    position === Math.floor(position) &&
    position >= 0 &&
    position <= 8
  );
}

export function createEmptyBoard(): CellValue[] {
  return ['', '', '', '', '', '', '', '', ''];
}
