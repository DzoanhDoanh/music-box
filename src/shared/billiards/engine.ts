// Bi-a table state and rules (8 bi, 9 bi, phăng) plus the computer player. The Worker runs
// every transition; PostgreSQL only stores the versioned result.
import { AppError } from '../domain';
import {
  BILLIARDS_BOT,
  BILLIARDS_SHOTS_KEPT,
  levelNames,
  type BilliardsCommand,
  type BilliardsMember,
  type BilliardsReason,
  type BilliardsSeat,
  type BilliardsState,
  type CreateBilliards,
} from './contracts';
import {
  H,
  POCKETS,
  R,
  W,
  freeSpot,
  normalShot,
  simulate,
  type Ball,
  type Shot,
  type SimResult,
} from './physics';

export type Side = 'a' | 'b';
export type Level = 1 | 2 | 3;
export type Random = { index(n: number): number };

const other = (side: Side): Side => (side === 'a' ? 'b' : 'a');
function fail(code = 'BILLIARDS_ACTION_INVALID'): never {
  throw new AppError(code, 409);
}

export const HEAD_STRING = W / 4;
const FOOT = { x: W * 0.75, y: H / 2 };
/** Carom: White belongs to the first seat, Yellow to the second; Red is shared. */
export const CAROM = { white: 0, yellow: 1, red: 2 } as const;

export const ballGroup = (n: number) => (n === 8 ? 'EIGHT' : n < 8 ? 'SOLID' : 'STRIPE');
export const groupNames = { SOLID: 'bi trơn (1–7)', STRIPE: 'bi sọc (9–15)' } as const;

// ---------------------------------------------------------------- racks

