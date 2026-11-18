import type { ScenePlan } from './scene-motion';

export const kameFireMs = 1400;
export const kameImpactMs = 1800;
export const kameRestoreMs = 950;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Retimes an already-confirmed capture, never the authoritative move or skin. */
export function kameCapturePlans(plans: Map<string, ScenePlan>, attacker: string) {
  const cue = plans.get(attacker);
  if (!cue || ![...plans.values()].some((p) => p.kind === 'capture')) return plans;
  return new Map(
    [...plans].map(([key, plan]) => [
      key,
      key === attacker
        ? {
            ...plan,
            points: [plan.points[0], plan.points.at(-1)!],
            kind: 'kamehameha' as const,
            duration: kameImpactMs,
            delay: 0,
          }
        : plan.kind === 'capture'
          ? { ...plan, delay: kameImpactMs, duration: kameImpactMs + plan.duration - plan.delay }
          : plan,
    ]),
  );
}

/** Beam impact happens first; the attacker then settles onto its confirmed square. */
export function kamePose(plan: ScenePlan, elapsedMs: number) {
  const ms = Math.max(0, elapsedMs);
  const start = plan.points[0],
    end = plan.points.at(-1)!;
  const travel = clamp((ms - kameImpactMs - 350) / 450);
  const ease = travel * travel * (3 - 2 * travel);
  const restore = clamp((ms - kameImpactMs - 650) / 300);
  return {
    x: start.x + (end.x - start.x) * ease,
    z: start.z + (end.z - start.z) * ease,
    scale: start.scale + (end.scale - start.scale) * ease,
    y: 0.21,
    charge: clamp(ms / kameFireMs),
    thrust: clamp((ms - kameFireMs + 200) / 200),
    beam: clamp((ms - kameFireMs) / (kameImpactMs - kameFireMs)),
    power: 1 - clamp((ms - kameImpactMs - 150) / 200),
    reveal: clamp((ms - 80) / 180) * (1 - restore),
    original: ms < kameImpactMs ? 1 - clamp(ms / 180) : restore,
    done: ms >= kameImpactMs + kameRestoreMs,
  };
}
