import { describe, expect, it } from 'vitest';
import {
  kameCapturePlans,
  kameFireMs,
  kameImpactMs,
  kameRestoreMs,
  kamePose,
} from '../../src/client/components/game/kamehameha-motion';
import { sampleSceneMotion, type ScenePlan } from '../../src/client/components/game/scene-motion';

function plans() {
  return new Map<string, ScenePlan>([
    [
      'attacker',
      {
        points: [
          { x: -3, z: 2, scale: 1 },
          { x: 1, z: -1, scale: 0.9 },
        ],
        kind: 'step',
        duration: 650,
        delay: 0,
      },
    ],
    [
      'victim',
      {
        points: [
          { x: 1, z: -1, scale: 1 },
          { x: 4, z: 4, scale: 1 },
        ],
        kind: 'capture',
        duration: 1550,
        delay: 650,
      },
    ],
    [
      'other',
      {
        points: [
          { x: 4, z: 0, scale: 1 },
          { x: 4, z: 0, scale: 0.9 },
        ],
        kind: 'shift',
        duration: 300,
        delay: 0,
      },
    ],
  ]);
}

describe('Kamehameha presentation', () => {
  it('only retimes confirmed captures, preserving input plans and ordinary moves', () => {
    const raw = plans(),
      before = structuredClone(raw);
    const next = kameCapturePlans(raw, 'attacker');
    expect(raw).toEqual(before);
    expect(next.get('attacker')).toMatchObject({ kind: 'kamehameha', duration: kameImpactMs });
    expect(next.get('attacker')!.points).toEqual(raw.get('attacker')!.points);
    expect(next.get('victim')).toMatchObject({ delay: kameImpactMs, duration: kameImpactMs + 900 });
    expect(next.get('other')).toBe(raw.get('other'));
    expect(kameCapturePlans(raw, 'missing')).toBe(raw);
    raw.delete('victim');
    expect(kameCapturePlans(raw, 'attacker')).toBe(raw);
  });
  it('charges from its starting square, extends a beam and holds the victim until impact', () => {
    const next = kameCapturePlans(plans(), 'attacker'),
      cue = next.get('attacker')!,
      victim = next.get('victim')!;
    expect(kamePose(cue, 1000)).toMatchObject({
      ...cue.points[0],
      beam: 0,
      original: 0,
      reveal: 1,
    });
    expect(kamePose(cue, kameFireMs)).toMatchObject({ thrust: 1, beam: 0 });
    expect(kamePose(cue, kameImpactMs)).toMatchObject({ ...cue.points[0], beam: 1 });
    expect(sampleSceneMotion(victim, kameImpactMs / victim.duration)).toMatchObject({
      ...victim.points[0],
      y: 0.21,
      spin: 0,
    });
    expect(sampleSceneMotion(victim, (kameImpactMs + 450) / victim.duration).y).toBeGreaterThan(
      3.9,
    );
    expect(sampleSceneMotion(victim, 1)).toMatchObject({ ...victim.points.at(-1), y: 0.21 });
  });
  it('extinguishes the beam, then restores the selected miniature at the authoritative destination', () => {
    const cue = kameCapturePlans(plans(), 'attacker').get('attacker')!;
    expect(kamePose(cue, kameImpactMs + 350)).toMatchObject({
      ...cue.points[0],
      power: 0,
      done: false,
    });
    expect(kamePose(cue, kameImpactMs + kameRestoreMs)).toMatchObject({
      ...cue.points.at(-1),
      original: 1,
      reveal: 0,
      power: 0,
      done: true,
    });
    expect(kamePose(cue, -1)).toEqual(kamePose(cue, 0));
    expect(kamePose(cue, 99999)).toEqual(kamePose(cue, kameImpactMs + kameRestoreMs));
    for (let ms = 0; ms < 4000; ms += 25) {
      const pose = kamePose(cue, ms);
      expect(pose.x).toBeGreaterThanOrEqual(-3);
      expect(pose.x).toBeLessThanOrEqual(1);
      expect(pose.z).toBeGreaterThanOrEqual(-1);
      expect(pose.z).toBeLessThanOrEqual(2);
      expect(pose.reveal).toBeGreaterThanOrEqual(0);
      expect(pose.reveal).toBeLessThanOrEqual(1);
    }
  });
});
