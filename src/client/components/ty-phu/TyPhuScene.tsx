import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Euler,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type MeshStandardMaterialParameters,
  type Texture,
} from 'three';
import { board, HOTEL } from '../../../shared/ty-phu/board';
import { cards } from '../../../shared/ty-phu/cards';
import type { TyPhuPublicState } from '../../../shared/ty-phu/contracts';
import { centre, drawBoard, drawWood } from './board-art';
import { playerColors, tilePosition } from './tile-layout';

/** World size of the 9.6-unit grid. */
const S = 10;
const U = S / 9.6;
const TOP = 0.32;
const corners = [0, 8, 16, 24];

const lookup = new Map(board.map((t) => [tilePosition(t.index).join(','), t.index]));
const gridLine = (units: number) =>
  units < 1.3 ? 1 : units >= 8.3 ? 9 : 2 + Math.floor(units - 1.3);
function tileAt(u: number, v: number) {
  return lookup.get(`${gridLine((1 - v) * 9.6)},${gridLine(u * 9.6)}`) ?? null;
}
function tileCentre(i: number): [number, number] {
  const [row, col] = tilePosition(i);
  return [(centre(col) - 0.5) * S, (centre(row) - 0.5) * S];
}
/** Unit vector from a tile towards the board centre, and the direction along its edge. */
function axes(i: number) {
  const [row, col] = tilePosition(i);
  const inward: [number, number] = [
    col === 1 ? 1 : col === 9 ? -1 : 0,
    row === 1 ? 1 : row === 9 ? -1 : 0,
  ];
  const along: [number, number] = inward[0] === 0 ? [1, 0] : [0, 1];
  return { inward, along };
}

function useCanvasTexture(make: () => HTMLCanvasElement, repeat = 1) {
  const texture = useMemo(() => {
    const t = new CanvasTexture(make());
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat !== 1) {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.repeat.set(repeat, repeat);
    }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

// ---------------------------------------------------------------- table & board

function Table() {
  const wood = useCanvasTexture(() => drawWood(1024, 'table'), 3);
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[70, 70]} />
      <meshStandardMaterial map={wood} roughness={0.75} />
    </mesh>
  );
}

