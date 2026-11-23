import {
  Component,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DuckFigure, DuckName, type DuckMotion } from './DuckFigure';
import { RiverWorld } from './RiverWorld';
import { DuckBatch } from './DuckBatch';
import { WaterTrails } from './WaterTrails';
import { Fireworks } from './Fireworks';
import { elapsedRace, displayFinished, positionsAt, type RacePlayback } from './playback';
import { riverX, raceZ, type CameraMode, type Graphics, skins } from './design';

function Racers({
  view,
  mine,
  graphics,
  visual,
}: {
  view: MutableRefObject<RacePlayback>;
  mine: string;
  graphics: Graphics;
  visual: MutableRefObject<number[]>;
}) {
  const entryData = view.current.race.entries;
  const entries = useMemo(
    () => [...entryData].sort((a, b) => a.id.localeCompare(b.id)),
    [entryData],
  );
  const refs = useRef<(THREE.Group | null)[]>([]);
  const labels = useRef<(THREE.Group | null)[]>([]);
  const previous = useRef<number[]>([]);
  const prevElapsed = useRef(-3000);
  const motion = useRef<MutableRefObject<DuckMotion>[]>([]);
  entries.forEach((_, i) => {
    motion.current[i] ??= { current: { speed: 0, mood: 'idle' } };
  });
  useFrame((_, delta) => {
    const elapsed = elapsedRace(view.current);
    const targets = positionsAt(view.current);
    const leaders = new Set(
      targets
        .map((p, i) => ({ p, i }))
        .sort((a, b) => b.p - a.p)
        .slice(0, 3)
        .map((p) => p.i),
    );
    const replay = view.current.replay !== null;
    const seeking = Math.abs(elapsed - prevElapsed.current) > 2000;
    prevElapsed.current = elapsed;
    targets.forEach((target, index) => {
      const group = refs.current[index];
      if (!group) return;
      const previousPosition = previous.current[index] ?? target;
      const p =
        replay || seeking
          ? target
          : Math.max(previousPosition, Math.min(target, previousPosition + delta * 0.08));
      previous.current[index] = p;
      visual.current[index] = p;
      const rank = view.current.race.results.find((r) => r.entryId === entries[index].id)?.rank;
      const speed =
        elapsed < 0 || view.current.replay?.paused
          ? 0
          : Math.min(
              2.5,
              Math.max(
                0,
                ((p - previousPosition) / Math.max(delta, 0.001)) *
                  view.current.race.config.duration,
              ),
            );
      motion.current[index].current = {
        speed,
        mood: p >= 1 && rank ? (rank <= 3 ? 'victory' : 'defeat') : speed > 0.02 ? 'swim' : 'idle',
      };
      const z = raceZ(p),
        lane =
          entries.length === 1
            ? 0
            : (index / (entries.length - 1) - 0.5) * Math.min(29, entries.length * 2);
      const sway = graphics.reducedMotion ? 0 : Math.sin(elapsed / 1200 + index * 1.7) * 0.16;
      group.position.set(riverX(z) + lane + sway, 0.04, z);
      group.rotation.y = Math.atan((riverX(z + 0.3) - riverX(z)) / 0.3) + sway * 0.1;
      group.visible = !displayFinished(view.current) || replay;
      const label = labels.current[index];
      if (label)
        label.visible = entries.length <= 6 || entries[index].userId === mine || leaders.has(index);
    });
  }, -3);
  const scale = entries.length > 20 ? 0.65 : entries.length > 12 ? 0.8 : 1;
  return (
    <>
      {entries.map((e, i) => (
        <group
          key={e.id}
          ref={(node) => {
            refs.current[i] = node;
          }}
          scale={scale}
        >
          <DuckFigure
            skin={e.skin}
            phase={i * 1.71}
            reduced={graphics.reducedMotion}
            motion={motion.current[i]}
          />
          <group
            ref={(node) => {
              labels.current[i] = node;
            }}
          >
            <DuckName name={e.name} mine={e.userId === mine} />
          </group>
        </group>
      ))}
      {graphics.particles && (
        <WaterTrails
          racers={refs}
          motion={motion}
          count={entries.length}
          low={graphics.quality === 'LOW' || entries.length > 20}
          reduced={graphics.reducedMotion}
        />
      )}
    </>
  );
}
function Director({
  view,
  mode,
  follow,
  graphics,
  visual,
}: {
  view: MutableRefObject<RacePlayback>;
  mode: CameraMode;
  follow: string;
  graphics: Graphics;
  visual: MutableRefObject<number[]>;
}) {
  const { camera, gl } = useThree();
  const target = useRef(new THREE.Vector3(0, 0, -90)),
    destination = useRef(new THREE.Vector3()),
    focus = useRef(new THREE.Vector3());
  const control = useRef<OrbitControls | null>(null);
  const shadow = useRef<THREE.DirectionalLight>(null);
  const object = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    if (mode !== 'FREE') return;
    const orbit = new OrbitControls(camera, gl.domElement);
    control.current = orbit;
    orbit.target.copy(target.current);
    orbit.minDistance = 5;
    orbit.maxDistance = 100;
    orbit.minPolarAngle = 0.12;
    orbit.maxPolarAngle = Math.PI * 0.47;
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.07;
    orbit.maxTargetRadius = 100;
    return () => {
      orbit.dispose();
      control.current = null;
    };
  }, [mode, camera, gl]);
  const warmed = useRef(false);
  const previousShot = useRef({ won: false, elapsed: 0 });
  useFrame((_, delta) => {
    const elapsed = elapsedRace(view.current),
      positions = visual.current.length ? visual.current : positionsAt(view.current);
    const leader = positions.length ? Math.max(...positions) : 0;
    const entries = [...view.current.race.entries].sort((a, b) => a.id.localeCompare(b.id));
    const index = entries.findIndex((e) => e.id === follow);
    const progress = index >= 0 ? positions[index] : leader;
    const z = raceZ(progress || 0),
      lane =
        index >= 0 && entries.length > 1
          ? (index / (entries.length - 1) - 0.5) * Math.min(29, entries.length * 2)
          : 0,
      x = riverX(z) + lane;
    const won = displayFinished(view.current) && !view.current.replay;
    const automatic: CameraMode = graphics.reducedMotion
      ? 'OVERVIEW'
      : elapsed < 4000
        ? 'OVERVIEW'
        : progress > 0.94
          ? 'FINISH'
          : (['LEADER', 'SIDE', 'WATER', 'AERIAL'] as const)[Math.floor(elapsed / 14000) % 4];
    const active = mode === 'AUTO' ? automatic : mode;
    const desired = destination.current,
      look = focus.current;
    const span = Math.min(30, Math.max(10, entries.length * 1.5));
    look.set(x, 0.7, z - (index >= 0 ? 1 : 7));
    switch (active) {
      case 'LEADER':
        desired.set(x + 12, 11, z + 22);
        break;
      case 'SIDE':
        desired.set(x + 20, 25, z + 10);
        break;
      case 'WATER':
        desired.set(riverX(z) + 6, 5.5, z + 19);
        break;
      case 'AERIAL':
        desired.set(x + 0.1, 37 + span * 0.25, z - 7);
        break;
      case 'FINISH':
        desired.set(riverX(90) + 22, 22, 75);
        look.set(riverX(90), 0.6, 89);
        break;
      default:
        desired.set(x + 15, 23 + span * 0.2, z + 27 + span * 0.15);
    }
    if (won && mode !== 'FREE') {
      desired.set(riverX(105), 8.5, 92);
      look.set(riverX(105), 2.2, 103);
    }
    if (mode !== 'FREE') {
      // Cut to the podium/seek target instead of flying through banners or riverbanks.
      const cut =
        won !== previousShot.current.won ||
        (view.current.replay !== null && Math.abs(elapsed - previousShot.current.elapsed) > 2000);
      const a =
        warmed.current && !cut ? 1 - Math.exp(-delta * (graphics.reducedMotion ? 3 : 1.5)) : 1;
      camera.position.lerp(desired, a);
      target.current.lerp(look, a);
      camera.lookAt(target.current);
      warmed.current = true;
    } else control.current?.update();
    previousShot.current = { won, elapsed };
    gl.domElement.dataset.camera = active;
    if (shadow.current) {
      shadow.current.position.set(x - 15, 32, z - 15);
      object.position.set(x, 0, z);
      object.updateMatrixWorld();
    }
  });
  return graphics.shadows && graphics.quality !== 'LOW' ? (
    <>
      <primitive object={object} />
      <directionalLight
        ref={shadow}
        target={object}
        intensity={1.1}
        castShadow
        shadow-mapSize={[
          graphics.quality === 'HIGH' ? 2048 : 1024,
          graphics.quality === 'HIGH' ? 2048 : 1024,
        ]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.001}
        shadow-normalBias={0.04}
      />
    </>
  ) : null;
}
function Celebration({
  view,
  graphics,
}: {
  view: MutableRefObject<RacePlayback>;
  graphics: Graphics;
}) {
  const group = useRef<THREE.Group>(null),
    particles = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = graphics.quality === 'HIGH' ? 160 : 80;
  useEffect(() => {
    for (let i = 0; i < count; i++)
      particles.current?.setColorAt(
        i,
        new THREE.Color(['#ffe49a', '#ff7fa8', '#86f4db', '#ba9aff'][i % 4]),
      );
    if (particles.current?.instanceColor) particles.current.instanceColor.needsUpdate = true;
  }, [count]);
  useFrame(({ clock }) => {
    const visible = displayFinished(view.current) && !view.current.replay;
    if (group.current) group.current.visible = visible;
    if (!visible || !particles.current || graphics.reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const t = (clock.elapsedTime * 0.25 + i * 0.013) % 1;
      dummy.position.set(Math.sin(i * 2.39) * (2 + t * 9), 10 - t * 8, Math.cos(i * 2.39) * 4);
      dummy.rotation.set(t * 8 + i, t * 5, i);
      dummy.scale.setScalar(0.12);
      dummy.updateMatrix();
      particles.current.setMatrixAt(i, dummy.matrix);
    }
    particles.current.instanceMatrix.needsUpdate = true;
  });
  const race = view.current.race;
  return (
    <group ref={group} visible={false} position={[riverX(105), 0.1, 103]}>
      {graphics.particles &&
        !graphics.reducedMotion &&
        view.current.race.config.track === 'FESTIVAL' && (
          <Fireworks view={view} count={graphics.quality === 'HIGH' ? 320 : 160} />
        )}
      {[2, 0, 1].map((place, i) => {
        const result = race.results[place],
          entry = race.entries.find((e) => e.id === result?.entryId);
        const h = place === 0 ? 2 : place === 1 ? 1.4 : 1;
        return (
          <group key={i} position={[(i - 1) * 4.5, 0, 0]}>
            <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[2.1, 2.2, h, 48]} />
              <meshStandardMaterial
                color={place === 0 ? '#e7bd69' : place === 1 ? '#bfd9da' : '#d89877'}
                metalness={0.3}
                roughness={0.3}
              />
            </mesh>
            {entry && (
              <group position={[0, h, 0]} rotation={[0, Math.PI, 0]} scale={1.5}>
                <DuckFigure skin={entry.skin} celebrate reduced={graphics.reducedMotion} />
              </group>
            )}
            {place === 0 && (
              <group position={[1.8, h, -0.2]} scale={0.75}>
                <mesh position={[0, 0.1, 0]} castShadow>
                  <boxGeometry args={[0.9, 0.2, 0.7]} />
                  <meshStandardMaterial color="#533b62" />
                </mesh>
                <mesh position={[0, 0.4, 0]} castShadow>
                  <cylinderGeometry args={[0.11, 0.23, 0.5, 16]} />
                  <meshStandardMaterial color="#ffe09c" metalness={0.55} roughness={0.25} />
                </mesh>
                <mesh position={[0, 0.95, 0]} castShadow>
                  <cylinderGeometry args={[0.52, 0.15, 0.65, 24, 1, true]} />
                  <meshStandardMaterial
                    color="#f8c855"
                    metalness={0.5}
                    roughness={0.25}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                {[-1, 1].map((side) => (
                  <mesh key={side} position={[side * 0.48, 0.92, 0]}>
                    <torusGeometry args={[0.24, 0.06, 8, 16]} />
                    <meshStandardMaterial color="#ffdd88" metalness={0.5} roughness={0.25} />
                  </mesh>
                ))}
              </group>
            )}
            {entry && (
              <DuckName
                name={`${place + 1}. ${entry.name}`}
                mine={place === 0}
                position={[0, 0.6, -2.4]}
              />
            )}
          </group>
        );
      })}
      {graphics.particles && !graphics.reducedMotion && (
        <instancedMesh ref={particles} args={[undefined, undefined, count]} frustumCulled={false}>
          <planeGeometry args={[1, 2]} />
          <meshBasicMaterial side={THREE.DoubleSide} />
        </instancedMesh>
      )}
    </group>
  );
}
function Diagnostics({
  report,
  graphics,
  view,
  visual,
}: {
  report: (fps: number, calls: number) => void;
  graphics: Graphics;
  view: MutableRefObject<RacePlayback>;
  visual: MutableRefObject<number[]>;
}) {
  const state = useRef({
    frames: 0,
    start: performance.now(),
    previous: performance.now(),
    times: [] as number[],
  });
  useFrame(({ gl, camera }) => {
    const now = performance.now();
    state.current.times.push(now - state.current.previous);
    state.current.previous = now;
    state.current.frames++;
    const elapsed = now - state.current.start;
    if (elapsed > 2500) {
      const fps = Math.round((state.current.frames * 1000) / elapsed);
      const times = state.current.times.sort((a, b) => a - b);
      gl.domElement.dataset.performance = JSON.stringify({
        fps,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        frameMsP95: times[Math.floor(times.length * 0.95)],
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        quality: graphics.quality,
        dpr: gl.getPixelRatio(),
        camera: camera.position.toArray(),
        raceElapsed: elapsedRace(view.current, now),
        positions: [...visual.current],
      });
      report(fps, gl.info.render.calls);
      state.current = { frames: 0, start: now, previous: now, times: [] };
    }
  });
  return null;
}
class SceneBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
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
    return this.state.failed ? (
      <p role="status">Đang chuyển sang bảng đua 2D…</p>
    ) : (
      this.props.children
    );
  }
}
export default function DuckScene({
  view,
  mine,
  graphics,
  camera,
  follow,
  onFailure,
  onPerformance,
}: {
  view: MutableRefObject<RacePlayback>;
  mine: string;
  graphics: Graphics;
  camera: CameraMode;
  follow: string;
  onFailure: () => void;
  onPerformance: (fps: number, calls: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const visual = useRef<number[]>([]);
  useEffect(() => {
    const element = canvas.current;
    const lost = (e: Event) => {
      e.preventDefault();
      onFailure();
    };
    element?.addEventListener('webglcontextlost', lost);
    return () => element?.removeEventListener('webglcontextlost', lost);
  }, [onFailure]);
  return (
    <SceneBoundary onFailure={onFailure}>
      <Canvas
        ref={canvas}
        shadows={graphics.shadows && graphics.quality !== 'LOW'}
        dpr={graphics.resolution}
        camera={{ fov: 47, near: 0.1, far: 300, position: [15, 27, -120] }}
        gl={{ antialias: graphics.quality !== 'LOW', powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          const context = gl.getContext();
          const extension = context.getExtension('WEBGL_debug_renderer_info');
          gl.domElement.dataset.renderer = extension
            ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL))
            : String(context.getParameter(context.RENDERER));
          gl.debug.onShaderError = () => queueMicrotask(onFailure);
        }}
        fallback={<p>Thiết bị không hỗ trợ WebGL. Hãy chọn chế độ 2D.</p>}
      >
        <RiverWorld track={view.current.race.config.track} graphics={graphics} />
        <DuckBatch
          quality={graphics.quality}
          revision={
            view.current.race.id +
            ':' +
            view.current.race.entries.map((e) => e.id + e.skin).join(',')
          }
        >
          <Racers view={view} mine={mine} graphics={graphics} visual={visual} />
        </DuckBatch>
        <Director view={view} mode={camera} follow={follow} graphics={graphics} visual={visual} />
        <Celebration view={view} graphics={graphics} />
        <Diagnostics report={onPerformance} graphics={graphics} view={view} visual={visual} />
      </Canvas>
    </SceneBoundary>
  );
}
export { skins };
