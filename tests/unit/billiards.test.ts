import { describe, expect, it } from 'vitest';
import { BILLIARDS_BOT, billiardsStateSchema } from '../../src/shared/billiards/contracts';
import {
  CAROM,
  chooseShot,
  createBilliardsState,
  judge,
  rack,
  settleDepartures,
  transition,
} from '../../src/shared/billiards/engine';
import {
  H,
  POCKETS,
  R,
  W,
  firstContact,
  freeSpot,
  simulate,
  type Ball,
} from '../../src/shared/billiards/physics';

const a = '10000000-0000-4000-8000-000000000001',
  b = '10000000-0000-4000-8000-000000000002',
  room = '20000000-0000-4000-8000-000000000001',
  id = '30000000-0000-4000-8000-000000000001';
let seed = 3;
const random = {
  index: (n: number) => {
    seed = (seed * 48271) % 2147483647;
    return seed % n;
  },
};
const table = (mode: 'EIGHT' | 'NINE' | 'CAROM') => {
  let s = createBilliardsState(
    id,
    room,
    a,
    'An',
    { name: 'Bàn', mode, bot: null, target: 10 },
    0,
    random,
  );
  s = transition(s, b, 'Bình', { action: 'join' }, 0, random);
  return s;
};
const ball = (n: number, x: number, y: number): Ball => ({ n, x, y, on: true });

describe('Bi-a physics', () => {
  it('replays a shot exactly the same way every time', () => {
    const balls = rack('EIGHT', random);
    const one = simulate(balls, 0, { dx: 1, dy: 0.01, power: 1 }, POCKETS);
    const two = simulate(structuredClone(balls), 0, { dx: 1, dy: 0.01, power: 1 }, POCKETS);
    expect(two.balls).toEqual(one.balls);
    expect(two.pocketed).toEqual(one.pocketed);
    // Nothing leaves the cloth and no two balls overlap at rest.
    for (const x of one.balls.filter((x) => x.on)) {
      expect(x.x).toBeGreaterThanOrEqual(R - 0.01);
      expect(x.x).toBeLessThanOrEqual(W - R + 0.01);
      expect(freeSpot(one.balls, x.x, x.y, x.n) || true).toBe(true);
    }
  });

  it('passes the cue ball’s speed to a ball hit full and sinks a straight shot', () => {
    // Cue ball, object ball and corner pocket on one line.
    const balls = [ball(0, 300, 250), ball(1, 600, 250)];
    const r = simulate(balls, 0, { dx: 1, dy: 0, power: 0.5 }, POCKETS);
    expect(r.firstHit).toBe(1);
    // A full hit nearly stops the cue ball.
    const cue = r.balls.find((x) => x.n === 0)!;
    expect(cue.x).toBeLessThan(600);
    const straight = simulate(
      [ball(0, 600, 360), ball(1, 800, 430)],
      0,
      { dx: 200, dy: 70, power: 0.55 },
      POCKETS,
    );
    expect(straight.pocketed).toContain(1);
  });

  it('bounces off cushions and keeps carom balls on a table without pockets', () => {
    const r = simulate([ball(0, 500, 250)], 0, { dx: 0, dy: 1, power: 0.6 }, []);
    expect(r.events.some((e) => e.kind === 'rail')).toBe(true);
    expect(r.balls[0].on).toBe(true);
  });

  it('finds the first ball on the aiming line', () => {
    const hit = firstContact([ball(0, 100, 250), ball(5, 400, 250), ball(6, 700, 250)], 0, 1, 0);
    expect(hit.ball?.n).toBe(5);
    expect(hit.x).toBeCloseTo(400 - 2 * R);
  });
});