function Board({
  onTile,
  onHover,
}: {
  onTile: (index: number) => void;
  onHover: (index: number | null) => void;
}) {
  const art = useCanvasTexture(() => drawBoard(2048));
  const frame = useCanvasTexture(() => drawWood(512, 'frame'));
  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.uv ? tileAt(e.uv.x, e.uv.y) : null);
  const rim = S / 2 + 0.22;
  const posts = [-1, -0.5, 0, 0.5, 1];
  return (
    <group>
      <mesh position={[0, TOP / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[S + 0.62, TOP, S + 0.62]} />
        <meshStandardMaterial map={frame} roughness={0.6} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, TOP + 0.002, 0]}
        receiveShadow
        onPointerMove={(e) => {
          e.stopPropagation();
          onHover(pick(e));
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          const index = pick(e);
          if (index !== null) onTile(index);
        }}
      >
        <planeGeometry args={[S, S]} />
        <meshStandardMaterial map={art} roughness={0.85} />
      </mesh>
      {/* Raised wooden fence with posts, like a printed board in its tray. */}
      {[0, 1, 2, 3].map((side) => {
        const horizontal = side % 2 === 0;
        const sign = side < 2 ? 1 : -1;
        return (
          <group key={side}>
            <mesh
              position={horizontal ? [0, TOP + 0.07, sign * rim] : [sign * rim, TOP + 0.07, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={horizontal ? [S + 0.62, 0.14, 0.16] : [0.16, 0.14, S + 0.62]} />
              <meshStandardMaterial map={frame} roughness={0.55} />
            </mesh>
            {posts.map((p) => (
              <mesh
                key={p}
                position={
                  horizontal
                    ? [p * (S / 2 + 0.2), TOP + 0.16, sign * rim]
                    : [sign * rim, TOP + 0.16, p * (S / 2 + 0.2)]
                }
                castShadow
              >
                <boxGeometry args={[0.26, 0.32, 0.26]} />
                <meshStandardMaterial color="#4a2c14" roughness={0.5} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------- pieces

const houseMaterial = new Map<string, MeshStandardMaterial>();
function material(color: string, extra: MeshStandardMaterialParameters = {}) {
  const key = color + JSON.stringify(extra);
  let m = houseMaterial.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: 0.45, ...extra });
    houseMaterial.set(key, m);
  }
  return m;
}

function House({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.1, 0]} castShadow material={material(color)}>
        <boxGeometry args={[0.22, 0.2, 0.22]} />
      </mesh>
      <mesh
        position={[0, 0.27, 0]}
        rotation-y={Math.PI / 4}
        castShadow
        material={material('#7a2e1e')}
      >
        <coneGeometry args={[0.2, 0.15, 4]} />
      </mesh>
      <mesh position={[0, 0.07, 0.111]} material={material('#3b2a1a')}>
        <planeGeometry args={[0.06, 0.1]} />
      </mesh>
    </group>
  );
}
function useWindowTexture() {
  return useCanvasTexture(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#222';
    c.fillRect(0, 0, 64, 128);
    for (let y = 8; y < 120; y += 18)
      for (let x = 8; x < 60; x += 18) {
        c.fillStyle = Math.random() < 0.8 ? '#ffe7a3' : '#555';
        c.fillRect(x, y, 10, 11);
      }
    return canvas;
  });
}
function Hotel({ color, windows }: { color: string; windows: Texture }) {
  return (
    <group>
      <mesh position={[0, 0.26, 0]} castShadow material={material(color)}>
        <boxGeometry args={[0.34, 0.52, 0.3]} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh key={side} position={[0, 0.27, side * 0.151]} rotation-y={side < 0 ? Math.PI : 0}>
          <planeGeometry args={[0.28, 0.44]} />
          <meshStandardMaterial
            map={windows}
            emissive="#ffcf6b"
            emissiveMap={windows}
            emissiveIntensity={0.6}
            transparent
            opacity={0.92}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.55, 0]} castShadow material={material('#f6c453', { metalness: 0.4 })}>
        <boxGeometry args={[0.4, 0.06, 0.36]} />
      </mesh>
      <mesh position={[0, 0.64, 0]} material={material('#f6c453', { metalness: 0.4 })}>
        <coneGeometry args={[0.06, 0.14, 6]} />
      </mesh>
    </group>
  );
}
function Flag({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.2, 0]} castShadow material={material('#5f5e5a')}>
        <cylinderGeometry args={[0.012, 0.012, 0.4, 6]} />
      </mesh>
      <mesh position={[0.08, 0.33, 0]} castShadow>
        <boxGeometry args={[0.16, 0.1, 0.01]} />
        <meshStandardMaterial color={color} side={DoubleSide} />
      </mesh>
    </group>
  );
}
function Umbrella({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.18, 0]} castShadow material={material('#e9e2d0')}>
        <cylinderGeometry args={[0.012, 0.012, 0.36, 6]} />
      </mesh>
      <mesh position={[0, 0.36, 0]} castShadow material={material(color)}>
        <coneGeometry args={[0.24, 0.12, 8, 1, true]} />
      </mesh>
      <mesh
        position={[0.18, 0.03, 0.05]}
        rotation-y={0.4}
        castShadow
        material={material('#f4ead2')}
      >
        <boxGeometry args={[0.12, 0.03, 0.26]} />
      </mesh>
    </group>
  );
}

