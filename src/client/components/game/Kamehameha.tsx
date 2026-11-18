import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, Group, InstancedMesh, Object3D, Vector3 } from 'three';
import CaptureBurst, { type CaptureEffectProps } from './CaptureBurst';
import Figurine from './Figurine';
import { pieceColors, type MovingPieceProps } from './MovingPiece';
import { advanceSceneTime, type ScenePlan } from './scene-motion';
import { kamePose } from './kamehameha-motion';

type V3 = [number, number, number];
const orange = '#ff791e',
  blue = '#164ca6',
  skinColor = '#ffc392';
function Shape({ at, size, color }: { at: V3; size: V3; color: string }) {
  return (
    <mesh position={at} scale={size}>
      <sphereGeometry args={[1, 16, 12]} />
      <meshStandardMaterial color={color} roughness={0.58} metalness={0.05} />
    </mesh>
  );
}

/** A local articulated miniature: orange gi, blue undershirt/sash and swept black hair. */
function GokuModel({
  limbs,
  hands,
}: {
  limbs: RefObject<Group | null>;
  hands: RefObject<Group | null>;
}) {
  return (
    <>
      <Shape at={[0, 1.2, 0]} size={[0.31, 0.39, 0.21]} color={orange} />
      <Shape at={[0, 1.47, 0.14]} size={[0.23, 0.17, 0.12]} color={blue} />
      <Shape at={[0, 1.52, 0.21]} size={[0.12, 0.12, 0.06]} color={skinColor} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.16, 1.3, 0.2]} rotation={[0, 0, side * -0.25]}>
            <boxGeometry args={[0.09, 0.35, 0.06]} />
            <meshStandardMaterial color="#ff9b3d" />
          </mesh>
          <Shape at={[side * 0.3, 1.4, 0]} size={[0.16, 0.18, 0.17]} color={orange} />
          <group position={[side * 0.18, 0.9, 0]} rotation={[side * 0.18, 0, side * 0.3]}>
            <Shape at={[0, -0.2, 0]} size={[0.19, 0.28, 0.19]} color={orange} />
            <Shape at={[0, -0.46, 0]} size={[0.14, 0.2, 0.15]} color={orange} />
            <Shape at={[0, -0.68, 0]} size={[0.145, 0.22, 0.145]} color={blue} />
            <Shape at={[0, -0.83, 0.1]} size={[0.16, 0.1, 0.25]} color={blue} />
            <mesh position={[0, -0.6, 0]}>
              <cylinderGeometry args={[0.15, 0.15, 0.035, 16]} />
              <meshStandardMaterial color="#ffb33c" />
            </mesh>
          </group>
        </group>
      ))}
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.29, 0.27, 0.14, 20]} />
        <meshStandardMaterial color={blue} />
      </mesh>
      <mesh position={[0.12, 0.78, 0.22]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[0.12, 0.38, 0.045]} />
        <meshStandardMaterial color={blue} />
      </mesh>
      <Shape at={[0, 1.65, 0]} size={[0.12, 0.13, 0.12]} color={skinColor} />
      <group position={[0, 1.94, 0]}>
        <Shape at={[0, 0, 0]} size={[0.28, 0.3, 0.245]} color={skinColor} />
        <Shape at={[0, 0.15, -0.065]} size={[0.3, 0.24, 0.24]} color="#141620" />
        {[-1, 1].map((side) => (
          <group key={side}>
            <Shape at={[side * 0.28, -0.02, 0]} size={[0.065, 0.1, 0.065]} color={skinColor} />
            <mesh position={[side * 0.12, 0.015, 0.224]} rotation={[0, side * 0.2, side * -0.12]}>
              <boxGeometry args={[0.14, 0.065, 0.03]} />
              <meshBasicMaterial color="#fff7ef" />
            </mesh>
            <mesh position={[side * 0.1, 0.012, 0.245]}>
              <boxGeometry args={[0.045, 0.06, 0.02]} />
              <meshBasicMaterial color="#17151d" />
            </mesh>
            <mesh position={[side * 0.12, 0.075, 0.24]} rotation={[0, 0, side * -0.2]}>
              <boxGeometry args={[0.16, 0.035, 0.03]} />
              <meshBasicMaterial color="#141620" />
            </mesh>
          </group>
        ))}
        <Shape at={[0, -0.07, 0.24]} size={[0.045, 0.05, 0.06]} color={skinColor} />
        <mesh position={[0, -0.17, 0.225]}>
          <boxGeometry args={[0.085, 0.018, 0.015]} />
          <meshBasicMaterial color="#a95538" />
        </mesh>
        {[
          [-0.26, 0.25, -0.04, 0.85, 0.62],
          [-0.15, 0.39, -0.03, 0.5, 0.72],
          [0.02, 0.43, -0.07, -0.12, 0.7],
          [0.2, 0.3, -0.09, -0.7, 0.65],
          [0.3, 0.14, -0.12, -1.1, 0.55],
          [-0.26, 0.08, -0.1, 1.25, 0.45],
          [-0.11, 0.11, 0.19, 2.7, 0.35],
          [0.1, 0.16, 0.17, -2.5, 0.3],
        ].map(([x, y, z, tilt, length], i) => (
          <mesh key={i} position={[x, y, z]} rotation={[0.15, 0, tilt]}>
            <coneGeometry args={[0.13, length, 5]} />
            <meshStandardMaterial color="#141620" roughness={0.45} />
          </mesh>
        ))}
      </group>
      <group ref={limbs}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i}>
            <cylinderGeometry args={[1, 1, 1, 12]} />
            <meshStandardMaterial color={skinColor} roughness={0.65} />
          </mesh>
        ))}
      </group>
      <group ref={hands}>
        {[-1, 1].map((side) => (
          <group key={side}>
            <Shape at={[0, 0, -0.06]} size={[0.105, 0.11, 0.1]} color={blue} />
            <Shape at={[0, 0, 0.06]} size={[0.1, 0.11, 0.13]} color={skinColor} />
          </group>
        ))}
      </group>
    </>
  );
}

