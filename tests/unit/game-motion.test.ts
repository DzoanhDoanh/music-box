import { describe, expect, it } from 'vitest';
import { createInitialGameState } from '../../src/shared/game/engine';
import { committedMotion, pieceLayout } from '../../src/client/components/game/board-motion';
import { piecePoint } from '../../src/client/components/game/board-geometry';

const actor = '20000000-0000-4000-8000-000000000001';
function move(from = 10, to = 16) {
  const before = createInitialGameState(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    actor,
    'Test',
    'An',
  );
  before.players[0].pieces[0] = from;
  const after = structuredClone(before);
  after.version++;
  after.players[0].pieces[0] = to;
  after.last = { type: 'piece_moved', actor, piece: 0, from, to, dice: 6 };
  return { before, after };
}
describe('presentation of committed moves', () => {
  it('visits each actual track corner before settling on the committed cell', () => {
    const { before, after } = move();
    const copy = structuredClone(after);
    const plan = committedMotion(before, after).find((p) => p.key === actor + ':0')!;
    for (let n = 11; n <= 16; n++) {
      const [x, y] = piecePoint(0, n, 0);
      expect(plan.frames).toContainEqual({ transform: `translate(${x}px,${y}px) scale(1)` });
    }
    expect(plan.duration).toBeLessThan(800);
    expect(after).toEqual(copy);
  });
  it('never replays receipt duplicates, missed states, reloads or rematches', () => {
    const { before, after } = move();
    expect(committedMotion(after, after)).toEqual([]);
    expect(committedMotion(before, { ...after, version: 3 })).toEqual([]);
    expect(committedMotion(before, { ...after, round: 2 })).toEqual([]);
    expect(committedMotion(before, { ...after, id: 'different-table' })).toEqual([]);
  });
  it('handles departure from home and the exact home lane finish', () => {
    for (const [from, to] of [
      [-1, 0],
      [51, 57],
    ]) {
      const { before, after } = move(from, to);
      const plan = committedMotion(before, after)[0];
      const end = pieceLayout(after).get(actor + ':0')!;
      expect(plan.frames.at(-1)?.transform).toBe(
        `translate(${end.x}px,${end.y}px) scale(${end.scale})`,
      );
    }
  });
  it('returns captured horses to their own home after the attacker arrives', () => {
    const { before, after } = move();
    const victim = {
      ...structuredClone(before.players[0]),
      id: 'victim',
      color: 1,
      pieces: [3, -1, -1, -1],
    };
    before.players.push(victim);
    after.players.push({ ...victim, pieces: [-1, -1, -1, -1] });
    after.last.captures = ['victim:0'];
    const plan = committedMotion(before, after).find((p) => p.key === 'victim:0')!;
    expect(plan.frames[1].offset).toBe(0.55);
    const [x, y] = piecePoint(1, -1, 0);
    expect(plan.frames.at(-1)?.transform).toBe(`translate(${x}px,${y}px) scale(1)`);
  });
});
