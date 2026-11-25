// Pure rules engine for Tỷ Phú Phố Nhạc. No I/O: the caller supplies time and randomness,
// so the server can use crypto randomness and tests can replay exact games.
import { AppError } from '../domain';
import {
  AIRPORT_INDEX,
  BEACH_RENTS,
  BIRTHDAY_GIFT,
  BOARD_SIZE,
  FESTIVAL_INDEX,
  FESTIVAL_FEE,
  FLY_FEE,
  HOTEL,
  JAIL_FINE,
  JAIL_INDEX,
  SALARY,
  beaches,
  board,
  cities,
  groupTiles,
  groups,
  levelCost,
  levelNames,
  levelRent,
  levelValue,
  sideCities,
  tile,
} from './board';
import { cardIds, cards, type CardId } from './cards';
import {
  defaultTyPhuRules,
  type TyPhuCommand,
  type TyPhuDebt,
  type TyPhuPlayer,
  type TyPhuPublicState,
  type TyPhuRules,
  type TyPhuState,
  type WinReason,
} from './contracts';

export interface TyPhuRandom {
  /** 1–6 inclusive. */
  die(): number;
  /** Uniform integer in [0, n). */
  index(n: number): number;
}

export const MAX_PLAYERS = 4;
export const AUTO_MS = 1500;
export const CARD_TARGET_MS = 20_000;
/** Everyone sees a drawn chance card this long before it takes effect. */
export const REVEAL_MS = 4000;
/** Client animation budget after a roll: dice fall, then the pawn walks tile by tile. */
export const DICE_MS = 1100;
export const STEP_MS = 200;
/** Shortest turn time left after a pause ends. */
const RESUME_MS = 10_000;
const LOG_LIMIT = 40;
/** Computer seats use fixed ids that no real account can have. */
export const botIds = [
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000003',
];
const botNames = ['Máy · Đàn Bầu', 'Máy · Sáo Trúc', 'Máy · Trống Cơm'];
const humans = (s: TyPhuState) => s.players.filter((p) => !p.bot);

function fail(code = 'TYPHU_ACTION_INVALID'): never {
  throw new AppError(code, 409);
}

// ---------------------------------------------------------------- creation & lobby

export function createTyPhuState(
  id: string,
  room: string,
  host: string,
  hostName: string,
  name: string,
  rules: TyPhuRules = defaultTyPhuRules,
): TyPhuState {
  return {
    schema: 1,
    id,
    room,
    host,
    name,
    version: 0,
    status: 'WAITING',
    rules,
    players: [newPlayer(host, hostName, 0, rules.startCash)],
    turn: null,
    phase: 'ROLL',
    pending: null,
    tiles: board.map(() => null),
    festival: null,
    dice: null,
    extraRoll: false,
    debt: null,
    deck: [],
    bank: 0,
    deadline: null,
    startedAt: null,
    endsAt: null,
    winner: null,
    winReason: null,
    log: [],
  };
}

function newPlayer(id: string, name: string, color: number, cash: number): TyPhuPlayer {
  return {
    id,
    name: name.slice(0, 40) || 'Người chơi',
    color,
    ready: false,
    cash,
    position: 0,
    lap: 1,
    jailed: false,
    jailTries: 0,
    status: 'ACTIVE',
    misses: 0,
    auto: false,
    doubles: 0,
    pass: false,
    shield: false,
    half: false,
    fine: false,
    flyNext: false,
    freeFly: false,
  };
}

// ---------------------------------------------------------------- money & values

const player = (s: TyPhuState, id: string) => s.players.find((p) => p.id === id);
const mustPlayer = (s: TyPhuState, id: string) => player(s, id) ?? fail('PERMISSION_DENIED');
export const activePlayers = (s: TyPhuState) => s.players.filter((p) => p.status === 'ACTIVE');
export const ownedBy = (s: TyPhuState, id: string) =>
  board.filter((t) => s.tiles[t.index]?.owner === id);

export function hasMonopoly(s: TyPhuState, owner: string, group: number) {
  return groupTiles(group).every((t) => s.tiles[t.index]?.owner === owner);
}
/** Total value V of a tile at its current level. */
export function tileValue(s: TyPhuState, index: number) {
  const t = tile(index),
    owned = s.tiles[index];
  if (!t.price) return 0;
  if (t.kind === 'BEACH') return t.price;
  return Math.round(t.price * levelValue[owned?.level ?? 0]);
}
/** Current price P = V × monopoly bonus. */
export function currentPrice(s: TyPhuState, index: number) {
  const t = tile(index),
    owned = s.tiles[index];
  const bonus =
    t.kind === 'CITY' && owned && t.group !== undefined && hasMonopoly(s, owned.owner, t.group)
      ? 1.5
      : 1;
  return Math.round(tileValue(s, index) * bonus);
}
export const buyoutPrice = (s: TyPhuState, index: number) =>
  Math.round(1.5 * currentPrice(s, index));
export const bankSalePrice = (s: TyPhuState, index: number) =>
  Math.round(0.5 * currentPrice(s, index));

/** Rent before the payer's card modifier: 10% × G × M × K × H (beaches: 25 / 50 / 200 by count). */
export function baseRent(s: TyPhuState, index: number) {
  const t = tile(index),
    owned = s.tiles[index];
  if (!owned || !t.price || owned.blackout > 0) return 0;
  if (t.kind === 'BEACH')
    return BEACH_RENTS[beaches.filter((b) => s.tiles[b.index]?.owner === owned.owner).length] ?? 0;
  const monopoly = t.group !== undefined && hasMonopoly(s, owned.owner, t.group) ? 1.5 : 1;
  const festival = s.festival === index ? 2 : 1;
  return Math.round(0.1 * t.price * levelRent[owned.level] * monopoly * festival);
}
export function netWorth(s: TyPhuState, id: string) {
  const p = player(s, id);
  if (!p || p.status !== 'ACTIVE') return 0;
  return p.cash + ownedBy(s, id).reduce((sum, t) => sum + currentPrice(s, t.index), 0);
}

