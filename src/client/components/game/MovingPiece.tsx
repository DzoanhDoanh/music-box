import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group } from 'three';
import type { PieceSkin } from '../../../shared/game/piece-skins';
import {
  advanceSceneTime,
  sampleSceneMotion,
  type ScenePlan,
  type ScenePoint,
} from './scene-motion';
import Figurine from './Figurine';

export const pieceColors = ['#f47784', '#56d6b0', '#f5ca6a', '#74b4fc'];

export type MovingPieceProps = {
  position: ScenePoint;
  plan?: ScenePlan;
  color: number;
  skin?: PieceSkin;
  animate: boolean;
  light?: boolean;
  effectStatus?: RefObject<HTMLDivElement | null>;
};

export default function MovingPiece({ position, plan, color, skin, animate }: MovingPieceProps) {
  const group = useRef<Group>(null);
  const motion = useRef<{ plan: ScenePlan; elapsed: number } | null>(null);
  const seenPlan = useRef<ScenePlan | undefined>(undefined);
  const { x, z, scale } = position;
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    motion.current = plan && animate && seenPlan.current !== plan ? { plan, elapsed: -1 } : null;
    seenPlan.current = plan;
    const start = motion.current
      ? sampleSceneMotion(motion.current.plan, 0)
      : { x, z, scale, y: 0.21, tilt: 0, spin: 0, roll: 0 };
    group.current?.position.set(start.x, start.y, start.z);
    group.current?.scale.setScalar(start.scale);
    group.current?.rotation.set(start.roll, start.spin, start.tilt);
    invalidate();
  }, [plan, animate, x, z, scale, invalidate]);
  useFrame((_, delta) => {
    const active = motion.current;
    if (!active || !group.current) return;
    active.elapsed = advanceSceneTime(active.elapsed, delta);
    const p = sampleSceneMotion(active.plan, active.elapsed / active.plan.duration);
    group.current.position.set(p.x, p.y, p.z);
    group.current.scale.setScalar(p.scale);
    group.current.rotation.set(p.roll, p.spin, p.tilt);
    if (active.elapsed >= active.plan.duration) motion.current = null;
    else invalidate();
  });
  return (
    <group ref={group}>
      <Figurine skin={skin} color={pieceColors[color]} />
    </group>
  );
}
