import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import CaptureBurst, { type CaptureEffectProps } from './CaptureBurst';
import Figurine from './Figurine';
import { pieceColors, type MovingPieceProps } from './MovingPiece';
import { advanceSceneTime, sampleSceneMotion, type ScenePlan } from './scene-motion';
import { riderRestoreMs } from './rider-motion';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const suit = '#17232a',
  green = '#28b881',
  silver = '#c3d6df',
  red = '#ed354b';
type V3 = [number, number, number];
type Joint = RefObject<Group | null>;
type Rig = {
  torso: Joint;
  kickHip: Joint;
  foldedHip: Joint;
  foldedKnee: Joint;
  leftArm: Joint;
  rightArm: Joint;
  scarf: Joint;
  boot: RefObject<Mesh | null>;
};

function Armor({
  at,
  size,
  color,
  glow = false,
}: {
  at: V3;
  size: V3;
  color: string;
  glow?: boolean;
}) {
  return (
    <mesh position={at} scale={size}>
      <sphereGeometry args={[1, 16, 10]} />
      <meshStandardMaterial
        color={color}
        roughness={0.32}
        metalness={0.35}
        emissive={glow ? color : '#000000'}
        emissiveIntensity={glow ? 0.65 : 0}
      />
    </mesh>
  );
}

