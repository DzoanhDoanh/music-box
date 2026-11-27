// Cờ Tướng (xiangqi) rules and the computer player. Pure functions shared by the Worker (which
// decides every move) and the client (which only highlights legal targets).
//
// The board is a 90-character string, index = row * 9 + col. Row 0 is Black's back rank (top),
// row 9 is Red's back rank (bottom). Red pieces are upper case, Black lower case, '.' is empty:
//   K/k Tướng · A/a Sĩ · E/e Tượng · H/h Mã · R/r Xe · C/c Pháo · P/p Tốt

export type Side = 'r' | 'b';
export type Move = { from: number; to: number };

export const START_BOARD =
  'rheakaehr' +
  '.........' +
  '.c.....c.' +
  'p.p.p.p.p' +
  '.........' +
  '.........' +
  'P.P.P.P.P' +
  '.C.....C.' +
  '.........' +
  'RHEAKAEHR';

export const other = (side: Side): Side => (side === 'r' ? 'b' : 'r');
export const sideOf = (piece: string): Side | null =>
  piece === '.' ? null : piece === piece.toUpperCase() ? 'r' : 'b';
const row = (i: number) => Math.floor(i / 9);
const col = (i: number) => i % 9;
const at = (r: number, c: number) => (r < 0 || r > 9 || c < 0 || c > 8 ? -1 : r * 9 + c);
const inPalace = (side: Side, r: number, c: number) =>
  c >= 3 && c <= 5 && (side === 'r' ? r >= 7 : r <= 2);
/** Rows on a side's own half of the river. */
const ownHalf = (side: Side, r: number) => (side === 'r' ? r >= 5 : r <= 4);

const ORTHO = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;
const DIAG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;
const HORSE = [
  [-2, -1, -1, 0],
  [-2, 1, -1, 0],
  [2, -1, 1, 0],
  [2, 1, 1, 0],
  [-1, -2, 0, -1],
  [1, -2, 0, -1],
  [-1, 2, 0, 1],
  [1, 2, 0, 1],
] as const;

/** Moves that follow how each piece moves, without checking whether they leave the general exposed. */
export function pseudoMoves(board: string, side: Side): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < 90; from++) {
    const piece = board[from];
    if (sideOf(piece) !== side) continue;
    pieceMoves(board, from, moves);
  }
  return moves;
}

function pieceMoves(board: string, from: number, out: Move[]) {
  const piece = board[from];
  const side = sideOf(piece)!;
  const r = row(from),
    c = col(from);
  const add = (to: number) => {
    if (to < 0) return;
    if (sideOf(board[to]) !== side) out.push({ from, to });
  };
  switch (piece.toUpperCase()) {
    case 'K':
      for (const [dr, dc] of ORTHO) if (inPalace(side, r + dr, c + dc)) add(at(r + dr, c + dc));
      return;
    case 'A':
      for (const [dr, dc] of DIAG) if (inPalace(side, r + dr, c + dc)) add(at(r + dr, c + dc));
      return;
    case 'E':
      for (const [dr, dc] of DIAG) {
        const eye = at(r + dr, c + dc),
          to = at(r + 2 * dr, c + 2 * dc);
        if (to >= 0 && board[eye] === '.' && ownHalf(side, r + 2 * dr)) add(to);
      }
      return;
    case 'H':
      for (const [dr, dc, lr, lc] of HORSE) {
        const leg = at(r + lr, c + lc),
          to = at(r + dr, c + dc);
        if (to >= 0 && board[leg] === '.') add(to);
      }
      return;
    case 'R':
      for (const [dr, dc] of ORTHO)
        for (let k = 1; ; k++) {
          const to = at(r + dr * k, c + dc * k);
          if (to < 0) break;
          if (board[to] === '.') out.push({ from, to });
          else {
            add(to);
            break;
          }
        }
      return;
    case 'C':
      for (const [dr, dc] of ORTHO) {
        let screen = false;
        for (let k = 1; ; k++) {
          const to = at(r + dr * k, c + dc * k);
          if (to < 0) break;
          if (!screen) {
            if (board[to] === '.') out.push({ from, to });
            else screen = true;
          } else if (board[to] !== '.') {
            add(to);
            break;
          }
        }
      }
      return;
    case 'P': {
      const forward = side === 'r' ? -1 : 1;
      add(at(r + forward, c));
      if (!ownHalf(side, r)) {
        add(at(r, c - 1));
        add(at(r, c + 1));
      }
      return;
    }
  }
}

