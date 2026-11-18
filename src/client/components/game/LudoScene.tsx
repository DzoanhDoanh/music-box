import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CanvasTexture, Group, SRGBColorSpace, Vector3 } from 'three';
import { ArrowLeft, ArrowRight, Minus, Plus, RotateCcw } from 'lucide-react';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { colorNames } from '../../../shared/game/contracts';
import { getLegalMoves } from '../../../shared/game/engine';
import { lastPosition, trackLength } from '../../../shared/game/board';
import { pieceSkinName } from '../../../shared/game/piece-skins';
import type { BoardProps } from './GameBoard';
import { boardTrack, homeLane, origins, piecePoint } from './board-geometry';
import { pieceLayout } from './board-motion';
import { sceneMotion, scenePoint, type ScenePlan } from './scene-motion';
import MovingPiece, { pieceColors as colors } from './MovingPiece';
import { useBoardCamera } from './useBoardCamera';
import { getBoardEffect, EffectCallout } from './board-effects';
import EffectPreview from './EffectPreview';
import {
  readCaptureEffect,
  rememberCaptureEffect,
  type CaptureEffectId,
} from '../../lib/capture-effect';

const panels = ['#532c3c', '#174b42', '#54442a', '#223d61'];
const base = '#152632';
const gold = '#d8b675';
const emptyPlans = new Map<string, ScenePlan>();
type Position = [number, number, number];

function SoftBox({
  size,
  at,
  color,
  radius = 0.12,
}: {
  size: Position;
  at: Position;
  color: string;
  radius?: number;
}) {
  const [x, y, z] = size;
  const geometry = useMemo(() => new RoundedBoxGeometry(x, y, z, 2, radius), [x, y, z, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={at} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.42} metalness={0.16} />
    </mesh>
  );
}
function Disc({
  x,
  z,
  radius,
  color,
  y = 0.07,
  height = 0.14,
}: {
  x: number;
  z: number;
  radius: number;
  color: string;
  y?: number;
  height?: number;
}) {
  return (
    <mesh position={[x - 7.5, y, z - 7.5]} receiveShadow>
      <cylinderGeometry args={[radius, radius + 0.035, height, 24]} />
      <meshStandardMaterial color={color} roughness={0.46} metalness={0.2} />
    </mesh>
  );
}
function Ring({
  at,
  radius,
  color,
  thickness = 0.025,
}: {
  at: Position;
  radius: number;
  color: string;
  thickness?: number;
}) {
  return (
    <mesh position={at} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, thickness, 6, 48]} />
      <meshStandardMaterial
        color={color}
        roughness={0.35}
        metalness={0.3}
        emissive={color}
        emissiveIntensity={0.12}
      />
    </mesh>
  );
}