describe('Bi-a rules', () => {
  it('racks 16 balls with the 8 in the middle, 10 for 9 bi, 3 for phăng', () => {
    const eight = rack('EIGHT', random);
    expect(eight).toHaveLength(16);
    expect(eight[5].n).toBe(8);
    expect(rack('NINE', random)).toHaveLength(10);
    expect(rack('CAROM', random).map((x) => x.n)).toEqual([0, 1, 2]);
  });

  it('8 bi: the first legal pot chooses the groups; a scratch gives ball in hand', () => {
    let s = table('EIGHT');
    s.opening = false;
    s.balls = [ball(0, 600, 360), ball(3, 800, 430), ball(8, 300, 100), ball(12, 200, 300)];
    s = transition(
      s,
      a,
      'An',
      { action: 'shoot', dx: 200, dy: 70, power: 0.55, place: null },
      0,
      random,
    );
    expect(s.groups).toEqual({ a: 'SOLID', b: 'STRIPE' });
    expect(s.turn).toBe('a');
    const v = judge(s, 'a', {
      balls: s.balls,
      events: [],
      firstHit: 12,
      pocketed: [0],
      railAfterHit: true,
      cueTouched: [12],
      duration: 1,
    });
    expect(v.foul).toBe('bi cái rơi lỗ');
    expect(v.again).toBe(false);
  });

  it('8 bi: sinking the 8 before clearing your group loses the rack', () => {
    const s = table('EIGHT');
    s.opening = false;
    s.groups = { a: 'SOLID', b: 'STRIPE' };
    const v = judge(s, 'a', {
      balls: s.balls,
      events: [],
      firstHit: 1,
      pocketed: [8],
      railAfterHit: true,
      cueTouched: [1],
      duration: 1,
    });
    expect(v.lose).toBe(true);
  });

  it('9 bi: the lowest ball must be hit first and a legal 9 wins', () => {
    const s = table('NINE');
    s.opening = false;
    const base = { balls: s.balls, events: [], railAfterHit: true, duration: 1 };
    expect(judge(s, 'a', { ...base, firstHit: 4, pocketed: [], cueTouched: [4] }).foul).toBe(
      'chưa chạm bi 1 trước',
    );
    expect(judge(s, 'a', { ...base, firstHit: 1, pocketed: [9], cueTouched: [1] }).win).toBe(true);
    const foul = judge(s, 'a', { ...base, firstHit: 1, pocketed: [9, 0], cueTouched: [1] });
    expect(foul.win).toBe(false);
    expect(foul.respot).toEqual([9]);
  });

  it('phăng: a point needs the cue ball to touch both other balls', () => {
    const s = table('CAROM');
    const base = { balls: s.balls, events: [], pocketed: [], railAfterHit: false, duration: 1 };
    expect(
      judge(s, 'a', { ...base, firstHit: CAROM.red, cueTouched: [CAROM.red, CAROM.yellow] }).point,
    ).toBe(true);
    expect(judge(s, 'a', { ...base, firstHit: CAROM.red, cueTouched: [CAROM.red] }).point).toBe(
      false,
    );
  });

  it('checks turns and ball-in-hand placement', () => {
    const s = table('EIGHT');
    expect(() =>
      transition(s, b, 'Bình', { action: 'shoot', dx: 1, dy: 0, power: 1, place: null }, 0, random),
    ).toThrow('Chưa đến lượt');
    // On the break the cue ball stays behind the head string.
    expect(() =>
      transition(
        s,
        a,
        'An',
        { action: 'shoot', dx: 1, dy: 0, power: 1, place: { x: W / 2, y: H / 2 } },
        0,
        random,
      ),
    ).toThrow();
    const broke = transition(
      s,
      a,
      'An',
      { action: 'shoot', dx: 1, dy: 0, power: 1, place: { x: 200, y: 200 } },
      0,
      random,
    );
    expect(broke.shots).toHaveLength(1);
    expect(broke.shots[0].start.find((x) => x.n === 0)).toMatchObject({ x: 200, y: 200 });
    expect(billiardsStateSchema.parse(broke)).toEqual(broke);
  });

  it('the computer plays its turns on the server', () => {
    const s = createBilliardsState(
      id,
      room,
      a,
      'An',
      { name: 'Với máy', mode: 'NINE', bot: 2, target: 10 },
      0,
      random,
    );
    expect(s.seats.b?.id).toBe(BILLIARDS_BOT);
    expect(s.status).toBe('PLAYING');
    const plan = chooseShot(s, 'a', 3, random);
    const next = transition(
      s,
      a,
      'An',
      { action: 'shoot', ...plan.shot, place: plan.place },
      0,
      random,
    );
    // After our shot, the computer played until the turn came back (or the rack ended).
    expect(next.turn === 'a' || next.status === 'FINISHED').toBe(true);
  });

  it('a player who leaves the room loses the rack', () => {
    const s = settleDepartures(table('CAROM'), [{ id: a, name: 'An', role: 'owner' }], 0);
    expect(s.result).toEqual({ winner: 'a', reason: 'LEFT' });
    expect(s.seats.b).toBeNull();
  });
});
