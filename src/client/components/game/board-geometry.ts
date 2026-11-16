import { boardCell } from '../../../shared/game/engine';
// A continuous 52-cell clockwise cross. First start is the red quadrant's exit.
export const track: [number, number][] = [
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [5, 6],
  [6, 5],
  [6, 4],
  [6, 3],
  [6, 2],
  [6, 1],
  [6, 0],
  [7, 0],
  [8, 0],
  [8, 1],
  [8, 2],
  [8, 3],
  [8, 4],
  [8, 5],
  [9, 6],
  [10, 6],
  [11, 6],
  [12, 6],
  [13, 6],
  [14, 6],
  [14, 7],
  [14, 8],
  [13, 8],
  [12, 8],
  [11, 8],
  [10, 8],
  [9, 8],
  [8, 9],
  [8, 10],
  [8, 11],
  [8, 12],
  [8, 13],
  [8, 14],
  [7, 14],
  [6, 14],
  [6, 13],
  [6, 12],
  [6, 11],
  [6, 10],
  [6, 9],
  [5, 8],
  [4, 8],
  [3, 8],
  [2, 8],
  [1, 8],
  [0, 8],
  [0, 7],
  [0, 6],
];
export const origins = [
  [0, 0],
  [9, 0],
  [9, 9],
  [0, 9],
];
export const homeLane = (color: number, n: number): [number, number] =>
  [
    [n + 1, 7],
    [7, n + 1],
    [13 - n, 7],
    [7, 13 - n],
  ][color] as [number, number];
export function piecePoint(color: number, n: number, piece: number): [number, number] {
  if (n === -1) {
    const [x, y] = origins[color];
    return [x + 1.8 + (piece % 2) * 2.3, y + 1.8 + Math.floor(piece / 2) * 2.3];
  }
  if (n < 52) return track[boardCell(color, n)].map((v) => v + 0.5) as [number, number];
  return homeLane(color, n - 52).map((v) => v + 0.5) as [number, number];
}