/** One local, transparent engraving atlas. No network images, user text or fonts to load. */
function makeEngraving(schema: BoardProps['state']['schema']) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;
  const unit = 2048 / 15.6;
  ctx.scale(unit, unit);
  ctx.translate(0.3, 0.3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let color = 0; color < 4; color++) {
    const [x, y] = origins[color];
    ctx.strokeStyle = colors[color] + '80';
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    ctx.roundRect(x + 0.28, y + 0.28, 5.44, 5.44, 0.4);
    ctx.stroke();
    ctx.fillStyle = colors[color];
    ctx.font = '600 .24px sans-serif';
    ctx.fillText(colorNames[color].toLocaleUpperCase('vi'), x + 3, y + 0.75);
    ctx.globalAlpha = 0.6;
    ctx.font = '.14px sans-serif';
    ctx.fillText('R O O M T U N E', x + 3, y + 5.33);
    ctx.globalAlpha = 1;
    for (let n = 0; n < 6; n++) {
      const [lx, ly] = homeLane(color, n);
      ctx.fillStyle = '#142435';
      ctx.font = '700 .38px sans-serif';
      ctx.fillText(String(n + 1), lx + 0.5, ly + 0.5);
    }
  }
  const quarter = trackLength(schema) / 4;
  boardTrack(schema).forEach(([x, y], i) => {
    const gate = i % quarter === quarter - 1,
      start = i % quarter === 0;
    if (!gate && !start) return;
    ctx.save();
    ctx.translate(x + 0.5, y + 0.5);
    const color = gate ? ((i + 1) / quarter) % 4 : Math.floor(i / quarter);
    ctx.fillStyle = start ? colors[color] : '#172335';
    ctx.font = 'bold .4px sans-serif';
    if (gate) {
      ctx.rotate((color * Math.PI) / 2);
      ctx.fillText('→', 0, 0);
    } else {
      ctx.font = '.48px serif';
      ctx.fillText('♞', 0, 0);
    }
    ctx.restore();
  });
  ctx.fillStyle = '#efdcb7';
  ctx.font = '.62px serif';
  ctx.fillText('✦', 7.5, 7.5);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function Table({ state }: Pick<BoardProps, 'state'>) {
  const texture = useMemo(() => makeEngraving(state.schema), [state.schema]);
  useEffect(() => () => texture.dispose(), [texture]);
  const quarter = trackLength(state.schema) / 4;
  const current =
    state.status === 'PLAYING' ? state.players.find((p) => p.id === state.turn)?.color : undefined;
  return (
    <group>
      <SoftBox size={[16.2, 0.45, 16.2]} at={[0, -0.46, 0]} color="#0c1522" radius={0.22} />
      <SoftBox size={[15.94, 0.09, 15.94]} at={[0, -0.225, 0]} color={gold} radius={0.04} />
      <SoftBox size={[15.7, 0.34, 15.7]} at={[0, -0.19, 0]} color={base} radius={0.16} />
      {origins.map(([x, z], color) => (
        <group key={color}>
          <SoftBox
            size={[5.72, 0.08, 5.72]}
            at={[x - 4.5, 0.025, z - 4.5]}
            color={panels[color]}
            radius={0.038}
          />
          <Disc x={x + 3} z={z + 3.04} radius={2.13} color="#142331" y={0.055} height={0.08} />
          <Ring
            at={[x - 4.5, 0.11, z - 4.46]}
            radius={2.15}
            color={current === color ? colors[color] : '#526064'}
            thickness={current === color ? 0.036 : 0.016}
          />
          {[0, 1, 2, 3].map((n) => (
            <group key={n}>
              <Disc
                x={x + 1.8 + (n % 2) * 2.3}
                z={z + 1.8 + Math.floor(n / 2) * 2.3}
                radius={0.61}
                color="#1b2a39"
                y={0.09}
                height={0.1}
              />
              <Ring
                at={[x - 5.7 + (n % 2) * 2.3, 0.15, z - 5.7 + Math.floor(n / 2) * 2.3]}
                radius={0.59}
                color={colors[color]}
                thickness={0.015}
              />
            </group>
          ))}
        </group>
      ))}
      {boardTrack(state.schema).map(([x, z], i) => {
        const gate = i % quarter === quarter - 1,
          start = i % quarter === 0;
        const color = gate ? ((i + 1) / quarter) % 4 : Math.floor(i / quarter);
        return (
          <group key={i}>
            <Disc
              x={x + 0.5}
              z={z + 0.5}
              radius={0.39}
              color={gate ? colors[color] : start ? panels[color] : '#2b414d'}
            />
            <Ring
              at={[x - 7, 0.15, z - 7]}
              radius={0.385}
              color={colors[color]}
              thickness={start ? 0.028 : 0.012}
            />
          </group>
        );
      })}
      {[0, 1, 2, 3].flatMap((color) =>
        [0, 1, 2, 3, 4, 5].map((n) => {
          const [x, z] = homeLane(color, n);
          return (
            <SoftBox
              key={color + ':' + n}
              size={[0.88, 0.16, 0.88]}
              at={[x - 7, 0.08, z - 7]}
              color={colors[color]}
              radius={0.05}
            />
          );
        }),
      )}
      <Disc x={7.5} z={7.5} radius={0.47} color="#192536" />
      <Ring at={[0, 0.17, 0]} radius={0.46} color={gold} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.183, 0]} renderOrder={1}>
        <planeGeometry args={[15.6, 15.6]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

function Celebration({
  position,
  enabled,
  color,
  delay,
}: {
  position: Position;
  enabled: boolean;
  color: number;
  delay: number;
}) {
  const group = useRef<Group>(null),
    elapsed = useRef(0);
  const started = useRef(false);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    if (group.current) group.current.visible = false;
    if (!enabled) {
      elapsed.current = Infinity;
      return;
    }
    if (started.current) return;
    started.current = true;
    elapsed.current = 0;
    invalidate();
  }, [enabled, invalidate]);
  useFrame((_, delta) => {
    if (!enabled || !group.current || elapsed.current > delay + 950) return;
    elapsed.current += Math.min(delta, 0.05) * 1000;
    const t = Math.max(0, (elapsed.current - delay) / 950);
    group.current.visible = t > 0 && t < 1;
    group.current.children.forEach((child, i) => {
      const angle = i * 2.39996,
        spread = 0.3 + t * 1.4;
      child.position.set(
        Math.cos(angle) * spread,
        0.25 + Math.sin(t * Math.PI) * ((i % 3) + 1) * 0.45,
        Math.sin(angle) * spread,
      );
      child.scale.setScalar(Math.max(0, 1 - t));
      child.rotation.set(t * 4, angle, t * 3);
    });
    invalidate();
  });
  return (
    <group ref={group} position={position} visible={false}>
      {Array.from({ length: 18 }, (_, i) => (
        <mesh key={i}>
          <octahedronGeometry args={[i % 3 === 0 ? 0.12 : 0.065]} />
          <meshStandardMaterial
            color={i % 2 ? colors[color] : '#fff1b4'}
            emissive={colors[color]}
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function LudoScene({
  state,
  actor,
  disabled,
  selectedPiece,
  onMove,
  onDestination,
  fallback,
}: BoardProps & { fallback: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const finisher = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [failed, setFailed] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [lightGraphics, setLightGraphics] = useState(false);
  const [choice, setChoice] = useState(() => ({ actor, id: readCaptureEffect(actor) }));
  const selectedEffect = choice.actor === actor ? choice.id : readCaptureEffect(actor);
  const applyEffect = (id: CaptureEffectId) => {
    const saved = rememberCaptureEffect(actor, id);
    setChoice({ actor, id });
    return saved;
  };
  const { camera, invalidate, sync, rotate, zoom, reset, gestures } = useBoardCamera(host, size);
  const previous = useRef(state);
  const eventKey = `${state.id}:${state.schema}:${state.round}:${state.version}`;
  const [motion, setMotion] = useState(() => ({
    key: eventKey,
    plans: emptyPlans,
    effect: selectedEffect,
  }));
  const plans = motion.key === eventKey ? motion.plans : emptyPlans;
  useLayoutEffect(() => {
    if (motion.key !== eventKey) {
      const rawPlans = sceneMotion(previous.current, state);
      const preparePlans = getBoardEffect(selectedEffect).preparePlans;
      setMotion({
        key: eventKey,
        plans: preparePlans
          ? preparePlans(rawPlans, state.last.actor + ':' + state.last.piece)
          : rawPlans,
        effect: selectedEffect,
      });
    }
    previous.current = state;
  }, [state, eventKey, motion.key, selectedEffect]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    if (host.current) observer.observe(host.current);
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let inView = true;
    const update = () => setAnimate(!document.hidden && !preference.matches && inView);
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    if (host.current) visibility.observe(host.current);
    document.addEventListener('visibilitychange', update);
    preference.addEventListener('change', update);
    update();
    return () => {
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', update);
      preference.removeEventListener('change', update);
    };
  }, []);
  const layout = useMemo(() => pieceLayout(state), [state]);
  useLayoutEffect(() => sync(), [layout, sync]);
  const dpr = lightGraphics
    ? 1
    : Math.max(
        1,
        Math.min(
          3,
          Math.max(2, window.devicePixelRatio || 1),
          Math.sqrt(8_000_000 / Math.max(1, size.width * size.height)),
        ),
      );
  const legal = getLegalMoves(state, actor);
  const projected = (x: number, y: number, elevation = 0.6) => {
    const point = new Vector3(x - 7.5, elevation, y - 7.5).project(camera);
    return { left: ((point.x + 1) / 2) * size.width, top: ((1 - point.y) / 2) * size.height };
  };
  const destinations = new Map<number, typeof legal>();
  for (const move of legal) {
    if (selectedPiece != null && selectedPiece !== move.piece) continue;
    destinations.set(move.to, [...(destinations.get(move.to) ?? []), move]);
  }
  const mover = state.players.find((p) => p.id === state.last.actor);
  const impact =
    mover && state.last.piece !== undefined
      ? layout.get(mover.id + ':' + state.last.piece)
      : undefined;
  const moverPlan = plans.get(state.last.actor + ':' + state.last.piece);
  const captureCount = [...plans.values()].filter((p) => p.kind === 'capture').length;
  // Freeze the renderer choice with the committed event: selecting another effect
  // must never replay or replace an impact already in progress.
  const captureEffect = getBoardEffect(motion.effect);
  if (failed) return fallback;
  return (
    <div
      className="ludo-scene"
      role="group"
      aria-label="Bàn cờ cá ngựa 3D. Quân có vòng sáng có thể đi; chọn quân trên bàn hoặc bằng nút phía dưới."
      data-motion={animate ? 'on' : 'reduced'}
    >
      <div className="ludo-viewport" ref={host} {...gestures}>
        {size.width > 1 && (
          <div className="ludo-canvas" aria-hidden="true">
            <Canvas
              orthographic
              camera={camera}
              frameloop="demand"
              dpr={dpr}
              shadows
              gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
              onCreated={({ gl, invalidate: render }) => {
                invalidate.current = render;
                gl.domElement.addEventListener('webglcontextlost', () => setFailed(true), {
                  once: true,
                });
                gl.setClearColor('#000000', 0);
              }}
            >
              <ambientLight intensity={0.65} />
              <hemisphereLight args={['#d9ebff', '#66527b', 1.1]} />
              <directionalLight
                position={[-8, 15, 8]}
                intensity={2.6}
                castShadow
                shadow-mapSize={lightGraphics ? [512, 512] : [2048, 2048]}
                shadow-camera-left={-12}
                shadow-camera-right={12}
                shadow-camera-top={12}
                shadow-camera-bottom={-12}
                shadow-normalBias={0.035}
                shadow-bias={-0.0003}
              />
              <directionalLight position={[8, 9, -9]} intensity={1.6} color="#8bbffc" />
              <mesh position={[0, -0.72, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[30, 30]} />
                <shadowMaterial transparent opacity={0.24} />
              </mesh>
              <Table state={state} />
              {state.players
                .filter((p) => p.status !== 'FORFEITED')
                .flatMap((p) =>
                  p.pieces.map((_, n) => {
                    const key = p.id + ':' + n;
                    const Piece =
                      captureCount > 0 && key === state.last.actor + ':' + state.last.piece
                        ? (captureEffect.Attacker ?? MovingPiece)
                        : MovingPiece;
                    return (
                      <Piece
                        key={key}
                        position={scenePoint(layout.get(key)!)}
                        plan={plans.get(key)}
                        color={p.color}
                        skin={p.skin}
                        animate={animate}
                        effectStatus={finisher}
                        light={lightGraphics}
                      />
                    );
                  }),
                )}
              {mover && moverPlan && captureCount > 0 && (
                <captureEffect.Renderer
                  key={eventKey}
                  plan={moverPlan}
                  color={colors[mover.color]}
                  enabled={animate}
                  light={lightGraphics}
                  overlay={finisher}
                />
              )}
              {impact && mover && captureCount === 0 && (
                <Celebration
                  key={state.id + ':' + state.round + ':' + state.version}
                  position={[impact.x - 7.5, 0.2, impact.y - 7.5]}
                  color={mover.color}
                  delay={moverPlan?.duration ?? 0}
                  enabled={animate && !!moverPlan && state.last.to === lastPosition(state.schema)}
                />
              )}
            </Canvas>
          </div>
        )}
        <div className="ludo-scene-hits">
          {[...destinations].map(([to, moves]) => {
            const player = state.players.find((p) => p.id === actor)!;
            const [x, y] = piecePoint(player.color, to, moves[0].piece, state.schema);
            const allowed = !disabled && moves.length === 1;
            return (
              <button
                key={to}
                className="ludo-scene-target"
                data-board-x={x}
                data-board-y={y}
                data-board-elevation={0.21}
                style={{
                  ...projected(x, y, 0.21),
                  width: Math.max(8, Math.min(36, camera.zoom * 0.9)),
                  height: Math.max(8, Math.min(36, camera.zoom * 0.9)),
                }}
                data-destination={to}
                aria-disabled={!allowed}
                disabled={!allowed}
                aria-label={`Đi tới ô sáng · ${pieceSkinName(player.skin)} ${moves[0].piece + 1}`}
                onClick={() => {
                  if (allowed) onDestination(moves[0]);
                }}
              >
                <span />
              </button>
            );
          })}
          {state.players
            .filter((p) => p.status !== 'FORFEITED')
            .flatMap((p) =>
              p.pieces.map((n, piece) => {
                const key = p.id + ':' + piece,
                  position = layout.get(key)!;
                const allowed = !disabled && p.id === actor && legal.some((m) => m.piece === piece);
                const label = `${pieceSkinName(p.skin)} ${piece + 1} · ${colorNames[p.color]} · ${p.name} · ${n === -1 ? 'chưa ra quân' : n >= trackLength(state.schema) ? 'chuồng bậc ' + (n - trackLength(state.schema) + 1) : 'ô ' + n}`;
                return (
                  <button
                    key={key}
                    data-piece={key}
                    data-skin={p.skin ?? 'HORSE'}
                    data-board-x={position.x}
                    data-board-y={position.y}
                    data-board-scale={position.scale}
                    className={
                      'ludo-scene-piece ludo-color-' +
                      p.color +
                      (allowed ? ' can-move' : '') +
                      (state.last.captures?.includes(key) ? ' just-captured' : '')
                    }
                    style={{
                      ...projected(position.x, position.y),
                      width: Math.max(8, camera.zoom * 0.9 * position.scale),
                      height: Math.max(10, camera.zoom * 1.18 * position.scale),
                    }}
                    aria-label={label}
                    title={label}
                    aria-disabled={!allowed}
                    tabIndex={allowed ? 0 : -1}
                    onClick={() => {
                      if (allowed) onMove(piece);
                    }}
                  >
                    <span aria-hidden="true">{piece + 1}</span>
                  </button>
                );
              }),
            )}
        </div>
        <EffectCallout
          overlay={finisher}
          effect={captureEffect}
          color={mover?.color ?? 0}
          detail={(mover?.name ?? '') + ' · ' + captureCount + ' quân về nhà'}
        />
        <p className="ludo-camera-hint">
          <span className="camera-mouse-hint">Kéo để xoay · Cuộn để zoom</span>
          <span className="camera-touch-hint">Hai ngón để xoay · Chụm để zoom</span>
        </p>
      </div>
      <EffectPreview
        skin={state.players.find((p) => p.id === actor)?.skin}
        color={state.players.find((p) => p.id === actor)?.color ?? 0}
        light={lightGraphics}
        activeEffect={selectedEffect}
        onApply={applyEffect}
      />
      <div className="ludo-camera-tools" role="group" aria-label="Điều khiển góc nhìn 3D">
        <button onClick={() => rotate(0.3, 0)} aria-label="Xoay bàn sang trái" title="Xoay trái">
          <ArrowLeft size={15} />
        </button>
        <button onClick={() => rotate(-0.3, 0)} aria-label="Xoay bàn sang phải" title="Xoay phải">
          <ArrowRight size={15} />
        </button>
        <button onClick={() => zoom(1 / 1.2)} aria-label="Thu nhỏ bàn cờ" title="Thu nhỏ">
          <Minus size={15} />
        </button>
        <button onClick={() => zoom(1.2)} aria-label="Phóng to bàn cờ" title="Phóng to">
          <Plus size={15} />
        </button>
        <button onClick={reset} aria-label="Đặt lại góc nhìn" title="Góc nhìn ban đầu">
          <RotateCcw size={15} />
        </button>
        <button
          className="ludo-quality"
          aria-pressed={!lightGraphics}
          aria-label={'Đồ họa: ' + (lightGraphics ? 'Nhẹ' : 'Rõ nét')}
          title="Đổi giữa đồ họa rõ nét và nhẹ máy"
          onClick={() => setLightGraphics((value) => !value)}
        >
          {lightGraphics ? 'Nhẹ' : 'Rõ nét'}
        </button>
      </div>
    </div>
  );
}