export function GokuAttacker({
  position,
  plan,
  color,
  skin,
  animate,
  effectStatus,
  light = false,
}: MovingPieceProps) {
  const original = useRef<Group>(null),
    goku = useRef<Group>(null),
    energy = useRef<Group>(null),
    limbs = useRef<Group>(null),
    hands = useRef<Group>(null),
    orb = useRef<Group>(null),
    beam = useRef<Group>(null),
    rings = useRef<Group>(null),
    particles = useRef<InstancedMesh>(null);
  const elapsed = useRef(Infinity),
    seen = useRef<ScenePlan | undefined>(undefined);
  const invalidate = useThree((s) => s.invalidate);
  const scratch = useMemo(
    () => ({
      dummy: new Object3D(),
      a: new Vector3(),
      b: new Vector3(),
      direction: new Vector3(),
      up: new Vector3(0, 1, 0),
    }),
    [],
  );
  const count = light ? 12 : 32;
  const { x, z, scale } = position;
  const start = plan?.points[0] ?? position;
  const yaw = Math.atan2(x - start.x, z - start.z);
  const distance = Math.hypot(x - start.x, z - start.z);
  useLayoutEffect(() => {
    const status = effectStatus?.current;
    if (plan !== seen.current) {
      elapsed.current = plan && animate ? -1 : Infinity;
      seen.current = plan;
    } else if (!animate) elapsed.current = Infinity;
    const p =
      plan && Number.isFinite(elapsed.current) ? kamePose(plan, 0) : { x, z, scale, y: 0.21 };
    if (original.current) {
      original.current.visible = true;
      original.current.position.set(p.x, p.y, p.z);
      original.current.scale.setScalar(p.scale);
    }
    if (goku.current) goku.current.visible = false;
    if (energy.current) energy.current.visible = false;
    if (status) {
      status.dataset.attackerForm = 'piece';
      status.dataset.beamPhase = 'idle';
    }
    invalidate();
    return () => {
      if (status) {
        status.dataset.attackerForm = 'piece';
        status.dataset.beamPhase = 'idle';
      }
    };
  }, [plan, animate, x, z, scale, invalidate, effectStatus]);

  useFrame((_, delta) => {
    if (!animate || !plan || !Number.isFinite(elapsed.current)) return;
    elapsed.current = advanceSceneTime(elapsed.current, delta);
    const ms = elapsed.current,
      pose = kamePose(plan, ms);
    if (original.current) {
      original.current.visible = pose.original > 0;
      original.current.position.set(pose.x, pose.y, pose.z);
      original.current.scale.setScalar(pose.scale * pose.original);
    }
    if (goku.current) {
      goku.current.visible = pose.reveal > 0;
      goku.current.position.set(pose.x, pose.y, pose.z);
      goku.current.rotation.y = yaw;
      goku.current.scale.setScalar(0.95 * pose.reveal);
    }
    // Both palms cup the same orb at the hip, then thrust forward together.
    const handX = 0.49 * (1 - pose.thrust),
      handZ = 0.06 + pose.thrust * 0.62;
    const handY = 1.02 + pose.thrust * 0.15;
    for (let side = 0; side < 2; side++) {
      const sign = side ? 1 : -1;
      const hx = handX + sign * 0.13;
      hands.current?.children[side].position.set(hx, handY, handZ);
      const joints: V3[] = [
        [sign * 0.31, 1.4, 0],
        [sign * 0.48 + handX * 0.5, 1.08, -0.08 + pose.thrust * 0.4],
        [hx, handY, handZ],
      ];
      for (let segment = 0; segment < 2; segment++) {
        const limb = limbs.current?.children[side * 2 + segment];
        if (!limb) continue;
        scratch.a.set(...joints[segment]);
        scratch.b.set(...joints[segment + 1]);
        scratch.direction.subVectors(scratch.b, scratch.a);
        limb.position.copy(scratch.a).add(scratch.b).multiplyScalar(0.5);
        limb.scale.set(0.095, scratch.direction.length(), 0.095);
        limb.quaternion.setFromUnitVectors(scratch.up, scratch.direction.normalize());
      }
    }
    const ballZ = 0.18 + pose.thrust * 0.6;
    if (energy.current) {
      energy.current.visible = pose.power > 0 && pose.reveal > 0;
      energy.current.position.set(start.x, 0.21, start.z);
      energy.current.rotation.y = yaw;
    }
    const pulse = 1 + Math.sin(ms * 0.012) * 0.045;
    if (orb.current) {
      orb.current.position.set(handX * 0.95, handY * 0.95, ballZ);
      orb.current.scale.setScalar((0.08 + pose.charge * 0.36) * pulse * pose.power);
      orb.current.rotation.set(ms * 0.002, ms * 0.003, 0);
    }
    const length = Math.max(0.05, distance - ballZ) * pose.beam;
    if (beam.current) {
      beam.current.visible = pose.beam > 0 && pose.power > 0;
      beam.current.position.set(0, handY * 0.95, ballZ + length / 2);
      beam.current.scale.set(pose.power * pulse, length, pose.power * pulse);
    }
    rings.current?.children.forEach((ring, i) => {
      ring.visible = pose.beam > 0 && pose.power > 0;
      ring.position.set(0, handY * 0.95, ballZ + length * ((ms / 500 + i / 4) % 1));
      ring.scale.setScalar((0.28 + Math.sin(ms * 0.01 + i) * 0.04) * pose.power);
    });
    if (particles.current) {
      for (let i = 0; i < count; i++) {
        const angle = i * 2.39996 + ms * 0.003;
        const radius =
          pose.beam > 0 ? 0.3 : (1 - ((ms / 900 + i / count) % 1)) * (0.45 + pose.charge * 0.65);
        scratch.dummy.position.set(
          handX + Math.cos(angle) * radius,
          handY + Math.sin(angle) * radius,
          pose.beam > 0 ? ballZ + length * (i / count) : ballZ + Math.sin(angle * 1.8) * radius,
        );
        scratch.dummy.scale.setScalar((0.025 + (i % 3) * 0.012) * pose.power);
        scratch.dummy.updateMatrix();
        particles.current.setMatrixAt(i, scratch.dummy.matrix);
      }
      particles.current.instanceMatrix.needsUpdate = true;
    }
    if (effectStatus?.current) {
      effectStatus.current.dataset.attackerForm =
        pose.reveal > 0 && pose.original === 0 ? 'goku' : 'piece';
      effectStatus.current.dataset.beamPhase = pose.done
        ? 'done'
        : pose.power <= 0
          ? 'recovering'
          : pose.beam >= 1
            ? 'hit'
            : pose.beam > 0
              ? 'firing'
              : 'charging';
    }
    if (pose.done) elapsed.current = Infinity;
    invalidate();
  });
  return (
    <>
      <group ref={original}>
        <Figurine skin={skin} color={pieceColors[color]} />
      </group>
      <group ref={goku} visible={false}>
        <GokuModel limbs={limbs} hands={hands} />
      </group>
      <group ref={energy} visible={false}>
        <group ref={orb}>
          <mesh>
            <sphereGeometry args={[0.65, 24, 16]} />
            <meshBasicMaterial color="#efffff" />
          </mesh>
          <mesh>
            <sphereGeometry args={[1, 24, 16]} />
            <meshBasicMaterial
              color="#3ebeff"
              transparent
              opacity={0.25}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {[0, 1].map((i) => (
            <mesh key={i} rotation={[(i * Math.PI) / 2, 0.3, 0]}>
              <torusGeometry args={[1.15, 0.045, 6, 40]} />
              <meshBasicMaterial
                color="#8eeaff"
                transparent
                opacity={0.75}
                blending={AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
        <group ref={beam} rotation={[Math.PI / 2, 0, 0]} visible={false}>
          {[0, 1, 2].map((i) => (
            <mesh key={i}>
              <cylinderGeometry
                args={[0.1 + i * 0.11, 0.09 + i * 0.1, 1, light ? 12 : 24, 1, true]}
              />
              <meshBasicMaterial
                color={i === 0 ? '#f1ffff' : '#39baff'}
                transparent
                opacity={i === 0 ? 0.95 : i === 1 ? 0.4 : 0.12}
                blending={AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
        <group ref={rings}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i}>
              <torusGeometry args={[1, 0.055, 6, 32]} />
              <meshBasicMaterial
                color="#9bedff"
                transparent
                opacity={0.65}
                blending={AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
        <instancedMesh
          key={count}
          ref={particles}
          args={[undefined, undefined, count]}
          frustumCulled={false}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            color="#b4f5ff"
            blending={AdditiveBlending}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </instancedMesh>
      </group>
    </>
  );
}

export default function Kamehameha(props: CaptureEffectProps) {
  return <CaptureBurst {...props} color="#53d8ff" showApproach={false} />;
}