/** Whether the general of `side` is attacked, including the two generals facing each other. */
export function inCheck(board: string, side: Side): boolean {
  const king = board.indexOf(side === 'r' ? 'K' : 'k');
  if (king < 0) return true;
  const enemy = (p: string) => (side === 'r' ? p.toLowerCase() : p.toUpperCase());
  const r = row(king),
    c = col(king);
  // Chariots, cannons and the facing general along files and ranks.
  for (const [dr, dc] of ORTHO) {
    let seen = 0;
    for (let k = 1; ; k++) {
      const i = at(r + dr * k, c + dc * k);
      if (i < 0) break;
      const p = board[i];
      if (p === '.') continue;
      seen++;
      if (seen === 1) {
        if (p === enemy('R') || (dc === 0 && p === enemy('K'))) return true;
      } else {
        if (p === enemy('C')) return true;
        break;
      }
    }
  }
  // Horses: the horse's leg is the point next to the horse on its long axis.
  for (const [dr, dc] of HORSE) {
    const h = at(r - dr, c - dc);
    if (h < 0 || board[h] !== enemy('H')) continue;
    const leg = Math.abs(dr) === 2 ? at(r - dr + dr / 2, c - dc) : at(r - dr, c - dc + dc / 2);
    if (board[leg] === '.') return true;
  }
  // Soldiers: an enemy soldier ahead of the general (from its own direction) or beside it.
  const pawn = enemy('P');
  const ahead = side === 'r' ? -1 : 1;
  if (board[at(r + ahead, c)] === pawn) return true;
  if (board[at(r, c - 1)] === pawn || board[at(r, c + 1)] === pawn) return true;
  return false;
}

/** The board after a move (no legality check). */
export function apply(board: string, move: Move) {
  const cells = board.split('');
  cells[move.to] = cells[move.from];
  cells[move.from] = '.';
  return cells.join('');
}

/** Every move `side` may make. */
export function legalMoves(board: string, side: Side): Move[] {
  return pseudoMoves(board, side).filter((m) => !inCheck(apply(board, m), side));
}
export const isLegal = (board: string, side: Side, move: Move) =>
  sideOf(board[move.from]) === side &&
  legalMoves(board, side).some((m) => m.from === move.from && m.to === move.to);

/** Neither side has a piece that can cross the river: nobody can win. */
export const noAttackers = (board: string) => !/[HRCPhrcp]/.test(board);

// ---------------------------------------------------------------- notation

export const pieceNames: Record<string, string> = {
  K: 'Tướng',
  A: 'Sĩ',
  E: 'Tượng',
  H: 'Mã',
  R: 'Xe',
  C: 'Pháo',
  P: 'Tốt',
};
/** Glyphs printed on the pieces, as on a real board. */
export const pieceGlyphs: Record<string, string> = {
  K: '帥',
  A: '仕',
  E: '相',
  H: '傌',
  R: '俥',
  C: '炮',
  P: '兵',
  k: '將',
  a: '士',
  e: '象',
  h: '馬',
  r: '車',
  c: '砲',
  p: '卒',
};

/** Vietnamese notation, e.g. "Pháo 2 bình 5", "Mã 8 tiến 7". Files count from each player's right. */
export function notation(board: string, move: Move): string {
  const piece = board[move.from];
  const side = sideOf(piece)!;
  const kind = piece.toUpperCase();
  const file = (i: number) => (side === 'r' ? 9 - col(i) : col(i) + 1);
  const dr = row(move.to) - row(move.from);
  const forward = side === 'r' ? -dr : dr;
  const action = forward > 0 ? 'tiến' : forward < 0 ? 'thoái' : 'bình';
  const diagonal = kind === 'H' || kind === 'E' || kind === 'A';
  const amount = action === 'bình' || diagonal ? file(move.to) : Math.abs(dr);
  return `${pieceNames[kind]} ${file(move.from)} ${action} ${amount}`;
}

// ---------------------------------------------------------------- computer player

export type Level = 1 | 2 | 3;
export type Random = { index(n: number): number };

const VALUE: Record<string, number> = { K: 0, A: 200, E: 200, H: 400, R: 900, C: 450, P: 100 };
const MATE = 100_000;