/** Balls of a fresh rack. Pool racks are shuffled with the server's random source. */
export function rack(mode: BilliardsState['mode'], random: Random): Ball[] {
  if (mode === 'CAROM')
    return [
      { n: CAROM.white, x: HEAD_STRING, y: H / 2 + 75, on: true },
      { n: CAROM.yellow, x: HEAD_STRING, y: H / 2, on: true },
      { n: CAROM.red, x: FOOT.x, y: FOOT.y, on: true },
    ];
  const dx = R * 1.7325 + 0.1,
    dy = 2 * R + 0.1;
  const spots: { x: number; y: number }[] = [];
  const rows = mode === 'EIGHT' ? [1, 2, 3, 4, 5] : [1, 2, 3, 2, 1];
  rows.forEach((count, row) => {
    for (let k = 0; k < count; k++)
      spots.push({ x: FOOT.x + row * dx, y: FOOT.y + (k - (count - 1) / 2) * dy });
  });
  let order: number[];
  if (mode === 'EIGHT') {
    // Ball 1 at the apex, the 8 in the middle of the third row, the rest shuffled.
    const rest = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
    for (let i = rest.length - 1; i > 0; i--) {
      const j = random.index(i + 1);
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    order = [1, rest[0], rest[1], rest[2], 8, ...rest.slice(3)];
  } else {
    // Ball 1 at the front, the 9 in the middle.
    const rest = [2, 3, 4, 5, 6, 7, 8];
    for (let i = rest.length - 1; i > 0; i--) {
      const j = random.index(i + 1);
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    order = [1, rest[0], rest[1], rest[2], 9, rest[3], rest[4], rest[5], rest[6]];
  }
  return [
    { n: 0, x: HEAD_STRING, y: H / 2, on: true },
    ...order.map((n, i) => ({ n, x: spots[i].x, y: spots[i].y, on: true })),
  ];
}

/** A free spot on the long axis from the foot spot toward the foot cushion (for respotting). */
function footSpot(balls: Ball[], n: number) {
  for (let x = FOOT.x; x < W - R; x += 1)
    if (freeSpot(balls, x, FOOT.y, n)) return { x, y: FOOT.y };
  for (let x = FOOT.x; x > R; x -= 1) if (freeSpot(balls, x, FOOT.y, n)) return { x, y: FOOT.y };
  return { x: FOOT.x, y: FOOT.y };
}
/** Puts a pocketed cue ball back so it has a position until the next shooter places it. */
function restoreCue(balls: Ball[]) {
  const cue = balls.find((b) => b.n === 0)!;
  if (cue.on) return;
  cue.on = true;
  for (let x = HEAD_STRING; x > R; x -= 2)
    if (freeSpot(balls, x, H / 2, 0)) {
      cue.x = x;
      cue.y = H / 2;
      return;
    }
}

// ---------------------------------------------------------------- state

export const botSeat = (level: Level): BilliardsSeat => ({
  id: BILLIARDS_BOT,
  name: `Máy · ${levelNames[level]}`,
  bot: true,
  level,
});
const humanSeat = (id: string, name: string): BilliardsSeat => ({ id, name, bot: false });
export const seatOf = (s: BilliardsState, actor: string): Side | null =>
  s.seats.a?.id === actor && !s.seats.a.bot
    ? 'a'
    : s.seats.b?.id === actor && !s.seats.b.bot
      ? 'b'
      : null;
const humans = (s: BilliardsState) =>
  (['a', 'b'] as const).flatMap((side) => {
    const seat = s.seats[side];
    return seat && !seat.bot ? [seat] : [];
  });
/** The ball `side` strikes. */
export const cueOf = (s: Pick<BilliardsState, 'mode'>, side: Side) =>
  s.mode === 'CAROM' ? (side === 'a' ? CAROM.white : CAROM.yellow) : 0;

export function createBilliardsState(
  id: string,
  room: string,
  actor: string,
  actorName: string,
  command: CreateBilliards,
  now: number,
  random: Random,
): BilliardsState {
  const s: BilliardsState = {
    schema: 1,
    id,
    room,
    host: actor,
    name: command.name.trim(),
    version: 0,
    status: 'WAITING',
    mode: command.mode,
    target: command.mode === 'CAROM' ? command.target : 1,
    seats: { a: humanSeat(actor, actorName), b: null },
    turn: 'a',
    breaker: 'a',
    balls: rack(command.mode, random),
    groups: { a: null, b: null },
    ballInHand: command.mode !== 'CAROM',
    kitchen: command.mode !== 'CAROM',
    opening: true,
    points: { a: 0, b: 0 },
    shots: [],
    seq: 0,
    result: null,
    note: null,
    score: {},
    updatedAt: now,
  };
  if (command.bot) {
    s.seats.b = botSeat(command.bot);
    start(s, random);
  }
  return s;
}

function start(s: BilliardsState, random: Random) {
  s.status = 'PLAYING';
  s.balls = rack(s.mode, random);
  s.turn = s.breaker;
  s.groups = { a: null, b: null };
  s.ballInHand = s.mode !== 'CAROM';
  s.kitchen = s.mode !== 'CAROM';
  s.opening = true;
  s.points = { a: 0, b: 0 };
  s.result = null;
  s.note = null;
  botTurn(s, random);
}

function reopen(s: BilliardsState) {
  s.status = humans(s).length ? 'WAITING' : 'CANCELLED';
  s.result = null;
  const first = humans(s)[0];
  if (first && seatOf(s, s.host) === null) s.host = first.id;
}

function finish(s: BilliardsState, winner: Side | null, reason: BilliardsReason) {
  s.status = 'FINISHED';
  s.result = { winner, reason };
  s.ballInHand = false;
  const seat = winner ? s.seats[winner] : null;
  if (seat) s.score[seat.id] = (s.score[seat.id] ?? 0) + 1;
}

// ---------------------------------------------------------------- rules

export type Verdict = {
  foul: string | null;
  /** The shooter keeps the table. */
  again: boolean;
  win: boolean;
  lose: boolean;
  /** Balls of the shooter's own group (or any, on an open table) that went down. */
  potted: number[];
  groups?: BilliardsState['groups'];
  point?: boolean;
  respot: number[];
};

/** Judges a finished shot by `side` from the table as it was before the shot. */
export function judge(s: BilliardsState, side: Side, r: SimResult): Verdict {
  const verdict: Verdict = {
    foul: null,
    again: false,
    win: false,
    lose: false,
    potted: [],
    respot: [],
  };
  if (s.mode === 'CAROM') {
    const mine = cueOf(s, side);
    const others = [0, 1, 2].filter((n) => n !== mine);
    verdict.point = others.every((n) => r.cueTouched.includes(n));
    verdict.again = verdict.point;
    verdict.win = verdict.point && s.points[side] + 1 >= s.target;
    return verdict;
  }
  const objects = r.pocketed.filter((n) => n !== 0);
  const scratch = r.pocketed.includes(0);
  const before = (n: number) => s.balls.find((b) => b.n === n)?.on;
  if (scratch) verdict.foul = 'bi cái rơi lỗ';
  else if (r.firstHit === null) verdict.foul = 'bi cái không chạm bi nào';

  if (s.mode === 'NINE') {
    const lowest = Math.min(...s.balls.filter((b) => b.on && b.n > 0).map((b) => b.n));
    if (!verdict.foul && r.firstHit !== lowest) verdict.foul = `chưa chạm bi ${lowest} trước`;
    if (!verdict.foul && !objects.length && !r.railAfterHit)
      verdict.foul = 'không bi nào chạm băng';
    if (objects.includes(9)) {
      if (verdict.foul) verdict.respot.push(9);
      else verdict.win = true;
    }
    verdict.potted = objects.filter((n) => n !== 9 || !verdict.foul);
    verdict.again = !verdict.foul && objects.length > 0;
    return verdict;
  }

  // 8 bi.
  let mine = s.groups[side];
  const left = (g: 'SOLID' | 'STRIPE') =>
    s.balls.filter((b) => b.on && ballGroup(b.n) === g).length;
  const onEight = mine !== null && left(mine) === 0;
  if (!verdict.foul && !s.opening && r.firstHit !== null) {
    const first = ballGroup(r.firstHit);
    if (mine && !onEight && first !== mine) verdict.foul = `phải chạm ${groupNames[mine]} trước`;
    if (mine && onEight && first !== 'EIGHT') verdict.foul = 'phải chạm bi 8 trước';
    if (!mine && first === 'EIGHT') verdict.foul = 'không được chạm bi 8 trước khi chia nhóm';
  }
  if (!verdict.foul && !objects.length && !r.railAfterHit) verdict.foul = 'không bi nào chạm băng';
  if (objects.includes(8)) {
    if (s.opening) verdict.respot.push(8);
    else if (verdict.foul || !onEight || !before(8)) verdict.lose = true;
    else verdict.win = true;
  }
  const down = objects.filter((n) => n !== 8);
  // The first ball legally pocketed after the break chooses the shooter's group.
  if (!verdict.foul && !mine && !s.opening && down.length) {
    mine = ballGroup(down[0]) as 'SOLID' | 'STRIPE';
    const theirs = mine === 'SOLID' ? 'STRIPE' : 'SOLID';
    verdict.groups = side === 'a' ? { a: mine, b: theirs } : { a: theirs, b: mine };
  }
  verdict.potted = mine ? down.filter((n) => ballGroup(n) === mine) : down;
  verdict.again = !verdict.foul && verdict.potted.length > 0;
  return verdict;
}

const shotText = (name: string, s: BilliardsState, v: Verdict, r: SimResult) => {
  if (s.mode === 'CAROM') return v.point ? `${name} ghi 1 điểm.` : `${name} trượt.`;
  const down = r.pocketed.filter((n) => n !== 0);
  const parts = [down.length ? `${name} đưa bi ${down.join(', ')} vào lỗ` : `${name} không vào bi`];
  if (v.foul) parts.push(`phạm lỗi: ${v.foul}`);
  return parts.join(' · ') + '.';
};

/** Plays a shot for `side` and applies the rules. */
function shoot(s: BilliardsState, side: Side, shot: Shot, place: { x: number; y: number } | null) {
  const cue = cueOf(s, side);
  if (place) {
    if (!s.ballInHand) fail();
    if (!freeSpot(s.balls, place.x, place.y, cue) || (s.kitchen && place.x > HEAD_STRING))
      fail('BILLIARDS_BAD_SPOT');
    const ball = s.balls.find((b) => b.n === cue)!;
    ball.x = Math.round(place.x * 100) / 100;
    ball.y = Math.round(place.y * 100) / 100;
    ball.on = true;
  }
  const start = structuredClone(s.balls);
  const normal = normalShot(shot.dx, shot.dy, shot.power, shot.spin);
  const r = simulate(start, cue, normal, s.mode === 'CAROM' ? [] : POCKETS);
  const v = judge(s, side, r);
  const name = s.seats[side]!.name;
  s.seq += 1;
  const text = shotText(name, s, v, r);
  s.shots = [
    ...s.shots,
    {
      seq: s.seq,
      by: side,
      start,
      cue,
      dx: normal.dx,
      dy: normal.dy,
      power: normal.power,
      ...(normal.spin ? { spin: normal.spin } : {}),
      text,
    },
  ].slice(-BILLIARDS_SHOTS_KEPT);
  s.balls = r.balls;
  s.note = text;
  if (v.groups) s.groups = v.groups;
  for (const n of v.respot) {
    const spot = footSpot(s.balls, n);
    const ball = s.balls.find((b) => b.n === n)!;
    Object.assign(ball, spot, { on: true });
  }
  s.opening = false;
  if (v.point) s.points[side] += 1;
  if (v.win)
    return finish(
      s,
      side,
      s.mode === 'CAROM' ? 'POINTS' : s.mode === 'NINE' ? 'NINE_POTTED' : 'EIGHT_POTTED',
    );
  if (v.lose) return finish(s, other(side), 'EIGHT_EARLY');
  if (s.mode !== 'CAROM') restoreCue(s.balls);
  s.ballInHand = !!v.foul;
  s.kitchen = false;
  if (!v.again) s.turn = other(side);
}

// ---------------------------------------------------------------- computer player

const NOISE: Record<Level, number> = { 1: 0.045, 2: 0.016, 3: 0.004 };
const BUDGET: Record<Level, number> = { 1: 50, 2: 160, 3: 320 };

type Plan = { shot: Shot; place: { x: number; y: number } | null };

/** Legal first-contact balls for `side` in pool. */
export function targets(s: BilliardsState, side: Side) {
  const on = s.balls.filter((b) => b.on && b.n !== 0);
  if (s.mode === 'NINE') {
    const lowest = Math.min(...on.map((b) => b.n));
    return on.filter((b) => b.n === lowest);
  }
  const mine = s.groups[side];
  if (!mine) return on.filter((b) => b.n !== 8);
  const own = on.filter((b) => ballGroup(b.n) === mine);
  return own.length ? own : on.filter((b) => b.n === 8);
}

function candidates(
  s: BilliardsState,
  side: Side,
  from: Ball,
  random: Random,
  level: Level,
): Shot[] {
  const list: Shot[] = [];
  const aim = (tx: number, ty: number, power: number) => {
    const dx = tx - from.x,
      dy = ty - from.y;
    if (dx * dx + dy * dy > 1) list.push(normalShot(dx, dy, power));
  };
  if (s.mode === 'CAROM') {
    // Thick and thin hits on each ball, plus a fan of banks.
    for (const b of s.balls)
      if (b.n !== from.n)
        for (const off of [-1.6, -1.1, -0.6, 0, 0.6, 1.1, 1.6]) {
          const dx = b.x - from.x,
            dy = b.y - from.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          for (const power of [0.35, 0.55, 0.75])
            aim(b.x - (dy / len) * off * R, b.y + (dx / len) * off * R, power);
        }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 2 * Math.PI + random.index(100) / 1000;
      for (const power of [0.5, 0.75]) list.push(normalShot(Math.cos(a), Math.sin(a), power));
    }
    return list;
  }
  if (s.opening) {
    const apex = s.balls.find((b) => b.n === 1)!;
    for (const off of [-0.25, 0, 0.25]) aim(apex.x, apex.y + off * R, 1);
    return list;
  }
  for (const t of targets(s, side)) {
    for (const p of POCKETS) {
      const px = p.x - t.x,
        py = p.y - t.y;
      const len = Math.sqrt(px * px + py * py);
      const gx = t.x - (px / len) * 2 * R,
        gy = t.y - (py / len) * 2 * R;
      // Skip cuts thinner than about 75°.
      const cx = gx - from.x,
        cy = gy - from.y;
      const clen = Math.sqrt(cx * cx + cy * cy);
      if ((cx * px + cy * py) / (clen * len) < 0.25) continue;
      for (const power of [0.3, 0.5, 0.75]) aim(gx, gy, power);
      // Stronger players also try drawing the cue ball back or following through.
      if (level > 1) {
        const dx = gx - from.x,
          dy = gy - from.y;
        if (dx * dx + dy * dy > 1)
          for (const y of [-0.6, 0.5]) list.push(normalShot(dx, dy, 0.5, { x: 0, y }));
      }
    }
    for (const power of [0.4, 0.7]) aim(t.x, t.y, power);
  }
  // A fan of directions finds kicks off the cushions when the direct paths are blocked.
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * 2 * Math.PI + random.index(100) / 1000;
    for (const power of [0.4, 0.7]) list.push(normalShot(Math.cos(a), Math.sin(a), power));
  }
  return list;
}

