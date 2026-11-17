import type { BauRound } from './contracts';
export function roundStandings(round: BauRound, names: Record<string, string> = {}) {
  const people = new Map<string, { user: string; name: string; net: number; awards: string[] }>();
  if (round.status === 'CANCELLED') return [];
  for (const b of round.bets) {
    if (b.payout === null) continue;
    const p = people.get(b.user_id) ?? { user: b.user_id, name: b.name, net: 0, awards: [] };
    p.net += b.payout - b.amount;
    if (b.payout > b.amount && b.symbol === 'CUA') p.awards.push('Vua Cua');
    if (b.payout > b.amount && b.symbol === 'TOM') p.awards.push('Thần Tôm');
    people.set(b.user_id, p);
  }
  if (round.dealer_net !== null)
    people.set(round.dealer_id, {
      user: round.dealer_id,
      name: names[round.dealer_id] ?? 'Người cầm cái',
      net: round.dealer_net,
      awards: round.dealer_net > 0 ? ['Cầm Cái Đại Tài'] : [],
    });
  return [...people.values()].sort((a, b) => b.net - a.net || a.user.localeCompare(b.user));
}
export function recentLeaders(rounds: BauRound[], names: Record<string, string> = {}) {
  const ordered = [...rounds]
    .filter((r) => r.status === 'RESULT')
    .sort((a, b) => a.number - b.number);
  const people = new Map<
    string,
    {
      user: string;
      name: string;
      net: number;
      wins: number;
      streak: number;
      last: number | null;
      awards: Set<string>;
    }
  >();
  for (const round of ordered)
    for (const p of roundStandings(round, names)) {
      const old = people.get(p.user) ?? {
        ...p,
        net: 0,
        wins: 0,
        streak: 0,
        last: null,
        awards: new Set<string>(),
      };
      if (old.last !== null && old.last < 0 && p.net > 0) old.awards.add('Lội Ngược Dòng');
      old.net += p.net;
      old.streak = p.net > 0 ? old.streak + 1 : 0;
      old.wins += p.net > 0 ? 1 : 0;
      old.last = p.net;
      if (old.streak >= 3) old.awards.add('Ba Lần Liên Tiếp');
      p.awards.forEach((a) => old.awards.add(a));
      people.set(p.user, old);
    }
  return [...people.values()]
    .map((p) => ({ ...p, awards: [...p.awards] }))
    .sort((a, b) => b.net - a.net || a.user.localeCompare(b.user));
}
