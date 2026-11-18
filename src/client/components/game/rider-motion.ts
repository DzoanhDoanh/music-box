import type { ScenePlan } from './scene-motion';

export const riderImpactMs = 1700;
export const riderRestoreMs = 500;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Presentation only: all captured pieces launch on the same committed impact. */
export function riderCapturePlans(plans: Map<string, ScenePlan>, attacker: string) {
  const cue = plans.get(attacker);
  if (!cue || ![...plans.values()].some((plan) => plan.kind === 'capture')) return plans;
  return new Map(
    [...plans].map(([key, plan]) => [
      key,
      key === attacker
        ? {
            ...plan,
            points: [plan.points[0], plan.points.at(-1)!],
            kind: 'rider-kick' as const,
            duration: riderImpactMs,
            delay: 0,
          }
        : plan.kind === 'capture'
          ? { ...plan, delay: riderImpactMs, duration: riderImpactMs + plan.duration - plan.delay }
          : plan,
    ]),
  );
}

/** Charge in place, lift off, then accelerate foot-first into the confirmed target. */
export function sampleRiderMotion(plan: ScenePlan, progress: number) {
  const t = clamp(progress),
    start = plan.points[0],
    end = plan.points.at(-1)!;
  const lift = clamp((t - 0.2) / 0.3);
  const dive = clamp((t - 0.5) / 0.5);
  const travel = t < 0.5 ? 0.18 * lift * lift : 0.18 + 0.82 * dive * dive;
  return {
    x: start.x + (end.x - start.x) * travel,
    z: start.z + (end.z - start.z) * travel,
    y: 0.21 + 2.6 * (t < 0.5 ? Math.sin((lift * Math.PI) / 2) : 1 - dive * dive),
    scale: start.scale + (end.scale - start.scale) * travel,
    tilt: 0,
    spin: 0,
    roll: 0,
  };
}
