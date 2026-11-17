import { describe, expect, it } from 'vitest';
import {
  aggregate,
  bankruptcy,
  collateral,
  grossPayout,
  outcomes,
  payout,
  penaltyTargets,
  nextDealer,
  phaseNext,
} from '../../src/shared/bau-cua/engine';
import {
  acceptedFaces,
  commitment,
  diceFromSeed,
  verifyRound,
} from '../../src/shared/bau-cua/fairness';
import {
  commandSchema,
  defaultSettings,
  settingsSchema,
  symbols,
} from '../../src/shared/bau-cua/contracts';

describe('Bầu Cua coin and fairness', () => {
  it('returns stake plus profit only when symbol occurs', () =>
    expect([0, 1, 2, 3].map((n) => payout(500, n))).toEqual([0, 1000, 1500, 2000]));
  it('rejects fractional, negative and overflowing coins', () => {
    for (const n of [-1, 0.5, Number.MAX_SAFE_INTEGER]) expect(() => payout(n, 3)).toThrow();
    expect(() => grossPayout([3e15, 3e15, 3e15, 0, 0, 0], [0, 1, 2])).toThrow('Coin overflow');
    expect(() => collateral([3e15, 3e15, 3e15, 3e15, 0, 0])).toThrow('Coin overflow');
  });
  it('enumerates every outcome and guarantees collateral for mixed stakes', () => {
    expect(new Set(outcomes().map(String)).size).toBe(216);
    for (const stakes of [
      [500, 0, 0, 0, 0, 0],
      [100, 200, 300, 400, 500, 600],
      [1000, 1000, 1000, 1000, 1000, 1000],
    ]) {
      const escrow = stakes.reduce((a, b) => a + b, 0),
        reserve = collateral(stakes);
      for (const dice of outcomes()) {
        const gross = grossPayout(stakes, dice);
        expect(reserve + escrow - gross).toBeGreaterThanOrEqual(0);
        expect(gross + reserve + escrow - gross).toBe(escrow + reserve);
      }
      expect(reserve).toBe(Math.max(0, ...outcomes().map((d) => grossPayout(stakes, d) - escrow)));
    }
    expect(collateral([500, 0, 0, 0, 0, 0])).toBe(1500);
    expect(collateral([100, 100, 100, 100, 100, 100])).toBe(0);
  });
  it('aggregates all six symbols', () =>
    expect(aggregate(symbols.map((symbol) => ({ symbol, amount: 100 })))).toEqual([
      100, 100, 100, 100, 100, 100,
    ]));
  it('rejects modulo-biased bytes', () => {
    const faces = acceptedFaces(Uint8Array.from({ length: 256 }, (_, i) => i));
    expect(faces).toHaveLength(252);
    for (let i = 0; i < 6; i++) expect(faces.filter((n) => n === i)).toHaveLength(42);
  });
  it('verifies deterministic commitment and rejects changed seed/round/dice', async () => {
    const round = '00000000-0000-4000-8000-000000000001',
      seed = 'ab'.repeat(32),
      hash = await commitment(seed),
      dice = await diceFromSeed(round, seed);
    expect(await verifyRound(round, seed, hash, dice)).toBe(true);
    expect(await verifyRound(round, 'cd'.repeat(32), hash, dice)).toBe(false);
    expect(await verifyRound(round, seed, hash, [])).toBe(false);
    expect(await commitment(seed)).toHaveLength(64);
  });
  it('only penalizes a new bankruptcy crossing', () => {
    expect(bankruptcy(100, 0, 1, false)).toBe(true);
    expect(bankruptcy(0, 0, 1, false)).toBe(false);
    expect(bankruptcy(100, 50, 100, false)).toBe(true);
    expect(bankruptcy(100, 0, 1, true)).toBe(false);
  });
  it('selects own queued songs in this room with deterministic tie breaker', () => {
    const base = {
      room_id: 'room',
      requested_by: 'me',
      requested_at: '2026-11-17',
      status: 'QUEUED',
    };
    const entries = [
      { ...base, id: 'a' },
      { ...base, id: 'b' },
      { ...base, id: 'c', status: 'PLAYING' },
      { ...base, id: 'd', requested_by: 'other' },
      { ...base, id: 'e', room_id: 'other' },
    ];
    expect(penaltyTargets(entries, 'room', 'me', 2).map((e) => e.id)).toEqual(['b', 'a']);
  });
  it('chooses the first online solvent dealer', () =>
    expect(
      nextDealer(
        [
          { user: 'a', online: false, available: 1000 },
          { user: 'b', online: true, available: 0 },
          { user: 'c', online: true, available: 1000 },
        ],
        1000,
      ),
    ).toBe('c'));
  it('defines locked phases and rejects forged result/balance commands', () => {
    expect(phaseNext.BETTING_OPEN).toBe('BETTING_LOCKED');
    expect(phaseNext.REVEALING).toBe('SETTLING');
    for (const input of [
      { action: 'start', dice: [0, 0, 0] },
      { action: 'settle' },
      { action: 'daily', balance: 10000 },
    ])
      expect(commandSchema.safeParse(input).success).toBe(false);
    expect(
      settingsSchema.safeParse({ ...defaultSettings, minBet: 10000, maxBet: 100 }).success,
    ).toBe(false);
  });
});
