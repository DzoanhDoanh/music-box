import type {
  LockedInput,
  Race,
  RaceFrame,
  RacePlan,
  RaceResult,
  RaceEntry,
  RaceConfig,
} from './contracts';
import { ranking, randomStream, uniform } from './fairness';
export const segmentMs = 2000;
export const playbackDelayMs = 3500;
export async function buildPlan(input: LockedInput, seed: string): Promise<RacePlan> {
  const results = await ranking(input, seed);
  const order = input.entries.map((e) => e.id).sort();
  const duration = input.config.duration * 1000;
  const bend = duration * 0.8;
  const paths = await Promise.all(
    order.map(async (id) => {
      const random = randomStream(seed, input.id + ':motion:' + id);
      const count = Math.ceil(bend / segmentMs);
      // A stream is ordered: concurrent digest requests may resolve in a different order.
      const weights: number[] = [];
      for (let i = 0; i < count; i++) weights.push(0.35 + (await uniform(random, 10000)) / 6000);
      const total = weights.reduce((a, b) => a + b, 0);
      const middle = 0.73 + (await uniform(random, 1000)) / 10000;
      let sum = 0;
      const points = [{ at: 0, position: 0 }];
      for (let i = 0; i < count; i++) {
        sum += weights[i];
        // Keep a steady racing pace beneath the random bursts/overtakes. Old races retain
        // their saved frames; rank/finish randomness and reward outcomes are unchanged.
        const progress = 0.65 * ((i + 1) / count) + 0.35 * (sum / total);
        points.push({ at: ((i + 1) * bend) / count, position: progress * middle });
      }
      const finish = results.find((r) => r.entryId === id)!.finishMs;
      points.push({ at: finish, position: 1 }, { at: duration, position: 1.008 });
      return points;
    }),
  );
  const times = [
    ...new Set([
      0,
      duration,
      ...Array.from({ length: Math.floor(duration / segmentMs) }, (_, i) => (i + 1) * segmentMs),
      ...results.map((r) => r.finishMs),
    ]),
  ].sort((a, b) => a - b);
  const frames = times.map((at) => ({
    at,
    positions: paths.map((points) => {
      const i = Math.max(0, points.findIndex((p) => p.at >= at) - 1);
      const a = points[i],
        b = points[Math.min(i + 1, points.length - 1)];
      const t = b.at === a.at ? 0 : Math.max(0, Math.min(1, (at - a.at) / (b.at - a.at)));
      return a.position + (b.position - a.position) * t;
    }),
  }));
  return { algorithm: 1, order, frames, results };
}
/** Only past endpoints may leave the backend. The display runs behind server time. */
export function publishedFrames(plan: RacePlan, startAt: number, serverNow: number) {
  const elapsed = Math.max(0, serverNow - startAt);
  const frames = plan.frames.filter((f) => f.at <= elapsed);
  // Include the authoritative position now, not just the last two-second checkpoint.
  // This removes up to two seconds of avoidable starvation without exposing future frames.
  if (frames.length && frames.at(-1)!.at < elapsed && elapsed < plan.frames.at(-1)!.at)
    frames.push({ at: elapsed, positions: sampleFrames(plan.frames, elapsed, plan.order.length) });
  return frames;
}
export function sampleFrames(frames: RaceFrame[], elapsed: number, count: number): number[] {
  if (!frames.length) return Array(count).fill(0) as number[];
  if (elapsed <= frames[0].at) return [...frames[0].positions];
  const next = frames.findIndex((f) => f.at >= elapsed);
  if (next < 0) return [...frames.at(-1)!.positions];
  const a = frames[next - 1],
    b = frames[next];
  const t = (elapsed - a.at) / (b.at - a.at);
  return a.positions.map((n, i) => n + (b.positions[i] - n) * t);
}
export function raceStatus(
  start: number | null,
  duration: number,
  now: number,
  status: Race['status'],
): Race['status'] {
  if (start === null || status === 'CANCELLED' || status === 'FINISHED') return status;
  return now < start ? 'COUNTDOWN' : now < start + duration * 1000 ? 'RACING' : 'FINISHED';
}
export function rewardsFor(entries: RaceEntry[], results: RaceResult[], config: RaceConfig) {
  let remaining = config.rewards.budget;
  if (!config.rewards.enabled || config.mode !== 'PLAYER') return [];
  return results.flatMap((result) => {
    const entry = entries.find((e) => e.id === result.entryId);
    if (!entry?.userId) return [];
    const value =
      config.rewards.participation +
      (result.rank === 1 ? config.rewards.winner : result.rank === 2 ? config.rewards.runnerUp : 0);
    const amount = Math.min(value, remaining);
    remaining -= amount;
    return amount > 0 ? [{ userId: entry.userId, amount }] : [];
  });
}
export function nextEntries(entries: RaceEntry[], results: RaceResult[], config: RaceConfig) {
  const kind = config.tournament.kind;
  const rank = new Map(results.map((r) => [r.entryId, r.rank]));
  return entries.filter((e) =>
    kind === 'ELIMINATION'
      ? (rank.get(e.id) ?? Infinity) <= config.tournament.advance
      : kind === 'WINNER_REMOVAL'
        ? rank.get(e.id) !== 1
        : true,
  );
}
export function standings(
  rounds: { entries: RaceEntry[]; results: RaceResult[] }[],
  teams = false,
) {
  const map = new Map<
    string,
    { entryId: string; name: string; team: string; points: number; wins: number }
  >();
  for (const round of rounds)
    for (const result of round.results) {
      const entry = round.entries.find((e) => e.id === result.entryId);
      if (!entry) continue;
      const key = teams ? entry.team || 'Không đội' : entry.userId || entry.id;
      const row = map.get(key) ?? {
        entryId: key,
        name: teams ? key : entry.name,
        team: entry.team,
        points: 0,
        wins: 0,
      };
      row.points += result.points;
      row.wins += Number(result.rank === 1);
      map.set(key, row);
    }
  return [...map.values()].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || a.entryId.localeCompare(b.entryId),
  );
}
