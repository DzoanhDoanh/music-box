import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/shared/domain';
import {
  BOARD_SIZE,
  HOTEL,
  JAIL_INDEX,
  beaches,
  board,
  cities,
  groupTiles,
  groups,
  sideCities,
} from '../../src/shared/ty-phu/board';
import { cardIds, type CardId } from '../../src/shared/ty-phu/cards';
import type { TyPhuCommand, TyPhuState } from '../../src/shared/ty-phu/contracts';
import {
  bankSalePrice,
  baseRent,
  buildCap,
  buildCost,
  buyoutPrice,
  cardTargets,
  createTyPhuState,
  currentPrice,
  moneyInvariant,
  publicTyPhuState,
  reconcile,
  transition,
  winProgress,
  type TyPhuRandom,
} from '../../src/shared/ty-phu/engine';

const A = '00000000-0000-4000-8000-00000000000a',
  B = '00000000-0000-4000-8000-00000000000b',
  C = '00000000-0000-4000-8000-00000000000c';

/** Dice from a queue; shuffles keep their order (index(n) = n - 1 never swaps). */
function scripted(dice: number[] = []): TyPhuRandom {
  const queue = [...dice];
  return {
    die: () => queue.shift() ?? 1,
    index: (n) => n - 1,
  };
}
function started(players = [A, B], rules = {}): TyPhuState {
  let s = createTyPhuState('10000000-0000-4000-8000-000000000001', 'room', A, 'An', 'Bàn thử', {
    startCash: 2000,
    turnSeconds: 45,
    minutes: null,
    buyout: true,
    ...rules,
  });
  const rng = scripted();
  for (const [i, id] of players.slice(1).entries()) {
    s = transition(s, id, ['Bình', 'Chi', 'Dũng'][i], { action: 'join' }, 0, rng);
    s = transition(s, id, 'x', { action: 'ready', ready: true }, 0, rng);
  }
  return transition(s, A, 'An', { action: 'start' }, 0, rng);
}
const run = (s: TyPhuState, actor: string, command: TyPhuCommand, rng = scripted(), now = 1) =>
  transition(s, actor, 'x', command, now, rng);
const own = (s: TyPhuState, index: number, owner: string, level = 0) => {
  s.tiles[index] = { owner, level, blackout: 0 };
};
const who = (s: TyPhuState, id: string) => s.players.find((p) => p.id === id)!;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as AppError).code;
  }
  return null;
};

describe('Tỷ Phú board', () => {
  it('has 32 tiles: 19 cities, 5 beaches, 3 chance, 1 tax and 4 corners', () => {
    expect(board).toHaveLength(BOARD_SIZE);
    expect(cities).toHaveLength(19);
    expect(beaches).toHaveLength(5);
    expect(board.filter((t) => t.kind === 'CHANCE').map((t) => t.index)).toEqual([12, 19, 28]);
    expect(board.filter((t) => t.kind === 'TAX').map((t) => t.index)).toEqual([30]);
    expect([0, 8, 16, 24].map((i) => board[i].kind)).toEqual([
      'START',
      'JAIL',
      'FESTIVAL',
      'AIRPORT',
    ]);
    expect(board.filter((t) => t.side === 1 && t.kind === 'CHANCE')).toEqual([]);
  });
  it('colour groups are adjacent runs of 2–3 cities and Ho Chi Minh City stands alone', () => {
    expect(groups).toHaveLength(7);
    for (const g of groups) {
      const indices = groupTiles(g).map((t) => t.index);
      expect(indices.length === 2 || indices.length === 3).toBe(true);
      expect(indices.at(-1)! - indices[0]).toBe(indices.length - 1);
    }
    expect(board[31].group).toBeUndefined();
    expect(sideCities(1)).toHaveLength(6);
    expect(sideCities(4).map((t) => t.index)).toEqual([26, 27, 31]);
  });
  it('the chance deck has 15 cards with 15 distinct mechanics', () => {
    expect(new Set(cardIds).size).toBe(15);
  });
});

