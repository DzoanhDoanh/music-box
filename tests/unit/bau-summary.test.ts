import { describe, expect, it } from 'vitest';
import { defaultSettings, type BauRound, type Bet } from '../../src/shared/bau-cua/contracts';
import { recentLeaders, roundStandings } from '../../src/shared/bau-cua/summary';

function round(number: number, bets: Bet[], overrides: Partial<BauRound> = {}): BauRound {
  return {
    id: String(number),
    number,
    status: 'RESULT',
    dealer_id: 'dealer',
    settings: defaultSettings,
    commitment: '',
    revealed_seed: null,
    dice: [0, 1, 2],
    deadline: null,
    action_at: null,
    version: 1,
    started_at: '',
    collateral: 0,
    stake_total: bets.reduce((n, b) => n + b.amount, 0),
    dealer_net: -bets.reduce((n, b) => n + (b.payout ?? 0) - b.amount, 0),
    bets,
    ...overrides,
  };
}
const bet = (payout: number | null, extra: Partial<Bet> = {}): Bet => ({
  user_id: 'player',
  name: 'Bình',
  symbol: 'CUA',
  amount: 100,
  payout,
  ...extra,
});

describe('Bầu Cua settlement summaries', () => {
  it('combines all stakes, includes dealer net and never counts unresolved or cancelled bets', () => {
    const result = roundStandings(round(1, [bet(300), bet(0, { symbol: 'GA' })]), { dealer: 'An' });
    expect(result.map((p) => [p.name, p.net, p.awards])).toEqual([
      ['Bình', 100, ['Vua Cua']],
      ['An', -100, []],
    ]);
    expect(result.reduce((n, p) => n + p.net, 0)).toBe(0);
    expect(
      roundStandings(round(2, [bet(null)], { status: 'BETTING_OPEN', dealer_net: null })),
    ).toEqual([]);
    expect(roundStandings(round(3, [bet(100)], { status: 'CANCELLED' }))).toEqual([]);
  });

  it('orders rounds chronologically and derives comeback and consecutive wins without granting coin', () => {
    const rounds = [
      round(4, [bet(200)]),
      round(1, [bet(0)]),
      round(3, [bet(200, { symbol: 'TOM' })]),
      round(2, [bet(200)]),
    ];
    const original = JSON.stringify(rounds);
    const result = recentLeaders(rounds, { dealer: 'An' });
    expect(result[0]).toMatchObject({ user: 'player', net: 200, wins: 3, streak: 3 });
    expect(result[0].awards).toEqual(
      expect.arrayContaining(['Vua Cua', 'Thần Tôm', 'Lội Ngược Dòng', 'Ba Lần Liên Tiếp']),
    );
    expect(new Set(result[0].awards).size).toBe(result[0].awards.length);
    expect(result[1].awards).toContain('Cầm Cái Đại Tài');
    expect(JSON.stringify(rounds)).toBe(original);
  });

  it('breaks the winning streak on a draw and ignores cancelled or unsettled rounds', () => {
    const result = recentLeaders([
      round(1, [bet(200)]),
      round(2, [bet(100)]),
      round(3, [bet(200)]),
      round(4, [bet(200)]),
      round(5, [bet(400)], { status: 'CANCELLED' }),
      round(6, [bet(400)], { status: 'REVEALING' }),
    ]).find((p) => p.user === 'player')!;
    expect(result.net).toBe(300);
    expect(result.streak).toBe(2);
    expect(result.awards).not.toContain('Ba Lần Liên Tiếp');
  });
});
