import { describe, expect, it } from 'vitest';
import {
  caNguaRulesSchema,
  defaultRules,
  legacyRules,
  stateSchema,
  type GameRules,
  type EngineAction,
} from '../../src/shared/game/contracts';
import { createInitialGameState, getLegalMoves, transition } from '../../src/shared/game/engine';
import { committedMotion } from '../../src/client/components/game/board-motion';
import { piecePoint } from '../../src/client/components/game/board-geometry';

const ids = [1, 2, 3, 4].map((n) => `10000000-0000-4000-8000-00000000000${n}`);
const room = '20000000-0000-4000-8000-000000000001';
const starts = [14, 28, 42];
const route = Array.from({ length: 56 }, (_, n) => n).filter((n) => !starts.includes(n));
function fixture(color = 0, rules: GameRules = defaultRules) {
  const s = createInitialGameState(room, room, ids[0], 'Di chuyển', 'An', rules);
  s.players = ids.map((id, color) => ({ ...structuredClone(s.players[0]), id, color }));
  s.status = 'PLAYING';
  s.phase = 'MOVE';
  s.turn = ids[color];
  s.dice = 1;
  s.deadline = 90000;
  return s;
}
const moves = (s: ReturnType<typeof fixture>) => getLegalMoves(s).filter((m) => m.piece === 0);
const move = (s: ReturnType<typeof fixture>, moveKind?: 'STEP' | 'JUMP', piece = 0) =>
  transition(s, s.turn!, '', false, { action: 'move', piece, moveKind, version: s.version }, 1);

