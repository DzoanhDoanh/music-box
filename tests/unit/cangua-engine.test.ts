import { describe, expect, it } from 'vitest';
import { boardCell, nextGate } from '../../src/shared/game/board';
import {
  defaultRules as safeStartRules,
  legacyRules,
  stateSchema,
  gameCommandSchema,
  type EngineAction,
  type GameState,
} from '../../src/shared/game/contracts';
import {
  createInitialGameState,
  transition,
  getLegalMoves,
  reconcileGame,
  checkWinCondition,
} from '../../src/shared/game/engine';
import { caNguaTrack, homeLane, piecePoint } from '../../src/client/components/game/board-geometry';
import { committedMotion, pieceLayout } from '../../src/client/components/game/board-motion';

const ids = [1, 2, 3, 4].map((n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const room = '20000000-0000-4000-8000-000000000001';
// Existing saved v2 tables keep their original unprotected-start rules.
const defaultRules = { ...safeStartRules, safe: 'NONE' } as const;
function fixture(count = 4) {
  let s = createInitialGameState(room, room, ids[0], 'Cờ cá ngựa', 'An', defaultRules);
  for (let color = 1; color < count; color++)
    s = transition(s, ids[color], 'Bạn', false, { action: 'join', color, version: s.version }, 0);
  for (const id of ids.slice(0, count))
    s = transition(s, id, '', false, { action: 'ready', ready: true, version: s.version }, 0);
  return transition(s, ids[0], '', false, { action: 'start', version: s.version }, 0);
}
function pending(s: GameState, dice: number, color = 0) {
  s.turn = ids[color];
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
    { action: 'move', version: s.version, piece, moveKind },
    1,
  );
}
const ownMoves = (s: GameState) => getLegalMoves(s).filter((m) => m.piece === 0);

describe('cờ cá ngựa v2 route and blocking', () => {
  it('allows an exact move onto another color start but never loops past its own gate', () => {
    for (let color = 0; color < 4; color++) {
      const next = (color + 1) % 4;
      const s = pending(fixture(), 2, color);
      s.players[color].pieces[0] = 12;
      expect(move(s).players[color].pieces[0]).toBe(14);
      s.players[next].pieces[0] = 0;
      expect(move(s).players[next].pieces[0]).toBe(-1);
      expect(() => move(pending(s, 3, color))).toThrow();
      s.players[color].pieces[0] = 54;
      expect(() => move(pending(s, 2, color))).toThrow();
      const gate = move(pending(s, 1, color));
      expect(gate.players[color].pieces[0]).toBe(55);
      expect(move(pending(gate, 1, color)).players[color].pieces[0]).toBe(56);
    }
  });
  it('has 56 unique adjacent track cells, six visible nonoverlapping ranks and gate immediately before each start', () => {
    expect(caNguaTrack).toHaveLength(56);
    const cells = new Set(caNguaTrack.map((p) => p.join(',')));
    expect(cells.size).toBe(56);
    caNguaTrack.forEach(([x, y], i) => {
      const [nx, ny] = caNguaTrack[(i + 1) % 56];
      expect(Math.abs(nx - x) + Math.abs(ny - y)).toBe(1);
    });
    for (let color = 0; color < 4; color++) {
      const gate = boardCell(color, 55, 2),
        start = boardCell(color, 0, 2);
      expect((gate + 1) % 56).toBe(start);
      let [x, y] = caNguaTrack[gate];
      for (let n = 0; n < 6; n++) {
        const [nx, ny] = homeLane(color, n);
        expect(cells.has([nx, ny].join(','))).toBe(false);
        cells.add([nx, ny].join(','));
        expect(Math.abs(nx - x) + Math.abs(ny - y)).toBe(1);
        expect(piecePoint(color, 56 + n, 0, 2)).toEqual([nx + 0.5, ny + 0.5]);
        [x, y] = [nx, ny];
      }
    }
    expect(cells.size).toBe(80);
  });
  it.each([0, 1, 2, 3])(
    'uses actual route distance at every square and wrap for color %i',
    (color) => {
      for (let from = 0; from < 55; from++)
        for (let distance = 1; distance <= Math.min(6, 55 - from); distance++) {
          const opponent = (color + 1) % 4;
          const initial = fixture();
          initial.players[color].pieces[0] = from;
          initial.players[opponent].pieces[0] =
            (boardCell(color, from + distance, 2) - opponent * 14 + 56) % 56;
          for (let dice = 1; dice <= 6; dice++) {
            const s = pending(structuredClone(initial), dice, color);
            const legal = ownMoves(s).filter((m) => m.moveKind === 'STEP');
            expect(legal.length).toBe(dice <= distance ? 1 : 0);
            if (legal.length) {
              const after = move(s);
              expect(after.players[color].pieces[0]).toBe(from + dice);
              expect(after.last.captures?.length).toBe(dice === distance ? 1 : 0);
              if (dice === distance) expect(after.players[opponent].pieces[0]).toBe(-1);
            } else expect(() => move(s)).toThrow();
          }
        }
    },
  );
  it('own pieces block both passage and landing, even when an opponent lies farther away', () => {
    for (let dice = 1; dice <= 6; dice++) {
      const s = pending(fixture(), dice);
      s.players[0].pieces = [9, 11, -1, -1];
      s.players[1].pieces[0] = 0; // global 14, five steps from mover
      expect(ownMoves(s).filter((m) => m.moveKind === 'STEP')).toHaveLength(dice === 1 ? 1 : 0);
      expect(ownMoves(s).some((m) => m.moveKind === 'JUMP')).toBe(false);
    }
  });
  it('requires empty start and never captures or advances beyond it on entry', () => {
    for (const owner of [0, 1]) {
      const s = pending(fixture(), 6);
      s.players[owner].pieces[1] = owner === 0 ? 0 : 42;
      expect(ownMoves(s)).toHaveLength(0);
    }
    const s = pending(fixture(), 6);
    const after = move(s);
    expect(after.players[0].pieces[0]).toBe(0);
    expect(after.turn).toBe(ids[0]);
    s.rules = { ...defaultRules, entry: 'ONE_OR_SIX' };
    expect(move(pending(s, 1)).turn).toBe(ids[1]);
  });
  it('keeps normal movement and empty-gate jumps distinct at every progress and color', () => {
    for (let color = 0; color < 4; color++)
      for (let from = 0; from < 55; from++) {
        const s = pending(fixture(), 1, color);
        s.players[color].pieces[0] = from;
        const gate = nextGate(from),
          moves = ownMoves(s);
        expect(moves.find((m) => m.moveKind === 'STEP')?.to).toBe(from + 1);
        expect(moves.some((m) => m.moveKind === 'JUMP')).toBe(gate > from + 1);
        if (gate > from + 1) {
          const after = move(s, 0, 'JUMP');
          expect(after.players[color].pieces[0]).toBe(gate);
          expect(after.last.captures).toEqual([]);
          expect(after.turn).not.toBe(s.turn);
          expect(stateSchema.safeParse(after).success).toBe(true);
        }
      }
  });
  it('every intervening square and destination blocks a jump; a neighboring opponent is still capturable with a normal 1', () => {
    for (let from = 0; from < 54; from++)
      for (let obstacle = from + 1; obstacle <= nextGate(from); obstacle++) {
        const s = pending(fixture(), 1);
        s.players[0].pieces[0] = from;
        s.players[1].pieces[0] = (obstacle - 14 + 56) % 56;
        expect(ownMoves(s).some((m) => m.moveKind === 'JUMP')).toBe(false);
        expect(() => move(s, 0, 'JUMP')).toThrow();
        if (obstacle === from + 1) expect(move(s).last.captures).toHaveLength(1);
      }
  });
  it('disables jumps by rule and rejects jump on other dice, in nest, or in home', () => {
    const s = pending(fixture(), 1);
    s.players[0].pieces[0] = 2;
    s.rules = { ...defaultRules, jumpOnOne: false };
    expect(ownMoves(s)).toEqual([{ piece: 0, from: 2, to: 3, moveKind: 'STEP' }]);
    s.rules = defaultRules;
    for (const from of [-1, 55, 56, 60, 61]) {
      s.players[0].pieces[0] = from;
      expect(() => move(s, 0, 'JUMP')).toThrow();
    }
    s.players[0].pieces[0] = 2;
    for (let dice = 2; dice <= 6; dice++) expect(() => move(pending(s, dice), 0, 'JUMP')).toThrow();
  });
  it('ignores pieces in another home lane or nest when checking the common path', () => {
    const s = pending(fixture(), 6);
    s.players[0].pieces[0] = 0;
    s.players[1].pieces = [56, 57, 60, 61];
    expect(move(s).players[0].pieces[0]).toBe(6);
  });
});

describe('cờ cá ngựa home, persistence and turn handling', () => {
  it('must stop at own gate, never wraps twice or spends excess steps inside home', () => {
    const s = pending(fixture(), 2);
    s.players[0].pieces[0] = 54;
    expect(ownMoves(s)).toHaveLength(0);
    expect(move(pending(s, 1)).players[0].pieces[0]).toBe(55);
  });
  it.each([1, 2, 3, 4, 5, 6])('enters rank %i only from gate with clear home path', (dice) => {
    const s = pending(fixture(), dice);
    s.players[0].pieces[0] = 55;
    expect(move(s).players[0].pieces[0]).toBe(55 + dice);
    for (let rank = 1; rank <= dice; rank++) {
      s.players[0].pieces[1] = 55 + rank;
      expect(ownMoves(s)).toHaveLength(0);
    }
  });
  it('climbs only one rank with exactly the next rank value; no overtaking or stacking', () => {
    for (let rank = 1; rank <= 6; rank++)
      for (let dice = 1; dice <= 6; dice++) {
        const s = pending(fixture(), dice);
        s.players[0].pieces[0] = 55 + rank;
        expect(ownMoves(s)).toHaveLength(dice === rank + 1 ? 1 : 0);
        if (dice === rank + 1) {
          expect(move(s).players[0].pieces[0]).toBe(56 + rank);
          s.players[0].pieces[1] = 56 + rank;
          expect(ownMoves(s)).toHaveLength(0);
        }
      }
  });
  it('wins only with four distinct ranks 3–6 and ranks the last remaining player', () => {
    const s = pending(fixture(2), 3);
    s.players[0].pieces = [61, 60, 59, 57];
    expect(checkWinCondition(s.players[0], 2)).toBe(false);
    const after = move(s, 3);
    expect(after.players[0].pieces).toEqual([61, 60, 59, 58]);
    expect(after.status).toBe('FINISHED');
    expect(after.players.map((p) => p.rank)).toEqual([1, 2]);
    expect(checkWinCondition({ ...s.players[0], pieces: [61, 61, 61, 61] }, 2)).toBe(false);
  });
  it('six grants another roll even with no legal moves and no third-six penalty', () => {
    let s = fixture();
    s.players[0].pieces = [58, 59, 60, 61];
    for (let i = 0; i < 5; i++) {
      s = transition(s, ids[0], '', false, { action: 'roll', version: s.version }, 1, 6);
      expect(s.turn).toBe(ids[0]);
      expect(s.last.type).toBe('no_moves');
    }
  });
  it('uses trusted random starting seat and resets readiness on rule changes', () => {
    const s = fixture();
    s.status = 'READY';
    s.turn = null;
    s.deadline = null;
    for (let i = 0; i < 4; i++)
      expect(
        transition(s, ids[0], '', false, { action: 'start', version: s.version }, 0, undefined, i)
          .turn,
      ).toBe(ids[i]);
    const changed = transition(
      s,
      ids[0],
      '',
      false,
      {
        action: 'settings',
        version: s.version,
        rules: { ...defaultRules, jumpOnOne: false },
      },
      0,
    );
    expect(changed.players.every((p) => !p.ready)).toBe(true);
    expect(() =>
      transition(
        s,
        ids[0],
        '',
        false,
        { action: 'settings', version: s.version, rules: legacyRules },
        0,
      ),
    ).toThrow();
  });
  it('retains pending choices across pause/reconnect, rejects stale/double moves, and handles timeout/forfeit', () => {
    const s = pending(fixture(), 1);
    s.players[0].pieces[0] = 2;
    let paused = transition(s, ids[0], '', false, { action: 'pause', version: s.version }, 10);
    expect(reconcileGame(paused, ids, 999999)).toEqual(paused);
    paused = transition(
      paused,
      ids[0],
      '',
      false,
      { action: 'resume', version: paused.version },
      100,
    );
    expect(ownMoves(paused)).toEqual(ownMoves(s));
    const moved = move(paused, 0, 'JUMP');
    expect(() => move(moved, 0, 'JUMP')).toThrow();
    expect(reconcileGame(s, ids, 1e8).status).toBe('FINISHED');
    expect(reconcileGame(s, ids.slice(1), 2).players[0].status).toBe('FORFEITED');
  });
  it('validates schema-specific positions/rules and forbids any duplicate occupied square', () => {
    const s = fixture();
    expect(s.schema).toBe(2);
    s.players[0].pieces = [55, 58, 60, 61];
    expect(stateSchema.safeParse(s).success).toBe(true);
    const bad = structuredClone(s);
    bad.players[1].pieces[0] = 41;
    expect(stateSchema.safeParse(bad).success).toBe(false);
    s.players[0].pieces = [61, 61, -1, -1];
    expect(stateSchema.safeParse(s).success).toBe(false);
    expect(stateSchema.safeParse({ ...fixture(), schema: 1 }).success).toBe(false);
    expect(
      gameCommandSchema.safeParse({ action: 'move', version: 1, piece: 0, moveKind: 'TELEPORT' })
        .success,
    ).toBe(false);
    const old = createInitialGameState(room, room, ids[0], 'Old', 'An', legacyRules);
    expect(old.schema).toBe(1);
    old.players[0].pieces[0] = 61;
    expect(stateSchema.safeParse(old).success).toBe(false);
  });
  it('animates long jumps around corners and follows the straight gate-to-home path', () => {
    for (const [from, dice, kind] of [
      [13, 1, 'JUMP'],
      [55, 6, 'STEP'],
    ] as const) {
      const s = pending(fixture(), dice);
      s.players[0].pieces[0] = from;
      const after = move(s, 0, kind);
      const plan = committedMotion(s, after).find((p) => p.key === ids[0] + ':0')!;
      expect(plan.duration).toBeLessThanOrEqual(1100);
      const end = pieceLayout(after).get(ids[0] + ':0')!;
      expect(plan.frames.at(-1)?.transform).toBe(`translate(${end.x}px,${end.y}px) scale(1)`);
      for (let n = from + 1; n <= after.last.to!; n++) {
        const [x, y] = piecePoint(0, n, 0, 2);
        expect(plan.frames).toContainEqual({ transform: `translate(${x}px,${y}px) scale(1)` });
      }
    }
  });
  it.each([2, 3, 4])(
    'completes a seeded %i-player match with valid checkpoints and distinct rankings',
    (count) => {
      let s = fixture(count),
        seed = 17,
        steps = 0;
      while (s.status === 'PLAYING' && steps++ < 20000) {
        let action: EngineAction, dice: number | undefined;
        if (s.phase === 'ROLL') {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          dice = (seed % 6) + 1;
          action = { action: 'roll', version: s.version };
        } else {
          const m = getLegalMoves(s).sort((a, b) => b.to - a.to)[0];
          action = { action: 'move', version: s.version, piece: m.piece, moveKind: m.moveKind };
        }
        s = transition(s, s.turn!, '', false, action, steps, dice);
        expect(stateSchema.safeParse(JSON.parse(JSON.stringify(s))).success).toBe(true);
      }
      expect(s.status).toBe('FINISHED');
      expect(new Set(s.players.map((p) => p.rank)).size).toBe(count);
    },
  );
});
