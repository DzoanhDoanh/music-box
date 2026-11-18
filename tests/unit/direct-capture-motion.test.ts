import { describe, expect, it } from 'vitest';
import { createInitialGameState, transition } from '../../src/shared/game/engine';
import { sceneMotion, sampleSceneMotion } from '../../src/client/components/game/scene-motion';
import { directCapturePlans } from '../../src/client/components/game/direct-capture-motion';
import { riderCapturePlans } from '../../src/client/components/game/rider-motion';
import { kameCapturePlans } from '../../src/client/components/game/kamehameha-motion';

const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
const attacker = ids[0] + ':0';
function fixture(dice: 1 | 6, capture = true) {
  const before = createInitialGameState(ids[0], ids[0], ids[0], 'Direct capture', 'An');
  before.players.push({ ...structuredClone(before.players[0]), id: ids[1], color: 1 });
  before.players[0].pieces = [dice === 1 ? 13 : 8, -1, -1, -1];
  before.players[1].pieces = [capture ? (dice === 1 ? 13 : 1) : -1, -1, -1, -1];
  before.status = 'PLAYING';
  before.phase = 'MOVE';
  before.turn = ids[0];
  before.dice = dice;
  before.deadline = 90000;
  const after = transition(
    before,
    ids[0],
    '',
    false,
    { action: 'move', piece: 0, version: before.version },
    1,
  );
  return { before, after, raw: sceneMotion(before, after) };
}

describe('direct finishers', () => {
  for (const dice of [1, 6] as const) {
    it.each([650, 900])(
      `attacks directly across a bent route on dice ${dice} with impact at %i ms`,
      (impactMs) => {
        const { before, after, raw } = fixture(dice);
        const saved = structuredClone({ before, after, raw });
        const plans = directCapturePlans(raw, attacker, impactMs);
        const cue = plans.get(attacker)!;
        const start = raw.get(attacker)!.points[0],
          end = raw.get(attacker)!.points.at(-1)!;
        expect(raw.get(attacker)!.points.length).toBeGreaterThan(2);
        expect(cue.points).toEqual([start, end]);
        expect(sampleSceneMotion(cue, 0.1)).toMatchObject({ ...start, y: 0.21 });
        for (const t of [0.2, 0.4, 0.6, 0.8]) {
          const p = sampleSceneMotion(cue, t);
          // Every point lies on the direct line in the board plane, not on the track's corners.
          expect(
            (p.x - start.x) * (end.z - start.z) - (p.z - start.z) * (end.x - start.x),
          ).toBeCloseTo(0);
          expect(p.y).toBeGreaterThan(0.21);
        }
        expect(sampleSceneMotion(cue, 1)).toMatchObject({ ...end, y: 0.21 });
        const victim = plans.get(ids[1] + ':0')!;
        expect(victim.delay).toBe(impactMs);
        expect(victim.duration - victim.delay).toBe(900);
        expect(sampleSceneMotion(victim, impactMs / victim.duration)).toMatchObject({
          ...victim.points[0],
          y: 0.21,
          spin: 0,
        });
        expect(sampleSceneMotion(victim, (impactMs + 450) / victim.duration).y).toBeGreaterThan(
          3.9,
        );
        expect({ before, after, raw }).toEqual(saved);
      },
    );
  }
  it('preserves ordinary jumps and steps, including skipped protected spawn squares', () => {
    for (const dice of [1, 6] as const) {
      const { raw } = fixture(dice, false);
      expect(directCapturePlans(raw, attacker, 650)).toBe(raw);
      expect(raw.get(attacker)!.points.length).toBeGreaterThan(2);
      expect(raw.get(attacker)!.kind).toBe(dice === 1 ? 'jump' : 'step');
    }
  });
  it('does not invent a finisher for a missing attacker or a replayed snapshot', () => {
    const { after, raw } = fixture(1);
    expect(directCapturePlans(raw, 'missing', 650)).toBe(raw);
    expect(directCapturePlans(sceneMotion(after, after), attacker, 650).size).toBe(0);
  });
  it.each([riderCapturePlans, kameCapturePlans])(
    'also preserves the two-endpoint route for transformation effects',
    (prepare) => {
      const { raw } = fixture(1);
      expect(prepare(raw, attacker).get(attacker)!.points).toEqual([
        raw.get(attacker)!.points[0],
        raw.get(attacker)!.points.at(-1)!,
      ]);
    },
  );
});