function log(s: TyPhuState, now: number, type: string, text: string, actor?: string) {
  s.log.push({ at: now, type, text, ...(actor ? { actor } : {}) });
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}
function receive(s: TyPhuState, p: TyPhuPlayer, amount: number) {
  p.cash += amount;
  s.bank -= amount;
}
function spend(s: TyPhuState, p: TyPhuPlayer, amount: number) {
  if (amount > p.cash) fail('TYPHU_NOT_ENOUGH_CASH');
  p.cash -= amount;
  s.bank += amount;
}
function releaseTile(s: TyPhuState, index: number) {
  s.tiles[index] = null;
  if (s.festival === index) s.festival = null;
}
/** Sells the cheapest tiles to the bank until `amount` is covered. Returns true when covered. */
function liquidate(s: TyPhuState, p: TyPhuPlayer, amount: number, now: number) {
  const owned = ownedBy(s, p.id).sort(
    (a, b) => currentPrice(s, a.index) - currentPrice(s, b.index) || a.index - b.index,
  );
  for (const t of owned) {
    if (p.cash >= amount) break;
    const price = bankSalePrice(s, t.index);
    releaseTile(s, t.index);
    receive(s, p, price);
    log(s, now, 'bank_sale', `${p.name} bán ${t.name} cho ngân hàng được ${price}.`, p.id);
  }
  return p.cash >= amount;
}
function bankrupt(s: TyPhuState, p: TyPhuPlayer, creditor: TyPhuPlayer | null, now: number) {
  if (creditor) {
    creditor.cash += p.cash;
  } else s.bank += p.cash;
  p.cash = 0;
  for (const t of ownedBy(s, p.id)) releaseTile(s, t.index);
  p.status = 'BANKRUPT';
  p.pass = p.shield = p.half = p.fine = false;
  log(s, now, 'bankrupt', `${p.name} phá sản.`, p.id);
}
/**
 * Moves money from a player to another player or the bank. Rent and tax apply the payer's
 * pending ×2 / ×0.5 cards. Shortfalls sell property; anything still missing is bankruptcy.
 * Returns the amount actually paid.
 */
function pay(
  s: TyPhuState,
  payer: TyPhuPlayer,
  payee: TyPhuPlayer | null,
  base: number,
  now: number,
  modifiers = false,
) {
  let amount = base;
  if (modifiers && base > 0) {
    const factor = (payer.fine ? 2 : 1) * (payer.half ? 0.5 : 1);
    if (payer.fine || payer.half) {
      if (payer.fine) log(s, now, 'card_used', `${payer.name} chịu phạt gấp đôi.`, payer.id);
      if (payer.half)
        log(s, now, 'card_used', `${payer.name} dùng phiếu giảm giá nửa vé.`, payer.id);
    }
    payer.fine = payer.half = false;
    amount = Math.round(base * factor);
  }
  if (amount <= 0) return 0;
  if (payer.cash < amount && !liquidate(s, payer, amount, now)) {
    const paid = payer.cash;
    bankrupt(s, payer, payee, now);
    return paid;
  }
  payer.cash -= amount;
  if (payee) payee.cash += amount;
  else s.bank += amount;
  return amount;
}

/** Total the bank would pay for everything a player owns. */
export function liquidationValue(s: TyPhuState, id: string) {
  return ownedBy(s, id).reduce((sum, t) => sum + bankSalePrice(s, t.index), 0);
}
/**
 * A payment by the player whose turn it is. Shortfalls that selling could cover become a
 * DEBT phase where the player picks what to sell; hopeless ones are bankruptcy at once.
 */
function charge(
  s: TyPhuState,
  payer: TyPhuPlayer,
  payee: TyPhuPlayer | null,
  base: number,
  now: number,
  debt: Omit<TyPhuDebt, 'amount' | 'creditor'>,
  modifiers: boolean,
): 'PAID' | 'DEBT' | 'BANKRUPT' {
  let amount = base;
  if (modifiers && base > 0) {
    if (payer.fine) log(s, now, 'card_used', `${payer.name} chịu phạt gấp đôi.`, payer.id);
    if (payer.half) log(s, now, 'card_used', `${payer.name} dùng phiếu giảm giá nửa vé.`, payer.id);
    amount = Math.round(base * (payer.fine ? 2 : 1) * (payer.half ? 0.5 : 1));
    payer.fine = payer.half = false;
  }
  if (amount <= 0) return 'PAID';
  if (payer.cash >= amount) {
    payer.cash -= amount;
    if (payee) payee.cash += amount;
    else s.bank += amount;
    s.debt = null;
    return 'PAID';
  }
  if (payer.cash + liquidationValue(s, payer.id) < amount) {
    bankrupt(s, payer, payee, now);
    return 'BANKRUPT';
  }
  s.debt = { ...debt, amount, creditor: payee?.id ?? null };
  log(s, now, 'debt', `${payer.name} thiếu tiền, cần bán ô để trả ${amount}.`, payer.id);
  setPhase(s, 'DEBT', now);
  return 'DEBT';
}
function afterRent(s: TyPhuState, p: TyPhuPlayer, index: number, paid: number, now: number) {
  const t = tile(index);
  const owner = player(s, s.tiles[index]?.owner ?? '');
  if (paid && owner)
    log(s, now, 'rent', `${p.name} trả ${owner.name} ${paid} tiền thuê ${t.name}.`, p.id);
  if (
    owner &&
    p.status === 'ACTIVE' &&
    s.rules.buyout &&
    t.kind === 'CITY' &&
    s.tiles[index]!.level < HOTEL &&
    p.cash >= buyoutPrice(s, index)
  )
    return setPhase(s, 'BUYOUT', now, { tile: index });
  settle(s, now);
}
/** Finishes the outstanding DEBT payment once the player holds enough cash. */
function completeDebt(s: TyPhuState, p: TyPhuPlayer, now: number, rng: TyPhuRandom) {
  const debt = s.debt!;
  s.debt = null;
  const creditor = debt.creditor ? player(s, debt.creditor) : null;
  p.cash -= debt.amount;
  if (creditor && creditor.status === 'ACTIVE') creditor.cash += debt.amount;
  else s.bank += debt.amount;
  s.pending = null;
  if (debt.reason === 'RENT') return afterRent(s, p, debt.tile!, debt.amount, now);
  if (debt.reason === 'TAX') {
    log(s, now, 'tax', `${p.name} nộp thuế nhà ${debt.amount}.`, p.id);
    return settle(s, now);
  }
  log(s, now, 'jail_exit', `${p.name} hết 3 lượt, nộp phạt ${JAIL_FINE} để ra tù.`, p.id);
  moveBy(s, p, (s.dice?.[0] ?? 0) + (s.dice?.[1] ?? 0), now);
  land(s, p, now, rng);
}
function sellToBank(s: TyPhuState, p: TyPhuPlayer, index: number, now: number) {
  const price = bankSalePrice(s, index);
  releaseTile(s, index);
  receive(s, p, price);
  log(s, now, 'bank_sale', `${p.name} bán ${tile(index).name} cho ngân hàng được ${price}.`, p.id);
}