function Property({
  index,
  level,
  color,
  windows,
}: {
  index: number;
  level: number;
  color: string;
  windows: Texture;
}) {
  const [x, z] = tileCentre(index);
  const { inward, along } = axes(index);
  // Buildings stand on the colour band at the inner edge; the owner's plaque lies under them.
  const depth = 1.3 * U;
  const bx = x + inward[0] * (depth / 2 - 0.2),
    bz = z + inward[1] * (depth / 2 - 0.2);
  const facing = Math.atan2(-inward[0], -inward[1]);
  const beach = board[index].kind === 'BEACH';
  const items =
    beach || level === 0 || level === HOTEL
      ? [0]
      : Array.from({ length: level }, (_, i) => i - (level - 1) / 2);
  return (
    <group>
      <mesh position={[bx, TOP + 0.012, bz]} rotation-y={facing} receiveShadow>
        <boxGeometry args={[U * 0.9, 0.02, 0.34]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {items.map((offset, i) => (
        <group
          key={i}
          position={[bx + along[0] * offset * 0.29, TOP + 0.02, bz + along[1] * offset * 0.29]}
          rotation-y={facing}
        >
          {beach ? (
            <Umbrella color={color} />
          ) : level === HOTEL ? (
            <Hotel color={color} windows={windows} />
          ) : level === 0 ? (
            <Flag color={color} />
          ) : (
            <House color={color} />
          )}
        </group>
      ))}
    </group>
  );
}

const pawnProfile = [
  [0, 0],
  [0.2, 0],
  [0.21, 0.035],
  [0.15, 0.07],
  [0.1, 0.16],
  [0.075, 0.3],
  [0.13, 0.33],
  [0.13, 0.355],
  [0.06, 0.37],
].map(([x, y]) => new Vector2(x, y));
const pawnGeometry = new LatheGeometry(pawnProfile, 28);

function Pawn({
  color,
  x,
  z,
  active,
  reduced,
}: {
  color: string;
  x: number;
  z: number;
  active: boolean;
  reduced: boolean;
}) {
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const from = useRef(new Vector3(x, TOP, z));
  const to = useRef(new Vector3(x, TOP, z));
  const t = useRef(1);
  useEffect(() => {
    if (!group.current) return;
    from.current.copy(group.current.position);
    to.current.set(x, TOP, z);
    t.current = reduced ? 1 : 0;
  }, [x, z, reduced]);
  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    t.current = Math.min(1, t.current + delta / 0.2);
    g.position.lerpVectors(from.current, to.current, t.current);
    g.position.y = TOP + Math.sin(Math.PI * t.current) * 0.4;
    if (active && t.current === 1 && !reduced)
      g.position.y += Math.abs(Math.sin(state.clock.elapsedTime * 3)) * 0.06;
    if (ring.current) {
      ring.current.visible = active;
      ring.current.position.set(g.position.x, TOP + 0.01, g.position.z);
      ring.current.rotation.z += delta;
    }
  });
  const body = useMemo(
    () => new MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.15 }),
    [color],
  );
  return (
    <>
      <group ref={group} position={[x, TOP, z]}>
        <mesh geometry={pawnGeometry} material={body} castShadow />
        <mesh position={[0, 0.46, 0]} material={body} castShadow>
          <sphereGeometry args={[0.1, 24, 16]} />
        </mesh>
      </group>
      <mesh ref={ring} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.24, 0.3, 32]} />
        <meshBasicMaterial color="#ffd27a" transparent opacity={0.85} blending={AdditiveBlending} />
      </mesh>
    </>
  );
}

// ---------------------------------------------------------------- dice & cards