/** A jointed, locally modelled classic Rider; never replaces the saved piece skin. */
function RiderModel({ rig }: { rig: Rig }) {
  return (
    <group ref={rig.torso} position={[0, 0.9, 0]}>
      <Armor at={[0, 0.23, 0]} size={[0.29, 0.4, 0.19]} color={suit} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Armor at={[side * 0.15, 0.43, 0.13]} size={[0.17, 0.19, 0.14]} color={green} />
          {[0, 1, 2].map((i) => (
            <Armor
              key={i}
              at={[side * 0.1, 0.22 - i * 0.105, 0.16]}
              size={[0.1, 0.07, 0.055]}
              color={i % 2 ? '#218a69' : green}
            />
          ))}
          <group ref={side < 0 ? rig.leftArm : rig.rightArm} position={[side * 0.32, 0.42, 0]}>
            <Armor at={[0, -0.03, 0]} size={[0.15, 0.16, 0.15]} color={green} />
            <Armor at={[0, -0.23, 0]} size={[0.1, 0.2, 0.1]} color={suit} />
            <group position={[0, -0.4, 0]} rotation={[-0.65, 0, 0]}>
              <Armor at={[0, -0.16, 0]} size={[0.12, 0.2, 0.12]} color={silver} />
              <Armor at={[0, -0.36, 0.02]} size={[0.13, 0.12, 0.13]} color={silver} />
            </group>
          </group>
          <group ref={side > 0 ? rig.kickHip : rig.foldedHip} position={[side * 0.14, -0.08, 0]}>
            <Armor at={[0, -0.19, 0]} size={[0.12, 0.25, 0.12]} color={suit} />
            <group ref={side < 0 ? rig.foldedKnee : undefined} position={[0, -0.4, 0]}>
              <Armor at={[0, 0, 0.035]} size={[0.13, 0.12, 0.13]} color={silver} />
              <Armor at={[0, -0.17, 0]} size={[0.115, 0.23, 0.12]} color={silver} />
              <Armor at={[0, -0.38, 0.1]} size={[0.14, 0.105, 0.23]} color={silver} />
              <Armor at={[0, -0.46, 0.1]} size={[0.145, 0.035, 0.23]} color={suit} />
              {side > 0 && (
                <mesh
                  ref={rig.boot}
                  position={[0, -0.36, 0.08]}
                  scale={[0.3, 0.4, 0.4]}
                  visible={false}
                >
                  <sphereGeometry args={[1, 16, 10]} />
                  <meshBasicMaterial
                    color="#ffe78f"
                    transparent
                    opacity={0}
                    blending={AdditiveBlending}
                    depthWrite={false}
                  />
                </mesh>
              )}
            </group>
          </group>
        </group>
      ))}
      <mesh position={[0, -0.015, 0]}>
        <cylinderGeometry args={[0.275, 0.27, 0.12, 20]} />
        <meshStandardMaterial color={silver} metalness={0.65} roughness={0.25} />
      </mesh>
      <mesh position={[0, -0.015, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.045, 20]} />
        <meshStandardMaterial color={red} emissive={red} emissiveIntensity={1.2} />
      </mesh>
      <Armor at={[0, 0.67, 0]} size={[0.15, 0.09, 0.14]} color={red} />
      <group ref={rig.scarf} position={[-0.12, 0.66, -0.13]} rotation={[-0.35, 0.2, 0.15]}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            position={[-i * 0.08, Math.sin(i * 1.2) * 0.07, -0.18 - i * 0.25]}
            rotation={[i * 0.12, i * 0.14, 0]}
          >
            <boxGeometry args={[0.22 - i * 0.035, 0.035, 0.32]} />
            <meshStandardMaterial color={red} roughness={0.7} />
          </mesh>
        ))}
      </group>
      <group position={[0, 0.94, 0]}>
        <Armor at={[0, 0, 0]} size={[0.29, 0.32, 0.26]} color={green} />
        <Armor at={[0, 0.08, 0.08]} size={[0.043, 0.26, 0.23]} color={silver} />
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh
              position={[side * 0.137, 0.055, 0.205]}
              rotation={[0, side * 0.32, side * -0.18]}
              scale={[0.135, 0.18, 0.1]}
            >
              <icosahedronGeometry args={[1, 1]} />
              <meshStandardMaterial
                color={red}
                emissive="#e51f39"
                emissiveIntensity={0.8}
                metalness={0.4}
                roughness={0.2}
              />
            </mesh>
            <mesh position={[side * 0.12, 0.37, 0.01]} rotation={[0, 0, side * -0.3]}>
              <coneGeometry args={[0.025, 0.4, 8]} />
              <meshStandardMaterial color={silver} metalness={0.6} roughness={0.2} />
            </mesh>
          </group>
        ))}
        <Armor at={[0, -0.15, 0.17]} size={[0.22, 0.11, 0.14]} color={silver} />
        {[-1, 0, 1].map((i) => (
          <mesh key={i} position={[i * 0.065, -0.16, 0.303]}>
            <boxGeometry args={[0.023, 0.07, 0.01]} />
            <meshBasicMaterial color={suit} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function RiderAttacker({
  position,
  plan,
  color,
  skin,
  animate,
  effectStatus,
  light = false,
}: MovingPieceProps) {
  const original = useRef<Group>(null),
    rider = useRef<Group>(null),
    rings = useRef<Group>(null),
    morph = useRef<Mesh>(null),
    trail = useRef<InstancedMesh>(null);
  const rig: Rig = {
    torso: useRef(null),
    kickHip: useRef(null),
    foldedHip: useRef(null),
    foldedKnee: useRef(null),
    leftArm: useRef(null),
    rightArm: useRef(null),
    scarf: useRef(null),
    boot: useRef(null),
  };
  const elapsed = useRef(Infinity),
    seen = useRef<ScenePlan | undefined>(undefined);
  const invalidate = useThree((s) => s.invalidate);
  const dummy = useMemo(() => new Object3D(), []);
  const count = light ? 8 : 16;
  const start = plan?.points[0] ?? position,
    end = position;
  const yaw = Math.atan2(end.x - start.x, end.z - start.z);
  const ringRotation = useMemo(
    () =>
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 0, 1),
        new Vector3(end.x - start.x, -2.6, end.z - start.z).normalize(),
      ),
    [end.x, end.z, start.x, start.z],
  );
  const { x, z, scale } = position;
  useLayoutEffect(() => {
    const statusElement = effectStatus?.current;
    if (plan !== seen.current) {
      elapsed.current = plan && animate ? -1 : Infinity;
      seen.current = plan;
    } else if (!animate) elapsed.current = Infinity;
    const point =
      plan && Number.isFinite(elapsed.current)
        ? sampleSceneMotion(plan, 0)
        : { x, z, scale, y: 0.21 };
    if (original.current) {
      original.current.visible = true;
      original.current.position.set(point.x, point.y, point.z);
      original.current.scale.setScalar(point.scale);
    }
    if (rider.current) rider.current.visible = false;
    if (rings.current) rings.current.visible = false;
    if (morph.current) morph.current.visible = false;
    if (trail.current) trail.current.visible = false;
    if (statusElement) statusElement.dataset.attackerForm = 'piece';
    invalidate();
    return () => {
      if (statusElement) statusElement.dataset.attackerForm = 'piece';
    };
  }, [plan, animate, x, z, scale, invalidate, effectStatus]);
  useFrame((_, delta) => {
    if (!animate || !plan || !Number.isFinite(elapsed.current)) return;
    elapsed.current = advanceSceneTime(elapsed.current, delta);
    const ms = elapsed.current,
      t = clamp(ms / plan.duration),
      age = ms - plan.duration;
    const p = sampleSceneMotion(plan, t);
    const returning = clamp((age - 220) / (riderRestoreMs - 220));
    const reveal = clamp((ms - 90) / 170) * (1 - returning);
    const originalSize = ms < plan.duration ? 1 - clamp(ms / 180) : returning;
    const kick = clamp((t - 0.4) / 0.15) * (1 - clamp(age / 350));
    if (original.current) {
      original.current.visible = originalSize > 0;
      original.current.position.set(p.x, p.y, p.z);
      original.current.scale.setScalar(p.scale * originalSize);
    }
    if (rider.current) {
      rider.current.visible = reveal > 0;
      rider.current.position.set(
        p.x - Math.sin(yaw) * kick * 0.45,
        p.y,
        p.z - Math.cos(yaw) * kick * 0.45,
      );
      rider.current.rotation.y = yaw;
      rider.current.scale.setScalar(0.92 * reveal);
    }
    if (rig.torso.current) {
      rig.torso.current.rotation.x = -0.4 * kick;
      rig.torso.current.position.y = 0.9 - (t < 0.2 ? Math.sin((t / 0.2) * Math.PI) * 0.17 : 0);
    }
    if (rig.kickHip.current) rig.kickHip.current.rotation.x = -1.12 * kick;
    if (rig.foldedHip.current) rig.foldedHip.current.rotation.x = -0.25 - 0.5 * kick;
    if (rig.foldedKnee.current) rig.foldedKnee.current.rotation.x = 0.25 + 1.8 * kick;
    if (rig.leftArm.current)
      rig.leftArm.current.rotation.set(-0.45 - kick * 0.55, 0, -0.5 - kick * 0.45);
    if (rig.rightArm.current)
      rig.rightArm.current.rotation.set(0.25 + kick * 0.7, 0, 0.5 + kick * 0.35);
    if (rig.scarf.current)
      rig.scarf.current.rotation.x = -0.35 + Math.sin(ms * 0.018) * (0.08 + kick * 0.18);
    if (rig.boot.current) {
      rig.boot.current.visible = kick > 0.05;
      (rig.boot.current.material as MeshBasicMaterial).opacity = kick * 0.5;
      rig.boot.current.scale.set(0.3 + kick * 0.06, 0.4, 0.4 + kick * 0.15);
    }
    if (morph.current) {
      morph.current.visible = t < 0.25 || (returning > 0 && returning < 1);
      morph.current.position.set(p.x, p.y + (t < 0.25 ? t * 8 : returning * 2), p.z);
      morph.current.scale.setScalar(0.55 + Math.sin(clamp(ms / 400) * Math.PI) * 0.3);
    }
    rings.current?.children.forEach((child, i) => {
      const at = sampleSceneMotion(plan, 0.6 + i * 0.13);
      child.position.set(at.x, at.y + 0.6, at.z);
      child.quaternion.copy(ringRotation);
      child.scale.setScalar(0.65 + i * 0.08 + Math.sin(ms * 0.012 + i) * 0.05);
      ((child as Mesh).material as MeshBasicMaterial).opacity =
        clamp((t - 0.35) * 5) * (1 - clamp((t - 0.88) / 0.12)) * 0.7;
    });
    if (rings.current) rings.current.visible = t > 0.35 && age < 0;
    if (trail.current) {
      trail.current.visible = t > 0.5 && age < 150;
      for (let i = 0; i < count; i++) {
        const q = sampleSceneMotion(plan, Math.max(0.5, t - i * 0.012));
        const radius = (1 - i / count) * 0.13 * (1 - clamp(age / 150));
        dummy.position.set(q.x, q.y + 0.5, q.z);
        dummy.scale.setScalar(radius);
        dummy.updateMatrix();
        trail.current.setMatrixAt(i, dummy.matrix);
      }
      trail.current.instanceMatrix.needsUpdate = true;
    }
    if (effectStatus?.current)
      effectStatus.current.dataset.attackerForm =
        reveal > 0 && originalSize === 0 ? 'rider' : 'piece';
    if (age >= riderRestoreMs) elapsed.current = Infinity;
    invalidate();
  });
  return (
    <>
      <group ref={original}>
        <Figurine skin={skin} color={pieceColors[color]} />
      </group>
      <group ref={rider} visible={false}>
        <RiderModel rig={rig} />
      </group>
      <mesh ref={morph} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1, 0.035, 8, 48]} />
        <meshBasicMaterial
          color="#9bffdb"
          transparent
          opacity={0.85}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <group ref={rings} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <torusGeometry args={[1, 0.025, 6, 48]} />
            <meshBasicMaterial
              color={i % 2 ? '#9bffdb' : '#ffd77e'}
              transparent
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      <instancedMesh
        key={count}
        ref={trail}
        args={[undefined, undefined, count]}
        visible={false}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          color="#ffc66d"
          transparent
          opacity={0.8}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </>
  );
}

export default function RiderKick(props: CaptureEffectProps) {
  return <CaptureBurst {...props} color="#ffe094" />;
}