// ---------------------------------------------------------------- building

/** Highest level this player may build to on a tile during the current stop. */
export function buildCap(p: TyPhuPlayer, levelAtStopStart: number) {
  if (p.lap <= 1) return 2;
  if (p.lap === 2) return 3;
  return levelAtStopStart >= 3 ? HOTEL : 3;
}
export function buildCost(index: number, from: number, to: number) {
  const price = tile(index).price ?? 0;
  let cost = 0;
  for (let level = from + 1; level <= to; level++) cost += price * levelCost[level];
  return Math.round(cost);
}
function canBuildOn(s: TyPhuState, p: TyPhuPlayer, index: number) {
  const owned = s.tiles[index];
  return (
    tile(index).kind === 'CITY' &&
    owned?.owner === p.id &&
    owned.level < buildCap(p, owned.level) &&
    p.cash >= buildCost(index, owned.level, owned.level + 1)
  );
}

// ---------------------------------------------------------------- turn flow

function turnMs(s: TyPhuState, p: TyPhuPlayer) {
  return p.auto ? AUTO_MS : s.rules.turnSeconds * 1000;
}
function setPhase(
  s: TyPhuState,
  phase: TyPhuState['phase'],
  now: number,
  pending: TyPhuState['pending'] = null,
  ms?: number,
  exact = false,
) {
  const current = mustPlayer(s, s.turn!);
  s.phase = phase;
  s.pending = pending;
  const wait = ms !== undefined && (exact || !current.auto) ? ms : turnMs(s, current);
  // A paused game keeps the time left aside and has no deadline until it resumes.
  if (s.paused) {
    s.paused.left = wait;
    s.deadline = null;
  } else s.deadline = now + wait;
}
/** Tiles a flight may land on: unowned land or the flyer's own land. */
export function flyTargets(s: TyPhuState, p: TyPhuPlayer) {
  return board
    .filter(
      (t) =>
        (t.kind === 'CITY' || t.kind === 'BEACH') && (s.tiles[t.index]?.owner ?? p.id) === p.id,
    )
    .map((t) => t.index);
}
const canFly = (s: TyPhuState, p: TyPhuPlayer) =>
  (p.freeFly || p.cash >= FLY_FEE) && flyTargets(s, p).length > 0;
function startTurn(s: TyPhuState, id: string, now: number) {
  const p = mustPlayer(s, id);
  s.turn = id;
  s.extraRoll = false;
  s.debt = null;
  s.dice = null;
  p.doubles = 0;
  if (p.flyNext && !canFly(s, p)) {
    p.flyNext = p.freeFly = false;
    log(s, now, 'fly_void', `${p.name} không đủ ${FLY_FEE} để bay, tung xúc xắc như thường.`, p.id);
  }
  setPhase(s, p.flyNext ? 'FLY' : 'ROLL', now);
}
function endTurn(s: TyPhuState, now: number) {
  const current = s.turn;
  if (current)
    for (const owned of s.tiles)
      if (owned?.owner === current && owned.blackout > 0) owned.blackout--;
  if (checkWinner(s, now)) return;
  if (s.endsAt !== null && now >= s.endsAt) return finishByWealth(s, now);
  const order = s.players;
  const from = Math.max(
    0,
    order.findIndex((p) => p.id === current),
  );
  for (let step = 1; step <= order.length; step++) {
    const next = order[(from + step) % order.length];
    if (next.status === 'ACTIVE') return startTurn(s, next.id, now);
  }
}
/** Called whenever the current stop has nothing left to decide. */
function settle(s: TyPhuState, now: number) {
  if (s.status !== 'PLAYING') return;
  if (checkWinner(s, now)) return;
  const p = player(s, s.turn ?? '');
  if (!p || p.status !== 'ACTIVE') return endTurn(s, now);
  if (s.extraRoll && !p.jailed) {
    s.extraRoll = false;
    return setPhase(s, 'ROLL', now);
  }
  endTurn(s, now);
}
function sendToJail(s: TyPhuState, p: TyPhuPlayer, now: number) {
  p.position = JAIL_INDEX;
  p.jailed = true;
  p.jailTries = 0;
  p.doubles = 0;
  s.extraRoll = false;
  log(s, now, 'jail', `${p.name} vào tù.`, p.id);
}
/** Moves forward, paying salary when passing or landing on Start. */
function moveTo(s: TyPhuState, p: TyPhuPlayer, to: number, now: number) {
  if (to < p.position || (to === 0 && p.position !== 0)) {
    p.lap++;
    receive(s, p, SALARY);
    log(s, now, 'salary', `${p.name} qua Xuất phát, nhận ${SALARY}.`, p.id);
  }
  p.position = to;
}
function moveBy(s: TyPhuState, p: TyPhuPlayer, steps: number, now: number) {
  moveTo(s, p, (p.position + steps) % BOARD_SIZE, now);
}

function land(s: TyPhuState, p: TyPhuPlayer, now: number, rng: TyPhuRandom): void {
  const t = tile(p.position);
  switch (t.kind) {
    case 'START':
      if (ownedBy(s, p.id).some((c) => canBuildOn(s, p, c.index)))
        return setPhase(s, 'START_BUILD', now);
      return settle(s, now);
    // Jail, the festival corner and the airport end the turn, even after a double.
    case 'JAIL':
      s.extraRoll = false;
      return settle(s, now);
    case 'FESTIVAL':
      s.extraRoll = false;
      if (p.cash >= FESTIVAL_FEE && ownedBy(s, p.id).some((c) => c.kind === 'CITY'))
        return setPhase(s, 'FESTIVAL', now);
      return settle(s, now);
    case 'AIRPORT':
      s.extraRoll = false;
      p.flyNext = true;
      return settle(s, now);
    case 'TAX': {
      const value = ownedBy(s, p.id).reduce((sum, c) => sum + tileValue(s, c.index), 0);
      const before = p.cash;
      const result = charge(s, p, null, Math.round(0.1 * value), now, { reason: 'TAX' }, true);
      if (result === 'DEBT') return;
      if (result === 'PAID' && before > p.cash)
        log(s, now, 'tax', `${p.name} nộp thuế nhà ${before - p.cash}.`, p.id);
      return settle(s, now);
    }
    case 'CHANCE':
      return drawCard(s, p, now, rng);
    case 'CITY':
    case 'BEACH': {
      const owned = s.tiles[t.index];
      if (!owned) {
        if (p.cash >= (t.price ?? 0)) return setPhase(s, 'BUY', now, { tile: t.index });
        return settle(s, now);
      }
      if (owned.owner === p.id) {
        if (canBuildOn(s, p, t.index))
          return setPhase(s, 'BUILD', now, { tile: t.index, from: owned.level });
        return settle(s, now);
      }
      const owner = mustPlayer(s, owned.owner);
      const rent = baseRent(s, t.index);
      if (rent === 0 && owned.blackout > 0)
        log(s, now, 'blackout', `${t.name} đang mất điện, không thu tiền thuê.`, p.id);
      const before = p.cash;
      const result = charge(s, p, owner, rent, now, { reason: 'RENT', tile: t.index }, true);
      if (result === 'DEBT') return;
      if (result === 'BANKRUPT') return settle(s, now);
      return afterRent(s, p, t.index, before - p.cash, now);
    }
  }
}