const faceUp: [number, number, number][] = [
  [0, 0, 0], // 1 on +y
  [0, 0, Math.PI / 2], // 2 on +x
  [-Math.PI / 2, 0, 0], // 3 on +z
  [Math.PI / 2, 0, 0], // 4 on -z
  [0, 0, -Math.PI / 2], // 5 on -x
  [Math.PI, 0, 0], // 6 on -y
];
const pipCells: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
function useDieTextures() {
  const textures = useMemo(
    () =>
      [2, 5, 1, 6, 3, 4].map((face) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const c = canvas.getContext('2d')!;
        c.fillStyle = '#fbf7ef';
        c.fillRect(0, 0, 128, 128);
        for (const cell of pipCells[face]) {
          const x = 30 + (cell % 3) * 34,
            y = 30 + Math.floor(cell / 3) * 34;
          c.fillStyle = face === 1 ? '#c0281f' : '#1d1d1d';
          c.beginPath();
          c.arc(x, y, face === 1 ? 15 : 11, 0, Math.PI * 2);
          c.fill();
        }
        const t = new CanvasTexture(canvas);
        t.colorSpace = SRGBColorSpace;
        return t;
      }),
    [],
  );
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
  return textures;
}
function Die({
  value,
  roll,
  index,
  textures,
  reduced,
}: {
  value: number | null;
  roll: string;
  index: number;
  textures: Texture[];
  reduced: boolean;
}) {
  const mesh = useRef<Mesh>(null);
  const tumble = useRef(0);
  const yaw = useRef(index * 0.7);
  useEffect(() => {
    if (!roll) return;
    tumble.current = reduced ? 0 : 0.75;
    yaw.current = Math.random() * Math.PI * 2;
  }, [roll, reduced]);
  const target = useMemo(() => {
    const face = new Quaternion().setFromEuler(new Euler(...faceUp[(value ?? 1) - 1]));
    return face;
  }, [value]);
  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    const base = new Vector3(index ? 0.55 : -0.55, TOP + 0.21, -0.2 + index * 0.3);
    if (tumble.current > 0) {
      tumble.current -= delta;
      m.rotation.x += delta * (11 + index * 3);
      m.rotation.z += delta * (8 + index * 2);
      m.position.set(base.x, base.y + Math.abs(Math.sin(tumble.current * 12)) * 0.5, base.z);
      return;
    }
    const goal = new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), yaw.current)
      .multiply(target);
    m.quaternion.slerp(goal, reduced ? 1 : 1 - Math.exp(-delta * 10));
    m.position.lerp(base, 0.2);
  });
  return (
    <mesh ref={mesh} position={[index ? 0.55 : -0.55, TOP + 0.21, 0]} castShadow>
      <boxGeometry args={[0.42, 0.42, 0.42]} />
      {textures.map((map, i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} map={map} roughness={0.3} />
      ))}
    </mesh>
  );
}

