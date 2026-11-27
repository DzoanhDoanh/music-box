import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import type { BilliardsState } from '../../../shared/billiards/contracts';
import { HEAD_STRING, cueOf, targets, type Side } from '../../../shared/billiards/engine';
import {
  H,
  POCKETS,
  R,
  W,
  firstContact,
  freeSpot,
  normalShot,
  simulate,
  type Ball,
  type Shot,
  type SimEvent,
  type Spin,
} from '../../../shared/billiards/physics';
import { playTableSound } from '../../lib/billiards-sound';
import { Button } from '../ui';

const RAIL = 44;
/** How far the cue can be drawn back, in table units: the full pull is full power. */
const MAX_PULL = 170;
/** Room kept on screen for the players bar and the controls around the table. */
const RESERVE = 210;
const COLORS: Record<number, string> = {
  1: '#f2c418',
  2: '#1d4fd8',
  3: '#d62828',
  4: '#6b2fa8',
  5: '#f07818',
  6: '#16823c',
  7: '#7a1f1f',
  8: '#121212',
};
const CAROM_COLORS = ['#f8f6ee', '#f2c418', '#d62828'];

type Place = { x: number; y: number };
type Job = { start: Ball[]; cue: number; shot: Shot };
type Layout = { width: number; height: number; scale: number; vertical: boolean };

