import { describe, expect, it } from 'vitest';
import { CO_TUONG_BOT, coTuongStateSchema } from '../../src/shared/co-tuong/contracts';
import { createCoTuongState, settleDepartures, transition } from '../../src/shared/co-tuong/engine';
import {
  START_BOARD,
  apply,
  chooseMove,
  inCheck,
  isLegal,
  legalMoves,
  notation,
} from '../../src/shared/co-tuong/rules';

const red = '10000000-0000-4000-8000-000000000001',
  black = '10000000-0000-4000-8000-000000000002',
  room = '20000000-0000-4000-8000-000000000001',
  id = '30000000-0000-4000-8000-000000000001';
const first = { index: () => 0 };
const sq = (r: number, c: number) => r * 9 + c;
/** A board from rows written top (Black) to bottom (Red). */
const board = (...rows: string[]) => rows.join('');

function perft(b: string, side: 'r' | 'b', depth: number): number {
  if (!depth) return 1;
  let n = 0;
  for (const m of legalMoves(b, side)) n += perft(apply(b, m), side === 'r' ? 'b' : 'r', depth - 1);
  return n;
}
const human = () => {
  let s = createCoTuongState(id, room, red, 'An', { name: 'Bàn', side: 'r', bot: null }, 0, first);
  s = transition(s, black, 'Bình', { action: 'join' }, 0, first);
  return s;
};
const move = (s: ReturnType<typeof human>, who: string, from: number, to: number) =>
  transition(s, who, '', { action: 'move', from, to }, 0, first);

describe('Cờ Tướng rules', () => {
  it('counts the standard number of positions from the opening', () => {
    expect(legalMoves(START_BOARD, 'r')).toHaveLength(44);
    expect(perft(START_BOARD, 'r', 2)).toBe(1920);
    expect(perft(START_BOARD, 'r', 3)).toBe(79666);
  });

  it('blocks horse legs and elephant eyes, and keeps elephants home', () => {
    // The advisor beside the horse blocks its leg toward (8,4).
    const b = board(
      '...k.....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '..E......',
      '...P.....',
      '....KAH..',
    );
    const horse = legalMoves(b, 'r')
      .filter((m) => m.from === sq(9, 6))
      .map((m) => m.to);
    expect(horse.sort()).toEqual([sq(7, 5), sq(7, 7), sq(8, 8)].sort());
    const elephant = legalMoves(b, 'r')
      .filter((m) => m.from === sq(7, 2))
      .map((m) => m.to);
    // The eye toward (9,4)... (8,3) holds a soldier, so that diagonal is shut.
    expect(elephant.sort()).toEqual([sq(5, 0), sq(5, 4), sq(9, 0)].sort());
  });

  it('lets cannons capture only over exactly one screen', () => {
    const b = board(
      '...k.....',
      '.........',
      '.........',
      '....r....',
      '.........',
      '....P....',
      '.........',
      '....C....',
      '.........',
      '.....K...',
    );
    const targets = legalMoves(b, 'r')
      .filter((m) => m.from === sq(7, 4))
      .map((m) => m.to);
    expect(targets).toContain(sq(3, 4));
    expect(targets).not.toContain(sq(5, 4));
    expect(targets).not.toContain(sq(4, 4));
  });

  it('forbids the two generals from facing each other on an open file', () => {
    const b = board(
      '....k....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '...K.....',
    );
    expect(isLegal(b, 'r', { from: sq(9, 3), to: sq(9, 4) })).toBe(false);
    expect(inCheck(apply(b, { from: sq(9, 3), to: sq(9, 4) }), 'r')).toBe(true);
  });

  it('writes moves in Vietnamese notation', () => {
    expect(notation(START_BOARD, { from: sq(7, 7), to: sq(7, 4) })).toBe('Pháo 2 bình 5');
    expect(notation(START_BOARD, { from: sq(9, 7), to: sq(7, 6) })).toBe('Mã 2 tiến 3');
    expect(notation(START_BOARD, { from: sq(2, 1), to: sq(2, 4) })).toBe('Pháo 2 bình 5');
  });

  it('the stronger levels find a mate in one', () => {
    // One chariot holds the second rank; the other drops to the back rank.
    const b = board(
      '...k.....',
      '........R',
      '.........',
      '.........',
      '.........',
      'R........',
      '.........',
      '.........',
      '.........',
      '.....K...',
    );
    for (const level of [2, 3] as const) {
      const m = chooseMove(b, 'r', level, first)!;
      const after = apply(b, m);
      expect(legalMoves(after, 'b')).toHaveLength(0);
    }
  });
});

