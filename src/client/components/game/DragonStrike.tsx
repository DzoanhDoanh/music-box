import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  CatmullRomCurve3,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  TubeGeometry,
  Vector3,
} from 'three';
import CaptureBurst, { type CaptureEffectProps } from './CaptureBurst';
import { advanceSceneTime, sampleSceneMotion, type ScenePlan } from './scene-motion';

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** An eastern dragon built locally from geometry; no external models or textures. */
function DragonHead() {
  const whiskers = useMemo(
    () =>
      [-1, 1].map(
        (side) =>
          new TubeGeometry(
            new CatmullRomCurve3([
              new Vector3(0.6, -0.05, side * 0.3),
              new Vector3(1, 0.05, side * 0.7),
              new Vector3(0.5, 0.3, side * 1.15),
              new Vector3(-0.2, 0.5, side * 1.2),
            ]),
            20,
            0.025,
            5,
            false,
          ),
      ),
    [],
  );
  useLayoutEffect(() => () => whiskers.forEach((g) => g.dispose()), [whiskers]);
  return (
    <group>
      <mesh scale={[0.78, 0.5, 0.58]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial
          color="#128e8b"
          emissive="#066c62"
          emissiveIntensity={0.6}
          metalness={0.35}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0.58, -0.03, 0]} scale={[0.62, 0.25, 0.4]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial
          color="#41cdb7"
          emissive="#128a6c"
          emissiveIntensity={0.5}
          metalness={0.3}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0.6, -0.23, 0]} scale={[0.46, 0.12, 0.3]}>
        <sphereGeometry args={[1, 16, 8]} />
        <meshBasicMaterial color="#081f2e" />
      </mesh>
      <mesh position={[0.5, -0.37, 0]} scale={[0.55, 0.11, 0.35]}>
        <sphereGeometry args={[1, 16, 8]} />
        <meshStandardMaterial color="#f2d88b" metalness={0.45} roughness={0.3} />
      </mesh>
      {[-1, 1].map((side, i) => (
        <group key={side}>
          <mesh
            position={[0.28, 0.19, side * 0.45]}
            rotation={[side * 0.2, 0, -0.2]}
            scale={[0.25, 0.13, 0.1]}
          >
            <sphereGeometry args={[1, 12, 8]} />
            <meshBasicMaterial color="#fff6bc" toneMapped={false} />
          </mesh>
          <mesh position={[0.35, 0.19, side * 0.54]} scale={[0.035, 0.1, 0.025]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshBasicMaterial color="#042b36" />
          </mesh>
          <mesh
            position={[0.16, 0.35, side * 0.43]}
            rotation={[0, 0, -0.35]}
            scale={[0.4, 0.1, 0.12]}
          >
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#ffc86b" emissive="#c17a22" emissiveIntensity={0.5} />
          </mesh>
          <group position={[-0.32, 0.4, side * 0.32]} rotation={[side * 0.35, 0, 0.5]}>
            <mesh position={[0, 0.4, 0]}>
              <coneGeometry args={[0.14, 1.05, 8]} />
              <meshStandardMaterial
                color="#ffe6a6"
                emissive="#e7942d"
                emissiveIntensity={0.5}
                metalness={0.5}
                roughness={0.3}
              />
            </mesh>
            <mesh position={[-0.19, 0.35, 0]} rotation={[0, 0, 0.75]}>
              <coneGeometry args={[0.08, 0.55, 6]} />
              <meshBasicMaterial color="#ffdc8c" />
            </mesh>
          </group>
          <mesh position={[0.85, -0.22, side * 0.24]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.065, 0.28, 8]} />
            <meshBasicMaterial color="#fff6d5" />
          </mesh>
          <mesh geometry={whiskers[i]}>
            <meshBasicMaterial color="#ffe6a6" toneMapped={false} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          position={[-0.55, 0.08 + Math.sin(i * 0.8) * 0.45, Math.cos(i * 0.8) * 0.48]}
          rotation={[0, 0, 0.85 + i * 0.05]}
        >
          <coneGeometry args={[0.16, 0.75, 5]} />
          <meshStandardMaterial
            color="#ffce69"
            emissive="#c7751a"
            emissiveIntensity={0.65}
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

function EnergyDragon({
  plan,
  enabled,
  light,
}: {
  plan: ScenePlan;
  enabled: boolean;
  light: boolean;
}) {
  const root = useRef<Group>(null),
    head = useRef<Group>(null),
    body = useRef<InstancedMesh>(null),
    spine = useRef<InstancedMesh>(null),
    orbit = useRef<Mesh>(null);
  const elapsed = useRef(Infinity),
    consumed = useRef(false);
  const invalidate = useThree((s) => s.invalidate);
  const dummy = useMemo(() => new Object3D(), []);
  const count = light ? 18 : 36;
  const end = plan.points.at(-1)!;
  const route = useMemo(() => {
    let length = 0;
    for (let i = 1; i < plan.points.length; i++)
      length += Math.hypot(
        plan.points[i].x - plan.points[i - 1].x,
        plan.points[i].z - plan.points[i - 1].z,
      );
    const first = plan.points[0];
    const next = plan.points.find((p) => p.x !== first.x || p.z !== first.z) ?? {
      x: first.x + 1,
      z: first.z,
    };
    const norm = Math.hypot(next.x - first.x, next.z - first.z);
    return {
      length: Math.max(1, length),
      dx: (next.x - first.x) / norm,
      dz: (next.z - first.z) / norm,
    };
  }, [plan]);
  useLayoutEffect(() => {
    const tint = new Color();
    for (let i = 0; i < count; i++)
      body.current?.setColorAt(
        i,
        tint.set(i % 5 === 0 ? '#fff1ad' : i % 2 ? '#22c8ad' : '#137c89'),
      );
    if (body.current?.instanceColor) body.current.instanceColor.needsUpdate = true;
  }, [count]);
  useLayoutEffect(() => {
    if (!consumed.current) {
      consumed.current = true;
      elapsed.current = enabled ? -1 : Infinity;
    } else if (!enabled) elapsed.current = Infinity;
    if (root.current) root.current.visible = Number.isFinite(elapsed.current);
    invalidate();
  }, [enabled, invalidate]);
  useFrame((_, delta) => {
    if (!enabled || !root.current || !Number.isFinite(elapsed.current)) return;
    elapsed.current = advanceSceneTime(elapsed.current, delta);
    const age = elapsed.current - plan.duration;
    if (age >= 650) {
      root.current.visible = false;
      elapsed.current = Infinity;
      invalidate();
      return;
    }
    const t = clamp(elapsed.current / plan.duration);
    const fade = 1 - clamp(age / 650);
    const grow = 0.35 + 0.65 * clamp(elapsed.current / 160);
    const p = sampleSceneMotion(plan, t);
    const before = sampleSceneMotion(plan, Math.max(0, t - 0.025));
    const dx = p.x - before.x || (t === 0 ? route.dx : 0),
      dz = p.z - before.z || (t === 0 ? route.dz : 0);
    const yaw = dx || dz ? Math.atan2(-dz, dx) : Math.atan2(-route.dz, route.dx);
    if (head.current) {
      head.current.position.set(p.x - end.x, p.y + 1.05 + clamp(age / 650) * 0.5, p.z - end.z);
      head.current.rotation.set(Math.sin(elapsed.current * 0.009) * 0.08, yaw, -0.12);
      head.current.scale.setScalar(0.72 * grow * fade);
    }
    if (body.current && spine.current) {
      for (let i = 0; i < count; i++) {
        const fraction = (i + 1) / count;
        const lag = (fraction * 3.7) / route.length;
        const sampleT = t - lag;
        const point = sampleSceneMotion(plan, clamp(sampleT));
        if (sampleT < 0) {
          point.x += sampleT * route.length * route.dx;
          point.z += sampleT * route.length * route.dz;
        }
        const wave =
          Math.sin(fraction * 9 - elapsed.current * 0.009) * 0.3 * Math.sin(fraction * Math.PI);
        const radius = (0.3 * (1 - fraction) + 0.045) * grow * fade;
        dummy.position.set(
          point.x - end.x - Math.sin(yaw) * wave,
          point.y + 1.05 + Math.sin(fraction * 11 - elapsed.current * 0.007) * 0.16,
          point.z - end.z - Math.cos(yaw) * wave,
        );
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(radius * 1.2, radius, radius);
        dummy.updateMatrix();
        body.current.setMatrixAt(i, dummy.matrix);
        dummy.position.y += radius * 0.9;
        dummy.rotation.z = 0.4;
        dummy.scale.set(radius * 0.6, radius * 1.8, radius * 0.45);
        dummy.updateMatrix();
        spine.current.setMatrixAt(i, dummy.matrix);
      }
      body.current.instanceMatrix.needsUpdate = true;
      spine.current.instanceMatrix.needsUpdate = true;
    }
    if (orbit.current) {
      orbit.current.rotation.z = elapsed.current * 0.004;
      orbit.current.scale.setScalar(age < 0 ? 1.5 - t * 0.4 : 1.1 + age / 170);
      (orbit.current.material as MeshBasicMaterial).opacity = 0.6 * fade;
    }
    invalidate();
  });
  return (
    <group ref={root} position={[end.x, 0, end.z]} visible={false}>
      <group ref={head}>
        <DragonHead />
      </group>
      <instancedMesh
        key={'body' + count}
        ref={body}
        args={[undefined, undefined, count]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, light ? 8 : 14, light ? 6 : 10]} />
        <meshStandardMaterial
          emissive="#0c7562"
          emissiveIntensity={0.65}
          roughness={0.3}
          metalness={0.4}
        />
      </instancedMesh>
      <instancedMesh
        key={'spine' + count}
        ref={spine}
        args={[undefined, undefined, count]}
        frustumCulled={false}
      >
        <coneGeometry args={[1, 1, 5]} />
        <meshBasicMaterial color="#ffe29c" toneMapped={false} />
      </instancedMesh>
      <mesh ref={orbit} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]}>
        <torusGeometry args={[1, 0.025, 6, 80]} />
        <meshBasicMaterial
          color="#56ffe0"
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export default function DragonStrike(props: CaptureEffectProps) {
  return (
    <>
      <CaptureBurst {...props} />
      <EnergyDragon plan={props.plan} enabled={props.enabled} light={props.light} />
    </>
  );
}