export default function BilliardsTable({
  state,
  side,
  canShoot,
  onShoot,
  onAnimating,
}: {
  state: BilliardsState;
  /** The viewer's seat, or null for a spectator. */
  side: Side | null;
  canShoot: boolean;
  onShoot: (shot: Shot, place: Place | null) => Promise<boolean>;
  onAnimating: (running: boolean) => void;
}) {
  const carom = state.mode === 'CAROM';
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<Layout>({ width: 0, height: 0, scale: 1, vertical: false });
  const [aim, setAim] = useState({ dx: 1, dy: 0 });
  /** Power while the cue is being drawn back (0..1), or null. */
  const [pull, setPull] = useState<number | null>(null);
  const [keyPower, setKeyPower] = useState(50);
  const [spin, setSpin] = useState<Spin>({ x: 0, y: 0 });
  const [place, setPlace] = useState<Place | null>(null);
  const [running, setRunning] = useState(false);
  /** While the cue snaps forward on release: how far behind the ball it still is. */
  const stroke = useRef<number | null>(null);

  // ---------------------------------------------------------------- layout
  useEffect(() => {
    const box = wrap.current;
    if (!box) return;
    const fit = () => {
      const width = box.clientWidth;
      // Narrow screens turn the table upright so the balls stay a usable size.
      const vertical = width < 600;
      const long = W + 2 * RAIL,
        short = H + 2 * RAIL;
      // The whole table fits on screen: limited by the width and by the window's height.
      const room = Math.max(240, window.innerHeight - RESERVE);
      const scale = Math.min(width / (vertical ? short : long), room / (vertical ? long : short));
      setLayout({
        width: (vertical ? short : long) * scale,
        height: (vertical ? long : short) * scale,
        scale,
        vertical,
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);

  // ---------------------------------------------------------------- what is shown
  const cueN = side ? cueOf(state, side) : cueOf(state, state.turn);
  const latest = useRef(state);
  latest.current = state;
  const shown = useRef<Ball[]>(state.balls);
  const cueAt = (balls: Ball[]) => {
    const cue = balls.find((b) => b.n === cueN)!;
    return place && state.ballInHand ? { ...cue, ...place, on: true } : cue;
  };
  const withPlace = (balls: Ball[]) =>
    balls.map((b) =>
      b.n === cueN && place && state.ballInHand ? { ...b, ...place, on: true } : b,
    );
  const placeOk =
    !place ||
    (freeSpot(state.balls, place.x, place.y, cueN) && (!state.kitchen || place.x <= HEAD_STRING));

  // ---------------------------------------------------------------- drawing
  const draw = useCallback(
    (balls: Ball[], overlay: boolean) => {
      const el = canvas.current;
      if (!el || !layout.width) return;
      const dpr = window.devicePixelRatio || 1;
      const ctx = el.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      const k = layout.scale * dpr;
      if (layout.vertical) ctx.setTransform(0, -k, k, 0, k * RAIL, k * (RAIL + W));
      else ctx.setTransform(k, 0, 0, k, k * RAIL, k * RAIL);
      drawTable(ctx, carom, latest.current.kitchen && overlay);
      for (const b of balls) if (b.on) drawShadow(ctx, b);
      for (const b of balls) if (b.on) drawBall(ctx, b, carom, layout.vertical);
      if (!overlay && stroke.current === null) return;
      const cue = cueAt(balls);
      if (overlay && latest.current.ballInHand) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = placeOk ? 'rgba(255,255,255,0.85)' : '#ff5a4f';
        ctx.beginPath();
        ctx.arc(cue.x, cue.y, R + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const back = stroke.current ?? (pull ?? 0) * MAX_PULL;
      drawAim(ctx, withPlace(balls), cue, aim, back, stroke.current === null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, carom, aim, pull, place, placeOk],
  );

  // ---------------------------------------------------------------- animation
  const seen = useRef<number | null>(null);
  const local = useRef<number | null>(null);
  const queue = useRef<Job[]>([]);
  const busy = useRef(false);
  const overlayOn = canShoot && !running;
  const overlayRef = useRef(overlayOn);
  overlayRef.current = overlayOn;
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const run = useCallback(() => {
    if (busy.current) return;
    const job = queue.current.shift();
    if (!job) {
      shown.current = latest.current.balls;
      setRunning(false);
      onAnimating(false);
      drawRef.current(shown.current, overlayRef.current);
      return;
    }
    busy.current = true;
    setRunning(true);
    onAnimating(true);
    const result = simulate(job.start, job.cue, job.shot, carom ? [] : POCKETS, 8);
    const frames = result.frames!;
    const events = result.events.slice();
    playTableSound('cue', job.shot.power);
    const t0 = performance.now();
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      while (events.length && events[0].t <= t) sound(events.shift()!);
      const f = frames[Math.min(frames.length - 1, Math.floor(t * 60))];
      const balls = job.start.map((b, i) => ({
        n: b.n,
        x: f[i * 3],
        y: f[i * 3 + 1],
        on: f[i * 3 + 2] === 1,
      }));
      drawRef.current(balls, false);
      if (t * 60 < frames.length) requestAnimationFrame(frame);
      else {
        busy.current = false;
        run();
      }
    };
    requestAnimationFrame(frame);
  }, [carom, onAnimating]);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = state.seq;
      shown.current = state.balls;
      return;
    }
    const fresh = state.shots.filter((s) => s.seq > seen.current! && s.seq !== local.current);
    seen.current = Math.max(seen.current, state.seq);
    for (const s of fresh)
      queue.current.push({
        start: s.start,
        cue: s.cue,
        shot: { dx: s.dx, dy: s.dy, power: s.power, spin: s.spin },
      });
    if (!busy.current) run();
  }, [state.seq, state.shots, state.balls, run]);

  // Each new turn starts aimed at a legal ball, with no spin and the cue ball where it lies.
  const turnKey = `${state.version}|${state.turn}|${state.status}`;
  useEffect(() => {
    setPlace(null);
    setSpin({ x: 0, y: 0 });
    if (!canShoot) return;
    const balls = latest.current.balls;
    const cue = balls.find((b) => b.n === cueN)!;
    const goal = carom
      ? balls.find((b) => b.n === 2)
      : targets(latest.current, side!).sort(
          (a, b) =>
            (a.x - cue.x) ** 2 + (a.y - cue.y) ** 2 - ((b.x - cue.x) ** 2 + (b.y - cue.y) ** 2),
        )[0];
    if (goal) setAim({ dx: goal.x - cue.x, dy: goal.y - cue.y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey, canShoot]);

  useEffect(() => {
    if (!busy.current) draw(shown.current, overlayOn);
  }, [draw, overlayOn, state.balls]);

  // ---------------------------------------------------------------- shooting
  const strike = (power: number) => {
    if (!overlayOn || !placeOk || power < 0.03) return;
    const shot = normalShot(aim.dx, aim.dy, power, spin);
    const where = place && state.ballInHand ? place : null;
    const start = withPlace(state.balls);
    // The cue snaps forward to the ball, then our own shot plays at once; the server's answer
    // (and any computer reply) follows it.
    const from = power * MAX_PULL;
    const t0 = performance.now();
    setRunning(true);
    const thrust = () => {
      const t = Math.min(1, (performance.now() - t0) / 90);
      stroke.current = from * (1 - t * t);
      drawRef.current(start, false);
      if (t < 1) {
        requestAnimationFrame(thrust);
        return;
      }
      stroke.current = null;
      local.current = state.seq + 1;
      queue.current.push({ start, cue: cueN, shot });
      run();
      void onShoot(shot, where).then((ok) => {
        if (!ok) local.current = null;
      });
    };
    requestAnimationFrame(thrust);
  };

  // ---------------------------------------------------------------- input
  const toTable = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / layout.scale,
      sy = (e.clientY - rect.top) / layout.scale;
    return layout.vertical ? { x: RAIL + W - sy, y: sx - RAIL } : { x: sx - RAIL, y: sy - RAIL };
  };
  const drag = useRef<{ mode: 'cue' | 'aim' | 'pull'; grip: number } | null>(null);
  const pointer = (e: React.PointerEvent, phase: 'down' | 'move') => {
    if (!overlayOn) return;
    const p = toTable(e);
    const cue = cueAt(state.balls);
    const len = Math.sqrt(aim.dx * aim.dx + aim.dy * aim.dy) || 1;
    const ux = aim.dx / len,
      uy = aim.dy / len;
    // Position along the aiming line (negative is behind the ball, where the cue lies).
    const along = (p.x - cue.x) * ux + (p.y - cue.y) * uy;
    const across = Math.abs((p.x - cue.x) * uy - (p.y - cue.y) * ux);
    if (phase === 'down') {
      const near = (p.x - cue.x) ** 2 + (p.y - cue.y) ** 2 < (2.4 * R) ** 2;
      if (state.ballInHand && near) drag.current = { mode: 'cue', grip: 0 };
      else if (along < -R && along > -(R + MAX_PULL + 340) && across < 45)
        drag.current = { mode: 'pull', grip: along };
      else drag.current = { mode: 'aim', grip: 0 };
      canvas.current!.setPointerCapture(e.pointerId);
    }
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'cue') {
      const maxX = state.kitchen ? HEAD_STRING : W - R;
      setPlace({
        x: Math.min(maxX, Math.max(R, p.x)),
        y: Math.min(H - R, Math.max(R, p.y)),
      });
    } else if (d.mode === 'pull') {
      // Drawing the cue further back means a harder shot.
      setPull(Math.min(1, Math.max(0, (d.grip - along) / MAX_PULL)));
    } else if ((p.x - cue.x) ** 2 + (p.y - cue.y) ** 2 > 4) {
      setAim({ dx: p.x - cue.x, dy: p.y - cue.y });
    }
  };
  const release = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode !== 'pull') return;
    const power = pull ?? 0;
    setPull(null);
    strike(power);
  };
  const turnAim = (degrees: number) => {
    const a = (degrees * Math.PI) / 180;
    setAim(({ dx, dy }) => ({
      dx: dx * Math.cos(a) - dy * Math.sin(a),
      dy: dx * Math.sin(a) + dy * Math.cos(a),
    }));
  };
  const keys = (e: React.KeyboardEvent) => {
    if (!overlayOn) return;
    const fine = e.shiftKey ? 0.2 : 1;
    if (e.key === 'ArrowLeft') turnAim(-fine);
    else if (e.key === 'ArrowRight') turnAim(fine);
    else if (e.key === 'ArrowUp') setKeyPower((v) => Math.min(100, v + 5));
    else if (e.key === 'ArrowDown') setKeyPower((v) => Math.max(5, v - 5));
    else if (e.key === 'Enter' || e.key === ' ') strike(keyPower / 100);
    else return;
    e.preventDefault();
  };

  const remaining = useMemo(
    () =>
      state.balls
        .filter((b) => b.on && (carom || b.n !== 0))
        .map((b) => b.n)
        .join(', '),
    [state.balls, carom],
  );

  return (
    <div className="bi-table-wrap" ref={wrap}>
      <div className="bi-canvas-box" style={{ width: layout.width, height: layout.height }}>
        <canvas
          ref={canvas}
          className={'bi-canvas' + (overlayOn ? ' active' : '')}
          width={Math.round(layout.width * (window.devicePixelRatio || 1))}
          height={Math.round(layout.height * (window.devicePixelRatio || 1))}
          style={{ width: layout.width, height: layout.height }}
          role="application"
          tabIndex={overlayOn ? 0 : -1}
          aria-label={
            (carom
              ? 'Bàn bi-a phăng với bi trắng, vàng và đỏ.'
              : `Bàn bi-a, còn bi ${remaining}.`) +
            (overlayOn
              ? ` Mũi tên trái, phải để ngắm; lên, xuống chọn lực (${keyPower}%); Enter để đánh.`
              : '')
          }
          onKeyDown={keys}
          onPointerDown={(e) => pointer(e, 'down')}
          onPointerMove={(e) => pointer(e, 'move')}
          onPointerUp={release}
          onPointerCancel={() => {
            drag.current = null;
            setPull(null);
          }}
        />
        {pull !== null && (
          <span className="bi-pull" role="status">
            Lực {Math.round(pull * 100)}%
          </span>
        )}
      </div>
      {canShoot && (
        <div className="bi-controls" aria-label="Điều khiển cú đánh" role="group">
          <div className="bi-row">
            <Button
              variant="ghost"
              aria-label="Xoay hướng ngắm sang trái"
              onClick={() => turnAim(-0.4)}
              disabled={running}
            >
              <RotateCcw size={16} />
            </Button>
            <Button
              variant="ghost"
              aria-label="Xoay hướng ngắm sang phải"
              onClick={() => turnAim(0.4)}
              disabled={running}
            >
              <RotateCw size={16} />
            </Button>
            <SpinPicker spin={spin} onChange={setSpin} disabled={running} carom={carom} />
            <p className="muted bi-hint">
              {state.ballInHand
                ? 'Kéo bi trắng để đặt. Kéo trên bàn để ngắm, nắm cây cơ kéo ra sau rồi thả để đánh.'
                : 'Kéo trên bàn để ngắm. Nắm cây cơ kéo ra sau, càng xa càng mạnh, rồi thả tay để đánh.'}
            </p>
          </div>
          {!placeOk && <p className="bi-warning">Không đặt bi cái ở đó được.</p>}
        </div>
      )}
    </div>
  );
}