describe('skip foreign starts and automatically jump on one', () => {
  it('locks the new profile while preserving optional settings in previously saved profiles', () => {
    for (const safe of ['NONE', 'STARTS'] as const)
      for (const jumpOnOne of [false, true]) {
        const rules = { ...defaultRules, safe, jumpOnOne };
        expect(caNguaRulesSchema.safeParse(rules).success).toBe(safe === 'STARTS' && jumpOnOne);
        const saved = { ...rules, movement: 'SKIP_STARTS_AUTO_JUMP' as const };
        expect(caNguaRulesSchema.parse(saved)).toEqual(saved);
        expect(stateSchema.parse(fixture(0, saved)).rules).toEqual(saved);
      }
  });

  it.each([0, 1, 2, 3])(
    'system decides jump or one counted step independently for color %i',
    (color) => {
      const s = fixture(color);
      s.players[color].pieces = [2, 13, -1, -1];
      for (const p of s.players) if (p.color !== color) p.pieces[0] = 0;
      expect(getLegalMoves(s)).toEqual([
        { piece: 0, from: 2, to: 3, moveKind: 'STEP' }, // Own horse at the gate blocks jumping.
        { piece: 1, from: 13, to: 27, moveKind: 'JUMP' }, // Protected spawn occupant does not block.
      ]);
      expect(move(s, undefined, 0).players[color].pieces).toEqual([3, 13, -1, -1]);
      expect(move(s, undefined, 1).players[color].pieces).toEqual([2, 27, -1, -1]);
      expect(() => move(s, 'JUMP', 0)).toThrow(
        expect.objectContaining({ code: 'GAME_ILLEGAL_MOVE' }),
      );
      expect(() => move(s, 'STEP', 1)).toThrow(
        expect.objectContaining({ code: 'GAME_ILLEGAL_MOVE' }),
      );
      // A newly released horse is the only kind of move that may end on its own start.
      s.dice = 6;
      expect(
        getLegalMoves(s)
          .filter((m) => m.to === 0)
          .every((m) => m.from === -1),
      ).toBe(true);
      expect(move(s, undefined, 2).players[color].pieces[2]).toBe(0);
      s.players[color].pieces = [0, -1, 55, -1];
      expect(getLegalMoves(s).some((m) => m.from === -1 || m.to === 0)).toBe(false);
      expect(move(s, undefined, 2).players[color].pieces[2]).toBe(61);
      for (const from of route.filter((n) => n < 55))
        for (let dice = 2; dice <= 6; dice++) {
          s.players[color].pieces = [from, -1, -1, -1];
          s.dice = dice;
          const expected = route[route.indexOf(from) + dice];
          expect(moves(s)).toEqual(
            expected === undefined ? [] : [{ piece: 0, from, to: expected, moveKind: 'STEP' }],
          );
          expect(moves(s).every((m) => ![0, 14, 28, 42].includes(m.to))).toBe(true);
        }
    },
  );

  it('opts new tables in while parsing saved v1/v2 rules without injecting a movement revision', () => {
    expect(defaultRules).toMatchObject({
      safe: 'STARTS',
      movement: 'SPAWN_ONLY_AUTO_JUMP',
      jumpOnOne: true,
    });
    for (const safe of ['STARTS', 'NONE'] as const) {
      const saved = caNguaRulesSchema.parse({ variant: 'CANGUA_V2', safe });
      const s = fixture(0, saved);
      expect(stateSchema.parse(s)).toEqual(s);
      expect(Object.hasOwn(stateSchema.parse(s).rules, 'movement')).toBe(false);
      s.players[0].pieces[0] = 2;
      expect(moves(s).map((m) => m.moveKind)).toEqual(['STEP', 'JUMP']);
      expect(move(s).players[0].pieces[0]).toBe(3);
    }
    const old = createInitialGameState(room, room, ids[0], 'V1', 'An', legacyRules);
    expect(stateSchema.parse(old)).toEqual(old);
    for (const movement of [null, false, 1, 'AUTO', {}])
      expect(
        stateSchema.safeParse({ ...fixture(), rules: { ...defaultRules, movement } }).success,
      ).toBe(false);
    expect(
      stateSchema.safeParse({ ...old, rules: { ...legacyRules, movement: defaultRules.movement } })
        .success,
    ).toBe(false);
  });

  describe.each([0, 1, 2, 3])('color %i including absolute route wrap', (color) => {
    it('counts every dice value on the playable route, skipping empty or protected foreign starts', () => {
      for (const occupied of [false, true])
        for (const from of route.filter((n) => n < 55))
          for (let dice = 1; dice <= 6; dice++) {
            const s = fixture(color, {
              ...defaultRules,
              movement: 'SKIP_STARTS_AUTO_JUMP',
              jumpOnOne: false,
            });
            s.players[color].pieces[0] = from;
            if (occupied) for (const p of s.players) if (p.color !== color) p.pieces[0] = 0;
            s.dice = dice;
            const target = route[route.indexOf(from) + dice];
            expect(stateSchema.safeParse(s).success).toBe(true);
            if (target === undefined) expect(moves(s)).toEqual([]);
            else {
              expect(moves(s)).toEqual([{ piece: 0, from, to: target, moveKind: 'STEP' }]);
              const after = move(s);
              expect(after.players[color].pieces[0]).toBe(target);
              expect(after.last.captures).toEqual([]);
              expect(stateSchema.safeParse(after).success).toBe(true);
            }
          }
    });

    it('offers exactly one automatic jump per horse on a clear route and rejects a forced STEP', () => {
      for (const from of route.filter((n) => n < 55)) {
        const s = fixture(color);
        s.players[color].pieces[0] = from;
        for (const p of s.players) if (p.color !== color) p.pieces[0] = 0;
        const gate = [13, 27, 41, 55].find((n) => n > from)!;
        expect(moves(s)).toEqual([{ piece: 0, from, to: gate, moveKind: 'JUMP' }]);
        expect(() => move(s, 'STEP')).toThrow(
          expect.objectContaining({ code: 'GAME_ILLEGAL_MOVE' }),
        );
        const after = move(s);
        expect(after.players[color].pieces[0]).toBe(gate);
        expect(after.last.moveKind).toBe('JUMP');
        expect(after.last.captures).toEqual([]);
        expect(after.turn).not.toBe(s.turn);
      }
    });

    it('captures an enemy at the next gate, otherwise falls back for ordinary blockers', () => {
      for (const from of route.filter((n) => n < 55)) {
        const gate = [13, 27, 41, 55].find((n) => n > from)!;
        const target = route[route.indexOf(from) + 1];
        for (const obstacle of route.filter((n) => n > from && n <= gate))
          for (const friendly of [false, true]) {
            const s = fixture(color);
            s.players[color].pieces[0] = from;
            const blocker = friendly ? color : (color + 1) % 4;
            s.players[blocker].pieces[1] = (color * 14 + obstacle - blocker * 14 + 56) % 56;
            if (!friendly && obstacle === gate) {
              expect(moves(s)).toEqual([{ piece: 0, from, to: gate, moveKind: 'JUMP' }]);
              const after = move(s);
              expect(after.last.captures).toEqual([ids[blocker] + ':1']);
              expect(after.players[blocker].pieces[1]).toBe(-1);
              expect(stateSchema.safeParse(after).success).toBe(true);
              expect(() => move(s, 'STEP')).toThrow(
                expect.objectContaining({ code: 'GAME_ILLEGAL_MOVE' }),
              );
              continue;
            }
            if (friendly && obstacle === target) expect(moves(s)).toEqual([]);
            else {
              expect(moves(s)).toEqual([{ piece: 0, from, to: target, moveKind: 'STEP' }]);
              const after = move(s);
              expect(after.last.captures).toHaveLength(!friendly && obstacle === target ? 1 : 0);
              expect(stateSchema.safeParse(after).success).toBe(true);
            }
            expect(() => move(s, 'JUMP')).toThrow(
              expect.objectContaining({ code: 'GAME_ILLEGAL_MOVE' }),
            );
          }
      }
    });

    it('counts exact captures across all starts and never crosses ordinary blockers', () => {
      for (const start of starts)
        for (const friendly of [false, true])
          for (let dice = 2; dice <= 6; dice++) {
            const s = fixture(color);
            const opponent = (color + start / 14) % 4;
            s.players[color].pieces[0] = start - 2;
            s.players[opponent].pieces[0] = 0; // Protected occupant does not block.
            const blocker = friendly ? color : opponent;
            s.players[blocker].pieces[1] = (color * 14 + start + 2 - blocker * 14 + 56) % 56;
            s.dice = dice;
            if (dice > 3 || (dice === 3 && friendly)) expect(moves(s)).toEqual([]);
            else {
              const after = move(s);
              expect(after.players[color].pieces[0]).toBe(start + dice - 1);
              expect(after.last.captures).toHaveLength(dice === 3 ? 1 : 0);
              expect(after.players[opponent].pieces[0]).toBe(0);
            }
          }
    });

    it('keeps spawn, own gate and home rules, including blocked spawn and no second lap', () => {
      const s = fixture(color);
      s.players[color].pieces = [-1, 0, -1, -1];
      s.dice = 6;
      expect(moves(s)).toEqual([]);
      expect(move(s, undefined, 1).players[color].pieces[1]).toBe(6);
      s.players[color].pieces = [54, 0, -1, -1];
      for (const dice of [2, 3, 4, 5, 6]) {
        s.dice = dice;
        expect(moves(s)).toEqual([]);
      }
      s.dice = 1;
      const gate = move(s);
      expect(gate.players[color].pieces[0]).toBe(55);
      gate.turn = ids[color];
      gate.phase = 'MOVE';
      gate.dice = 6;
      const home = move(gate);
      expect(home.players[color].pieces).toEqual([61, 0, -1, -1]);
      expect(home.last.moveKind).toBe('STEP');
    });
  });

  it('retains optional disabling of jumps and counts unprotected starts when safety is off', () => {
    const s = fixture(0, {
      ...defaultRules,
      movement: 'SKIP_STARTS_AUTO_JUMP',
      safe: 'NONE',
      jumpOnOne: false,
    });
    s.players[0].pieces[0] = 13;
    expect(move(s).players[0].pieces[0]).toBe(14);
    s.rules = { ...defaultRules, movement: 'SKIP_STARTS_AUTO_JUMP', jumpOnOne: false };
    expect(move(s).players[0].pieces[0]).toBe(15);
    s.rules = defaultRules;
    expect(move(s).players[0].pieces[0]).toBe(27);
  });

  it('evaluates each numbered horse independently at starts, gates and occupied home ranks', () => {
    // Expected destinations are written out independently of trackStepTarget/getLegalMoves.
    const cases = [
      {
        pieces: [13, 5, 57, -1],
        dice: 2,
        expected: [
          [13, 16, 'STEP'],
          [5, 7, 'STEP'],
        ],
      },
      { pieces: [54, 55, 56, 58], dice: 2, expected: [[56, 57, 'STEP']] },
      { pieces: [55, 57, 59, 60], dice: 1, expected: [[55, 56, 'STEP']] },
      {
        pieces: [13, 15, 27, 41],
        dice: 1,
        expected: [
          [15, 16, 'STEP'],
          [27, 29, 'STEP'],
          [41, 55, 'JUMP'],
        ],
      },
      { pieces: [55, 58, 59, 60], dice: 6, expected: [[60, 61, 'STEP']] },
      {
        pieces: [0, -1, 55, 60],
        dice: 6,
        expected: [
          [0, 6, 'STEP'],
          [60, 61, 'STEP'],
        ],
      },
    ];
    const permutations = (items: number[]): number[][] =>
      items.length === 0
        ? [[]]
        : items.flatMap((item, i) =>
            permutations(items.filter((_, j) => j !== i)).map((rest) => [item, ...rest]),
          );
    for (const color of [0, 1, 2, 3])
      for (const c of cases)
        for (const pieces of permutations(c.pieces)) {
          const s = fixture(color);
          s.players[color].pieces = pieces;
          s.dice = c.dice;
          // Every opponent start is occupied; these must neither block nor consume a step.
          for (const p of s.players) if (p.color !== color) p.pieces[0] = 0;
          const before = structuredClone(s);
          const expected = c.expected
            .map(([from, to, moveKind]) => ({
              piece: pieces.indexOf(from as number),
              from,
              to,
              moveKind,
            }))
            .sort((a, b) => a.piece - b.piece);
          expect(getLegalMoves(s)).toEqual(expected);
          for (let piece = 0; piece < 4; piece++) {
            const legal = expected.find((m) => m.piece === piece);
            if (!legal)
              expect(() => move(s, undefined, piece)).toThrow(
                expect.objectContaining({ code: 'GAME_ILLEGAL_MOVE' }),
              );
            else {
              const after = move(s, undefined, piece);
              expect(after.players[color].pieces).toEqual(
                pieces.map((from, i) => (i === piece ? legal.to : from)),
              );
              expect(after.last.piece).toBe(piece);
              expect(after.last.captures).toEqual([]);
              expect(stateSchema.safeParse(after).success).toBe(true);
            }
          }
          expect(s).toEqual(before);
        }
  });

  it('animates a six-step move spanning seven coordinates without landing on the skipped start', () => {
    for (let color = 0; color < 4; color++) {
      const before = fixture(color);
      before.players[color].pieces[0] = 11;
      before.dice = 6;
      const after = move(before);
      expect(after.players[color].pieces[0]).toBe(18);
      const motion = committedMotion(before, after).find((p) => p.key === ids[color] + ':0')!;
      expect(motion).toBeDefined();
      expect(motion.frames).toHaveLength(13);
      for (const n of [12, 13, 15, 16, 17, 18]) {
        const [x, y] = piecePoint(color, n, 0, 2);
        expect(motion.frames).toContainEqual({ transform: `translate(${x}px,${y}px) scale(1)` });
      }
      const [x, y] = piecePoint(color, 14, 0, 2);
      expect(motion.frames).not.toContainEqual({ transform: `translate(${x}px,${y}px) scale(1)` });
      expect(committedMotion(after, after)).toEqual([]);
      expect(committedMotion(before, { ...after, version: after.version + 1 })).toEqual([]);
      expect(committedMotion(before, { ...after, round: after.round + 1 })).toEqual([]);
    }
  });

  it.each([2, 3, 4])(
    'completes a %i-player game and rematch without changing positions or rules on reload',
    (count) => {
      let s = fixture(),
        seed = 17,
        steps = 0;
      s.players = s.players.slice(0, count);
      s.phase = 'ROLL';
      s.dice = null;
      while (s.status === 'PLAYING' && steps++ < 20000) {
        let action: EngineAction, dice: number | undefined;
        if (s.phase === 'ROLL') {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          dice = (seed % 6) + 1;
          action = { action: 'roll', version: s.version };
        } else {
          const legal = getLegalMoves(s);
          expect(new Set(legal.map((m) => m.piece)).size).toBe(legal.length);
          const best = legal.sort((a, b) => b.to - a.to)[0];
          action = { action: 'move', version: s.version, piece: best.piece };
        }
        s = transition(s, s.turn!, '', false, action, steps, dice);
        expect(stateSchema.parse(JSON.parse(JSON.stringify(s)))).toEqual(s);
      }
      expect(s.status).toBe('FINISHED');
      expect(new Set(s.players.map((p) => p.rank)).size).toBe(count);
      s = transition(s, s.host, '', false, { action: 'rematch', version: s.version }, steps + 1);
      expect(s.rules).toEqual(defaultRules);
      expect(s.players.every((p) => p.pieces.every((n) => n === -1))).toBe(true);
    },
  );
});
