// Bi-a physics, shared by the Worker (which decides every shot) and the browser (which replays
// the same shot to animate it). Only + - * / and sqrt are used, so every JavaScript engine computes
// exactly the same result from the same input.
//
// The table is 1000 × 500 units seen from above; x grows to the right (foot of the table), y down.

export const W = 1000;
export const H = 500;
export const R = 11.25;
/** Simulation step in seconds. Small enough that a ball never skips past another. */
export const DT = 1 / 480;
const MAX_SPEED = 3300;
const ROLL = 80; // constant rolling deceleration, units/s²
const DRAG = 0.4; // speed-proportional slowing, 1/s
const BALL_E = 0.94; // ball-on-ball restitution
const RAIL_E = 0.76; // cushion restitution
const STOP = 4;
const MAX_STEPS = 480 * 25;

export type Ball = { n: number; x: number; y: number; on: boolean };
export type Shot = { dx: number; dy: number; power: number };
export type Pocket = { x: number; y: number; r: number };

/** Corner and side pockets of a pool table; carom tables have none. */
export const POCKETS: Pocket[] = [
  { x: 0, y: 0, r: 26 },
  { x: W / 2, y: -4, r: 22 },
  { x: W, y: 0, r: 26 },
  { x: 0, y: H, r: 26 },
  { x: W / 2, y: H + 4, r: 22 },
  { x: W, y: H, r: 26 },
];

export type SimEvent =
  | { t: number; kind: 'hit'; a: number; b: number; speed: number }
  | { t: number; kind: 'rail'; n: number; speed: number }
  | { t: number; kind: 'pocket'; n: number };

export type SimResult = {
  balls: Ball[];
  events: SimEvent[];
  /** Ball the cue ball touched first, or null. */
  firstHit: number | null;
  /** Balls pocketed, in order. */
  pocketed: number[];
  /** Some ball reached a cushion after the cue ball's first contact. */
  railAfterHit: boolean;
  /** Distinct balls the cue ball touched, in order (for carom). */
  cueTouched: number[];
  /** Positions every `every` steps, for animation; present only when asked for. */
  frames?: Float32Array[];
  duration: number;
};

/** The shot direction as a unit vector, rounded so client and server agree on the input. */
export function normalShot(dx: number, dy: number, power: number): Shot {
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    dx: round(dx / len),
    dy: round(dy / len),
    power: Math.min(1, Math.max(0.02, round(power))),
  };
}

/**
 * Plays one shot of the cue ball `cue` until every ball stops.
 * `pockets` is empty for carom. `record` keeps a frame every `record` steps (8 ≈ 60 fps).
 */
