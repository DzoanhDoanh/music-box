import type { ScenePlan } from './scene-motion';

/** Presentation only: attack directly between confirmed endpoints, without a
 * separate walk along the track. Ordinary moves keep their original route. */
export function directCapturePlans(
  plans: Map<string, ScenePlan>,
  attacker: string,
  impactMs: number,
) {
  const cue = plans.get(attacker);
  if (!cue || ![...plans.values()].some((plan) => plan.kind === 'capture')) return plans;
  return new Map(
    [...plans].map(([key, plan]) => [
      key,
      key === attacker
        ? {
            ...plan,
            points: [plan.points[0], plan.points.at(-1)!],
            kind: 'strike' as const,
            duration: impactMs,
            delay: 0,
          }
        : plan.kind === 'capture'
          ? { ...plan, delay: impactMs, duration: impactMs + plan.duration - plan.delay }
          : plan,
    ]),
  );
}
