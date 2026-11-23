import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DuckTrack } from '../../../shared/duck-race/contracts';
import { maps, riverWidth, riverX, type Graphics } from './design';

function strip(inner: number, outer: number, y: number) {
  const points: number[] = [],
    uv: number[] = [],
    index: number[] = [];
  for (let i = 0; i <= 120; i++) {
    const z = -120 + i * 2;
    for (const x of [inner, outer]) {
      points.push(riverX(z) + x, y, z);
      uv.push((x + riverWidth / 2) / riverWidth, i / 120);
    }
    if (i < 120) {
      const k = i * 2;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
const waterVertex = `varying vec2 vUv; varying vec3 vPosition; uniform float uTime;
void main(){ vUv=uv; vec3 p=position; p.y+=sin(p.z*.65+uTime*1.1)*.045+cos(p.x*.8+uTime)*.035;
vPosition=p; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`;
const waterFragment = `uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform float uDetail;
varying vec2 vUv; varying vec3 vPosition;
void main(){vec2 p=vPosition.xz; float edge=pow(abs(vUv.x-.5)*2.,5.);
float a=sin(p.x*1.8+sin(p.y*.4+uTime)*1.5+uTime*.5); float b=cos(p.y*1.1-uTime*.9+p.x*.5);
float ripple=pow(max(0.,a*b),12.); float broad=sin(p.y*.23+uTime*.4)*cos(p.x*.3-uTime*.2);
vec3 c=mix(uDeep,uShallow,.43+edge*.5+broad*.13);
c+=vec3(.62,.92,.9)*ripple*(.12+uDetail*.18);
float foam=smoothstep(.88,.99,abs(vUv.x-.5)*2.)*(.5+.5*sin(p.y*3.-uTime*2.));
c=mix(c,vec3(.8,1.,.95),foam*.42); gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
export function Water({
  track,
  quality,
  reduced,
}: {
  track: DuckTrack;
  quality: Graphics['quality'];
  reduced: boolean;
}) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => strip(-riverWidth / 2, riverWidth / 2, 0), []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(maps[track].water) },
      uDeep: { value: new THREE.Color(maps[track].deep) },
      uDetail: { value: quality === 'HIGH' ? 1 : quality === 'MEDIUM' ? 0.6 : 0 },
    }),
    [track, quality],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.uTime.value = reduced ? 0 : clock.elapsedTime;
  });
  return (
    <mesh geometry={geometry}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={waterVertex}
        fragmentShader={waterFragment}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
type Instance = {
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
};
function Instances({
  items,
  geometry,
  color,
  glow = false,
}: {
  items: Instance[];
  geometry: THREE.BufferGeometry;
  color: string;
  glow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        emissive: glow ? color : '#000',
        emissiveIntensity: glow ? 1.1 : 0,
      }),
    [color, glow],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const mesh = ref.current;
    return () => {
      mesh?.dispose();
    };
  }, [geometry, items.length]);
  useEffect(() => {
    const dummy = new THREE.Object3D();
    items.forEach((item, i) => {
      dummy.position.set(...item.position);
      dummy.scale.set(...item.scale);
      dummy.rotation.set(...(item.rotation ?? [0, 0, 0]));
      dummy.updateMatrix();
      ref.current?.setMatrixAt(i, dummy.matrix);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [items]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}
const pebble = new THREE.IcosahedronGeometry(1, 1);
const trunk = new THREE.CylinderGeometry(0.6, 0.9, 1, 7);
const cube = new THREE.BoxGeometry(1, 1, 1);
const leaf = new THREE.SphereGeometry(1, 10, 7);
function Props({ track, low, reduced }: { track: DuckTrack; low: boolean; reduced: boolean }) {
  const accents = useMemo(() => {
    const hills: Instance[] = [],
      reeds: Instance[] = [];
    for (let i = 0; i < 12; i++)
      for (const side of [-1, 1]) {
        const z = -130 + i * 24;
        hills.push({
          position: [side * (49 + (i % 3) * 5), -4, z],
          scale: [19, 8 + (i % 4) * 2, 22],
        });
      }
    for (let i = 0; i < (low ? 80 : 180); i++) {
      const z = -113 + (i * 226) / (low ? 80 : 180),
        side = i % 2 ? 1 : -1;
      reeds.push({
        position: [riverX(z) + side * (17.8 + Math.sin(i * 2.7) * 0.5), 0.85, z],
        scale: [0.09, 0.5 + 0.3 * Math.sin(i), 0.11],
        rotation: [0, i, side * 0.2],
      });
    }
    return { hills, reeds };
  }, [low]);
  const { trees, crowns, rocks, flowers, lanterns, clouds, fences, leaves } = useMemo(() => {
    const trees: Instance[] = [],
      crowns: Instance[] = [],
      rocks: Instance[] = [],
      flowers: Instance[] = [],
      lanterns: Instance[] = [],
      clouds: Instance[] = [],
      fences: Instance[] = [],
      leaves: Instance[] = [];
    const step = low ? 12 : 8;
    for (let z = -112, i = 0; z < 115; z += step, i++)
      for (const side of [-1, 1]) {
        const x = riverX(z) + side * (22 + Math.sin(i * 8) * 2),
          h = 4 + (i % 3);
        trees.push({
          position: [x, h / 2 + 0.6, z],
          scale: [0.7, h, 0.7],
          rotation: [0, 0, side * 0.08],
        });
        if (track === 'TROPICAL')
          for (let n = 0; n < 6; n++)
            leaves.push({
              position: [
                x + Math.sin((n * Math.PI) / 3) * 1.8,
                h + 0.4,
                z + Math.cos((n * Math.PI) / 3) * 1.8,
              ],
              scale: [0.7, 0.22, 3.1],
              rotation: [0.22, (n * Math.PI) / 3, 0],
            });
        else
          for (let n = 0; n < 3; n++)
            crowns.push({
              position: [x + (n - 1) * 1.5, h + 0.5 + (n === 1 ? 1 : 0), z],
              scale: [2.4, 2.4, 2.2],
            });
        rocks.push({
          position: [riverX(z) + side * 17.2, 0.4, z + 3],
          scale: [1.1 + (i % 2), 0.7, 1.5],
          rotation: [0.2, i, 0],
        });
        for (let n = 0; n < 3; n++)
          flowers.push({ position: [x + n - 1, 1, z + 2], scale: [0.2, 0.25, 0.2] });
        if (track === 'FESTIVAL')
          lanterns.push({ position: [riverX(z) + side * 18.5, 3.2, z], scale: [0.5, 0.7, 0.5] });
        if (track === 'SUNNY' && i % 3 === 0)
          for (let n = 0; n < 3; n++) {
            fences.push({
              position: [riverX(z) + side * 19, 1.4, z + n * 1.3],
              scale: [0.2, 1.4, 0.18],
            });
            fences.push({
              position: [riverX(z) + side * 19, 1.7, z + 1.3],
              scale: [0.16, 0.18, 3.2],
            });
          }
        if (i % 4 === 0)
          for (let n = 0; n < 3; n++)
            clouds.push({ position: [side * 45 + n * 2, 25 + (i % 5), z], scale: [4, 1.8, 2.5] });
      }
    return { trees, crowns, rocks, flowers, lanterns, clouds, fences, leaves };
  }, [track, low]);
  return (
    <>
      <Instances
        items={accents.hills}
        geometry={leaf}
        color={track === 'FESTIVAL' ? '#34576f' : track === 'TROPICAL' ? '#3f9672' : '#70aa70'}
      />
      <Instances
        items={accents.reeds}
        geometry={trunk}
        color={track === 'FESTIVAL' ? '#78b8b2' : '#4b9561'}
      />
      <Instances
        items={trees}
        geometry={trunk}
        color={track === 'TROPICAL' ? '#8b8b54' : '#ae8165'}
      />
      <Instances items={crowns} geometry={pebble} color={maps[track].leaf} />
      <Instances items={leaves} geometry={leaf} color="#329d69" />
      <Instances
        items={rocks}
        geometry={pebble}
        color={track === 'FESTIVAL' ? '#747c9f' : '#a7aaa0'}
      />
      <Instances
        items={flowers}
        geometry={leaf}
        color={track === 'FESTIVAL' ? '#b8b2ff' : '#ffe5a0'}
        glow={track === 'FESTIVAL'}
      />
      <Instances items={lanterns} geometry={leaf} color="#ffaf73" glow />
      <Instances
        items={clouds}
        geometry={leaf}
        color={track === 'FESTIVAL' ? '#65789b' : '#fff8ec'}
      />
      <Instances items={fences} geometry={cube} color="#e8ce98" />
      {track === 'SUNNY' &&
        [-55, 30].map((z, i) => (
          <group key={z} position={[riverX(z) + (i ? -32 : 32), 1.4, z]}>
            <mesh castShadow position={[0, 1.5, 0]}>
              <boxGeometry args={[5, 3, 4]} />
              <meshStandardMaterial color="#ffe2ae" />
            </mesh>
            <mesh castShadow position={[0, 4, 0]} rotation={[0, Math.PI / 4, 0]}>
              <coneGeometry args={[4.3, 2.8, 4]} />
              <meshStandardMaterial color="#d27a6c" />
            </mesh>
            <mesh position={[0, 1.2, 2.01]}>
              <boxGeometry args={[1.1, 1.8, 0.04]} />
              <meshStandardMaterial color="#765352" />
            </mesh>
          </group>
        ))}
      {track === 'TROPICAL' && (
        <group position={[-31, 0, 24]}>
          <mesh castShadow position={[0, 4.5, 0]}>
            <dodecahedronGeometry args={[7, 0]} />
            <meshStandardMaterial color="#587f70" />
          </mesh>
          <mesh position={[5.1, 4.2, 0]} rotation={[0, 0, -0.12]}>
            <boxGeometry args={[0.6, 8, 3]} />
            <meshStandardMaterial
              color="#bcfff0"
              emissive="#7edac8"
              emissiveIntensity={0.2}
              transparent
              opacity={0.8}
            />
          </mesh>
          <FallingWater low={low} reduced={reduced} />
          <mesh position={[6, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1, 3.5, 40]} />
            <meshBasicMaterial color="#e5fff7" transparent opacity={0.55} />
          </mesh>
        </group>
      )}
    </>
  );
}
function FallingWater({ low, reduced }: { low: boolean; reduced: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = low ? 30 : 64;
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#e4fff8',
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const mesh = ref.current;
    return () => {
      mesh?.dispose();
    };
  }, [count]);
  useFrame(({ clock }) => {
    for (let i = 0; i < count; i++) {
      const t = ((reduced ? 0 : clock.elapsedTime) * 0.7 + i / count) % 1;
      dummy.position.set(5.3 + t * 0.9, 8 - t * 7.6, Math.sin(i * 7.9) * 1.4);
      dummy.scale.set(0.06, 0.12 + t * 0.4, 0.06);
      dummy.updateMatrix();
      ref.current?.setMatrixAt(i, dummy.matrix);
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[leaf, material, count]} dispose={null} frustumCulled={false} />
  );
}
function Banner({ finish }: { finish: boolean }) {
  const checker = useMemo(() => {
    const positions: number[] = [],
      colors: number[] = [];
    for (let i = 0; i < 34; i++) {
      const color = new THREE.Color(i % 2 ? '#243d53' : '#fff7d2');
      for (const [x, z] of [
        [i - 17, -0.35],
        [i - 16, 0.35],
        [i - 16, -0.35],
        [i - 17, -0.35],
        [i - 17, 0.35],
        [i - 16, 0.35],
      ]) {
        positions.push(x, 0.08, z);
        colors.push(color.r, color.g, color.b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }, []);
  useEffect(() => () => checker.dispose(), [checker]);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const c = canvas.getContext('2d')!;
    c.fillStyle = finish ? '#203d50' : '#fff0b8';
    c.fillRect(0, 0, 1024, 128);
    c.fillStyle = finish ? '#fff0b8' : '#203d50';
    c.font = 'bold 50px system-ui';
    c.textAlign = 'center';
    c.fillText(finish ? 'ROOMTUNE  •  FINISH' : 'READY, SET, QUACK!', 512, 82);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, [finish]);
  useEffect(() => () => texture.dispose(), [texture]);
  const z = finish ? 90 : -90;
  return (
    <group position={[riverX(z), 0, z]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 17.5, 3.4, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.32, 6.8, 12]} />
          <meshStandardMaterial color="#fff3d7" />
        </mesh>
      ))}
      <mesh position={[0, 6.6, 0]}>
        <boxGeometry args={[35.4, 1.8, 0.25]} />
        <meshStandardMaterial map={texture} />
      </mesh>
      <mesh geometry={checker}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
export function RiverWorld({ track, graphics }: { track: DuckTrack; graphics: Graphics }) {
  const ground = useMemo(
    () => [
      strip(-riverWidth / 2 - 20, -riverWidth / 2, 0.6),
      strip(riverWidth / 2, riverWidth / 2 + 20, 0.6),
    ],
    [],
  );
  useEffect(() => () => ground.forEach((g) => g.dispose()), [ground]);
  const theme = maps[track];
  return (
    <>
      <color attach="background" args={[theme.sky]} />
      <fog attach="fog" args={[theme.sky, 70, 225]} />
      <hemisphereLight args={[theme.light, theme.grass, track === 'FESTIVAL' ? 2.1 : 2.5]} />
      <directionalLight
        position={[-25, 50, -30]}
        intensity={track === 'FESTIVAL' ? 2 : 3}
        color={theme.light}
      />
      <Water track={track} quality={graphics.quality} reduced={graphics.reducedMotion} />
      {ground.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshStandardMaterial color={theme.grass} roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <Props track={track} low={graphics.quality === 'LOW'} reduced={graphics.reducedMotion} />
      <Banner finish={false} />
      <Banner finish />
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[riverX(82) + side * 26, 0.6, 82]}
          rotation={[0, side > 0 ? Math.PI : 0, 0]}
        >
          {[0, 1, 2].map((step) => (
            <mesh key={step} position={[-step * 1.4, step * 0.55, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.5, 0.45, 9]} />
              <meshStandardMaterial color={track === 'FESTIVAL' ? '#a296cf' : '#d7af7a'} />
            </mesh>
          ))}
          <mesh position={[-1.4, 4, 0]} castShadow rotation={[0, 0, -0.12]}>
            <boxGeometry args={[6, 0.25, 11]} />
            <meshStandardMaterial color={track === 'FESTIVAL' ? '#a37bcb' : '#f6bc83'} />
          </mesh>
          {[-4.7, 4.7].map((z) => (
            <mesh key={z} position={[-3, 2, z]}>
              <cylinderGeometry args={[0.12, 0.15, 4, 8]} />
              <meshStandardMaterial color="#b28667" />
            </mesh>
          ))}
        </group>
      ))}
      <group position={[riverX(110), 0, 110]}>
        <mesh position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[42, 0.4, 5]} />
          <meshStandardMaterial color={track === 'FESTIVAL' ? '#9579c9' : '#b88d65'} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 18, 0.6, 0]}>
            <boxGeometry args={[2, 1.5, 5]} />
            <meshStandardMaterial color="#a6a597" />
          </mesh>
        ))}
        <mesh position={[0, 2.5, -2.4]}>
          <boxGeometry args={[41, 0.3, 0.3]} />
          <meshStandardMaterial
            color="#f2d6ac"
            emissive={track === 'FESTIVAL' ? '#e9a4e6' : '#000'}
          />
        </mesh>
      </group>
    </>
  );
}
