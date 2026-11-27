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
import {
  RAIL,
  lightFor,
  paintBall,
  paintCue,
  paintKitchen,
  paintShadow,
  paintTable,
} from './tablePaint';

/** Timing of someone else's shot on screen, in ms: their cue lines up, draws back, strikes. */
const LINE_UP = 550;
const DRAW_BACK = 450;
const THRUST = 90;
/** How far the cue can be drawn back, in table units: the full pull is full power. */
const MAX_PULL = 170;
/** Room kept on screen for the players bar and the controls around the table. */
const RESERVE = 210;

type Place = { x: number; y: number };
/** A shot to play on screen. `remote` shots (the computer's or the opponent's) are lined up first. */
type Job = { start: Ball[]; cue: number; shot: Shot; by: Side; remote: boolean };
/** The cue drawn without the aiming guide, `back` units behind the ball. */
type Stick = { cue: number; dx: number; dy: number; back: number };
export type Playing = { by: Side; remote: boolean } | null;
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
  /** The shot being played on screen, or null when the table is still. */
  onAnimating: (playing: Playing) => void;
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
  const cache = useRef<{ key: string; sheet: HTMLCanvasElement } | null>(null);
  const draw = useCallback(
    (balls: Ball[], overlay: boolean, stick?: Stick) => {
      const el = canvas.current;
      if (!el || !layout.width) return;
      const dpr = window.devicePixelRatio || 1;
      const ctx = el.getContext('2d')!;
      const k = layout.scale * dpr;
      const orient = (c: CanvasRenderingContext2D) => {
        if (layout.vertical) c.setTransform(0, -k, k, 0, k * RAIL, k * (RAIL + W));
        else c.setTransform(k, 0, 0, k, k * RAIL, k * RAIL);
      };
      // The table itself never changes during play: paint it once per size and reuse it.
      const key = `${el.width}x${el.height}|${layout.vertical}|${carom}`;
      if (cache.current?.key !== key) {
        const sheet = document.createElement('canvas');
        sheet.width = el.width;
        sheet.height = el.height;
        const c = sheet.getContext('2d')!;
        orient(c);
        paintTable(c, carom);
        cache.current = { key, sheet };
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(cache.current.sheet, 0, 0);
      orient(ctx);
      const light = lightFor(layout.vertical);
      if (latest.current.kitchen && overlay) paintKitchen(ctx);
      for (const b of balls) if (b.on) paintShadow(ctx, b, light);
      for (const b of balls) if (b.on) paintBall(ctx, b, carom, layout.vertical);
      if (stick) {
        const ball = balls.find((b) => b.n === stick.cue);
        if (ball) drawAim(ctx, balls, ball, stick, stick.back, false, light);
        return;
      }
      if (!overlay) return;
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
      drawAim(ctx, withPlace(balls), cue, aim, (pull ?? 0) * MAX_PULL, true, light);
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
      onAnimating(null);
      drawRef.current(shown.current, overlayRef.current);
      return;
    }
    busy.current = true;
    setRunning(true);
    onAnimating({ by: job.by, remote: job.remote });
    const result = simulate(job.start, job.cue, job.shot, carom ? [] : POCKETS, 8);
    const frames = result.frames!;
    const events = result.events.slice();
    const roll = () => {
      playTableSound('cue', job.shot.power);
      const t0 = performance.now();
      requestAnimationFrame(function frame() {
        const t = (performance.now() - t0) / 1000;
        while (events.length && events[0].t <= t) sound(events.shift()!);
        const f = frames[Math.min(frames.length - 1, Math.floor(t * 60))];
        drawRef.current(
          job.start.map((b, i) => ({
            n: b.n,
            x: f[i * 3],
            y: f[i * 3 + 1],
            on: f[i * 3 + 2] === 1,
          })),
          false,
        );
        if (t * 60 < frames.length) requestAnimationFrame(frame);
        else {
          busy.current = false;
          run();
        }
      });
    };
    // Our own cue already struck on screen. Anyone else's shot is shown as it would be seen at the
    // table: a pause, their cue lining up, drawing back and striking, then the balls roll.
    if (!job.remote) return roll();
    const t0 = performance.now(),
      pullTo = job.shot.power * MAX_PULL;
    requestAnimationFrame(function line() {
      const t = performance.now() - t0;
      if (t >= LINE_UP + DRAW_BACK + THRUST) return roll();
      const back =
        t < LINE_UP
          ? 0
          : t < LINE_UP + DRAW_BACK
            ? pullTo * Math.sin((((t - LINE_UP) / DRAW_BACK) * Math.PI) / 2)
            : pullTo * (1 - ((t - LINE_UP - DRAW_BACK) / THRUST) ** 2);
      drawRef.current(job.start, false, { cue: job.cue, dx: job.shot.dx, dy: job.shot.dy, back });
      requestAnimationFrame(line);
    });
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
        by: s.by,
        remote: true,
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
      drawRef.current(start, false, {
        cue: cueN,
        dx: shot.dx,
        dy: shot.dy,
        back: from * (1 - t * t),
      });
      if (t < 1) {
        requestAnimationFrame(thrust);
        return;
      }
      local.current = state.seq + 1;
      queue.current.push({ start, cue: cueN, shot, by: side!, remote: false });
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
      {canShoot && !running && (
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

function drawAim(
  ctx: CanvasRenderingContext2D,
  balls: Ball[],
  cue: Ball,
  aim: { dx: number; dy: number },
  /** How far the cue is drawn back behind the ball, in table units. */
  pulled: number,
  guide: boolean,
  light: { x: number; y: number },
) {
  const len = Math.sqrt(aim.dx * aim.dx + aim.dy * aim.dy) || 1;
  const ux = aim.dx / len,
    uy = aim.dy / len;
  ctx.save();
  if (guide) aimGuide(ctx, balls, cue, ux, uy);
  paintCue(ctx, cue, ux, uy, pulled, light);
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
