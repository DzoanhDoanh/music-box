import type { GameState } from '../../../shared/game/contracts';
import { skipsStart } from '../../../shared/game/board';
import { committedMotion, pieceLayout } from './board-motion';
import { piecePoint } from './board-geometry';
import { sampleRiderMotion } from './rider-motion';

export type ScenePoint = { x: number; z: number; scale: number };
export type ScenePlan = {
  points: ScenePoint[];
  duration: number;
  delay: number;
  kind: 'step' | 'jump' | 'strike' | 'capture' | 'shift' | 'rider-kick' | 'kamehameha';
};
export const scenePoint = (p: { x: number; y: number; scale: number }): ScenePoint => ({
  x: p.x - 7.5,
  z: p.y - 7.5,
  scale: p.scale,
});

/** -1 starts on the first rendered frame, excluding demand-render idle time.
 * Later frames use real elapsed time, so low FPS cannot stretch capture timing. */
export function advanceSceneTime(elapsedMs: number, deltaSeconds: number) {
  if (!Number.isFinite(elapsedMs)) return Infinity;
  return elapsedMs < 0 ? 0 : elapsedMs + Math.max(0, deltaSeconds) * 1000;
}

/** The same consecutive authoritative-event guard as the flat board. No simulated moves. */
export function sceneMotion(before: GameState, after: GameState) {
  const result = new Map<string, ScenePlan>();
  const validated = committedMotion(before, after);
  const old = pieceLayout(before),
    next = pieceLayout(after);
  for (const plan of validated) {
    const points = [scenePoint(old.get(plan.key)!)];
    let kind: ScenePlan['kind'] = 'shift';
    if (plan.key === after.last.actor + ':' + after.last.piece) {
      kind = after.last.moveKind === 'JUMP' ? 'jump' : 'step';
      const player = after.players.find((p) => p.id === after.last.actor)!;
      for (let n = after.last.from! + 1; n < after.last.to!; n++) {
        if (skipsStart(n, after.rules)) continue;
        const [x, y] = piecePoint(player.color, n, after.last.piece!, after.schema);
        points.push(scenePoint({ x, y, scale: 1 }));
      }
    } else if (after.last.captures?.includes(plan.key)) kind = 'capture';
    points.push(scenePoint(next.get(plan.key)!));
    result.set(plan.key, {
      points,
      kind,
      duration: kind === 'capture' ? plan.duration + 900 : plan.duration,
      delay: kind === 'capture' ? plan.duration : 0,
    });
  }
  return result;
}

export function sampleSceneMotion(plan: ScenePlan, progress: number) {
  if (plan.kind === 'rider-kick') return sampleRiderMotion(plan, progress);
  const time = Math.max(0, Math.min(1, progress));
  if (time === 1)
    return { ...plan.points[plan.points.length - 1], y: 0.21, tilt: 0, spin: 0, roll: 0 };
  const t = Math.max(0, (time * plan.duration - plan.delay) / (plan.duration - plan.delay));
  const travel =
    plan.kind === 'capture'
      ? 1 - (1 - t) ** 2
      : plan.kind === 'strike'
        ? Math.max(0, (t - 0.12) / 0.88) ** 2
        : t;
  const segment = Math.min(plan.points.length - 2, Math.floor(travel * (plan.points.length - 1)));
  const local = travel * (plan.points.length - 1) - segment;
  const a = plan.points[segment],
    b = plan.points[segment + 1];
  const hop =
    plan.kind === 'step'
      ? Math.sin(local * Math.PI) * 0.36
      : plan.kind === 'strike'
        ? Math.sin(travel * Math.PI) * 1.2
        : plan.kind === 'jump'
          ? Math.sin(t * Math.PI) * 1.4
          : plan.kind === 'capture'
            ? Math.sin(t * Math.PI) * 3.8
            : 0;
  return {
    x: a.x + (b.x - a.x) * local,
    z: a.z + (b.z - a.z) * local,
    y: 0.21 + hop,
    scale: a.scale + (b.scale - a.scale) * local,
    tilt: plan.kind === 'capture' ? Math.sin(t * Math.PI) * 1.2 : 0,
    spin: plan.kind === 'capture' ? t * Math.PI * 4 : 0,
    roll: plan.kind === 'capture' ? t * Math.PI * 2 : 0,
  };
}
