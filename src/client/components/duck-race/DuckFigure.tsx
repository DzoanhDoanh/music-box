import { useMemo, useRef, useEffect, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DuckSkin } from '../../../shared/duck-race/contracts';
import { skins } from './design';

// Shared original geometry. Resources are bounded by the 12-skin catalog, not race count.
const sphere = new THREE.SphereGeometry(1, 20, 14);
const cone = new THREE.ConeGeometry(1, 1, 24);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 20);
const box = new THREE.BoxGeometry(1, 1, 1);
const visor = new THREE.MeshStandardMaterial({
  color: '#aeeeff',
  transparent: true,
  opacity: 0.2,
  roughness: 0.05,
  depthWrite: false,
});
const materials = new Map<string, THREE.MeshStandardMaterial>();
export type DuckMotion = { speed: number; mood: 'idle' | 'swim' | 'victory' | 'defeat' };
function mat(color: string, glow = false) {
  const key = color + glow;
  if (!materials.has(key))
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.38,
        metalness: 0.04,
        emissive: glow ? color : '#000',
        emissiveIntensity: glow ? 0.7 : 0,
      }),
    );
  return materials.get(key)!;
}
function Part({
  color,
  position,
  scale,
  shape = 'round',
  rotation,
  glow = false,
}: {
  color: string;
  position: [number, number, number];
  scale: [number, number, number];
  shape?: 'round' | 'cone' | 'cylinder' | 'box';
  rotation?: [number, number, number];
  glow?: boolean;
}) {
  return (
    <mesh
      dispose={null}
      castShadow
      geometry={
        shape === 'round' ? sphere : shape === 'cone' ? cone : shape === 'box' ? box : cylinder
      }
      material={mat(color, glow)}
      position={position}
      scale={scale}
      rotation={rotation}
    />
  );
}
export function DuckFigure({
  skin,
  phase = 0,
  swimming = true,
  celebrate = false,
  reduced = false,
  motion,
}: {
  skin: DuckSkin;
  phase?: number;
  swimming?: boolean;
  celebrate?: boolean;
  reduced?: boolean;
  motion?: MutableRefObject<DuckMotion>;
}) {
  const rig = useRef<THREE.Group>(null),
    head = useRef<THREE.Group>(null),
    wings = useRef<THREE.Group>(null),
    eyes = useRef<THREE.Group>(null);
  const { color, accent } = skins[skin];
  const blend = useRef({ speed: 0, victory: 0, defeat: 0 });
  const swimPhase = useRef(phase);
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime + phase;
    const mood = motion?.current.mood;
    const easing = 1 - Math.exp(-delta * 6);
    blend.current.speed = THREE.MathUtils.lerp(
      blend.current.speed,
      motion?.current.speed ?? (swimming ? 1 : 0),
      easing,
    );
    blend.current.victory = THREE.MathUtils.lerp(
      blend.current.victory,
      Number(celebrate || mood === 'victory'),
      easing,
    );
    blend.current.defeat = THREE.MathUtils.lerp(
      blend.current.defeat,
      Number(mood === 'defeat'),
      easing,
    );
    const { speed, victory, defeat } = blend.current;
    // Integrate the stroke: multiplying total time by a changing speed makes the
    // animation jump backwards whenever a duck slows down.
    swimPhase.current =
      (swimPhase.current + Math.min(delta, 0.1) * (2 + speed * 3 + victory * 5)) % (Math.PI * 2);
    const cycle = swimPhase.current;
    if (rig.current) {
      rig.current.position.y = reduced
        ? 0
        : Math.sin(cycle) * (0.025 + speed * 0.025 + victory * 0.15);
      rig.current.rotation.z = reduced
        ? 0
        : Math.sin(t * 2.5) * (0.02 + speed * 0.015 + victory * 0.08);
      rig.current.rotation.x = reduced ? 0 : -Math.min(speed, 2) * 0.045 + defeat * 0.12;
    }
    if (head.current) {
      head.current.rotation.y = reduced ? 0 : Math.sin(t * 1.4) * (0.1 + defeat * 0.1);
      head.current.rotation.x = reduced ? 0 : defeat * 0.3 - victory * 0.12;
    }
    if (wings.current)
      wings.current.rotation.x = reduced
        ? 0
        : Math.sin(cycle * 2) * (0.02 + speed * 0.055 + victory * 0.3);
    if (eyes.current)
      eyes.current.scale.y = reduced ? 1 : Math.sin(t * 0.7) > 0.996 ? 0.12 : 1 - defeat * 0.22;
  }, -2);
  return (
    <group ref={rig}>
      <Part color={color} position={[0, 0.6, -0.08]} scale={[0.68, 0.52, 0.87]} />
      <Part
        color={color}
        position={[0, 0.88, -0.8]}
        scale={[0.3, 0.18, 0.42]}
        rotation={[-0.4, 0, 0]}
      />
      <Part
        color={skin === 'ROBOT' ? '#51869a' : '#fff1cc'}
        position={[0, 0.45, 0.35]}
        scale={[0.53, 0.32, 0.46]}
      />
      <group ref={wings} position={[0, 0.68, 0]}>
        {[-1, 1].map((side) => (
          <Part
            key={side}
            color={accent}
            position={[side * 0.62, 0, -0.12]}
            scale={[0.16, 0.3, 0.48]}
            rotation={[0, side * 0.13, side * -0.18]}
          />
        ))}
      </group>
      <group ref={head} position={[0, 1.23, 0.42]}>
        <Part color={color} position={[0, 0, 0]} scale={[0.51, 0.51, 0.48]} />
        <Part color="#ff9e38" position={[0, -0.13, 0.45]} scale={[0.34, 0.12, 0.31]} />
        <Part color="#e17b34" position={[0, -0.17, 0.49]} scale={[0.29, 0.035, 0.28]} />
        <group ref={eyes} position={[0, 0.1, 0]}>
          {[-1, 1].map((side) => (
            <group key={side}>
              <Part color="#fffef3" position={[side * 0.28, 0, 0.37]} scale={[0.145, 0.16, 0.1]} />
              <Part
                color={skin === 'ROBOT' ? '#3affdf' : '#172d42'}
                position={[side * 0.28, 0, 0.46]}
                scale={[0.078, 0.1, 0.045]}
                glow={skin === 'ROBOT'}
              />
              <Part
                color="#fff"
                position={[side * 0.28 - 0.024, 0.035, 0.5]}
                scale={[0.025, 0.03, 0.018]}
              />
            </group>
          ))}
        </group>
        {skin === 'NINJA' && (
          <>
            <Part color="#202c40" position={[0, 0.22, -0.02]} scale={[0.52, 0.1, 0.46]} />
            <Part
              color="#ff687e"
              position={[0.51, 0.17, -0.22]}
              scale={[0.3, 0.055, 0.16]}
              rotation={[0, 0.6, 0.25]}
            />
            <Part
              color="#ff687e"
              position={[0, 0.25, 0.43]}
              scale={[0.13, 0.09, 0.02]}
              shape="box"
            />
          </>
        )}
        {skin === 'PIRATE' && (
          <>
            <Part color="#273248" position={[0, 0.43, 0]} scale={[0.7, 0.16, 0.37]} />
            <Part color="#273248" position={[0, 0.58, 0]} scale={[0.46, 0.3, 0.25]} />
            <Part color="#fff" position={[0, 0.58, 0.25]} scale={[0.11, 0.12, 0.025]} />
            <Part color="#222536" position={[0.28, 0.11, 0.46]} scale={[0.16, 0.16, 0.04]} />
          </>
        )}
        {skin === 'KING' && (
          <>
            <Part
              shape="cylinder"
              color="#f2bd39"
              position={[0, 0.48, 0]}
              scale={[0.43, 0.16, 0.4]}
            />
            {Array.from({ length: 5 }, (_, i) => (
              <Part
                key={i}
                shape="cone"
                color="#ffe488"
                position={[Math.sin(i * 1.256) * 0.34, 0.67, Math.cos(i * 1.256) * 0.34]}
                scale={[0.1, 0.35, 0.1]}
              />
            ))}
            <Part color="#e4558e" position={[0, 0.5, 0.4]} scale={[0.08, 0.08, 0.03]} />
          </>
        )}
        {skin === 'ASTRONAUT' && (
          <>
            <mesh geometry={sphere} material={visor} dispose={null} scale={[0.64, 0.65, 0.63]} />
            <Part
              color="#6b96b5"
              position={[0, -0.43, 0]}
              scale={[0.51, 0.1, 0.48]}
              shape="cylinder"
            />
          </>
        )}
        {skin === 'COWBOY' && (
          <>
            <Part
              shape="cylinder"
              color="#9e6245"
              position={[0, 0.39, 0]}
              scale={[0.78, 0.08, 0.65]}
            />
            <Part color="#c9925d" position={[0, 0.57, 0]} scale={[0.44, 0.32, 0.37]} />
            <Part color="#623e3c" position={[0, 0.46, 0]} scale={[0.46, 0.055, 0.39]} />
          </>
        )}
        {skin === 'CONICAL' && (
          <>
            <Part shape="cone" color="#ead28d" position={[0, 0.62, 0]} scale={[0.85, 0.5, 0.85]} />
            <Part shape="cone" color="#fff2b2" position={[0, 0.66, 0]} scale={[0.76, 0.43, 0.76]} />
          </>
        )}
        {skin === 'PARTY' && (
          <>
            <Part shape="cone" color="#9073ed" position={[0, 0.73, 0]} scale={[0.38, 0.83, 0.38]} />
            <Part color="#ffeb9e" position={[0, 1.15, 0]} scale={[0.11, 0.11, 0.11]} />
            {[-0.2, 0.2].map((x) => (
              <Part
                key={x}
                color="#7ffff0"
                position={[x, 0.52, 0.28]}
                scale={[0.055, 0.055, 0.025]}
              />
            ))}
          </>
        )}
        {skin === 'ROBOT' && (
          <>
            <Part
              shape="cylinder"
              color="#50889a"
              position={[0, 0.66, 0]}
              scale={[0.035, 0.4, 0.035]}
            />
            <Part color="#ff8daa" glow position={[0, 0.89, 0]} scale={[0.11, 0.11, 0.11]} />
            {[-1, 1].map((s) => (
              <Part
                key={s}
                shape="box"
                color="#77b0bd"
                position={[s * 0.51, 0, 0]}
                scale={[0.12, 0.24, 0.25]}
              />
            ))}
          </>
        )}
        {skin === 'RAINBOW' &&
          ['#ff779e', '#ffd96b', '#87e7c2', '#83c6ff'].map((c, i) => (
            <Part
              key={c}
              color={c}
              position={[(i - 1.5) * 0.15, 0.49 + Math.sin(i) * 0.07, -0.03]}
              scale={[0.11, 0.22, 0.16]}
            />
          ))}
      </group>
      {skin === 'KING' && (
        <Part color="#a679e5" position={[0, 0.7, -0.6]} scale={[0.67, 0.4, 0.38]} />
      )}
      {skin === 'ASTRONAUT' && (
        <Part shape="box" color="#8fb5da" position={[0, 0.92, -0.65]} scale={[0.65, 0.63, 0.35]} />
      )}
      {skin === 'RAINBOW' &&
        ['#ff779e', '#ffd96b', '#83eac7'].map((c, i) => (
          <Part
            key={c}
            color={c}
            position={[0, 0.73 + i * 0.1, -0.65 - i * 0.05]}
            scale={[0.54 - i * 0.1, 0.09, 0.18]}
          />
        ))}
    </group>
  );
}
export function DuckName({
  name,
  mine,
  position = [0, 2.6, 0],
}: {
  name: string;
  mine: boolean;
  position?: [number, number, number];
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = mine ? '#fff3b0' : '#16394be6';
    ctx.beginPath();
    ctx.roundRect(0, 4, 512, 80, 34);
    ctx.fill();
    ctx.fillStyle = mine ? '#173044' : '#fff';
    ctx.font = '600 30px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.length > 22 ? name.slice(0, 21) + '…' : name, 256, 44);
    const image = new THREE.CanvasTexture(canvas);
    image.colorSpace = THREE.SRGBColorSpace;
    return image;
  }, [name, mine]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[3.2, 0.6, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}