function score(s: BilliardsState, side: Side, r: SimResult) {
  const v = judge(s, side, r);
  if (v.win) return 100_000;
  if (v.lose) return -100_000;
  let value = v.foul ? -400 : 0;
  if (s.mode === 'CAROM') return v.point ? 1000 + (s.points[side] + 1 >= s.target ? 1000 : 0) : -50;
  value += v.potted.length * 300 + (v.again ? 200 : 0);
  // Leaving fewer of the opponent's balls near pockets is not modelled; prefer a cue ball near the middle.
  const cue = r.balls.find((b) => b.n === 0)!;
  value -= Math.abs(cue.x - W / 2) / 50 + Math.abs(cue.y - H / 2) / 50;
  return value;
}

/** The computer's shot for `side` at `level`. */
export function chooseShot(s: BilliardsState, side: Side, level: Level, random: Random): Plan {
  const cue = cueOf(s, side);
  const current = s.balls.find((b) => b.n === cue)!;
  // With ball in hand, also try spots straight behind each target, lined up on a pocket.
  const spots: ({ x: number; y: number } | null)[] = [null];
  if (s.ballInHand && s.mode !== 'CAROM') {
    for (const t of targets(s, side).slice(0, 4))
      for (const p of POCKETS) {
        const px = t.x - p.x,
          py = t.y - p.y;
        const len = Math.sqrt(px * px + py * py);
        const x = t.x + (px / len) * 120,
          y = t.y + (py / len) * 120;
        if (freeSpot(s.balls, x, y, 0) && (!s.kitchen || x <= HEAD_STRING)) spots.push({ x, y });
      }
    if (!freeSpot(s.balls, current.x, current.y, 0) || (s.kitchen && current.x > HEAD_STRING))
      spots[0] = { x: HEAD_STRING - 40, y: H / 2 };
  }
  const plans: Plan[] = [];
  for (const place of spots.slice(0, 6)) {
    const from = place ? { ...current, ...place } : current;
    for (const shot of candidates(s, side, from, random, level)) plans.push({ shot, place });
  }
  // Keep within the level's budget, sampling evenly.
  const budget = BUDGET[level];
  const picked =
    plans.length <= budget
      ? plans
      : Array.from({ length: budget }, (_, i) => plans[Math.floor((i * plans.length) / budget)]);
  const turn = (shot: Shot, e: number) =>
    normalShot(shot.dx - shot.dy * e, shot.dy + shot.dx * e, shot.power, shot.spin);
  const value = (plan: Plan, shot = plan.shot) => {
    const balls = structuredClone(s.balls);
    if (plan.place) Object.assign(balls.find((b) => b.n === cue)!, plan.place, { on: true });
    return score(s, side, simulate(balls, cue, shot, s.mode === 'CAROM' ? [] : POCKETS));
  };
  const ranked = picked
    .map((plan) => ({ plan, value: value(plan) + random.index(10) }))
    .sort((a, b) => b.value - a.value);
  let best = ranked[0]?.plan ?? { shot: normalShot(1, 0, 0.5), place: null };
  // Vừa and Khó replay their best few shots slightly off-line and keep the one that holds up,
  // so a shot that only works when hit perfectly (or risks the 8) is avoided.
  if (level > 1) {
    let safest = -Infinity;
    for (const { plan, value: exact } of ranked.slice(0, 6)) {
      const n = NOISE[level];
      const worst = Math.min(
        exact,
        ...[-2 * n, -n, n, 2 * n].map((e) => value(plan, turn(plan.shot, e))),
      );
      const total = exact + worst;
      if (total > safest) {
        safest = total;
        best = plan;
      }
    }
  }
  // Human hands are not perfect: turn the aim by a small random angle.
  const e = ((random.index(2001) - 1000) / 1000) * NOISE[level];
  return { shot: turn(best.shot, e), place: best.place };
}