const spinText = (spin: Spin) => {
  const parts: string[] = [];
  if (spin.y > 0.05) parts.push(`lên ${Math.round(spin.y * 100)}%`);
  if (spin.y < -0.05) parts.push(`về ${Math.round(-spin.y * 100)}%`);
  if (spin.x > 0.05) parts.push(`phải ${Math.round(spin.x * 100)}%`);
  if (spin.x < -0.05) parts.push(`trái ${Math.round(-spin.x * 100)}%`);
  return parts.length ? `Xoáy ${parts.join(', ')}` : 'Không xoáy';
};

/** Where the cue tip strikes the cue ball: top for follow, bottom for draw, sides for english. */
function SpinPicker({
  spin,
  onChange,
  disabled,
  carom,
}: {
  spin: Spin;
  onChange: (spin: Spin) => void;
  disabled: boolean;
  carom: boolean;
}) {
  const ball = useRef<HTMLDivElement>(null);
  const set = (e: React.PointerEvent) => {
    const r = ball.current!.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * 2 - 1,
      y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const len = Math.sqrt(x * x + y * y);
    // The tip has to stay on the ball.
    if (len > 0.85) {
      x = (x / len) * 0.85;
      y = (y / len) * 0.85;
    }
    onChange({ x: x / 0.85, y: y / 0.85 });
  };
  const step = (dx: number, dy: number) => {
    const x = Math.max(-1, Math.min(1, spin.x + dx)),
      y = Math.max(-1, Math.min(1, spin.y + dy));
    const len = Math.sqrt(x * x + y * y);
    onChange(len > 1 ? { x: x / len, y: y / len } : { x, y });
  };
  return (
    <div className="bi-spin">
      <div
        ref={ball}
        className={'bi-spin-ball' + (carom ? ' carom' : '')}
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Điểm chạm cơ. ${spinText(spin)}. Dùng phím mũi tên để chỉnh, số 0 để bỏ xoáy.`}
        aria-disabled={disabled}
        onPointerDown={(e) => {
          if (disabled) return;
          ball.current!.setPointerCapture(e.pointerId);
          set(e);
        }}
        onPointerMove={(e) => {
          if (!disabled && e.buttons) set(e);
        }}
        onDoubleClick={() => onChange({ x: 0, y: 0 })}
        onKeyDown={(e) => {
          if (disabled) return;
          const moves: Record<string, [number, number]> = {
            ArrowUp: [0, 0.1],
            ArrowDown: [0, -0.1],
            ArrowLeft: [-0.1, 0],
            ArrowRight: [0.1, 0],
          };
          if (moves[e.key]) step(...moves[e.key]);
          else if (e.key === '0') onChange({ x: 0, y: 0 });
          else return;
          e.preventDefault();
        }}
      >
        <i
          className="bi-spin-dot"
          style={{ left: `${50 + spin.x * 42.5}%`, top: `${50 - spin.y * 42.5}%` }}
        />
      </div>
      <small aria-hidden="true">{spinText(spin)}</small>
    </div>
  );
}

function sound(e: SimEvent) {
  if (e.kind === 'pocket') playTableSound('pocket');
  else if (e.kind === 'hit') playTableSound('ball', e.speed / 1800);
  else if (e.speed > 120) playTableSound('rail', e.speed / 2200);
}

// ---------------------------------------------------------------- canvas painting (table units)

function drawTable(ctx: CanvasRenderingContext2D, carom: boolean, kitchen: boolean) {
  // Wooden rails.
  const wood = ctx.createLinearGradient(-RAIL, -RAIL, W + RAIL, H + RAIL);
  wood.addColorStop(0, '#6b3a17');
  wood.addColorStop(0.5, '#8a4f22');
  wood.addColorStop(1, '#5a2f12');
  ctx.fillStyle = wood;
  roundRect(ctx, -RAIL, -RAIL, W + 2 * RAIL, H + 2 * RAIL, 22);
  ctx.fill();
  // Cushions, a darker cloth strip inside the wood.
  ctx.fillStyle = carom ? '#174a85' : '#145c37';
  ctx.fillRect(-14, -14, W + 28, H + 28);
  // Cloth with a soft light over the middle.
  const cloth = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.65);
  cloth.addColorStop(0, carom ? '#2f78c4' : '#2a9a5c');
  cloth.addColorStop(1, carom ? '#1d5aa0' : '#1c7444');
  ctx.fillStyle = cloth;
  ctx.fillRect(0, 0, W, H);
  // Diamonds on the rails.
  ctx.fillStyle = '#f3e3c3';
  for (let i = 1; i < 8; i++) {
    if (i === 4 && !carom) continue;
    for (const y of [-29, H + 29]) diamond(ctx, (W * i) / 8, y);
  }
  for (let i = 1; i < 4; i++) for (const x of [-29, W + 29]) diamond(ctx, x, (H * i) / 4);
  // Head string and spots.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (const x of [W / 4, (W * 3) / 4]) {
    ctx.beginPath();
    ctx.arc(x, H / 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (kitchen) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(HEAD_STRING, 0);
    ctx.lineTo(HEAD_STRING, H);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (carom) return;
  for (const p of POCKETS) {
    const side = p.x === W / 2;
    const cx = side ? p.x : p.x === 0 ? -5 : W + 5,
      cy = p.y <= 0 ? (side ? -12 : -5) : side ? H + 12 : H + 5;
    const hole = ctx.createRadialGradient(cx, cy, 4, cx, cy, side ? 20 : 24);
    hole.addColorStop(0, '#000');
    hole.addColorStop(1, '#1b1b1b');
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(cx, cy, side ? 20 : 24, 0, Math.PI * 2);
    ctx.fill();
  }
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x + 3, y);
  ctx.lineTo(x, y + 4);
  ctx.lineTo(x - 3, y);
  ctx.closePath();
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawShadow(ctx: CanvasRenderingContext2D, b: Ball) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(b.x + 3, b.y + 4, R, R * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBall(ctx: CanvasRenderingContext2D, b: Ball, carom: boolean, vertical: boolean) {
  const color = carom ? CAROM_COLORS[b.n] : b.n === 0 ? '#f8f6ee' : COLORS[b.n > 8 ? b.n - 8 : b.n];
  const stripe = !carom && b.n > 8;
  ctx.save();
  ctx.beginPath();
  ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = stripe ? '#f8f6ee' : color;
  ctx.fillRect(b.x - R, b.y - R, 2 * R, 2 * R);
  if (stripe) {
    ctx.fillStyle = color;
    // The stripe runs across the screen whichever way the table is turned.
    if (vertical) ctx.fillRect(b.x - R * 0.55, b.y - R, R * 1.1, 2 * R);
    else ctx.fillRect(b.x - R, b.y - R * 0.55, 2 * R, R * 1.1);
  }
  if (!carom && b.n > 0) {
    ctx.fillStyle = '#fbfaf5';
    ctx.beginPath();
    ctx.arc(b.x, b.y, R * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(b.x, b.y);
    if (vertical) ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#111';
    ctx.font = `700 ${R * 0.62}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.n), 0, 0.5);
    ctx.restore();
  }
  // Light from the top left, darker edge: a glossy sphere.
  const shade = ctx.createRadialGradient(
    b.x - R * 0.35,
    b.y - R * 0.4,
    R * 0.1,
    b.x,
    b.y,
    R * 1.05,
  );
  shade.addColorStop(0, 'rgba(255,255,255,0.75)');
  shade.addColorStop(0.25, 'rgba(255,255,255,0.08)');
  shade.addColorStop(0.75, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = shade;
  ctx.fillRect(b.x - R, b.y - R, 2 * R, 2 * R);
  ctx.restore();
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  balls: Ball[],
  cue: Ball,
  aim: { dx: number; dy: number },
  /** How far the cue is drawn back behind the ball, in table units. */
  pulled: number,
  guide: boolean,
) {
  const len = Math.sqrt(aim.dx * aim.dx + aim.dy * aim.dy) || 1;
  const ux = aim.dx / len,
    uy = aim.dy / len;
  ctx.save();
  if (guide) aimGuide(ctx, balls, cue, ux, uy);
  // The cue stick, further back the harder the shot will be.
  const back = R + 4 + pulled;
  const sx = cue.x - ux * back,
    sy = cue.y - uy * back;
  const ex = sx - ux * 320,
    ey = sy - uy * 320;
  const stick = ctx.createLinearGradient(sx, sy, ex, ey);
  stick.addColorStop(0, '#e9e4d8');
  stick.addColorStop(0.04, '#3a6fd1');
  stick.addColorStop(0.06, '#e8c78f');
  stick.addColorStop(0.7, '#b07a3c');
  stick.addColorStop(1, '#2b1708');
  ctx.strokeStyle = stick;
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.restore();
}