describe('Tỷ Phú money formulas', () => {
  it('matches the Đà Lạt worked example in the design', () => {
    const s = started();
    own(s, 22, A, 3);
    expect(baseRent(s, 22)).toBe(550);
    expect(buyoutPrice(s, 22)).toBe(825);
    expect(bankSalePrice(s, 22)).toBe(275);
    own(s, 21, A);
    own(s, 23, A);
    expect(currentPrice(s, 22)).toBe(825);
    expect(baseRent(s, 22)).toBe(825);
    expect(buyoutPrice(s, 22)).toBe(1238);
    expect(bankSalePrice(s, 22)).toBe(413);
    s.festival = 22;
    expect(baseRent(s, 22)).toBe(1650);
    s.festival = null;
    s.tiles[22]!.level = HOTEL;
    expect(baseRent(s, 22)).toBe(1320);
  });
  it('beach rent is 50 × beaches owned and ignores level, group and festival', () => {
    const s = started();
    own(s, 4, A);
    expect(baseRent(s, 4)).toBe(50);
    own(s, 13, A);
    own(s, 20, A);
    expect(baseRent(s, 4)).toBe(150);
  });
  it('building costs 0.5 G per level and G for the hotel', () => {
    expect(buildCost(22, 0, 3)).toBe(330);
    expect(buildCost(22, 3, 4)).toBe(220);
  });
});

describe('Tỷ Phú building by lap', () => {
  it('caps lap 1 at level 2, lap 2 at level 3 and needs level 3 before a hotel', () => {
    const p = { lap: 1 } as TyPhuState['players'][number];
    expect(buildCap(p, 0)).toBe(2);
    expect(buildCap({ ...p, lap: 2 }, 0)).toBe(3);
    expect(buildCap({ ...p, lap: 3 }, 2)).toBe(3);
    expect(buildCap({ ...p, lap: 3 }, 3)).toBe(HOTEL);
  });
  it('buys land and builds in the same stop within the lap limit', () => {
    let s = started();
    const first = s.turn!;
    s = run(s, first, { action: 'roll' }, scripted([2, 3])); // lands on 5 (Sa Pa)
    expect(s.phase).toBe('BUY');
    expect(code(() => run(s, first, { action: 'buy', level: 3 }))).toBe('TYPHU_BUILD_LIMIT');
    s = run(s, first, { action: 'buy', level: 2 });
    expect(s.tiles[5]).toEqual({ owner: first, level: 2, blackout: 0 });
    expect(who(s, first).cash).toBe(2000 - 80 - 80);
    expect(moneyInvariant(s)).toBe(4000);
  });
  it('a stop at level 2 on lap 3 can reach level 3 but not jump to the hotel', () => {
    let s = started();
    const first = s.turn!;
    own(s, 5, first, 2);
    who(s, first).lap = 3;
    s = run(s, first, { action: 'roll' }, scripted([2, 3]));
    expect(s.phase).toBe('BUILD');
    expect(code(() => run(s, first, { action: 'build', level: 4 }))).toBe('TYPHU_BUILD_LIMIT');
    s = run(s, first, { action: 'build', level: 3 });
    expect(s.tiles[5]!.level).toBe(3);
  });
});

describe('Tỷ Phú rent, buyout and hotels', () => {
  it('pays rent automatically, then offers a 1.5× buyout that the owner cannot refuse', () => {
    let s = started();
    const [mover, owner] = [s.turn!, s.players.find((p) => p.id !== s.turn)!.id];
    own(s, 5, owner, 1);
    s = run(s, mover, { action: 'roll' }, scripted([2, 3]));
    expect(who(s, mover).cash).toBe(2000 - 32);
    expect(s.phase).toBe('BUYOUT');
    s = run(s, mover, { action: 'buyout' });
    expect(s.tiles[5]!.owner).toBe(mover);
    expect(who(s, owner).cash).toBe(2000 + 32 + 180);
    expect(moneyInvariant(s)).toBe(4000);
  });
  it('hotels cannot be bought out or targeted by any card', () => {
    let s = started();
    const [mover, owner] = [s.turn!, s.players.find((p) => p.id !== s.turn)!.id];
    own(s, 5, owner, HOTEL);
    for (const card of ['STORM', 'DEMOLISH', 'EVICT', 'BLACKOUT'] as CardId[])
      expect(cardTargets(s, who(s, mover), card)).toEqual([]);
    s = run(s, mover, { action: 'roll' }, scripted([2, 3]));
    expect(s.phase).not.toBe('BUYOUT');
  });
  it('blackout stops rent until two of the owner’s turns have ended', () => {
    let s = started();
    const [mover, owner] = [s.turn!, s.players.find((p) => p.id !== s.turn)!.id];
    own(s, 5, owner, 1);
    s.tiles[5]!.blackout = 2;
    s = run(s, mover, { action: 'roll' }, scripted([2, 3]));
    expect(who(s, mover).cash).toBe(2000);
  });
});