// ---------------------------------------------------------------- chance cards

function drawCard(s: TyPhuState, p: TyPhuPlayer, now: number, rng: TyPhuRandom): void {
  if (!s.deck.length) s.deck = shuffledDeck(s, rng);
  const card = s.deck.shift();
  if (!card) return settle(s, now);
  log(s, now, 'card', `${p.name} rút phiếu “${cards[card].name}”.`, p.id);
  // Everyone sees the card first; it takes effect when the drawer confirms or time runs out.
  setPhase(s, 'REVEAL', now, { card }, REVEAL_MS, true);
}
function resolveCard(s: TyPhuState, p: TyPhuPlayer, now: number, rng: TyPhuRandom): void {
  const card = s.pending!.card!;
  s.pending = null;
  const target = cards[card].target;
  if (target && cardTargets(s, p, card).length === 0) {
    log(s, now, 'card_void', 'Không có mục tiêu hợp lệ, phiếu không có tác dụng.', p.id);
    return settle(s, now);
  }
  if (target) return setPhase(s, 'CARD', now, { card }, CARD_TARGET_MS);
  return applyCard(s, p, card, now, rng);
}
/** Fresh deck order; cards currently held by players stay out of the deck. */
function shuffledDeck(s: TyPhuState, rng: TyPhuRandom): CardId[] {
  const held = new Set<CardId>();
  for (const p of activePlayers(s)) {
    if (p.pass) held.add('JAIL_PASS');
    if (p.shield) held.add('SHIELD');
    if (p.half) held.add('HALF_PRICE');
  }
  const deck = cardIds.filter((c) => !held.has(c));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.index(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
/** Valid tile targets for a targeted card. */
export function cardTargets(s: TyPhuState, p: TyPhuPlayer, card: CardId): number[] {
  const others = new Set(
    activePlayers(s)
      .filter((o) => o.id !== p.id)
      .map((o) => o.id),
  );
  switch (cards[card].target) {
    case 'OPPONENT_CITY':
      return cities
        .filter((c) => {
          const owned = s.tiles[c.index];
          if (!owned || !others.has(owned.owner) || owned.level >= HOTEL) return false;
          if (card === 'STORM' || card === 'DEMOLISH') return owned.level >= 1;
          if (card === 'BLACKOUT') return owned.blackout === 0;
          return true;
        })
        .map((c) => c.index);
    case 'OWN_CITY_AND_PLAYER':
      return others.size
        ? cities
            .filter((c) => s.tiles[c.index]?.owner === p.id && s.tiles[c.index]!.level < HOTEL)
            .map((c) => c.index)
        : [];
    case 'OWN_CITY':
      return cities.filter((c) => s.tiles[c.index]?.owner === p.id).map((c) => c.index);
    default:
      return [];
  }
}
function applyCard(
  s: TyPhuState,
  p: TyPhuPlayer,
  card: CardId,
  now: number,
  rng: TyPhuRandom,
  target?: { tile: number; player?: string },
): void {
  const t = target ? tile(target.tile) : null;
  switch (card) {
    case 'STORM':
    case 'DEMOLISH':
    case 'EVICT':
    case 'BLACKOUT': {
      const owned = s.tiles[t!.index]!;
      const victim = mustPlayer(s, owned.owner);
      if (victim.shield) {
        victim.shield = false;
        log(s, now, 'shield', `${victim.name} dùng Bảo hiểm sân khấu chặn phiếu tấn công.`, p.id);
        break;
      }
      if (card === 'STORM') {
        owned.level--;
        log(s, now, 'storm', `${t!.name} bị hạ xuống ${levelNames[owned.level]}.`, p.id);
      } else if (card === 'DEMOLISH') {
        owned.level = 0;
        log(s, now, 'demolish', `Toàn bộ nhà ở ${t!.name} bị phá dỡ.`, p.id);
      } else if (card === 'EVICT') {
        const refund = bankSalePrice(s, t!.index);
        releaseTile(s, t!.index);
        receive(s, victim, refund);
        log(s, now, 'evict', `${t!.name} bị thu hồi; ${victim.name} nhận lại ${refund}.`, p.id);
      } else {
        owned.blackout = 2;
        log(s, now, 'blackout', `${t!.name} mất điện trong 2 lượt của ${victim.name}.`, p.id);
      }
      break;
    }
    case 'GIFT': {
      const recipient = mustPlayer(s, target!.player!);
      s.tiles[t!.index]!.owner = recipient.id;
      s.tiles[t!.index]!.blackout = 0;
      log(s, now, 'gift', `${p.name} tặng ${t!.name} cho ${recipient.name}.`, p.id);
      break;
    }
    case 'HOST_FESTIVAL':
      s.festival = t!.index;
      log(s, now, 'festival', `${t!.name} đăng cai Đại nhạc hội.`, p.id);
      break;
    case 'JAIL':
      sendToJail(s, p, now);
      return settle(s, now);
    case 'DOUBLE_FINE':
      p.fine = true;
      break;
    case 'BIRTHDAY':
      for (const other of activePlayers(s))
        if (other.id !== p.id) pay(s, other, p, BIRTHDAY_GIFT, now);
      break;
    case 'HALF_PRICE':
      p.half = true;
      break;
    case 'JAIL_PASS':
      p.pass = true;
      break;
    case 'SHIELD':
      p.shield = true;
      break;
    case 'GO_FESTIVAL':
      moveTo(s, p, s.festival ?? FESTIVAL_INDEX, now);
      return land(s, p, now, rng);
    case 'GO_AIRPORT':
      moveTo(s, p, AIRPORT_INDEX, now);
      p.freeFly = true;
      return land(s, p, now, rng);
    case 'GO_START':
      moveTo(s, p, 0, now);
      return land(s, p, now, rng);
  }
  settle(s, now);
}

// ---------------------------------------------------------------- win conditions

export function winProgress(s: TyPhuState, id: string) {
  const monopolies = groups.filter((g) => hasMonopoly(s, id, g)).length;
  const beachCount = beaches.filter((b) => s.tiles[b.index]?.owner === id).length;
  const lines = ([1, 2, 3, 4] as const).map((side) => ({
    side,
    owned: sideCities(side).filter((c) => s.tiles[c.index]?.owner === id).length,
    total: sideCities(side).length,
  }));
  return { monopolies, beaches: beachCount, lines };
}
function winReason(s: TyPhuState, id: string): WinReason | null {
  const progress = winProgress(s, id);
  if (progress.monopolies >= 3) return 'MONOPOLY';
  if (progress.lines.some((l) => l.owned === l.total)) return 'LINE';
  if (progress.beaches >= 4) return 'BEACHES';
  return null;
}
function finish(s: TyPhuState, winner: string, reason: WinReason, now: number) {
  s.status = 'FINISHED';
  s.paused = null;
  s.winner = winner;
  s.winReason = reason;
  s.deadline = null;
  s.pending = null;
  const names: Record<WinReason, string> = {
    MONOPOLY: 'có 3 monopoly',
    LINE: 'độc chiếm một dãy nhà',
    BEACHES: 'sở hữu 4 bãi biển',
    LAST_STANDING: 'là người trụ lại cuối cùng',
    TIME: 'giàu nhất khi hết giờ',
  };
  log(s, now, 'win', `${mustPlayer(s, winner).name} thắng vì ${names[reason]}.`, winner);
}
function checkWinner(s: TyPhuState, now: number) {
  if (s.status !== 'PLAYING') return true;
  const alive = activePlayers(s);
  if (alive.length <= 1) {
    if (alive[0]) finish(s, alive[0].id, 'LAST_STANDING', now);
    else s.status = 'CANCELLED';
    return true;
  }
  if (!alive.some((p) => !p.bot)) {
    log(s, now, 'bots_only', 'Không còn người chơi thật; ván kết thúc theo tài sản.');
    finishByWealth(s, now);
    return true;
  }
  // The player whose turn it is is checked first, then everyone else (a gift can hand a win).
  const start = Math.max(
    0,
    alive.findIndex((p) => p.id === s.turn),
  );
  for (let i = 0; i < alive.length; i++) {
    const p = alive[(start + i) % alive.length];
    const reason = winReason(s, p.id);
    if (reason) {
      finish(s, p.id, reason, now);
      return true;
    }
  }
  return false;
}
function finishByWealth(s: TyPhuState, now: number) {
  const best = activePlayers(s)
    .map((p, order) => ({ p, worth: netWorth(s, p.id), order }))
    .sort((a, b) => b.worth - a.worth || a.order - b.order)[0];
  if (best) finish(s, best.p.id, 'TIME', now);
}

// ---------------------------------------------------------------- commands

/** Rolls, then holds the next deadline until the dice and the walk have played out. */
function rollDice(s: TyPhuState, p: TyPhuPlayer, now: number, rng: TyPhuRandom) {
  const from = p.position;
  rollAndMove(s, p, now, rng);
  const steps = (p.position - from + BOARD_SIZE) % BOARD_SIZE;
  const walk = steps > 0 && steps <= 12 ? steps * STEP_MS : 0;
  if (s.status !== 'PLAYING') return;
  if (s.deadline !== null) s.deadline += DICE_MS + walk;
  else if (s.paused?.left != null) s.paused.left += DICE_MS + walk;
}
function rollAndMove(s: TyPhuState, p: TyPhuPlayer, now: number, rng: TyPhuRandom) {
  const d1 = rng.die(),
    d2 = rng.die();
  s.dice = [d1, d2];
  const double = d1 === d2;
  log(s, now, 'roll', `${p.name} tung ${d1} + ${d2}${double ? ' (đôi)' : ''}.`, p.id);
  if (p.jailed) {
    if (double) {
      p.jailed = false;
      p.jailTries = 0;
      log(s, now, 'jail_exit', `${p.name} ra tù nhờ tung đôi.`, p.id);
    } else {
      p.jailTries++;
      if (p.jailTries < 3) return settle(s, now);
      p.jailed = false;
      p.jailTries = 0;
      const result = charge(s, p, null, JAIL_FINE, now, { reason: 'JAIL' }, false);
      if (result === 'DEBT') return;
      if (result === 'BANKRUPT') return settle(s, now);
      log(s, now, 'jail_exit', `${p.name} hết 3 lượt, nộp phạt ${JAIL_FINE} để ra tù.`, p.id);
    }
    moveBy(s, p, d1 + d2, now);
    return land(s, p, now, rng);
  }
  if (double) {
    p.doubles++;
    if (p.doubles >= 3) {
      sendToJail(s, p, now);
      return settle(s, now);
    }
    s.extraRoll = true;
  } else s.extraRoll = false;
  moveBy(s, p, d1 + d2, now);
  land(s, p, now, rng);
}

function requireTurn(s: TyPhuState, actor: string, ...phases: TyPhuState['phase'][]) {
  if (s.status !== 'PLAYING') fail();
  if (s.paused) fail('TYPHU_PAUSED');
  if (s.turn !== actor) fail('TYPHU_NOT_YOUR_TURN');
  if (!phases.includes(s.phase)) fail();
  return mustPlayer(s, actor);
}

export function transition(
  state: TyPhuState,
  actor: string,
  actorName: string,
  command: TyPhuCommand,
  now: number,
  rng: TyPhuRandom,
): TyPhuState {
  const s = structuredClone(state);
  apply(s, actor, actorName, command, now, rng);
  s.version++;
  return s;
}

function apply(
  s: TyPhuState,
  actor: string,
  actorName: string,
  command: TyPhuCommand,
  now: number,
  rng: TyPhuRandom,
) {
  switch (command.action) {
    case 'join': {
      if (s.status !== 'WAITING' || s.players.length >= MAX_PLAYERS) fail('TYPHU_SEAT_TAKEN');
      if (player(s, actor)) fail('TYPHU_SEAT_TAKEN');
      const used = new Set(s.players.map((p) => p.color));
      const color = [0, 1, 2, 3].find((c) => !used.has(c))!;
      s.players.push(newPlayer(actor, actorName, color, s.rules.startCash));
      log(s, now, 'join', `${actorName} vào bàn.`, actor);
      return;
    }
    case 'leave': {
      mustPlayer(s, actor);
      if (s.status === 'WAITING') {
        s.players = s.players.filter((p) => p.id !== actor);
        if (!humans(s).length) s.status = 'CANCELLED';
        else if (s.host === actor) s.host = humans(s)[0].id;
        return;
      }
      return surrender(s, actor, now);
    }
    case 'ready': {
      if (s.status !== 'WAITING') fail();
      mustPlayer(s, actor).ready = command.ready;
      return;
    }
    case 'start': {
      if (s.status !== 'WAITING') fail();
      if (s.host !== actor) fail('PERMISSION_DENIED');
      if (s.players.length < 2 || s.players.some((p) => p.id !== s.host && !p.ready))
        fail('TYPHU_NOT_READY');
      // Seat order is drawn by the server, never by whoever presses start.
      for (let i = s.players.length - 1; i > 0; i--) {
        const j = rng.index(i + 1);
        [s.players[i], s.players[j]] = [s.players[j], s.players[i]];
      }
      for (const p of s.players)
        Object.assign(
          p,
          newPlayer(p.id, p.name, p.color, 0),
          p.bot ? { bot: true, auto: true } : {},
        );
      for (const p of s.players) receive(s, p, s.rules.startCash);
      // The opening cash counts as the baseline, not a bank debt.
      s.bank = 0;
      s.status = 'PLAYING';
      s.startedAt = now;
      s.endsAt = s.rules.minutes === null ? null : now + s.rules.minutes * 60_000;
      s.deck = shuffledDeck(s, rng);
      log(s, now, 'start', 'Ván bắt đầu.', actor);
      return startTurn(s, s.players[0].id, now);
    }
    case 'add_bot': {
      if (s.status !== 'WAITING' || s.players.length >= MAX_PLAYERS) fail('TYPHU_SEAT_TAKEN');
      if (s.host !== actor) fail('PERMISSION_DENIED');
      const slot = botIds.findIndex((id) => !player(s, id));
      const used = new Set(s.players.map((p) => p.color));
      const color = [0, 1, 2, 3].find((c) => !used.has(c))!;
      const bot = newPlayer(botIds[slot], botNames[slot], color, s.rules.startCash);
      Object.assign(bot, { bot: true, auto: true, ready: true });
      s.players.push(bot);
      log(s, now, 'join', `${bot.name} vào bàn.`, bot.id);
      return;
    }
    case 'remove_bot': {
      if (s.status !== 'WAITING') fail();
      if (s.host !== actor) fail('PERMISSION_DENIED');
      if (!player(s, command.player)?.bot) fail('TYPHU_BAD_TARGET');
      s.players = s.players.filter((p) => p.id !== command.player);
      return;
    }
    case 'rematch': {
      if (s.status !== 'FINISHED' || s.host !== actor) fail('PERMISSION_DENIED');
      if (s.rematch) fail();
      s.rematch = command.game;
      log(s, now, 'rematch', 'Chủ bàn đã mở ván mới.', actor);
      return;
    }
    case 'surrender':
      if (s.status !== 'PLAYING') fail();
      mustPlayer(s, actor);
      return surrender(s, actor, now);
    case 'pause': {
      const who = mustPlayer(s, actor);
      if (s.status !== 'PLAYING' || s.paused || who.status !== 'ACTIVE') fail();
      s.paused = {
        by: actor,
        at: now,
        left: s.deadline === null ? null : Math.max(0, s.deadline - now),
      };
      s.deadline = null;
      log(s, now, 'pause', `${who.name} tạm dừng ván.`, actor);
      return;
    }
    case 'resume': {
      const who = mustPlayer(s, actor);
      if (s.status !== 'PLAYING' || !s.paused || who.status !== 'ACTIVE') fail();
      const { at, left } = s.paused;
      s.paused = null;
      if (s.endsAt !== null) s.endsAt += Math.max(0, now - at);
      const current = player(s, s.turn ?? '');
      const floor = current && !current.auto && s.phase !== 'REVEAL' ? RESUME_MS : 0;
      s.deadline = left === null ? null : now + Math.max(left, floor);
      log(s, now, 'resume', `${who.name} cho ván chơi tiếp.`, actor);
      return;
    }
  }

  const p = requireTurn(s, actor, s.phase);
  p.misses = 0;
  if (!p.bot) p.auto = false;
  switch (command.action) {
    case 'roll': {
      if (s.phase === 'FLY') {
        p.flyNext = p.freeFly = false;
      } else requireTurn(s, actor, 'ROLL');
      return rollDice(s, p, now, rng);
    }
    case 'pay_jail': {
      requireTurn(s, actor, 'ROLL');
      if (!p.jailed) fail();
      spend(s, p, JAIL_FINE);
      p.jailed = false;
      p.jailTries = 0;
      log(s, now, 'jail_exit', `${p.name} nộp ${JAIL_FINE} để ra tù.`, p.id);
      return setPhase(s, 'ROLL', now);
    }
    case 'use_pass': {
      requireTurn(s, actor, 'ROLL');
      if (!p.jailed || !p.pass) fail();
      p.pass = false;
      p.jailed = false;
      p.jailTries = 0;
      log(s, now, 'jail_exit', `${p.name} dùng Thẻ VIP hậu trường để ra tù.`, p.id);
      return setPhase(s, 'ROLL', now);
    }
    case 'buy': {
      requireTurn(s, actor, 'BUY');
      const index = s.pending!.tile!,
        t = tile(index);
      if (t.kind === 'BEACH' && command.level !== 0) fail();
      if (command.level > buildCap(p, 0)) fail('TYPHU_BUILD_LIMIT');
      const cost = (t.price ?? 0) + buildCost(index, 0, command.level);
      spend(s, p, cost);
      s.tiles[index] = { owner: p.id, level: command.level, blackout: 0 };
      log(
        s,
        now,
        'buy',
        `${p.name} mua ${t.name}${command.level ? ` và xây ${levelNames[command.level]}` : ''} (${cost}).`,
        p.id,
      );
      return settle(s, now);
    }
    case 'build': {
      requireTurn(s, actor, 'BUILD');
      const index = s.pending!.tile!,
        owned = s.tiles[index]!;
      if (
        command.level <= owned.level ||
        command.level > buildCap(p, s.pending!.from ?? owned.level)
      )
        fail('TYPHU_BUILD_LIMIT');
      const cost = buildCost(index, owned.level, command.level);
      spend(s, p, cost);
      owned.level = command.level;
      log(
        s,
        now,
        'build',
        `${p.name} nâng ${tile(index).name} lên ${levelNames[owned.level]} (${cost}).`,
        p.id,
      );
      return settle(s, now);
    }
    case 'buyout': {
      requireTurn(s, actor, 'BUYOUT');
      const index = s.pending!.tile!,
        owned = s.tiles[index]!;
      const owner = mustPlayer(s, owned.owner),
        price = buyoutPrice(s, index);
      if (p.cash < price) fail('TYPHU_NOT_ENOUGH_CASH');
      p.cash -= price;
      owner.cash += price;
      owned.owner = p.id;
      owned.blackout = 0;
      log(
        s,
        now,
        'buyout',
        `${p.name} mua lại ${tile(index).name} của ${owner.name} giá ${price}.`,
        p.id,
      );
      if (checkWinner(s, now)) return;
      if (canBuildOn(s, p, index))
        return setPhase(s, 'BUILD', now, { tile: index, from: owned.level });
      return settle(s, now);
    }
    case 'sell': {
      requireTurn(s, actor, 'DEBT');
      if (!s.debt || s.tiles[command.tile]?.owner !== p.id) fail('TYPHU_BAD_TARGET');
      sellToBank(s, p, command.tile, now);
      if (p.cash >= s.debt!.amount) return completeDebt(s, p, now, rng);
      // Breaking a monopoly lowers what the rest is worth; stop once it can no longer cover.
      if (p.cash + liquidationValue(s, p.id) < s.debt!.amount) {
        const creditor = s.debt!.creditor ? (player(s, s.debt!.creditor) ?? null) : null;
        s.debt = null;
        bankrupt(s, p, creditor, now);
        return settle(s, now);
      }
      return setPhase(s, 'DEBT', now);
    }
    case 'declare_bankrupt': {
      requireTurn(s, actor, 'DEBT');
      const creditor = s.debt?.creditor ? (player(s, s.debt.creditor) ?? null) : null;
      s.debt = null;
      bankrupt(s, p, creditor, now);
      return settle(s, now);
    }
    case 'skip': {
      if (s.phase === 'ROLL' || s.phase === 'DEBT' || s.phase === 'REVEAL') fail();
      // A bad card cannot be dodged; only optional choices can be skipped.
      if (s.phase === 'CARD' && cards[s.pending!.card!].kind === 'BAD') fail();
      if (s.phase === 'FLY') {
        p.flyNext = p.freeFly = false;
        return setPhase(s, 'ROLL', now);
      }
      return settle(s, now);
    }
    case 'card_ok': {
      requireTurn(s, actor, 'REVEAL');
      return resolveCard(s, p, now, rng);
    }
    case 'card_target': {
      requireTurn(s, actor, 'CARD');
      const card = s.pending!.card!;
      if (!cardTargets(s, p, card).includes(command.tile)) fail('TYPHU_BAD_TARGET');
      if (card === 'GIFT') {
        const recipient = player(s, command.player ?? '');
        if (!recipient || recipient.status !== 'ACTIVE' || recipient.id === p.id)
          fail('TYPHU_BAD_TARGET');
      }
      s.pending = null;
      return applyCard(s, p, card, now, rng, { tile: command.tile, player: command.player });
    }
    case 'festival': {
      requireTurn(s, actor, 'FESTIVAL');
      if (s.tiles[command.tile]?.owner !== p.id || tile(command.tile).kind !== 'CITY')
        fail('TYPHU_BAD_TARGET');
      spend(s, p, FESTIVAL_FEE);
      s.festival = command.tile;
      log(
        s,
        now,
        'festival',
        `${p.name} trả ${FESTIVAL_FEE} cho ${tile(command.tile).name} đăng cai Đại nhạc hội.`,
        p.id,
      );
      return settle(s, now);
    }
    case 'start_build': {
      requireTurn(s, actor, 'START_BUILD');
      if (!canBuildOn(s, p, command.tile)) fail('TYPHU_BUILD_LIMIT');
      const owned = s.tiles[command.tile]!;
      const cost = buildCost(command.tile, owned.level, owned.level + 1);
      spend(s, p, cost);
      owned.level++;
      log(
        s,
        now,
        'build',
        `${p.name} nâng ${tile(command.tile).name} lên ${levelNames[owned.level]} (${cost}).`,
        p.id,
      );
      return settle(s, now);
    }
    case 'fly': {
      requireTurn(s, actor, 'FLY');
      if (!flyTargets(s, p).includes(command.to)) fail('TYPHU_BAD_TARGET');
      const fee = p.freeFly ? 0 : FLY_FEE;
      spend(s, p, fee);
      p.flyNext = p.freeFly = false;
      log(s, now, 'fly', `${p.name} bay tới ${tile(command.to).name}.`, p.id);
      moveTo(s, p, command.to, now);
      s.extraRoll = false;
      return land(s, p, now, rng);
    }
  }
}

function surrender(s: TyPhuState, id: string, now: number) {
  const p = mustPlayer(s, id);
  if (p.status !== 'ACTIVE') return;
  for (const t of ownedBy(s, id)) releaseTile(s, t.index);
  s.bank += p.cash;
  p.cash = 0;
  p.status = 'LEFT';
  log(s, now, 'surrender', `${p.name} rời ván.`, id);
  if (checkWinner(s, now)) return;
  if (s.turn === id) endTurn(s, now);
}

// ---------------------------------------------------------------- timeouts & auto play

/** Applies default actions for every expired deadline. Idempotent for a given `now`. */
export function reconcile(state: TyPhuState, now: number, rng: TyPhuRandom): TyPhuState {
  if (state.status !== 'PLAYING' || state.paused || state.deadline === null || now < state.deadline)
    return state;
  const s = structuredClone(state);
  for (let guard = 0; guard < 64 && s.status === 'PLAYING' && s.deadline !== null; guard++) {
    if (now < s.deadline) break;
    if (s.endsAt !== null && now >= s.endsAt && s.phase === 'ROLL' && !s.extraRoll) {
      finishByWealth(s, now);
      break;
    }
    const p = mustPlayer(s, s.turn!);
    // Watching a chance card is not a missed turn.
    if (!p.auto && s.phase !== 'REVEAL') {
      p.misses++;
      if (p.misses >= 3) {
        p.auto = true;
        log(s, now, 'auto', `${p.name} vắng mặt; hệ thống chơi thay.`, p.id);
      }
    }
    if (p.bot) botAct(s, p, now, rng);
    else autoAct(s, p, now, rng);
  }
  s.version++;
  return s;
}

function autoAct(s: TyPhuState, p: TyPhuPlayer, now: number, rng: TyPhuRandom) {
  const pending = s.pending;
  switch (s.phase) {
    case 'DEBT': {
      // Away players sell their cheapest property first.
      if (s.debt && liquidate(s, p, s.debt.amount, now)) return completeDebt(s, p, now, rng);
      const creditor = s.debt?.creditor ? (player(s, s.debt.creditor) ?? null) : null;
      s.debt = null;
      bankrupt(s, p, creditor, now);
      return settle(s, now);
    }
    case 'ROLL':
      if (p.jailed && p.pass) {
        p.pass = p.jailed = false;
        p.jailTries = 0;
      }
      return rollDice(s, p, now, rng);
    case 'FLY':
      p.flyNext = p.freeFly = false;
      return rollDice(s, p, now, rng);
    case 'BUY': {
      // Away players keep a cash reserve; everyone else declines by default.
      const t = tile(pending!.tile!);
      if (p.auto && p.cash - (t.price ?? 0) >= 300) {
        spend(s, p, t.price ?? 0);
        s.tiles[t.index] = { owner: p.id, level: 0, blackout: 0 };
        log(s, now, 'buy', `${p.name} mua ${t.name} (${t.price}).`, p.id);
      }
      return settle(s, now);
    }
    case 'REVEAL':
      return resolveCard(s, p, now, rng);
    case 'CARD': {
      const card = pending!.card!;
      const targets = cardTargets(s, p, card);
      const others = activePlayers(s).filter((o) => o.id !== p.id);
      if (!targets.length) return settle(s, now);
      if (card === 'GIFT') {
        const tileIndex = targets.sort((a, b) => currentPrice(s, a) - currentPrice(s, b))[0];
        const poorest = others.sort((a, b) => netWorth(s, a.id) - netWorth(s, b.id))[0];
        s.pending = null;
        return applyCard(s, p, card, now, rng, { tile: tileIndex, player: poorest.id });
      }
      const ranked =
        card === 'HOST_FESTIVAL'
          ? targets.sort((a, b) => rentWithFestival(s, b) - rentWithFestival(s, a))
          : targets.sort((a, b) => baseRent(s, b) - baseRent(s, a) || b - a);
      s.pending = null;
      return applyCard(s, p, card, now, rng, { tile: ranked[0] });
    }
    case 'FESTIVAL': {
      // Hosting costs money, so only seats on automatic play host, and only with a reserve.
      const own = cities.filter((c) => s.tiles[c.index]?.owner === p.id).map((c) => c.index);
      const best = own.sort((a, b) => rentWithFestival(s, b) - rentWithFestival(s, a))[0];
      if (best !== undefined && p.auto && p.cash - FESTIVAL_FEE >= 300) {
        spend(s, p, FESTIVAL_FEE);
        s.festival = best;
        log(
          s,
          now,
          'festival',
          `${p.name} trả ${FESTIVAL_FEE} cho ${tile(best).name} đăng cai Đại nhạc hội.`,
          p.id,
        );
      }
      return settle(s, now);
    }
    default:
      return settle(s, now);
  }
}
/** Cash a computer seat keeps back for rent and tax. */
function botReserve(s: TyPhuState) {
  return Math.max(200, Math.round(s.rules.startCash * 0.12));
}
/** A computer seat's move: buys and builds while keeping a reserve, otherwise plays like auto. */
function botAct(s: TyPhuState, p: TyPhuPlayer, now: number, rng: TyPhuRandom) {
  const budget = p.cash - botReserve(s);
  const run = (command: TyPhuCommand) => apply(s, p.id, p.name, command, now, rng);
  const index = s.pending?.tile;
  switch (s.phase) {
    case 'ROLL':
      if (p.jailed && !p.pass && budget >= JAIL_FINE) run({ action: 'pay_jail' });
      return autoAct(s, p, now, rng);
    case 'BUY': {
      const t = tile(index!);
      const price = t.price ?? 0;
      if (t.kind === 'BEACH')
        return run(budget >= price ? { action: 'buy', level: 0 } : { action: 'skip' });
      for (let level = buildCap(p, 0); level >= 0; level--)
        if (price + buildCost(index!, 0, level) <= budget) return run({ action: 'buy', level });
      return run({ action: 'skip' });
    }
    case 'BUILD': {
      const owned = s.tiles[index!]!;
      for (let level = buildCap(p, s.pending!.from ?? owned.level); level > owned.level; level--)
        if (buildCost(index!, owned.level, level) <= budget) return run({ action: 'build', level });
      return run({ action: 'skip' });
    }
    case 'BUYOUT': {
      const group = tile(index!).group;
      const owners = group ? groupTiles(group).map((t) => s.tiles[t.index]?.owner) : [];
      // Worth it when it finishes a group, otherwise only with plenty of spare cash.
      const completes = owners.filter((o) => o !== p.id).length === 1;
      const price = buyoutPrice(s, index!);
      return run(
        price <= budget && (completes || price * 2 <= budget)
          ? { action: 'buyout' }
          : { action: 'skip' },
      );
    }
    case 'START_BUILD': {
      const best = cities
        .filter((c) => canBuildOn(s, p, c.index))
        .filter((c) => {
          const level = s.tiles[c.index]!.level;
          return buildCost(c.index, level, level + 1) <= budget;
        })
        .sort((a, b) => baseRent(s, b.index) - baseRent(s, a.index))[0];
      return run(best ? { action: 'start_build', tile: best.index } : { action: 'skip' });
    }
    case 'FLY': {
      const fee = p.freeFly ? 0 : FLY_FEE;
      const target = flyTargets(s, p)
        .map(tile)
        .filter((t) => !s.tiles[t.index])
        .filter((t) => (t.price ?? 0) + fee <= budget)
        .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0];
      return run(target ? { action: 'fly', to: target.index } : { action: 'roll' });
    }
    default:
      return autoAct(s, p, now, rng);
  }
}
function rentWithFestival(s: TyPhuState, index: number) {
  const previous = s.festival;
  s.festival = index;
  const rent = baseRent(s, index);
  s.festival = previous;
  return rent;
}

/** Strips server-only data (deck order) before a snapshot leaves the server. */
export function publicTyPhuState(state: TyPhuState): TyPhuPublicState {
  const { deck, ...rest } = state;
  return { ...rest, deckCount: deck.length };
}
/** Σ cash + bank must stay equal to the opening money for the whole game. */
export function moneyInvariant(s: TyPhuState) {
  return s.players.reduce((sum, p) => sum + p.cash, 0) + s.bank;
}
