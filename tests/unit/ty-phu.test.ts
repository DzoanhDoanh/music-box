import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/shared/domain';
import {
  BEACH_RENTS,
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
  botIds,
  buildCap,
  buildCost,
  buyoutPrice,
  cardTargets,
  createTyPhuState,
  currentPrice,
  DICE_MS,
  flyTargets,
  LAND_MS,
  moneyInvariant,
  publicTyPhuState,
  reconcile,
  STEP_MS,
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
  it('has 32 tiles: 20 cities, 4 beaches, 3 chance, 1 tax and 4 corners', () => {
    expect(board).toHaveLength(BOARD_SIZE);
    expect(cities).toHaveLength(20);
    expect(beaches).toHaveLength(4);
    expect(board[29]).toMatchObject({ kind: 'CITY', name: 'Phú Quốc', price: 210 });
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
    expect(sideCities(4).map((t) => t.index)).toEqual([26, 27, 29, 31]);
  });
  it('the chance deck has 15 cards with 15 distinct mechanics', () => {
    expect(new Set(cardIds).size).toBe(15);
  });
});

/** The price table of 2026-11-26: totals and rents for Mốc, Nhà 1–3 and the hotel. */
const priceTable: [number, number[], number[]][] = [
  [1, [50, 120, 170, 220, 345], [3, 30, 65, 105, 207]],
  [2, [55, 130, 185, 240, 380], [3, 33, 72, 116, 227]],
  [3, [60, 145, 205, 265, 415], [4, 36, 78, 126, 248]],
  [5, [70, 170, 240, 310, 485], [4, 42, 91, 147, 289]],
  [6, [75, 180, 255, 330, 520], [5, 45, 98, 158, 310]],
  [7, [85, 205, 290, 375, 585], [5, 51, 111, 179, 351]],
  [9, [100, 240, 340, 440, 690], [6, 60, 130, 210, 413]],
  [10, [105, 250, 355, 460, 725], [6, 63, 137, 221, 434]],
  [11, [110, 265, 375, 485, 760], [7, 66, 143, 231, 454]],
  [14, [120, 290, 410, 530, 830], [7, 72, 156, 252, 496]],
  [15, [125, 300, 425, 550, 865], [8, 75, 163, 263, 516]],
  [17, [140, 335, 475, 615, 965], [8, 84, 182, 294, 578]],
  [18, [145, 350, 495, 640, 1000], [9, 87, 189, 305, 599]],
  [21, [160, 385, 545, 705, 1105], [10, 96, 208, 336, 661]],
  [22, [165, 395, 560, 725, 1140], [10, 99, 215, 347, 681]],
  [23, [170, 410, 580, 750, 1175], [10, 102, 221, 357, 702]],
  [26, [185, 445, 630, 815, 1275], [11, 111, 241, 389, 764]],
  [27, [190, 455, 645, 835, 1310], [11, 114, 247, 399, 785]],
  [29, [210, 505, 715, 925, 1450], [13, 126, 273, 441, 867]],
  [31, [220, 530, 750, 970, 1520], [13, 132, 286, 462, 909]],
];

describe('Tỷ Phú money formulas', () => {
  it('matches the price table for every city and level', () => {
    expect(priceTable.map(([i]) => i)).toEqual(cities.map((c) => c.index));
    for (const [index, totals, rents] of priceTable) {
      const s = started();
      for (let level = 0; level <= HOTEL; level++) {
        own(s, index, A, level);
        expect([index, level, currentPrice(s, index)]).toEqual([index, level, totals[level]]);
        expect([index, level, baseRent(s, index)]).toEqual([index, level, rents[level]]);
        expect(bankSalePrice(s, index)).toBe(totals[level]);
        expect(buyoutPrice(s, index)).toBe(2 * totals[level]);
        if (level)
          expect(buildCost(index, level - 1, level)).toBe(totals[level] - totals[level - 1]);
      }
    }
  });
  it('a monopoly raises rent ×1.5 but not the price, and the festival doubles rent', () => {
    const s = started();
    own(s, 22, A, 3);
    own(s, 21, A);
    own(s, 23, A);
    expect(currentPrice(s, 22)).toBe(725);
    expect(baseRent(s, 22)).toBe(Math.round(347 * 1.5));
    s.festival = 22;
    expect(baseRent(s, 22)).toBe(Math.round(347 * 1.5 * 2));
  });
  it('beach rent is 50 / 100 / 200 / 400 by beaches owned and ignores the festival', () => {
    const s = started();
    own(s, 4, A);
    expect(baseRent(s, 4)).toBe(50);
    own(s, 13, A);
    expect(baseRent(s, 4)).toBe(100);
    own(s, 20, A);
    s.festival = 20;
    expect(baseRent(s, 20)).toBe(200);
    expect(BEACH_RENTS[4]).toBe(400);
    expect(board[4].price).toBe(200);
  });
});

