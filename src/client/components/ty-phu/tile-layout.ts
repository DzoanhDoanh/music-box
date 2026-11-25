import type { Tile } from '../../../shared/ty-phu/board';

export const playerColors = ['#e24b4a', '#378add', '#639922', '#ba7517'];
export const colorNames = ['Đỏ', 'Xanh dương', 'Xanh lá', 'Vàng'];
const groupColors: Record<number, string> = {
  1: '#97c459',
  2: '#639922',
  3: '#5dcaa5',
  4: '#1d9e75',
  5: '#ed93b1',
  6: '#d4537e',
  7: '#ef9f27',
};

/** Grid row/column (1-based) of a tile on the 9×9 board; Start sits bottom-right. */
export function tilePosition(i: number): [number, number] {
  if (i === 0) return [9, 9];
  if (i < 8) return [9, 9 - i];
  if (i === 8) return [9, 1];
  if (i < 16) return [9 - (i - 8), 1];
  if (i === 16) return [1, 1];
  if (i < 24) return [1, 1 + (i - 16)];
  if (i === 24) return [1, 9];
  return [1 + (i - 24), 9];
}
export function stripColor(t: Tile) {
  if (t.kind === 'BEACH') return '#85b7eb';
  if (t.kind === 'CITY') return t.group ? groupColors[t.group] : '#e24b4a';
  if (t.kind === 'TAX') return '#5f5e5a';
  return 'var(--line)';
}
