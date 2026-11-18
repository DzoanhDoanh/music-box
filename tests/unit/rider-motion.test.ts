import { describe, expect, it } from 'vitest';
import { riderCapturePlans, riderImpactMs } from '../../src/client/components/game/rider-motion';
import { sampleSceneMotion, type ScenePlan } from '../../src/client/components/game/scene-motion';

function plans() {
  return new Map<string, ScenePlan>([
    [
      'attacker',
      {
        points: [
          { x: -3, z: 0, scale: 1 },
          { x: 0, z: 0, scale: 1 },
        ],
        kind: 'step',
        duration: 690,
        delay: 0,
      },
    ],
    [
      'victim',
      {
        points: [
          { x: 0, z: 0, scale: 1 },
          { x: 4, z: -2, scale: 1 },
        ],
        kind: 'capture',
        duration: 1590,
        delay: 690,
      },
    ],
    [
      'other',
      {
        points: [
          { x: 4, z: 4, scale: 1 },
          { x: 4, z: 4, scale: 0.9 },
        ],
        kind: 'shift',
        duration: 360,
        delay: 0,
      },
    ],
  ]);
}

describe('Rider Kick presentation', () => {
  it('retimes only the confirmed attacker and victims without mutating the original plans', () => {
    const raw = plans(),
      before = structuredClone(raw);
    const next = riderCapturePlans(raw, 'attacker');
    expect(raw).toEqual(before);
    expect(next.get('attacker')).toMatchObject({ kind: 'rider-kick', duration: riderImpactMs });
    expect(next.get('attacker')!.points).toEqual(raw.get('attacker')!.points);
    expect(next.get('victim')).toMatchObject({
      delay: riderImpactMs,
      duration: riderImpactMs + 900,
    });
    expect(next.get('other')).toBe(raw.get('other'));
  });
  it('leaves ordinary moves and missing attackers unchanged', () => {
    const raw = plans();
    expect(riderCapturePlans(raw, 'missing')).toBe(raw);
    raw.delete('victim');
    expect(riderCapturePlans(raw, 'attacker')).toBe(raw);
  });
  it('charges in place, rises, dives and lands at the authoritative destination', () => {
    const plan = riderCapturePlans(plans(), 'attacker').get('attacker')!;
    expect(sampleSceneMotion(plan, 0.15)).toMatchObject({ ...plan.points[0], y: 0.21 });
    expect(sampleSceneMotion(plan, 0.5).y).toBeCloseTo(2.81);
    expect(sampleSceneMotion(plan, 0.8).y).toBeLessThan(sampleSceneMotion(plan, 0.5).y);
    expect(sampleSceneMotion(plan, 1)).toMatchObject({ ...plan.points.at(-1), y: 0.21 });
    expect(sampleSceneMotion(plan, 2)).toEqual(sampleSceneMotion(plan, 1));
    for (let n = 0; n <= 100; n++) {
      const p = sampleSceneMotion(plan, n / 100);
      expect(p.x).toBeGreaterThanOrEqual(-3);
      expect(p.x).toBeLessThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0.21);
    }
  });
  it('holds the opponent still until the boot strikes, then completes the original trip home', () => {
    const victim = riderCapturePlans(plans(), 'attacker').get('victim')!;
    const impact = sampleSceneMotion(victim, riderImpactMs / victim.duration);
    expect(impact).toMatchObject({ ...victim.points[0], y: 0.21, spin: 0, roll: 0 });
    const flight = sampleSceneMotion(victim, (riderImpactMs + 450) / victim.duration);
    expect(flight.y).toBeGreaterThan(3.9);
    expect(sampleSceneMotion(victim, 1)).toMatchObject({
      ...victim.points.at(-1),
      y: 0.21,
      spin: 0,
      roll: 0,
    });
  });
});