describe('Tỷ Phú building', () => {
  it('lap 1 builds to Nhà 2, lap 2 to Nhà 3, and a hotel needs lap 3 and Nhà 3 first', () => {
    expect(buildCap({ lap: 1 }, 0)).toBe(2);
    expect(buildCap({ lap: 1 }, 3)).toBe(2);
    expect(buildCap({ lap: 2 }, 0)).toBe(3);
    expect(buildCap({ lap: 2 }, 3)).toBe(3);
    expect(buildCap({ lap: 3 }, 2)).toBe(3);
    expect(buildCap({ lap: 3 }, 3)).toBe(HOTEL);
  });
  it('on the first lap an empty tile can only be bought up to Nhà 2', () => {
    let s = started();
    const first = s.turn!;
    s = run(s, first, { action: 'roll' }, scripted([2, 3]));
    expect(s.phase).toBe('BUY');
    expect(code(() => run(s, first, { action: 'buy', level: 3 }))).toBe('TYPHU_BUILD_LIMIT');
    s = run(s, first, { action: 'buy', level: 2 });
    expect(s.tiles[5]).toEqual({ owner: first, level: 2, blackout: 0 });
  });
  it('from lap 2 an empty tile can be bought straight up to Nhà 3', () => {
    let s = started();
    const first = s.turn!;
    who(s, first).lap = 2;
    s = run(s, first, { action: 'roll' }, scripted([2, 3])); // lands on 5 (Sa Pa)
    expect(s.phase).toBe('BUY');
    expect(code(() => run(s, first, { action: 'buy', level: 4 }))).toBe('TYPHU_BUILD_LIMIT');
    s = run(s, first, { action: 'buy', level: 3 });
    expect(s.tiles[5]).toEqual({ owner: first, level: 3, blackout: 0 });
    expect(who(s, first).cash).toBe(2000 - 310);
    expect(moneyInvariant(s)).toBe(4000);
  });
  it('a stop at Nhà 2 can reach Nhà 3 but not jump to the hotel', () => {
    let s = started();
    const first = s.turn!;
    who(s, first).lap = 3;
    own(s, 5, first, 2);
    s = run(s, first, { action: 'roll' }, scripted([2, 3]));
    expect(s.phase).toBe('BUILD');
    expect(code(() => run(s, first, { action: 'build', level: 4 }))).toBe('TYPHU_BUILD_LIMIT');
    s = run(s, first, { action: 'build', level: 3 });
    expect(s.tiles[5]!.level).toBe(3);
    expect(who(s, first).cash).toBe(2000 - 70);
  });
});