function cardCanvas(title: string, body?: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 256;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#b3261e';
  c.fillRect(0, 0, 384, 256);
  c.strokeStyle = '#f6c453';
  c.lineWidth = 8;
  c.strokeRect(12, 12, 360, 232);
  c.fillStyle = '#fff4d6';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (!body) {
    c.font = '900 120px Georgia, serif';
    c.fillText('?', 192, 110);
    c.font = '800 34px "Segoe UI", sans-serif';
    c.fillText(title, 192, 205);
  } else {
    c.font = '800 30px "Segoe UI", sans-serif';
    c.fillText('CƠ HỘI', 192, 50);
    c.font = '800 34px "Segoe UI", sans-serif';
    const words = body.split(' ');
    let line = '',
      y = 115;
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (c.measureText(next).width > 320 && line) {
        c.fillText(line, 192, y);
        line = word;
        y += 42;
      } else line = next;
    }
    c.fillText(line, 192, y);
  }
  return canvas;
}
function Deck({ drawn }: { drawn: string | null }) {
  const back = useCanvasTexture(() => cardCanvas('CƠ HỘI'));
  const face = useMemo(() => {
    if (!drawn) return null;
    const t = new CanvasTexture(cardCanvas('', drawn));
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [drawn]);
  useEffect(() => () => face?.dispose(), [face]);
  const floating = useRef<Mesh>(null);
  const camera = useThree((s) => s.camera);
  useFrame((state) => {
    const m = floating.current;
    if (!m) return;
    m.position.y = TOP + 1.5 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
    m.lookAt(camera.position);
  });
  const x = S * 0.22 + 0.3,
    z = S * 0.22 + 0.15;
  return (
    <group>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          position={[x, TOP + 0.012 + i * 0.016, z]}
          rotation-y={0.08 * Math.sin(i * 1.7)}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1.5, 0.014, 1]} />
          {[0, 1, 3, 4, 5].map((n) => (
            <meshStandardMaterial key={n} attach={`material-${n}`} color="#f2e6cc" />
          ))}
          <meshStandardMaterial attach="material-2" map={back} roughness={0.6} />
        </mesh>
      ))}
      {face && (
        <mesh ref={floating} position={[0, TOP + 1.5, 0]}>
          <planeGeometry args={[2.1, 1.4]} />
          <meshStandardMaterial
            map={face}
            side={DoubleSide}
            emissive="#ffffff"
            emissiveIntensity={0.15}
            emissiveMap={face}
          />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------- corner props & effects

function Jail() {
  const [x, z] = tileCentre(8);
  const w = 1.3 * U * 0.8;
  return (
    <group position={[x, TOP, z]}>
      {[-1, 1].map((side) =>
        Array.from({ length: 6 }, (_, i) => (
          <mesh
            key={`${side}${i}`}
            position={
              side < 0 ? [w / 2, 0.3, -w / 2 + (i * w) / 5] : [-w / 2 + (i * w) / 5, 0.3, -w / 2]
            }
            castShadow
            material={material('#3c3c3c', { metalness: 0.7, roughness: 0.3 })}
          >
            <cylinderGeometry args={[0.022, 0.022, 0.6, 6]} />
          </mesh>
        )),
      )}
      <mesh position={[w / 2, 0.6, 0]} material={material('#3c3c3c', { metalness: 0.7 })}>
        <boxGeometry args={[0.05, 0.05, w]} />
      </mesh>
      <mesh position={[0, 0.6, -w / 2]} material={material('#3c3c3c', { metalness: 0.7 })}>
        <boxGeometry args={[w, 0.05, 0.05]} />
      </mesh>
    </group>
  );
}
function Plane() {
  const [x, z] = tileCentre(24);
  const group = useRef<Group>(null);
  useFrame((state) => {
    if (group.current)
      group.current.position.y = TOP + 0.55 + Math.sin(state.clock.elapsedTime * 1.5) * 0.06;
  });
  const white = material('#f4f4f4', { metalness: 0.3, roughness: 0.3 });
  const blue = material('#378add');
  return (
    <group ref={group} position={[x, TOP + 0.55, z]} rotation-y={Math.PI * 0.75}>
      <mesh rotation-z={Math.PI / 2} material={white} castShadow>
        <cylinderGeometry args={[0.09, 0.07, 0.9, 12]} />
      </mesh>
      <mesh position={[0.48, 0, 0]} rotation-z={-Math.PI / 2} material={white}>
        <coneGeometry args={[0.09, 0.16, 12]} />
      </mesh>
      <mesh position={[0.05, -0.02, 0]} material={blue} castShadow>
        <boxGeometry args={[0.26, 0.02, 1]} />
      </mesh>
      <mesh position={[-0.38, 0.12, 0]} material={blue}>
        <boxGeometry args={[0.14, 0.22, 0.02]} />
      </mesh>
      <mesh position={[-0.38, 0.02, 0]} material={blue}>
        <boxGeometry args={[0.12, 0.02, 0.36]} />
      </mesh>
    </group>
  );
}
function Stage() {
  const [x, z] = tileCentre(16);
  const lights = useRef<Group>(null);
  useFrame((state) => {
    lights.current?.children.forEach((child, i) => {
      const m = (child as Mesh).material as MeshStandardMaterial;
      m.emissiveIntensity = 1 + Math.sin(state.clock.elapsedTime * 4 + i * 1.3) * 0.8;
    });
  });
  // A small concert stage: wooden floor, red backdrop, speakers, a mic and blinking lights.
  return (
    <group position={[x, TOP, z]} rotation-y={-Math.PI / 4}>
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow material={material('#8a5a32')}>
        <boxGeometry args={[0.95, 0.1, 0.6]} />
      </mesh>
      <mesh position={[0, 0.11, 0]} material={material('#f6c453', { metalness: 0.5 })}>
        <boxGeometry args={[0.97, 0.02, 0.62]} />
      </mesh>
      <mesh position={[0, 0.42, -0.28]} castShadow material={material('#a3261f')}>
        <boxGeometry args={[0.95, 0.62, 0.04]} />
      </mesh>
      <mesh position={[0, 0.76, -0.27]} material={material('#3b2a1a')}>
        <boxGeometry args={[1.0, 0.05, 0.08]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.38, 0.27, -0.1]}
          castShadow
          material={material('#1d1d1d')}
        >
          <boxGeometry args={[0.16, 0.3, 0.14]} />
        </mesh>
      ))}
      <mesh position={[0, 0.3, 0.08]} material={material('#bfbfbf', { metalness: 0.8 })}>
        <cylinderGeometry args={[0.012, 0.012, 0.36, 6]} />
      </mesh>
      <mesh position={[0, 0.5, 0.08]} material={material('#333', { metalness: 0.6 })}>
        <sphereGeometry args={[0.045, 12, 8]} />
      </mesh>
      <group ref={lights}>
        {['#ff6b6b', '#ffd27a', '#7ad3ff', '#c38bff'].map((color, i) => (
          <mesh key={color} position={[-0.36 + i * 0.24, 0.74, -0.2]}>
            <sphereGeometry args={[0.035, 10, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
function Spotlight({ index }: { index: number }) {
  const [x, z] = tileCentre(index);
  const beam = useRef<Mesh>(null);
  useFrame((state) => {
    const m = beam.current;
    if (m)
      (m.material as MeshStandardMaterial).opacity =
        0.09 + Math.sin(state.clock.elapsedTime * 3) * 0.03;
  });
  return (
    <group position={[x, TOP, z]}>
      <mesh ref={beam} position={[0, 0.9, 0]}>
        <coneGeometry args={[0.42, 1.8, 32, 1, true]} />
        <meshStandardMaterial
          color="#ffd27a"
          emissive="#ffd27a"
          transparent
          opacity={0.18}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </mesh>
      <pointLight position={[0, 0.8, 0]} color="#ffcf6b" intensity={4} distance={2.5} />
      <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.35, 0.55, 32]} />
        <meshBasicMaterial color="#ffd27a" transparent opacity={0.6} blending={AdditiveBlending} />
      </mesh>
    </group>
  );
}
function Marker({ index, color, pulse }: { index: number; color: string; pulse: boolean }) {
  const [x, z] = tileCentre(index);
  const corner = corners.includes(index);
  const { inward } = axes(index);
  const w = (corner ? 1.3 : inward[0] === 0 ? 1 : 1.3) * U,
    d = (corner ? 1.3 : inward[0] === 0 ? 1.3 : 1) * U;
  const mesh = useRef<Mesh>(null);
  useFrame((state) => {
    const m = mesh.current;
    if (m && pulse) {
      (m.material as MeshStandardMaterial).opacity =
        0.3 + Math.sin(state.clock.elapsedTime * 6) * 0.15;
      m.position.y = TOP + 0.03 + Math.abs(Math.sin(state.clock.elapsedTime * 3)) * 0.04;
    }
  });
  return (
    <mesh ref={mesh} position={[x, TOP + 0.03, z]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[w * 0.96, d * 0.96]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.8}
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </mesh>
  );
}
function Money() {
  const notes: [number, number, number, string][] = [
    [-S / 2 - 1.6, 2.2, 0.3, '#b9d7a8'],
    [-S / 2 - 1.8, 0.4, -0.2, '#e8b4c2'],
    [S / 2 + 1.7, -1.8, 0.5, '#f2d48f'],
    [S / 2 + 1.5, -3.6, -0.1, '#a9cbe6'],
  ];
  return (
    <group>
      {notes.map(([x, z, r, color], i) =>
        Array.from({ length: 5 + (i % 3) }, (_, k) => (
          <mesh
            key={`${i}-${k}`}
            position={[x + k * 0.02, 0.012 + k * 0.012, z]}
            rotation-y={r + k * 0.05}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[1.5, 0.01, 0.75]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}

// ---------------------------------------------------------------- camera

function Rig({ yaw, zoom }: { yaw: number; zoom: number }) {
  const { camera, size } = useThree();
  const current = useRef(yaw);
  useFrame((_, delta) => {
    current.current += (yaw - current.current) * (1 - Math.exp(-delta * 5));
    const narrow = Math.max(1, 1.25 / (size.width / size.height));
    const r = 20.5 * narrow * zoom;
    const elevation = 0.98;
    camera.position.set(
      Math.sin(current.current) * Math.cos(elevation) * r,
      Math.sin(elevation) * r,
      Math.cos(current.current) * Math.cos(elevation) * r,
    );
    // Aim a little towards the near edge so the whole tray fits under the perspective.
    camera.lookAt(Math.sin(current.current) * 0.9, -0.2, Math.cos(current.current) * 0.9);
  });
  return null;
}

// ---------------------------------------------------------------- scene

export type TyPhuSceneProps = {
  state: TyPhuPublicState;
  shown: Record<string, number>;
  selectable: number[];
  focused: number | null;
  onTile: (index: number) => void;
  yaw: number;
  zoom: number;
  onFailure: () => void;
  dragged: () => boolean;
};

function World({ state, shown, selectable, focused, onTile, yaw, zoom, dragged }: TyPhuSceneProps) {
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const windows = useWindowTexture();
  const dice = useDieTextures();
  const hovered = useRef<number | null>(null);
  const gl = useThree((s) => s.gl);
  const setHover = (index: number | null) => {
    hovered.current = index;
    gl.domElement.style.cursor = index === null ? 'grab' : 'pointer';
  };
  const colorOf = (id: string) => playerColors[state.players.find((p) => p.id === id)?.color ?? 0];
  const active = state.players.filter((p) => p.status === 'ACTIVE');
  const roll = String([...state.log].reverse().find((e) => e.type === 'roll')?.at ?? '');
  const card =
    state.phase === 'CARD' && state.pending?.card ? cards[state.pending.card].name : null;
  return (
    <>
      <color attach="background" args={[new Color('#17110c')]} />
      <fog attach="fog" args={['#17110c', 24, 48]} />
      <hemisphereLight args={['#fff1dc', '#3a2412', 0.75]} />
      <directionalLight
        position={[6, 14, 5]}
        intensity={2.1}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <pointLight position={[0, 6, 0]} intensity={18} distance={16} color="#ffb766" />
      <Rig yaw={yaw} zoom={zoom} />
      <Table />
      <Money />
      <Board
        onTile={(i) => {
          if (!dragged()) onTile(i);
        }}
        onHover={setHover}
      />
      <Jail />
      <Plane />
      <Stage />
      <Deck drawn={card} />
      {board.map((t) => {
        const owned = state.tiles[t.index];
        return owned ? (
          <Property
            key={t.index}
            index={t.index}
            level={owned.level}
            color={colorOf(owned.owner)}
            windows={windows}
          />
        ) : null;
      })}
      {state.festival !== null && <Spotlight index={state.festival} />}
      {board.map((t) =>
        state.tiles[t.index]?.blackout ? (
          <Marker key={`b${t.index}`} index={t.index} color="#1b1b1b" pulse={false} />
        ) : null,
      )}
      {selectable.map((i) => (
        <Marker key={`s${i}`} index={i} color="#ffb347" pulse={!reduced} />
      ))}
      {focused !== null && <Marker index={focused} color="#ffffff" pulse={false} />}
      {active.map((p) => {
        const position = shown[p.id] ?? p.position;
        const here = active.filter((o) => (shown[o.id] ?? o.position) === position);
        const slot = here.findIndex((o) => o.id === p.id);
        const [x, z] = tileCentre(position);
        const { along } = axes(position);
        const spread = (slot - (here.length - 1) / 2) * 0.3;
        const off: [number, number] = corners.includes(position)
          ? [spread, (slot % 2) * 0.25 - 0.1]
          : [along[0] * spread, along[1] * spread];
        return (
          <Pawn
            key={p.id}
            color={playerColors[p.color]}
            x={x + off[0]}
            z={z + off[1]}
            active={p.id === state.turn && state.status === 'PLAYING'}
            reduced={reduced}
          />
        );
      })}
      {state.status === 'PLAYING' &&
        [0, 1].map((i) => (
          <Die
            key={i}
            index={i}
            value={state.dice?.[i] ?? null}
            roll={roll}
            textures={dice}
            reduced={reduced}
          />
        ))}
    </>
  );
}

class Boundary extends Component<
  { onFailure: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function TyPhuScene(props: TyPhuSceneProps) {
  const { onFailure } = props;
  return (
    <Boundary onFailure={onFailure}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 34, near: 0.1, far: 120, position: [10, 12, 10] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener(
            'webglcontextlost',
            (e) => {
              e.preventDefault();
              onFailure();
            },
            { once: true },
          );
        }}
        fallback={null}
      >
        <World {...props} />
      </Canvas>
    </Boundary>
  );
}