export function simulate(
  start: Ball[],
  cue: number,
  shot: Shot,
  pockets: Pocket[],
  record = 0,
): SimResult {
  const n = start.length;
  const x = new Float64Array(n),
    y = new Float64Array(n),
    vx = new Float64Array(n),
    vy = new Float64Array(n);
  const on = start.map((b) => b.on);
  start.forEach((b, i) => {
    x[i] = b.x;
    y[i] = b.y;
  });
  const ci = start.findIndex((b) => b.n === cue);
  const s = normalShot(shot.dx, shot.dy, shot.power);
  // Power feels better on a curve: fine control for soft shots, still room for a hard break.
  const speed = MAX_SPEED * (0.08 + 0.92 * s.power * s.power);
  vx[ci] = s.dx * speed;
  vy[ci] = s.dy * speed;

  const events: SimEvent[] = [];
  const pocketed: number[] = [];
  const cueTouched: number[] = [];
  let firstHit: number | null = null;
  let railAfterHit = false;
  const frames: Float32Array[] = [];
  const snap = () => {
    const f = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      f[i * 3] = x[i];
      f[i * 3 + 1] = y[i];
      f[i * 3 + 2] = on[i] ? 1 : 0;
    }
    frames.push(f);
  };
  if (record) snap();
  const D = 2 * R,
    D2 = D * D;
  let step = 0;
  for (; step < MAX_STEPS; step++) {
    const t = step * DT;
    let moving = false;
    for (let i = 0; i < n; i++) {
      if (!on[i]) continue;
      const sp2 = vx[i] * vx[i] + vy[i] * vy[i];
      if (sp2 === 0) continue;
      const sp = Math.sqrt(sp2);
      const next = sp - (ROLL + DRAG * sp) * DT;
      if (next <= STOP) {
        vx[i] = 0;
        vy[i] = 0;
        continue;
      }
      moving = true;
      const k = next / sp;
      vx[i] *= k;
      vy[i] *= k;
      x[i] += vx[i] * DT;
      y[i] += vy[i] * DT;
      // Pockets swallow a ball whose centre enters the mouth.
      let sunk = false;
      for (const p of pockets) {
        const px = x[i] - p.x,
          py = y[i] - p.y;
        if (px * px + py * py < p.r * p.r) {
          on[i] = false;
          vx[i] = 0;
          vy[i] = 0;
          pocketed.push(start[i].n);
          events.push({ t, kind: 'pocket', n: start[i].n });
          sunk = true;
          break;
        }
      }
      if (sunk) continue;
      // Cushions.
      let rail = 0;
      if (x[i] < R) {
        x[i] = R + (R - x[i]);
        rail = Math.abs(vx[i]);
        vx[i] = -vx[i] * RAIL_E;
        vy[i] *= 0.96;
      } else if (x[i] > W - R) {
        x[i] = W - R - (x[i] - (W - R));
        rail = Math.abs(vx[i]);
        vx[i] = -vx[i] * RAIL_E;
        vy[i] *= 0.96;
      }
      if (y[i] < R) {
        y[i] = R + (R - y[i]);
        rail = Math.max(rail, Math.abs(vy[i]));
        vy[i] = -vy[i] * RAIL_E;
        vx[i] *= 0.96;
      } else if (y[i] > H - R) {
        y[i] = H - R - (y[i] - (H - R));
        rail = Math.max(rail, Math.abs(vy[i]));
        vy[i] = -vy[i] * RAIL_E;
        vx[i] *= 0.96;
      }
      if (rail) {
        events.push({ t, kind: 'rail', n: start[i].n, speed: rail });
        if (firstHit !== null) railAfterHit = true;
      }
    }
    // Ball-on-ball collisions between equal masses.
    for (let i = 0; i < n; i++) {
      if (!on[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!on[j]) continue;
        if (vx[i] === 0 && vy[i] === 0 && vx[j] === 0 && vy[j] === 0) continue;
        const ddx = x[j] - x[i],
          ddy = y[j] - y[i];
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= D2 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = ddx / d,
          ny = ddy / d;
        const rel = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
        // Separate overlapping balls evenly.
        const push = (D - d) / 2;
        x[i] -= nx * push;
        y[i] -= ny * push;
        x[j] += nx * push;
        y[j] += ny * push;
        if (rel <= 0) continue;
        const jmp = ((1 + BALL_E) / 2) * rel;
        vx[i] -= jmp * nx;
        vy[i] -= jmp * ny;
        vx[j] += jmp * nx;
        vy[j] += jmp * ny;
        moving = true;
        events.push({ t, kind: 'hit', a: start[i].n, b: start[j].n, speed: rel });
        const other = i === ci ? j : j === ci ? i : -1;
        if (other >= 0) {
          if (firstHit === null) firstHit = start[other].n;
          if (!cueTouched.includes(start[other].n)) cueTouched.push(start[other].n);
        }
      }
    }
    if (record && step % record === 0) snap();
    if (!moving) break;
  }
  if (record) snap();
  return {
    balls: start.map((b, i) => ({
      n: b.n,
      x: Math.round(x[i] * 100) / 100,
      y: Math.round(y[i] * 100) / 100,
      on: on[i],
    })),
    events,
    firstHit,
    pocketed,
    railAfterHit,
    cueTouched,
    frames: record ? frames : undefined,
    duration: step * DT,
  };
}

/** Whether a ball of radius R fits at (x, y) on the cloth without touching another ball. */
export function freeSpot(balls: Ball[], x: number, y: number, ignore = -1) {
  if (x < R || x > W - R || y < R || y > H - R) return false;
  return balls.every(
    (b) => !b.on || b.n === ignore || (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) >= 4 * R * R,
  );
}

/**
 * Where the cue ball first meets another ball (or a cushion) along a direction: for the aiming
 * guide. Returns the cue's centre at contact and the ball it meets, if any.
 */
export function firstContact(balls: Ball[], cue: number, dx: number, dy: number) {
  const c = balls.find((b) => b.n === cue)!;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len,
    uy = dy / len;
  let best = Infinity,
    target: Ball | null = null;
  for (const b of balls) {
    if (!b.on || b.n === cue) continue;
    // Ray against a circle of radius 2R around the other ball.
    const ox = b.x - c.x,
      oy = b.y - c.y;
    const along = ox * ux + oy * uy;
    if (along <= 0) continue;
    const perp2 = ox * ox + oy * oy - along * along;
    const reach = 4 * R * R - perp2;
    if (reach < 0) continue;
    const t = along - Math.sqrt(reach);
    if (t < best) {
      best = t;
      target = b;
    }
  }
  // Distance to the cushions.
  const wall = Math.min(
    ux > 0 ? (W - R - c.x) / ux : ux < 0 ? (R - c.x) / ux : Infinity,
    uy > 0 ? (H - R - c.y) / uy : uy < 0 ? (R - c.y) / uy : Infinity,
  );
  if (wall < best) {
    best = wall;
    target = null;
  }
  return { x: c.x + ux * best, y: c.y + uy * best, ball: target };
}