function botTurn(s: BilliardsState, random: Random) {
  for (let guard = 0; guard < 16 && s.status === 'PLAYING' && s.seats[s.turn]?.bot; guard++) {
    const side = s.turn;
    const plan = chooseShot(s, side, s.seats[side]!.level ?? 2, random);
    shoot(s, side, plan.shot, plan.place);
  }
}

// ---------------------------------------------------------------- transitions

export function settleDepartures(s: BilliardsState, members: BilliardsMember[], now: number) {
  const present = new Set(members.map((m) => m.id));
  let next = s;
  for (const side of ['a', 'b'] as const) {
    const seat = next.seats[side];
    if (!seat || seat.bot || present.has(seat.id) || next.status === 'CANCELLED') continue;
    next = transition(next, seat.id, seat.name, { action: 'leave' }, now, { index: () => 0 });
  }
  return next;
}

export function transition(
  current: BilliardsState,
  actor: string,
  actorName: string,
  command: BilliardsCommand,
  now: number,
  random: Random,
): BilliardsState {
  const s = structuredClone(current);
  const mine = seatOf(s, actor);
  const host = s.host === actor;
  switch (command.action) {
    case 'join': {
      if (!['WAITING', 'FINISHED'].includes(s.status) || mine) fail('BILLIARDS_SEAT_TAKEN');
      const free = !s.seats.a ? 'a' : !s.seats.b ? 'b' : fail('BILLIARDS_SEAT_TAKEN');
      s.seats[free] = humanSeat(actor, actorName);
      start(s, random);
      break;
    }
    case 'leave': {
      if (!mine) fail();
      if (s.status === 'PLAYING') {
        finish(s, other(mine), 'LEFT');
        s.note = `${s.seats[mine]!.name} đã rời bàn.`;
      }
      s.seats[mine] = null;
      if (!humans(s).length) s.seats = { a: null, b: null };
      if (s.status !== 'FINISHED' || !humans(s).length) reopen(s);
      else if (s.host === actor) s.host = humans(s)[0].id;
      break;
    }
    case 'add_bot': {
      if (!host || !['WAITING', 'FINISHED'].includes(s.status)) fail();
      const free = !s.seats.a ? 'a' : !s.seats.b ? 'b' : fail('BILLIARDS_SEAT_TAKEN');
      s.seats[free] = botSeat(command.level);
      start(s, random);
      break;
    }
    case 'remove_bot': {
      const side = s.seats.a?.bot ? 'a' : s.seats.b?.bot ? 'b' : null;
      if (!host || !side || s.status !== 'FINISHED') fail();
      s.seats[side] = null;
      reopen(s);
      break;
    }
    case 'shoot': {
      if (s.status !== 'PLAYING') fail();
      if (!mine || s.turn !== mine) fail('BILLIARDS_NOT_YOUR_TURN');
      shoot(s, mine, command, command.place);
      botTurn(s, random);
      break;
    }
    case 'resign': {
      if (s.status !== 'PLAYING' || !mine) fail();
      finish(s, other(mine), 'RESIGN');
      break;
    }
    case 'rematch': {
      if (s.status !== 'FINISHED' || !mine || !s.seats.a || !s.seats.b) fail();
      // The players take turns to break.
      s.breaker = other(s.breaker);
      start(s, random);
      break;
    }
  }
  s.version = current.version + 1;
  s.updatedAt = now;
  return s;
}
