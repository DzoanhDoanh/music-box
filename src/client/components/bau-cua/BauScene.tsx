import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  Quaternion,
  Euler,
  SRGBColorSpace,
} from 'three';
import { symbols, type Phase } from '../../../shared/bau-cua/contracts';
import { symbolArtwork } from './artwork';

const rotations: [number, number, number][] = [
  [0, 0, Math.PI / 2],
  [0, 0, -Math.PI / 2],
  [0, 0, 0],
  [Math.PI, 0, 0],
  [-Math.PI / 2, 0, 0],
  [Math.PI / 2, 0, 0],
];
function Die({
  face,
  index,
  shaking,
  reduced,
}: {
  face: number;
  index: number;
  shaking: boolean;
  reduced: boolean;
}) {
  const mesh = useRef<Mesh>(null);
  const textures = useMemo(
    () =>
      symbols.map((s, i) => {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const c = canvas.getContext('2d')!;
        c.fillStyle = '#fff6e6';
        c.fillRect(0, 0, 256, 256);
        c.strokeStyle = ['#7a9b44', '#b83e4e', '#d36c45', '#397f9b', '#bf852c', '#8862a3'][i];
        c.lineWidth = 10;
        c.strokeRect(12, 12, 232, 232);
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        const picture = new Image();
        picture.onload = () => {
          c.drawImage(picture, 42, 36, 172, 182);
          texture.needsUpdate = true;
        };
        picture.src = symbolArtwork[s];
        return texture;
      }),
    [],
  );
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
  const target = useMemo(
    () => new Quaternion().setFromEuler(new Euler(...(rotations[face] ?? rotations[0]))),
    [face],
  );
  useFrame((state, delta) => {
    if (!mesh.current) return;
    if (shaking && !reduced) {
      mesh.current.rotation.x += delta * (7 + index);
      mesh.current.rotation.z += delta * (5 + index);
      mesh.current.position.y =
        0.6 + Math.abs(Math.sin(state.clock.elapsedTime * 10 + index)) * 0.2;
    } else {
      mesh.current.quaternion.slerp(target, reduced ? 1 : 1 - Math.exp(-delta * 9));
      mesh.current.position.y = 0.55;
    }
  });
  return (
    <mesh ref={mesh} position={[(index - 1) * 1.22, 0.55, index === 1 ? -0.6 : 0.25]} castShadow>
      <boxGeometry args={[0.9, 0.9, 0.9]} />
      {textures.map((map, i) => (
        <meshStandardMaterial
          key={i}
          attach={`material-${i}`}
          map={map}
          roughness={0.32}
          metalness={0.05}
        />
      ))}
    </mesh>
  );
}
function Bowl({
  covered,
  shaking,
  reduced,
}: {
  covered: boolean;
  shaking: boolean;
  reduced: boolean;
}) {
  const group = useRef<Group>(null);
  useFrame((state, delta) => {
    if (!group.current) return;
    const target = covered ? 0 : 3.7;
    group.current.position.y +=
      (target - group.current.position.y) * (reduced ? 1 : 1 - Math.exp(-delta * 4));
    group.current.rotation.z =
      shaking && !reduced ? Math.sin(state.clock.elapsedTime * 22) * 0.08 : 0;
    group.current.position.x =
      shaking && !reduced ? Math.sin(state.clock.elapsedTime * 17) * 0.1 : 0;
    group.current.visible = group.current.position.y < 3.65;
  });
  return (
    <group ref={group}>
      <mesh castShadow position={[0, 0.12, 0]} scale={[1, 0.72, 1]}>
        <sphereGeometry args={[2.35, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#ece8dc" roughness={0.24} metalness={0.12} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 0.14, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.35, 0.07, 12, 64]} />
        <meshStandardMaterial color="#c39c54" metalness={0.7} roughness={0.22} />
      </mesh>
      <mesh position={[0, 1.82, 0]}>
        <sphereGeometry args={[0.22, 20, 16]} />
        <meshStandardMaterial color="#b28a45" metalness={0.7} roughness={0.25} />
      </mesh>
    </group>
  );
}
export default function BauScene({
  dice,
  phase,
  reduced,
}: {
  dice: number[] | null;
  phase: Phase;
  reduced: boolean;
}) {
  const shown = !!dice && ['REVEALING', 'RESULT', 'CANCELLED'].includes(phase);
  return (
    <Canvas
      shadows={!reduced}
      dpr={[1, 1.5]}
      camera={{ position: [0, 5.5, 7], fov: 38 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      onCreated={({ gl }) => {
        gl.setClearColor(new Color('#000000'), 0);
      }}
      fallback={<div className="bau-scene-fallback">Kết quả hiển thị ở ngay bên dưới.</div>}
    >
      <ambientLight intensity={1.8} />
      <directionalLight position={[3, 7, 4]} intensity={3} castShadow shadow-mapSize={[512, 512]} />
      <pointLight position={[-4, 3, -2]} intensity={12} color="#c2b2ff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2.8, 64]} />
        <meshStandardMaterial color="#196b59" roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[2.9, 2.9, 0.1, 64]} />
        <meshStandardMaterial color="#bb9658" metalness={0.45} roughness={0.35} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <Die
          key={i}
          index={i}
          face={dice?.[i] ?? i}
          shaking={phase === 'SHAKING'}
          reduced={reduced}
        />
      ))}
      <Bowl covered={!shown} shaking={phase === 'SHAKING'} reduced={reduced} />
    </Canvas>
  );
}
