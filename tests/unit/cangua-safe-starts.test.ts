import { describe, expect, it } from 'vitest';
import { boardCell } from '../../src/shared/game/board';
import {
  caNguaRulesSchema,
  legacyRules,
  stateSchema,
  type GameRules,
  type GameState,
} from '../../src/shared/game/contracts';
import {
  createInitialGameState,
  getLegalMoves,
  isSafe,
  transition,
} from '../../src/shared/game/engine';

const ids = [1, 2, 3, 4].map((n) => `10000000-0000-4000-8000-00000000000${n}`);
const room = '20000000-0000-4000-8000-000000000001';
// Historical STARTS matches retain counted starts and optional jumps.
const defaultRules = caNguaRulesSchema.parse({ variant: 'CANGUA_V2', safe: 'STARTS' });
function fixture(color = 0, rules: GameRules = defaultRules) {
  let s = createInitialGameState(room, room, ids[0], 'An toàn', 'An', rules);
  for (let i = 1; i < 4; i++)
    s = transition(s, ids[i], 'Bạn', false, { action: 'join', color: i, version: s.version }, 0);
  for (const id of ids)
    s = transition(s, id, '', false, { action: 'ready', ready: true, version: s.version }, 0);
  return transition(
    s,
    ids[0],
    '',
    false,
    { action: 'start', version: s.version },
    0,
    undefined,
    color,
  );
}
function pending(s: GameState, dice: number) {
  s.phase = 'MOVE';
  s.dice = dice;
  return s;
}
function move(s: GameState, piece = 0, moveKind: 'STEP' | 'JUMP' = 'STEP') {
  return transition(
    s,
    s.turn!,
    '',
    false,
    { action: 'move', piece, moveKind, version: s.version },
    1,
  );
}
const moves = (s: GameState) => getLegalMoves(s).filter((m) => m.piece === 0);