/** The dashed line to the first ball, the ghost ball, and where both balls go after contact. */
function aimGuide(ctx: CanvasRenderingContext2D, balls: Ball[], cue: Ball, ux: number, uy: number) {
  const hit = firstContact(balls, cue.n, ux, uy);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(cue.x + ux * R, cue.y + uy * R);
  ctx.lineTo(hit.x, hit.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // Ghost ball where the cue ball will be at contact.
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(hit.x, hit.y, R, 0, Math.PI * 2);
  ctx.stroke();
  if (hit.ball) {
    const nx = hit.ball.x - hit.x,
      ny = hit.ball.y - hit.y;
    const nl = Math.sqrt(nx * nx + ny * ny) || 1;
    // Where the object ball goes.
    ctx.strokeStyle = 'rgba(255,230,120,0.95)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(hit.ball.x, hit.ball.y);
    ctx.lineTo(hit.ball.x + (nx / nl) * 90, hit.ball.y + (ny / nl) * 90);
    ctx.stroke();
    // Where the cue ball glances off.
    const dot = ux * (nx / nl) + uy * (ny / nl);
    const tx = ux - (nx / nl) * dot,
      ty = uy - (ny / nl) * dot;
    const tl = Math.sqrt(tx * tx + ty * ty);
    if (tl > 0.05) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hit.x, hit.y);
      ctx.lineTo(hit.x + (tx / tl) * 55 * tl, hit.y + (ty / tl) * 55 * tl);
      ctx.stroke();
    }
  }
}