describe('Tỷ Phú dice and jail', () => {
  it('a double rolls again and a third double goes to jail', () => {
    let s = started();
    const p = s.turn!;
    s = run(s, p, { action: 'roll' }, scripted([1, 1])); // 2: Cao Bằng
    s = run(s, p, { action: 'skip' });
    expect(s.turn).toBe(p);
    expect(s.phase).toBe('ROLL');
    s = run(s, p, { action: 'roll' }, scripted([1, 1])); // 4: beach
    s = run(s, p, { action: 'skip' });
    s = run(s, p, { action: 'roll' }, scripted([2, 2]));
    expect(who(s, p).position).toBe(JAIL_INDEX);
    expect(who(s, p).jailed).toBe(true);
    expect(s.turn).not.toBe(p);
  });
  it('three failed jail rolls cost the fine and move by the last roll', () => {
    let s = started();
    const p = s.turn!,
      other = s.players.find((x) => x.id !== p)!.id;
    Object.assign(who(s, p), { jailed: true, position: JAIL_INDEX });
    for (let i = 0; i < 2; i++) {
      s = run(s, p, { action: 'roll' }, scripted([1, 2]));
      expect(who(s, p).jailed).toBe(true);
      s.turn = p;
      s.phase = 'ROLL';
    }
    s = run(s, p, { action: 'roll' }, scripted([1, 2]));
    expect(who(s, p).jailed).toBe(false);
    expect(who(s, p).position).toBe(JAIL_INDEX + 3);
    expect(who(s, p).cash).toBe(2000 - 100);
    expect(other).toBeTruthy();
  });
});

describe('Tỷ Phú chance cards', () => {
  const draw = (s: TyPhuState, card: CardId) => {
    s.deck = [card];
    const p = s.turn!;
    who(s, p).position = 7; // 5 steps to tile 12 (Cơ hội)
    return run(s, p, { action: 'roll' }, scripted([2, 3]));
  };
  it('double fine and half price modify the next rent and cancel each other', () => {
    let s = started();
    const [p, owner] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
    own(s, 14, owner, 1); // Vinh: rent 64
    s = draw(s, 'DOUBLE_FINE');
    expect(who(s, p).fine).toBe(true);
    s.turn = p;
    s.phase = 'ROLL';
    s.extraRoll = false;
    s = run(s, p, { action: 'roll' }, scripted([1, 1])); // 12 → 14
    expect(who(s, p).cash).toBe(2000 - 128);
    expect(who(s, p).fine).toBe(false);
    who(s, p).fine = true;
    who(s, p).half = true;
    who(s, p).position = 12;
    s.turn = p;
    s.phase = 'ROLL';
    s = run(s, p, { action: 'roll' }, scripted([1, 1]));
    expect(who(s, p).cash).toBe(2000 - 128 - 64);
  });
  it('the shield blocks the first attack card aimed at its holder', () => {
    let s = started();
    const [p, victim] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
    own(s, 21, victim, 2);
    who(s, victim).shield = true;
    s = draw(s, 'STORM');
    expect(s.phase).toBe('CARD');
    s = run(s, p, { action: 'card_target', tile: 21 });
    expect(s.tiles[21]!.level).toBe(2);
    expect(who(s, victim).shield).toBe(false);
  });
  it('storm lowers one level while demolish clears every house', () => {
    let s = started();
    const [p, victim] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
    own(s, 21, victim, 3);
    s = run(draw(s, 'STORM'), p, { action: 'card_target', tile: 21 });
    expect(s.tiles[21]!.level).toBe(2);
    s.turn = p;
    s = run(draw(s, 'DEMOLISH'), p, { action: 'card_target', tile: 21 });
    expect(s.tiles[21]).toMatchObject({ owner: victim, level: 0 });
  });
  it('a gift cannot be skipped and hands the city to the chosen player', () => {
    let s = started();
    const [p, other] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
    own(s, 1, p, 1);
    s = draw(s, 'GIFT');
    expect(code(() => run(s, p, { action: 'skip' }))).toBe('TYPHU_ACTION_INVALID');
    s = run(s, p, { action: 'card_target', tile: 1, player: other });
    expect(s.tiles[1]!.owner).toBe(other);
  });
  it('a targeted card without any valid target has no effect', () => {
    let s = started();
    s = draw(s, 'EVICT');
    expect(s.phase).not.toBe('CARD');
  });
});

