import { symbols, type BauSymbol, type Phase } from './contracts';

export function payout(stake: number, occurrences: number) {
  if (
    !Number.isSafeInteger(stake) ||
    stake < 0 ||
    !Number.isInteger(occurrences) ||
    occurrences < 0 ||
    occurrences > 3
  )
    throw new Error('Invalid payout input');
  const value = occurrences ? stake * (occurrences + 1) : 0;
  if (!Number.isSafeInteger(value)) throw new Error('Coin overflow');
  return value;
}
export function outcomes() {
  const results: number[][] = [];
  for (let a = 0; a < 6; a++)
    for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) results.push([a, b, c]);
  return results;
}
export function grossPayout(stakes: readonly number[], dice: readonly number[]) {
  if (
    stakes.length !== 6 ||
    dice.length !== 3 ||
    dice.some((n) => !Number.isInteger(n) || n < 0 || n > 5)
  )
    throw new Error('Invalid dice');
  const gross = stakes.reduce(
    (total, stake, i) => total + payout(stake, dice.filter((n) => n === i).length),
    0,
  );
  if (!Number.isSafeInteger(gross)) throw new Error('Coin overflow');
  return gross;
}
export function collateral(stakes: readonly number[]) {
  const total = stakes.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Coin overflow');
  return Math.max(0, ...outcomes().map((dice) => grossPayout(stakes, dice) - total));
}
export function aggregate(bets: { symbol: BauSymbol; amount: number }[]) {
  return symbols.map((s) => bets.filter((b) => b.symbol === s).reduce((n, b) => n + b.amount, 0));
}
export const phaseNext: Partial<Record<Phase, Phase>> = {
  BETTING_OPEN: 'BETTING_LOCKED',
  BETTING_LOCKED: 'SHAKING',
  SHAKING: 'REVEALING',
  REVEALING: 'SETTLING',
  SETTLING: 'RESULT',
};
export function bankruptcy(
  before: number,
  after: number,
  threshold: number,
  alreadyPenalized: boolean,
) {
  return !alreadyPenalized && before >= threshold && after < threshold;
}
export function penaltyTargets<
  T extends {
    id: string;
    room_id: string;
    requested_by: string | null;
    requested_at: string;
    status: string;
  },
>(entries: T[], room: string, actor: string, count: number) {
  return entries
    .filter((e) => e.room_id === room && e.requested_by === actor && e.status === 'QUEUED')
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at) || b.id.localeCompare(a.id))
    .slice(0, count);
}
export function nextDealer(
  queue: { user: string; online: boolean; available: number }[],
  minimum: number,
) {
  return queue.find((p) => p.online && p.available >= minimum)?.user ?? null;
}