describe('Tỷ Phú rent, buyout and hotels', () => {
  it('pays rent automatically, then offers a 2× buyout that the owner cannot refuse', () => {
    let s = started();
    const [mover, owner] = [s.turn!, s.players.find((p) => p.id !== s.turn)!.id];
    own(s, 5, owner, 1);
    s = run(s, mover, { action: 'roll' }, scripted([2, 3]));
    expect(who(s, mover).cash).toBe(2000 - 42);
    expect(s.phase).toBe('BUYOUT');
    s = run(s, mover, { action: 'buyout' });
    expect(s.tiles[5]!.owner).toBe(mover);
    expect(who(s, owner).cash).toBe(2000 + 42 + 340);
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
    const shown = run(s, p, { action: 'roll' }, scripted([2, 3]));
    expect(shown.phase).toBe('REVEAL');
    expect(shown.pending).toEqual({ card });
    return run(shown, p, { action: 'card_ok' });
  };
  it('double fine and half price modify the next rent and cancel each other', () => {
    let s = started();
    const [p, owner] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
    own(s, 14, owner, 1); // Vinh Nhà 1: rent 72
    s = draw(s, 'DOUBLE_FINE');
    expect(who(s, p).fine).toBe(true);
    s.turn = p;
    s.phase = 'ROLL';
    s.extraRoll = false;
    s = run(s, p, { action: 'roll' }, scripted([1, 1])); // 12 → 14
    expect(who(s, p).cash).toBe(2000 - 144);
    expect(who(s, p).fine).toBe(false);
    who(s, p).fine = true;
    who(s, p).half = true;
    who(s, p).position = 12;
    s.turn = p;
    s.phase = 'ROLL';
    s = run(s, p, { action: 'roll' }, scripted([1, 1]));
    expect(who(s, p).cash).toBe(2000 - 144 - 72);
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
  it('the eviction card wipes the tile out with no refund, leaving it empty', () => {
    let s = started();
    const [p, other] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
    own(s, 1, other, 3);
    const before = who(s, other).cash;
    s = draw(s, 'EVICT');
    s = run(s, p, { action: 'card_target', tile: 1 });
    expect(s.tiles[1]).toBeNull();
    expect(who(s, other).cash).toBe(before);
  });
  it('a targeted card without any valid target has no effect', () => {
    let s = started();
    s = draw(s, 'EVICT');
    expect(s.phase).not.toBe('CARD');
  });
});

describe('Tỷ Phú corners, fees, chance reveal and pause', () => {
  it('stopping on the jail corner puts the player in jail', () => {
    let s = started();
    const p = s.turn!;
    who(s, p).position = 5;
    s = run(s, p, { action: 'roll' }, scripted([1, 2]));
    expect(who(s, p).position).toBe(JAIL_INDEX);
    expect(who(s, p).jailed).toBe(true);
    expect(s.turn).not.toBe(p);
  });
  it('after the flight the player rolls the dice as usual', () => {
    let s = started();
    const p = s.turn!;
    who(s, p).position = 24;
    who(s, p).flyNext = true;
    s.phase = 'FLY';
    s = run(s, p, { action: 'fly', to: 3 });
    expect(s.phase).toBe('BUY');
    s = run(s, p, { action: 'skip' });
    expect(s.turn).toBe(p);
    expect(s.phase).toBe('ROLL');
    s = run(s, p, { action: 'roll' }, scripted([1, 2]));
    expect(who(s, p).position).toBe(6);
  });
  it('jail, festival and airport end the turn even after a double', () => {
    for (const [from, corner] of [
      [6, 8],
      [14, 16],
      [22, 24],
    ]) {
      let s = started();
      const p = s.turn!;
      own(s, 1, p);
      who(s, p).position = from;
      s = run(s, p, { action: 'roll' }, scripted([1, 1]));
      expect(who(s, p).position).toBe(corner);
      expect(s.extraRoll).toBe(false);
      if (s.phase === 'FESTIVAL') s = run(s, p, { action: 'skip' });
      expect(s.turn).not.toBe(p);
    }
  });
  it('hosting the festival costs 50 and needs the money', () => {
    let s = started();
    const p = s.turn!;
    own(s, 1, p);
    who(s, p).position = 13;
    s = run(s, p, { action: 'roll' }, scripted([1, 2]));
    expect(s.phase).toBe('FESTIVAL');
    s = run(s, p, { action: 'festival', tile: 1 });
    expect(s.festival).toBe(1);
    expect(who(s, p).cash).toBe(1950);
    let poor = started();
    const q = poor.turn!;
    own(poor, 1, q);
    who(poor, q).cash = 40;
    poor.bank += 1960;
    who(poor, q).position = 13;
    poor = run(poor, q, { action: 'roll' }, scripted([1, 2]));
    expect(poor.phase).not.toBe('FESTIVAL');
    expect(poor.turn).not.toBe(q);
  });
  it('flights cost 50, only reach free or own land, and need the fare', () => {
    let s = started();
    const [p, other] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
    own(s, 1, p);
    own(s, 2, other);
    who(s, p).position = 24;
    who(s, p).flyNext = true;
    s.phase = 'FLY';
    const targets = flyTargets(s, who(s, p));
    expect(targets).toContain(1);
    expect(targets).toContain(3);
    expect(targets).not.toContain(2);
    for (const locked of [0, 8, 12, 16, 24, 30]) expect(targets).not.toContain(locked);
    expect(code(() => run(s, p, { action: 'fly', to: 2 }))).toBe('TYPHU_BAD_TARGET');
    expect(code(() => run(s, p, { action: 'fly', to: 12 }))).toBe('TYPHU_BAD_TARGET');
    s = run(s, p, { action: 'fly', to: 3 });
    expect(who(s, p).position).toBe(3);
    expect(who(s, p).cash).toBe(2000 - 50 + 200); // fare, then salary for passing Start
    // Without the fare the next turn is an ordinary roll.
    let poor = started();
    const q = poor.turn!;
    who(poor, q).cash = 30;
    poor.bank += 1970;
    who(poor, q).position = 22;
    poor = run(poor, q, { action: 'roll' }, scripted([1, 1]));
    expect(who(poor, q).flyNext).toBe(true);
    const r = poor.turn!;
    poor = run(poor, r, { action: 'roll' }, scripted([1, 2]));
    if (poor.phase !== 'ROLL') poor = run(poor, r, { action: 'skip' });
    expect(poor.turn).toBe(q);
    expect(poor.phase).toBe('ROLL');
    expect(who(poor, q).flyNext).toBe(false);
  });
  it('the airport, by card or on foot, only lets the player fly on their next turn', () => {
    for (const byCard of [true, false]) {
      let s = started();
      const [p, other] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
      s.deck = ['GO_AIRPORT'];
      who(s, p).position = byCard ? 7 : 19;
      s = run(s, p, { action: 'roll' }, scripted([2, 3]));
      if (byCard) {
        expect(s.phase).toBe('REVEAL');
        s = run(s, p, { action: 'card_ok' });
      }
      expect(who(s, p).position).toBe(24);
      expect(who(s, p).flyNext).toBe(true);
      expect(s.turn).toBe(other);
      expect(s.phase).toBe('ROLL');
      s = run(s, other, { action: 'roll' }, scripted([1, 2]));
      if (s.turn === other) s = run(s, other, { action: 'skip' });
      expect(s.turn).toBe(p);
      expect(s.phase).toBe('FLY');
    }
  });
  it('beaches and cities, hotels included, sell back for their full total price', () => {
    const s = started();
    own(s, 4, A);
    expect(bankSalePrice(s, 4)).toBe(200);
    own(s, 1, A, HOTEL);
    expect(bankSalePrice(s, 1)).toBe(345);
  });
  it('a drawn card waits for everyone to see it, even for automatic seats', () => {
    let s = started();
    const p = s.turn!;
    s.deck = ['BIRTHDAY'];
    who(s, p).position = 7;
    s = run(s, p, { action: 'roll' }, scripted([2, 3]), 1000);
    expect(s.phase).toBe('REVEAL');
    expect(who(s, p).cash).toBe(2000);
    expect(code(() => run(s, p, { action: 'skip' }))).toBe('TYPHU_ACTION_INVALID');
    // The deadline also covers the dice and the 5-step walk on screen.
    expect(s.deadline).toBe(1000 + 4000 + DICE_MS + 5 * STEP_MS + LAND_MS);
    const early = reconcile(s, s.deadline! - 1, scripted());
    expect(early.phase).toBe('REVEAL');
    const later = reconcile(s, s.deadline!, scripted());
    expect(who(later, p).cash).toBe(2050);
    expect(who(later, p).misses).toBe(0);
  });
  it('pausing freezes the clock and blocks moves until someone resumes', () => {
    let s = started();
    const [p, other] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
    const deadline = s.deadline!;
    s = run(s, other, { action: 'pause' }, scripted(), 5000);
    expect(s.deadline).toBeNull();
    expect(s.paused).toMatchObject({ by: other, at: 5000, left: deadline - 5000 });
    expect(code(() => run(s, p, { action: 'roll' }))).toBe('TYPHU_PAUSED');
    expect(code(() => run(s, p, { action: 'pause' }))).toBe('TYPHU_ACTION_INVALID');
    expect(reconcile(s, 10_000_000, scripted())).toBe(s);
    s = run(s, p, { action: 'resume' }, scripted(), 600_000);
    expect(s.paused).toBeNull();
    expect(s.deadline).toBe(600_000 + deadline - 5000);
    s = run(s, p, { action: 'roll' }, scripted([1, 2]), 600_001);
    expect(who(s, p).position).toBe(3);
  });
  it('a timed match gets the paused minutes back', () => {
    let s = started([A, B], { minutes: 30 });
    const endsAt = s.endsAt!;
    s = run(s, A, { action: 'pause' }, scripted(), 1000);
    s = run(s, B, { action: 'resume' }, scripted(), 61_000);
    expect(s.endsAt).toBe(endsAt + 60_000);
  });
});

describe('Tỷ Phú debts: the player chooses what to sell', () => {
  /** Mover lands on Sa Pa (owner's Nhà 3, rent 147) holding 40 cash and two cities. */
  function inDebt() {
    let s = started();
    const [p, owner] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
    own(s, 5, owner, 3);
    own(s, 1, p); // Hà Giang Mốc: bank pays 50
    own(s, 22, p, 2); // Đà Lạt Nhà 2: bank pays 560
    who(s, p).cash = 40;
    s.bank += 1960;
    s = run(s, p, { action: 'roll' }, scripted([2, 3]));
    return { s, p, owner };
  }
  it('enters DEBT instead of selling automatically, and skip is not allowed', () => {
    const { s, p } = inDebt();
    expect(s.phase).toBe('DEBT');
    expect(s.debt).toMatchObject({ amount: 147, reason: 'RENT', tile: 5 });
    expect(who(s, p).cash).toBe(40);
    expect(code(() => run(s, p, { action: 'skip' }))).toBe('TYPHU_ACTION_INVALID');
  });
  it('sells only the chosen tiles and pays once the cash covers the debt', () => {
    const debt = inDebt();
    let s = debt.s;
    const { p, owner } = debt;
    s = run(s, p, { action: 'sell', tile: 1 });
    expect(s.phase).toBe('DEBT');
    expect(s.tiles[22]).toMatchObject({ owner: p });
    s = run(s, p, { action: 'sell', tile: 22 });
    expect(s.debt).toBeNull();
    expect(who(s, p).cash).toBe(40 + 50 + 560 - 147);
    expect(who(s, owner).cash).toBe(2000 + 147);
    expect(moneyInvariant(s)).toBe(4000);
  });
  it('cannot sell someone else’s tile', () => {
    const { s, p } = inDebt();
    expect(code(() => run(s, p, { action: 'sell', tile: 5 }))).toBe('TYPHU_BAD_TARGET');
  });
  it('declaring bankruptcy hands the remaining cash to the creditor', () => {
    const debt = inDebt();
    let s = debt.s;
    const { p, owner } = debt;
    s = run(s, p, { action: 'declare_bankrupt' });
    expect(who(s, p).status).toBe('BANKRUPT');
    expect(who(s, owner).cash).toBe(2040);
    expect(s.winner).toBe(owner);
  });
  it('a timeout sells the cheapest tiles first, like before', () => {
    const { s, p } = inDebt();
    const after = reconcile({ ...s, deadline: 0 }, 10, scripted());
    expect(after.tiles[1]).toBeNull();
    expect(after.tiles[22]).toBeNull();
    expect(who(after, p).cash).toBe(40 + 50 + 560 - 147);
    expect(after.phase).not.toBe('DEBT');
  });
  it('a debt that selling everything cannot cover is immediate bankruptcy', () => {
    let s = started();
    const [p, owner] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
    own(s, 5, owner, 3);
    own(s, 1, p);
    who(s, p).cash = 10;
    s.bank += 1990;
    s = run(s, p, { action: 'roll' }, scripted([2, 3]));
    expect(who(s, p).status).toBe('BANKRUPT');
    expect(s.phase).not.toBe('DEBT');
  });
  it('tax and the third failed jail roll use the same choice', () => {
    let s = started();
    const p = s.turn!;
    own(s, 31, p, HOTEL); // total 1520 → tax 152
    who(s, p).cash = 50;
    who(s, p).position = 28;
    s.bank += 1950;
    s = run(s, p, { action: 'roll' }, scripted([1, 1])); // 28 → 30 (Thuế nhà)
    expect(s.debt).toMatchObject({ reason: 'TAX', amount: 152 });
    s = run(s, p, { action: 'sell', tile: 31 });
    expect(who(s, p).cash).toBe(50 + 1520 - 152);
    let j = started();
    const q = j.turn!;
    own(j, 22, q, 2); // bank pays 560
    Object.assign(who(j, q), { jailed: true, jailTries: 2, position: JAIL_INDEX, cash: 40 });
    j.bank += 1960;
    j = run(j, q, { action: 'roll' }, scripted([1, 2]));
    expect(j.debt).toMatchObject({ reason: 'JAIL', amount: 100 });
    j = run(j, q, { action: 'sell', tile: 22 });
    expect(who(j, q).cash).toBe(40 + 560 - 100);
    expect(who(j, q).position).toBe(JAIL_INDEX + 3);
  });
  it('a hotel sells for its full total and can cover a monopoly rent', () => {
    let s = started();
    const [p, owner] = [s.turn!, s.players.find((x) => x.id !== s.turn)!.id];
    for (const i of [5, 6, 7]) own(s, i, owner);
    s.tiles[5]!.level = HOTEL; // Sa Pa hotel in a monopoly: 289 × 1.5 = 434
    own(s, 1, p, HOTEL); // Hà Giang hotel: bank pays 345
    who(s, p).cash = 100;
    s.bank += 1900;
    s = run(s, p, { action: 'roll' }, scripted([2, 3]));
    expect(s.debt).toMatchObject({ amount: 434 });
    s = run(s, p, { action: 'sell', tile: 1 });
    expect(who(s, p).cash).toBe(100 + 345 - 434);
    expect(moneyInvariant(s)).toBe(4000);
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
    expect(winProgress(s, p).lines[3]).toEqual({ side: 4, owned: 4, total: 4 });
  });
  it('owning all four beaches wins', () => {
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

describe('Tỷ Phú computer seats and rematch', () => {
  const lobby = () =>
    createTyPhuState('10000000-0000-4000-8000-000000000001', 'room', A, 'An', 'Bàn thử', {
      startCash: 2000,
      turnSeconds: 45,
      minutes: null,
      buyout: true,
    });
  it('only the host adds or removes computer seats, which are always ready', () => {
    let s = lobby();
    s = run(s, B, { action: 'join' });
    expect(code(() => run(s, B, { action: 'add_bot' }))).toBe('PERMISSION_DENIED');
    s = run(s, A, { action: 'add_bot' });
    s = run(s, A, { action: 'add_bot' });
    const bots = s.players.filter((p) => p.bot);
    expect(bots.map((p) => p.id)).toEqual(botIds.slice(0, 2));
    expect(bots.every((p) => p.ready && p.auto)).toBe(true);
    expect(code(() => run(s, A, { action: 'add_bot' }))).toBe('TYPHU_SEAT_TAKEN');
    expect(code(() => run(s, A, { action: 'remove_bot', player: B }))).toBe('TYPHU_BAD_TARGET');
    s = run(s, A, { action: 'remove_bot', player: botIds[0] });
    expect(s.players.map((p) => p.id)).toEqual([A, B, botIds[1]]);
  });
  it('a host can start against the computer alone, and the bot keeps playing itself', () => {
    let s = lobby();
    s = run(s, A, { action: 'add_bot' });
    s = run(s, A, { action: 'start' });
    expect(s.status).toBe('PLAYING');
    const bot = who(s, botIds[0]);
    expect(bot.bot && bot.auto).toBe(true);
    // Hand the turn to the bot: its deadline is short and the server moves for it.
    s.turn = bot.id;
    s.phase = 'ROLL';
    s.deadline = 0;
    s = reconcile(s, 10, scripted([1, 2]));
    expect(who(s, bot.id).position).toBe(3);
    expect(who(s, bot.id).misses).toBe(0);
  });
  it('a bot buys up to Nhà 3 but keeps a cash reserve', () => {
    let s = lobby();
    s = run(s, A, { action: 'add_bot' });
    s = run(s, A, { action: 'start' });
    const bot = who(s, botIds[0]);
    bot.position = 22;
    bot.lap = 2;
    s.turn = bot.id;
    s.phase = 'BUY';
    s.pending = { tile: 22 };
    s.deadline = 0;
    s = reconcile(s, 10, scripted());
    expect(s.tiles[22]).toMatchObject({ owner: bot.id, level: 3 });
    let poor = run(lobby(), A, { action: 'add_bot' });
    poor = run(poor, A, { action: 'start' });
    who(poor, botIds[0]).cash = 300;
    Object.assign(poor, { turn: botIds[0], phase: 'BUY', pending: { tile: 22 }, deadline: 0 });
    poor = reconcile(poor, 10, scripted());
    expect(poor.tiles[22]).toBeNull();
  });
  it('the game ends by wealth once only computers are left', () => {
    let s = lobby();
    s = run(s, A, { action: 'add_bot' });
    s = run(s, A, { action: 'add_bot' });
    s = run(s, A, { action: 'start' });
    s = run(s, A, { action: 'surrender' });
    expect(s.status).toBe('FINISHED');
    expect(botIds).toContain(s.winner);
  });
  it('a host leaving the lobby hands it to a person, never to a bot', () => {
    let s = lobby();
    s = run(s, A, { action: 'add_bot' });
    s = run(s, B, { action: 'join' });
    s = run(s, A, { action: 'leave' });
    expect(s.host).toBe(B);
    let alone = run(lobby(), A, { action: 'add_bot' });
    alone = run(alone, A, { action: 'leave' });
    expect(alone.status).toBe('CANCELLED');
  });
  it('only the host links a rematch, once, after the game is over', () => {
    let s = started();
    const next = '10000000-0000-4000-8000-000000000002';
    expect(code(() => run(s, A, { action: 'rematch', game: next }))).toBe('PERMISSION_DENIED');
    s = run(s, B, { action: 'surrender' });
    expect(code(() => run(s, B, { action: 'rematch', game: next }))).toBe('PERMISSION_DENIED');
    s = run(s, A, { action: 'rematch', game: next });
    expect(s.rematch).toBe(next);
    expect(code(() => run(s, A, { action: 'rematch', game: next }))).toBe('TYPHU_ACTION_INVALID');
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
      return { action: 'fly', to: pick(flyTargets(s, p)) };
    case 'REVEAL':
      return { action: 'card_ok' };
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
      if (p.cash < 50) return { action: 'skip' };
      const mine = cities.filter((c) => s.tiles[c.index]?.owner === p.id);
      return random() < 0.9 ? { action: 'festival', tile: pick(mine).index } : { action: 'skip' };
    }
    case 'DEBT': {
      if (random() < 0.05) return { action: 'declare_bankrupt' };
      const mine = board.filter((t) => s.tiles[t.index]?.owner === p.id);
      return { action: 'sell', tile: pick(mine).index };
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
  it('300 games between computer seats always finish with money conserved', () => {
    const reasons: Record<string, number> = {};
    for (let game = 0; game < 300; game++) {
      const random = mulberry(10_000 + game);
      const rng: TyPhuRandom = {
        die: () => 1 + Math.floor(random() * 6),
        index: (n) => Math.floor(random() * n),
      };
      let s = createTyPhuState('10000000-0000-4000-8000-000000000001', 'room', A, 'An', 'Bàn', {
        startCash: 2000,
        turnSeconds: 45,
        minutes: null,
        buyout: true,
      });
      for (let i = 0; i < 1 + (game % 3); i++)
        s = transition(s, A, 'An', { action: 'add_bot' }, 0, rng);
      s = transition(s, A, 'An', { action: 'start' }, 0, rng);
      // The person goes fully automatic too, so only engine-driven play remains.
      s.players.find((p) => p.id === A)!.auto = true;
      const total = moneyInvariant(s);
      let now = 1;
      for (let steps = 0; s.status === 'PLAYING' && steps < 20_000; steps++) {
        now = Math.max(now + 1, s.deadline ?? now);
        s = reconcile(s, now, rng);
        expect(moneyInvariant(s)).toBe(total);
      }
      expect(s.status).toBe('FINISHED');
      reasons[s.winReason!] = (reasons[s.winReason!] ?? 0) + 1;
    }
    console.info('Tỷ Phú bot simulation', reasons);
    expect(reasons.LAST_STANDING ?? 0).toBeLessThan(300);
  }, 120_000);
});