describe('Tỷ Phú win conditions', () => {
  it('three monopolies win immediately', () => {
    let s = started();
    const p = s.turn!;
    for (const g of [1, 2]) for (const t of groupTiles(g)) own(s, t.index, p);
    own(s, 9, p);
    own(s, 10, p);
    who(s, p).position = 10;
    s = run(s, p, { action: 'roll' }, scripted([1, 0])); // 11: Ninh Bình
    s = run(s, p, { action: 'buy', level: 0 });
    expect(s.status).toBe('FINISHED');
    expect(s.winReason).toBe('MONOPOLY');
    expect(s.winner).toBe(p);
  });
  it('owning every city of a leg wins (beaches not required)', () => {
    const s = started();
    const p = s.turn!;
    for (const t of sideCities(4)) own(s, t.index, p);
    expect(winProgress(s, p).lines[3]).toEqual({ side: 4, owned: 3, total: 3 });
  });
  it('four of the five beaches win', () => {
    let s = started();
    const p = s.turn!;
    for (const i of [4, 13, 20]) own(s, i, p);
    who(s, p).position = 23;
    s = run(s, p, { action: 'roll' }, scripted([1, 1])); // 25: Biển Mũi Né
    s = run(s, p, { action: 'buy', level: 0 });
    expect(s.winReason).toBe('BEACHES');
  });
  it('bankruptcy leaves the last player standing as the winner', () => {
    let s = started();
    const [p, owner] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
    own(s, 5, owner, 3);
    who(s, p).cash = 10;
    s.bank += 1990;
    s = run(s, p, { action: 'roll' }, scripted([2, 3]));
    expect(who(s, p).status).toBe('BANKRUPT');
    expect(s.winner).toBe(owner);
    expect(s.winReason).toBe('LAST_STANDING');
    expect(moneyInvariant(s)).toBe(4000);
  });
});

describe('Tỷ Phú timeouts and privacy', () => {
  it('expired turns act automatically and three misses switch to auto play', () => {
    let s = started();
    const p = s.turn!;
    for (let i = 0; i < 3; i++) {
      s.turn = p;
      s.phase = 'ROLL';
      s.deadline = 0;
      s = reconcile(s, 100, scripted([1, 2]));
    }
    expect(who(s, p).auto).toBe(true);
  });
  it('never sends the deck order to clients', () => {
    const view = publicTyPhuState(started());
    expect('deck' in view).toBe(false);
    expect(view.deckCount).toBe(15);
  });
  it('rejects actions from players whose turn it is not', () => {
    const s = started();
    const other = s.players.find((x) => x.id !== s.turn)!.id;
    expect(code(() => run(s, other, { action: 'roll' }))).toBe('TYPHU_NOT_YOUR_TURN');
    expect(code(() => run(s, C, { action: 'roll' }))).toBe('TYPHU_NOT_YOUR_TURN');
  });
});