function pieceScore(piece: string, i: number) {
  const kind = piece.toUpperCase();
  const side = sideOf(piece)!;
  const r = row(i),
    c = col(i);
  let v = VALUE[kind];
  // Rows advanced from the piece's own back rank.
  const advance = side === 'r' ? 9 - r : r;
  if (kind === 'P') {
    if (!ownHalf(side, r)) v += 90 + (4 - Math.abs(c - 4)) * 10;
    if (advance >= 8) v -= 40; // a soldier on the last rank only moves sideways
  } else if (kind === 'H' || kind === 'R')
    v += (4 - Math.abs(c - 4)) * 4 + Math.min(advance, 6) * 4;
  else if (kind === 'C' && c === 4) v += 20;
  return v;
}

/** Static score from `side`'s point of view. */
export function evaluate(board: string, side: Side) {
  let score = 0;
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (p === '.') continue;
    const v = pieceScore(p, i);
    score += sideOf(p) === side ? v : -v;
  }
  return score;
}

const victim = (board: string, m: Move) =>
  board[m.to] === '.'
    ? 0
    : VALUE[board[m.to].toUpperCase()] * 10 - VALUE[board[m.from].toUpperCase()] / 10;

type Search = { nodes: number; limit: number };
class OutOfTime extends Error {}

function quiesce(
  board: string,
  side: Side,
  alpha: number,
  beta: number,
  s: Search,
  depth: number,
): number {
  if (++s.nodes > s.limit) throw new OutOfTime();
  const stand = evaluate(board, side);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;
  const captures = pseudoMoves(board, side)
    .filter((m) => board[m.to] !== '.')
    .sort((a, b) => victim(board, b) - victim(board, a));
  for (const m of captures) {
    if (board[m.to].toUpperCase() === 'K') return MATE;
    const next = apply(board, m);
    if (inCheck(next, side)) continue;
    const score = -quiesce(next, other(side), -beta, -alpha, s, depth - 1);
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(
  board: string,
  side: Side,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  s: Search,
): number {
  if (depth <= 0) return quiesce(board, side, alpha, beta, s, 4);
  if (++s.nodes > s.limit) throw new OutOfTime();
  const moves = legalMoves(board, side);
  // In Cờ Tướng a side with no legal move loses, in check or not.
  if (!moves.length) return -MATE + ply;
  moves.sort((a, b) => victim(board, b) - victim(board, a));
  let best = -Infinity;
  for (const m of moves) {
    const score = -negamax(apply(board, m), other(side), depth - 1, -beta, -alpha, ply + 1, s);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

/** Scores every legal root move at `depth`; null when the node budget ran out. */
function rootScores(
  board: string,
  side: Side,
  depth: number,
  s: Search,
  order: Move[],
  exact: boolean,
) {
  const scored: { move: Move; score: number }[] = [];
  let alpha = -Infinity;
  try {
    for (const move of order) {
      // Exact scores when the level picks among close moves; otherwise only the best one matters,
      // so later moves are searched with a narrow window.
      const score = -negamax(
        apply(board, move),
        other(side),
        depth - 1,
        -Infinity,
        exact ? Infinity : -alpha + 1,
        1,
        s,
      );
      scored.push({ move, score });
      if (score > alpha) alpha = score;
    }
  } catch (error) {
    if (error instanceof OutOfTime) return null;
    throw error;
  }
  return scored.sort((a, b) => b.score - a.score);
}

const LEVELS: Record<Level, { depth: number; limit: number; margin: number }> = {
  // Dễ: looks one move ahead and often settles for a move that is merely fine.
  1: { depth: 1, limit: 20_000, margin: 180 },
  // Vừa: sees replies and simple combinations.
  2: { depth: 2, limit: 120_000, margin: 25 },
  // Khó: searches deeper within a fixed budget, so a move always arrives quickly.
  3: { depth: 4, limit: 300_000, margin: 0 },
};

/** The computer's move for `side`, or null when it has none. */
export function chooseMove(board: string, side: Side, level: Level, random: Random): Move | null {
  const moves = legalMoves(board, side);
  if (!moves.length) return null;
  const { depth, limit, margin } = LEVELS[level];
  const search: Search = { nodes: 0, limit };
  // Shuffle first so equal moves are not always the same one.
  let order = moves
    .map((m) => ({ m, k: random.index(1_000_000) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.m);
  let ranked: { move: Move; score: number }[] = order.map((move) => ({ move, score: 0 }));
  for (let d = 1; d <= depth; d++) {
    const result = rootScores(board, side, d, search, order, margin > 0);
    if (!result) break;
    ranked = result;
    order = result.map((x) => x.move);
  }
  const top = ranked[0].score;
  const close = ranked.filter((x) => x.score >= top - margin && x.score > -MATE / 2);
  const pool = close.length ? close : [ranked[0]];
  return pool[random.index(pool.length)].move;
}
