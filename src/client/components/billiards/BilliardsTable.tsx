import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, RotateCw, Target } from 'lucide-react';
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
} from '../../../shared/billiards/physics';
import { playTableSound } from '../../lib/billiards-sound';
import { Button } from '../ui';

const RAIL = 44;
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
  const [power, setPower] = useState(55);
  const [place, setPlace] = useState<Place | null>(null);
  const [running, setRunning] = useState(false);

  // ---------------------------------------------------------------- layout
  useEffect(() => {
    const box = wrap.current;
    if (!box) return;
    const fit = () => {
      const width = box.clientWidth;
      // Narrow screens turn the table upright so the balls stay a usable size.
      const vertical = width < 600;
      const scale = width / (vertical ? H + 2 * RAIL : W + 2 * RAIL);
      const height = (vertical ? W + 2 * RAIL : H + 2 * RAIL) * scale;
      setLayout({ width, height, scale, vertical });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
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
      if (!overlay) return;
      const cue = cueAt(balls);
      if (latest.current.ballInHand && place !== undefined) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = placeOk ? 'rgba(255,255,255,0.85)' : '#ff5a4f';
        ctx.beginPath();
        ctx.arc(cue.x, cue.y, R + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      drawAim(ctx, withPlace(balls), cue, aim, power / 100);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, carom, aim, power, place, placeOk],
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
        shot: { dx: s.dx, dy: s.dy, power: s.power },
      });
    if (!busy.current) run();
  }, [state.seq, state.shots, state.balls, run]);

  // Each new turn starts aimed at a legal ball, and with the cue ball where it lies.
  const turnKey = `${state.version}|${state.turn}|${state.status}`;
  useEffect(() => {
    setPlace(null);
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

  // ---------------------------------------------------------------- input
  const toTable = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / layout.scale,
      sy = (e.clientY - rect.top) / layout.scale;
    return layout.vertical ? { x: RAIL + W - sy, y: sx - RAIL } : { x: sx - RAIL, y: sy - RAIL };
  };
  const drag = useRef<'cue' | 'aim' | null>(null);
  const pointer = (e: React.PointerEvent, phase: 'down' | 'move') => {
    if (!overlayOn) return;
    const p = toTable(e);
    const cue = cueAt(state.balls);
    if (phase === 'down') {
      const near = (p.x - cue.x) ** 2 + (p.y - cue.y) ** 2 < (2.4 * R) ** 2;
      drag.current = state.ballInHand && near ? 'cue' : 'aim';
      canvas.current!.setPointerCapture(e.pointerId);
    }
    if (!drag.current) return;
    if (drag.current === 'cue') {
      const maxX = state.kitchen ? HEAD_STRING : W - R;
      setPlace({
        x: Math.min(maxX, Math.max(R, p.x)),
        y: Math.min(H - R, Math.max(R, p.y)),
      });
    } else if ((p.x - cue.x) ** 2 + (p.y - cue.y) ** 2 > 4) {
      setAim({ dx: p.x - cue.x, dy: p.y - cue.y });
    }
  };
  const turnAim = (degrees: number) => {
    const a = (degrees * Math.PI) / 180;
    setAim(({ dx, dy }) => ({
      dx: dx * Math.cos(a) - dy * Math.sin(a),
      dy: dx * Math.sin(a) + dy * Math.cos(a),
    }));
  };
  const strike = async () => {
    if (!overlayOn || !placeOk) return;
    const shot = normalShot(aim.dx, aim.dy, power / 100);
    const where = place && state.ballInHand ? place : null;
    // Play our own shot at once; the server's answer (and any computer reply) follows it.
    local.current = state.seq + 1;
    queue.current.push({ start: withPlace(state.balls), cue: cueN, shot });
    run();
    const ok = await onShoot(shot, where);
    if (!ok) local.current = null;
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
      <canvas
        ref={canvas}
        className={'bi-canvas' + (overlayOn ? ' active' : '')}
        width={Math.round(layout.width * (window.devicePixelRatio || 1))}
        height={Math.round(layout.height * (window.devicePixelRatio || 1))}
        style={{ width: layout.width, height: layout.height }}
        role="img"
        aria-label={
          carom ? 'Bàn bi-a phăng với bi trắng, vàng và đỏ' : `Bàn bi-a, còn bi ${remaining}`
        }
        onPointerDown={(e) => pointer(e, 'down')}
        onPointerMove={(e) => pointer(e, 'move')}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
      {canShoot && (
        <div className="bi-controls" aria-label="Điều khiển cú đánh" role="group">
          <p className="muted bi-hint">
            {state.ballInHand
              ? 'Bạn được đặt bi cái: kéo bi trắng tới chỗ muốn đặt, rồi chạm bàn để ngắm.'
              : 'Chạm hoặc kéo trên bàn để ngắm; dùng nút xoay để chỉnh tinh.'}
          </p>
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
            <label className="bi-power">
              Lực {power}%
              <input
                type="range"
                min={5}
                max={100}
                value={power}
                disabled={running}
                onChange={(e) => setPower(Number(e.target.value))}
              />
            </label>
            <Button variant="primary" onClick={() => void strike()} disabled={running || !placeOk}>
              <Target size={16} /> Đánh
            </Button>
          </div>
          {!placeOk && <p className="bi-warning">Không đặt bi cái ở đó được.</p>}
        </div>
      )}
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
  power: number,
) {
  const len = Math.sqrt(aim.dx * aim.dx + aim.dy * aim.dy) || 1;
  const ux = aim.dx / len,
    uy = aim.dy / len;
  const hit = firstContact(balls, cue.n, ux, uy);
  ctx.save();
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
  // The cue stick, drawn back further for a harder shot.
  const back = R + 6 + power * 45;
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