describe('safe starts for cờ cá ngựa', () => {
  it('new tables opt in, saved or missing v2 settings retain NONE, v1 stays unchanged', () => {
    expect(createInitialGameState(room, room, ids[0], 'New', 'An').rules.safe).toBe('STARTS');
    expect(caNguaRulesSchema.parse({ variant: 'CANGUA_V2' }).safe).toBe('NONE');
    for (let cell = 0; cell < 56; cell++) {
      expect(isSafe(cell, defaultRules)).toBe([0, 14, 28, 42].includes(cell));
      expect(isSafe(cell, { ...defaultRules, safe: 'NONE' })).toBe(false);
    }
    expect(isSafe(8, legacyRules)).toBe(true);
    expect(isSafe(13, legacyRules)).toBe(true);
    expect(isSafe(14, legacyRules)).toBe(false);
  });

  describe.each([0, 1, 2, 3])('color %i, including route wrap', (color) => {
    it('counts safe starts as steps; can pass but never land on empty or occupied foreign starts', () => {
      for (const distance of [14, 28, 42]) {
        const opponent = (color + distance / 14) % 4;
        for (const occupied of [false, true]) {
          const s = pending(fixture(color), 1);
          s.players[color].pieces[0] = distance - 1;
          if (occupied) s.players[opponent].pieces[0] = 0;
          expect(stateSchema.safeParse(s).success).toBe(true);
          expect(moves(s).some((m) => m.moveKind === 'STEP')).toBe(false);
          expect(() => move(s)).toThrow();
          const after = move(pending(s, 2));
          expect(after.players[color].pieces[0]).toBe(distance + 1);
          expect(after.players[opponent].pieces[0]).toBe(occupied ? 0 : -1);
          expect(after.last.captures).toEqual([]);
          expect(stateSchema.safeParse(after).success).toBe(true);
        }
      }
    });

    it('six cannot spawn onto its own horse but can move that horse away', () => {
      const s = pending(fixture(color), 6);
      s.players[color].pieces[1] = 0;
      expect(moves(s)).toEqual([]);
      expect(() => move(s)).toThrow();
      const after = move(s, 1);
      expect(after.players[color].pieces[1]).toBe(6);
      expect(after.turn).toBe(ids[color]);
      const spawned = move(pending(after, 6));
      expect(spawned.players[color].pieces).toEqual([0, 6, -1, -1]);
      expect(stateSchema.safeParse(spawned).success).toBe(true);
      s.rules = { ...defaultRules, entry: 'ONE_OR_SIX' };
      expect(() => move(pending(s, 1))).toThrow();
    });

    it('ordinary own/enemy obstacles before or after a safe square still block; exact ordinary captures work', () => {
      const opponent = (color + 1) % 4;
      for (const obstacle of [12, 15])
        for (const friendly of [false, true]) {
          const s = pending(fixture(color), 6);
          s.players[color].pieces[0] = 11;
          s.players[opponent].pieces[0] = 0;
          const blocker = friendly ? color : opponent;
          s.players[blocker].pieces[1] = (boardCell(color, obstacle, 2) - blocker * 14 + 56) % 56;
          expect(moves(s)).toEqual([]);
          expect(() => move(s)).toThrow();
          pending(s, obstacle - 11);
          if (friendly) expect(() => move(s)).toThrow();
          else {
            const after = move(s);
            expect(after.players[color].pieces[0]).toBe(obstacle);
            expect(after.players[opponent].pieces).toEqual([0, -1, -1, -1]);
            expect(after.last.captures).toHaveLength(1);
          }
        }
    });

    it('jump crosses a protected horse, but ordinary route occupants and gate occupants block', () => {
      for (const start of [14, 28, 42]) {
        const opponent = (color + start / 14) % 4;
        const s = pending(fixture(color), 1);
        s.players[color].pieces[0] = start - 1;
        s.players[opponent].pieces[0] = 0;
        expect(moves(s)).toEqual([{ piece: 0, from: start - 1, to: start + 13, moveKind: 'JUMP' }]);
        const after = move(s, 0, 'JUMP');
        expect(after.players[color].pieces[0]).toBe(start + 13);
        expect(after.players[opponent].pieces[0]).toBe(0);
        expect(after.last.captures).toEqual([]);
        for (const obstacle of [start + 1, start + 13]) {
          s.players[color].pieces[1] = obstacle;
          expect(() => move(s, 0, 'JUMP')).toThrow();
        }
      }
    });

    it('stops at its own gate and enters home rather than looping into its own start', () => {
      const s = pending(fixture(color), 2);
      s.players[color].pieces = [54, 0, -1, -1];
      expect(() => move(s)).toThrow();
      const gate = move(pending(s, 1));
      gate.turn = ids[color];
      const home = move(pending(gate, 1));
      expect(home.players[color].pieces).toEqual([56, 0, -1, -1]);
    });

    it('rejects foreign starts and stacking in saved state, preserves old v2 occupancy', () => {
      const s = fixture(color);
      for (const from of [14, 28, 42]) {
        s.players[color].pieces[0] = from;
        expect(stateSchema.safeParse(s).success).toBe(false);
        expect(stateSchema.safeParse({ ...s, rules: { ...s.rules, safe: 'NONE' } }).success).toBe(
          true,
        );
      }
      s.players[color].pieces = [0, 0, -1, -1];
      expect(stateSchema.safeParse(s).success).toBe(false);
      s.players[color].pieces = [0, -1, -1, -1];
      expect(stateSchema.safeParse(s).success).toBe(true);
    });
  });

  it.each([defaultRules, { ...defaultRules, safe: 'NONE' } as const, legacyRules])(
    'rematch retains saved rules %j and active games reject settings changes',
    (rules) => {
      let s = fixture(0, rules);
      expect(() =>
        transition(
          s,
          ids[0],
          '',
          false,
          { action: 'settings', version: s.version, rules: { ...defaultRules, safe: 'NONE' } },
          1,
        ),
      ).toThrow();
      for (const id of ids.slice(1))
        s = transition(s, id, '', false, { action: 'surrender', version: s.version }, 1);
      s = transition(s, ids[0], '', false, { action: 'rematch', version: s.version }, 2);
      expect(s.rules).toEqual(rules);
      expect(s.schema).toBe('variant' in rules ? 2 : 1);
      expect(s.players.every((p) => p.pieces.every((n) => n === -1))).toBe(true);
    },
  );
});