// ------------------------------------------------------------------ simulation

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function botCommand(s: TyPhuState, random: () => number): TyPhuCommand {
  const p = who(s, s.turn!);
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
  switch (s.phase) {
    case 'ROLL':
      if (p.jailed && p.pass && random() < 0.5) return { action: 'use_pass' };
      if (p.jailed && p.cash >= 100 && random() < 0.3) return { action: 'pay_jail' };
      return { action: 'roll' };
    case 'FLY':
      if (random() < 0.3) return { action: 'skip' };
      if (!p.freeFly && p.cash < 50) return { action: 'skip' };
      return { action: 'fly', to: pick(board.filter((t) => t.index !== 24)).index };
    case 'BUY': {
      const t = board[s.pending!.tile!];
      if (random() < 0.15) return { action: 'skip' };
      const levels = t.kind === 'BEACH' ? [0] : [0, 1, 2, 3].filter((l) => l <= buildCap(p, 0));
      const affordable = levels.filter((l) => t.price! + buildCost(t.index, 0, l) <= p.cash);
      return { action: 'buy', level: pick(affordable) };
    }
    case 'BUILD': {
      const index = s.pending!.tile!,
        level = s.tiles[index]!.level;
      const options = [1, 2, 3, 4].filter(
        (l) =>
          l > level &&
          l <= buildCap(p, s.pending!.from ?? level) &&
          buildCost(index, level, l) <= p.cash,
      );
      return options.length && random() < 0.8
        ? { action: 'build', level: pick(options) }
        : { action: 'skip' };
    }
    case 'BUYOUT':
      return random() < 0.5 ? { action: 'buyout' } : { action: 'skip' };
    case 'CARD': {
      const card = s.pending!.card!;
      const targets = cardTargets(s, p, card);
      const others = s.players.filter((o) => o.status === 'ACTIVE' && o.id !== p.id);
      return { action: 'card_target', tile: pick(targets), player: pick(others).id };
    }
    case 'FESTIVAL': {
      const mine = cities.filter((c) => s.tiles[c.index]?.owner === p.id);
      return random() < 0.9 ? { action: 'festival', tile: pick(mine).index } : { action: 'skip' };
    }
    case 'START_BUILD': {
      const options = cities.filter((c) => {
        const owned = s.tiles[c.index];
        return (
          owned?.owner === p.id &&
          owned.level < buildCap(p, owned.level) &&
          buildCost(c.index, owned.level, owned.level + 1) <= p.cash
        );
      });
      return options.length
        ? { action: 'start_build', tile: pick(options).index }
        : { action: 'skip' };
    }
  }
}

describe('Tỷ Phú simulation', () => {
  it('1,000 random 2–4 player games always finish with money conserved', () => {
    const reasons: Record<string, number> = {};
    const turns: number[] = [];
    for (let game = 0; game < 1000; game++) {
      const random = mulberry(game + 1);
      const rng: TyPhuRandom = {
        die: () => 1 + Math.floor(random() * 6),
        index: (n) => Math.floor(random() * n),
      };
      const count = 2 + (game % 3);
      let s = started([A, B, C, '00000000-0000-4000-8000-00000000000d'].slice(0, count), {
        minutes: game % 5 === 0 ? 30 : null,
      });
      const total = moneyInvariant(s);
      let now = 1,
        steps = 0;
      while (s.status === 'PLAYING' && steps < 20_000) {
        steps++;
        now += 5_000;
        if (random() < 0.05) {
          s = reconcile({ ...s, deadline: 0 }, now, rng);
        } else s = transition(s, s.turn!, 'x', botCommand(s, random), now, rng);
        expect(moneyInvariant(s)).toBe(total);
        for (const p of s.players) {
          if (p.status === 'ACTIVE') expect(p.cash).toBeGreaterThanOrEqual(0);
          else expect(p.cash).toBe(0);
        }
        for (const owned of s.tiles)
          if (owned) expect(s.players.find((p) => p.id === owned.owner)?.status).toBe('ACTIVE');
      }
      expect(s.status).toBe('FINISHED');
      reasons[s.winReason!] = (reasons[s.winReason!] ?? 0) + 1;
      turns.push(steps);
    }
    turns.sort((a, b) => a - b);
    console.info('Tỷ Phú simulation', {
      reasons,
      medianActions: turns[500],
      p90Actions: turns[900],
    });
    expect(Object.keys(reasons).length).toBeGreaterThan(1);
  }, 120_000);
});