describe('Cờ Tướng tables', () => {
  it('starts when the second seat is taken and checks turns and legality', () => {
    let s = human();
    expect(s.status).toBe('PLAYING');
    expect(() => move(s, black, sq(3, 0), sq(4, 0))).toThrow('Chưa đến lượt');
    expect(() => move(s, red, sq(9, 0), sq(5, 1))).toThrow('không hợp lệ');
    s = move(s, red, sq(7, 7), sq(7, 4));
    expect(s.moves[0].text).toBe('Pháo 2 bình 5');
    expect(s.turn).toBe('b');
    expect(s.version).toBe(2);
    expect(coTuongStateSchema.parse(s)).toEqual(s);
  });

  it('the computer answers at once and can take back a move', () => {
    let s = createCoTuongState(
      id,
      room,
      red,
      'An',
      { name: 'Với máy', side: 'b', bot: 1 },
      0,
      first,
    );
    // The computer plays Red, so it has already opened.
    expect(s.seats.r?.id).toBe(CO_TUONG_BOT);
    expect(s.moves).toHaveLength(1);
    expect(s.turn).toBe('b');
    const reply = legalMoves(s.board, 'b')[0];
    s = move(s, red, reply.from, reply.to);
    expect(s.moves).toHaveLength(3);
    s = transition(s, red, 'An', { action: 'undo' }, 0, first);
    expect(s.moves).toHaveLength(1);
    expect(s.turn).toBe('b');
  });

  it('ends on checkmate and counts the win across a rematch with swapped colours', () => {
    let s = human();
    // Fool's mate style: cannons double on the centre file after Black opens it.
    s = move(s, red, sq(7, 7), sq(7, 4)); // Pháo 2 bình 5
    s = move(s, black, sq(0, 3), sq(1, 4)); // Sĩ lên
    s = move(s, red, sq(7, 4), sq(3, 4)); // Pháo ăn tốt, chiếu
    expect(s.moves.at(-1)!.check).toBe(true);
    s = transition(s, black, 'Bình', { action: 'resign' }, 0, first);
    expect(s.status).toBe('FINISHED');
    expect(s.result).toEqual({ winner: 'r', reason: 'RESIGN' });
    expect(s.score[red]).toBe(1);
    s = transition(s, black, 'Bình', { action: 'rematch' }, 0, first);
    expect(s.status).toBe('PLAYING');
    expect(s.seats.r?.id).toBe(black);
    expect(s.board).toBe(START_BOARD);
  });

  it('draws by agreement and when one side keeps checking it loses on repetition', () => {
    let s = human();
    s = transition(s, red, 'An', { action: 'offer_draw' }, 0, first);
    expect(s.drawOffer).toBe('r');
    expect(() =>
      transition(s, red, 'An', { action: 'answer_draw', accept: true }, 0, first),
    ).toThrow();
    s = transition(s, black, 'Bình', { action: 'answer_draw', accept: true }, 0, first);
    expect(s.result).toEqual({ winner: null, reason: 'DRAW_AGREED' });

    // Shuffle the same two chariots back and forth: a plain threefold repetition is a draw.
    let t = human();
    for (let i = 0; i < 2; i++) {
      t = move(t, red, sq(9, 0), sq(8, 0));
      t = move(t, black, sq(0, 0), sq(1, 0));
      t = move(t, red, sq(8, 0), sq(9, 0));
      t = move(t, black, sq(1, 0), sq(0, 0));
    }
    expect(t.result).toEqual({ winner: null, reason: 'REPETITION' });
  });

  it('a player who leaves the room loses the running game', () => {
    const s = settleDepartures(human(), [{ id: red, name: 'An', role: 'owner' }], 0);
    expect(s.status).toBe('FINISHED');
    expect(s.result).toEqual({ winner: 'r', reason: 'LEFT' });
    expect(s.seats.b).toBeNull();
    // The seat is free again for someone else to start a new game.
    const next = transition(s, black, 'Bình', { action: 'join' }, 0, first);
    expect(next.status).toBe('PLAYING');
  });
});
