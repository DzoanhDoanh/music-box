import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  Sprite,
} from 'three';
import { advanceSceneTime, sampleSceneMotion, type ScenePlan } from './scene-motion';

const lifetime = 1450;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const burstColors = ['#fff8d0', '#ffcf68', '#fff2b3'];

export type CaptureEffectProps = {
  plan: ScenePlan;
  color: string;
  enabled: boolean;
  light: boolean;
  overlay: RefObject<HTMLDivElement | null>;
  onComplete?: () => void;
  showApproach?: boolean;
};

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.12, '#ffffffdd');
  glow.addColorStop(0.4, '#ffffff44');
  glow.addColorStop(1, '#ffffff00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

/** Local visual renderer. Gameplay mounts only for a validated event; the effect lab
 * supplies isolated demo plans. Never sends commands. Disabling consumes the event. */
export default function CaptureBurst({
  plan,
  color,
  enabled,
  light,
  overlay,
  onComplete,
  showApproach = true,
}: CaptureEffectProps) {
  const root = useRef<Group>(null),
    waves = useRef<Group>(null),
    shards = useRef<InstancedMesh>(null),
    streaks = useRef<InstancedMesh>(null),
    trail = useRef<InstancedMesh>(null),
    charge = useRef<Mesh>(null),
    glow = useRef<Sprite>(null),
    flash = useRef<PointLight>(null);
  const elapsed = useRef(Infinity),
    consumed = useRef(false);
  const invalidate = useThree((s) => s.invalidate);
  const dummy = useMemo(() => new Object3D(), []);
  const texture = useMemo(glowTexture, []);
  const count = light ? 24 : 72;
  const end = plan.points[plan.points.length - 1];
  useLayoutEffect(() => () => texture.dispose(), [texture]);
  useLayoutEffect(() => {
    const tint = new Color();
    for (let i = 0; i < count; i++) {
      shards.current?.setColorAt(i, tint.set(i % 3 ? burstColors[i % 3] : color));
    }
    if (shards.current?.instanceColor) shards.current.instanceColor.needsUpdate = true;
  }, [color, count]);
  useLayoutEffect(() => {
    const element = overlay.current;
    if (!consumed.current) {
      consumed.current = true;
      elapsed.current = enabled ? -1 : Infinity;
    } else if (!enabled) elapsed.current = Infinity;
    if (root.current) root.current.visible = Number.isFinite(elapsed.current);
    if (element) {
      element.hidden = true;
      element.dataset.phase = Number.isFinite(elapsed.current) ? 'charging' : 'done';
    }
    invalidate();
    return () => {
      if (element) element.hidden = true;
    };
  }, [enabled, invalidate, overlay]);
  useFrame((_, delta) => {
    if (!enabled || !root.current || !Number.isFinite(elapsed.current)) return;
    elapsed.current = advanceSceneTime(elapsed.current, delta);
    const age = elapsed.current - plan.duration;
    const t = clamp(age / lifetime);
    const element = overlay.current;
    if (age >= lifetime) {
      root.current.visible = false;
      if (element) {
        element.hidden = true;
        element.dataset.phase = 'done';
      }
      elapsed.current = Infinity;
      invalidate();
      onComplete?.();
      return;
    }
    if (element && age >= 0 && element.dataset.phase === 'charging') {
      element.hidden = false;
      element.dataset.phase = 'impact';
    }
    // Keep the callout on the same presentation clock as WebGL, including slow frames.
    if (element && age >= 0) element.style.setProperty('--impact-age', age + 'ms');
    if (charge.current) {
      const charging = age < 0;
      charge.current.visible = showApproach && charging;
      const origin = sampleSceneMotion(plan, clamp(elapsed.current / plan.duration));
      charge.current.position.set(origin.x - end.x, origin.y - 0.2, origin.z - end.z);
      charge.current.scale.setScalar(1.8 - clamp(elapsed.current / plan.duration));
      charge.current.rotation.z = elapsed.current * 0.006;
      (charge.current.material as MeshBasicMaterial).opacity = charging
        ? 0.3 + clamp(elapsed.current / plan.duration) * 0.5
        : 0;
    }
    if (trail.current) {
      trail.current.visible = showApproach && age < 0;
      for (let i = 0; i < 10; i++) {
        const progress = clamp(elapsed.current / plan.duration - i * 0.025);
        const p = sampleSceneMotion(plan, progress);
        dummy.position.set(p.x - end.x, p.y + 0.5, p.z - end.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar((1 - i / 10) * 0.18);
        dummy.updateMatrix();
        trail.current.setMatrixAt(i, dummy.matrix);
      }
      trail.current.instanceMatrix.needsUpdate = true;
    }
    if (glow.current) {
      glow.current.visible = age >= 0;
      glow.current.scale.setScalar(2 + Math.sin(t * Math.PI) * 7);
      glow.current.material.opacity = Math.max(0, 1 - t * 2.8) * 0.85;
    }
    if (flash.current)
      flash.current.intensity = age >= 0 ? Math.max(0, 1 - t * 4) * (light ? 8 : 22) : 0;
    waves.current?.children.forEach((child, i) => {
      const local = (age - i * 100) / 1050;
      child.visible = local >= 0 && local < 1;
      child.scale.setScalar(0.4 + Math.pow(clamp(local), 0.65) * (i === 1 ? 4.3 : 3.6));
      (child as Mesh).rotation.z = t * (i % 2 ? -2 : 2);
      ((child as Mesh).material as MeshBasicMaterial).opacity = (1 - clamp(local)) ** 2 * 0.95;
    });
    if (shards.current) {
      shards.current.visible = age >= 0;
      for (let i = 0; i < count; i++) {
        const theta = i * 2.399963,
          speed = 1.6 + (i % 9) * 0.42;
        const travel = 1 - (1 - t) ** 2;
        dummy.position.set(
          Math.cos(theta) * speed * travel,
          0.4 + Math.sin(t * Math.PI) * (1 + (i % 7) * 0.5),
          Math.sin(theta) * speed * travel,
        );
        dummy.rotation.set(i + t * 8, theta + t * 5, t * 9);
        const scale = (0.08 + (i % 4) * 0.035) * (1 - t) ** 0.65;
        dummy.scale.set(scale, scale * (i % 3 ? 2.4 : 1), scale);
        dummy.updateMatrix();
        shards.current.setMatrixAt(i, dummy.matrix);
      }
      shards.current.instanceMatrix.needsUpdate = true;
    }
    if (streaks.current) {
      streaks.current.visible = age >= 0 && t < 0.65;
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const radius = 0.4 + Math.sqrt(t) * 4;
        dummy.position.set(
          Math.cos(angle) * radius,
          0.3 + (i % 3) * 0.12,
          Math.sin(angle) * radius,
        );
        dummy.rotation.set(Math.PI / 2, 0, angle - Math.PI / 2);
        dummy.scale.set(0.04 * (1 - t), (0.4 + Math.sin(t * Math.PI) * 1.2) * (1 - t), 0.04);
        dummy.updateMatrix();
        streaks.current.setMatrixAt(i, dummy.matrix);
      }
      streaks.current.instanceMatrix.needsUpdate = true;
    }
    invalidate();
  });
  return (
    <group ref={root} position={[end.x, 0.22, end.z]} visible={false}>
      <mesh ref={charge} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.64, 0.71, 64, 1, 0, Math.PI * 1.75]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <group ref={waves}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            rotation={[-Math.PI / 2 + i * 0.12, 0, 0]}
            position={[0, 0.08 + i * 0.16, 0]}
            visible={false}
          >
            <ringGeometry args={[i === 1 ? 0.91 : 0.95, 1, 80]} />
            <meshBasicMaterial
              color={i === 1 ? color : '#ffe8a3'}
              transparent
              opacity={0}
              side={DoubleSide}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      <sprite ref={glow} position={[0, 0.85, 0]} visible={false}>
        <spriteMaterial
          map={texture}
          color="#fff1b5"
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      <pointLight
        ref={flash}
        position={[0, 2.5, 0]}
        color="#ffdd99"
        intensity={0}
        distance={10}
        decay={2}
      />
      <instancedMesh
        key={count}
        ref={shards}
        args={[undefined, undefined, count]}
        frustumCulled={false}
        visible={false}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={streaks}
        args={[undefined, undefined, 16]}
        frustumCulled={false}
        visible={false}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          color="#ffeaa1"
          toneMapped={false}
          transparent
          opacity={0.85}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={trail}
        args={[undefined, undefined, 10]}
        frustumCulled={false}
        visible={false}
      >
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial
          color={color}
          toneMapped={false}
          transparent
          opacity={0.6}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}
