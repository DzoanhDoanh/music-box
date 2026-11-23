import type { LockedInput, RaceResult } from './contracts';

const encoder = new TextEncoder();
export const hex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
export const commitment = (race: string, seed: string) =>
  sha256('roomtune:duck:1:commit:' + race + ':' + seed);
// PostgreSQL JSONB and browsers need not preserve object-key insertion order.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
/** Canonical input excludes mutable appearance. IDs are immutable and sorted before locking. */
export const lockedText = (input: LockedInput) =>
  canonical({
    algorithm: input.algorithm,
    id: input.id,
    config: input.config,
    entries: input.entries
      .map((e) => ({ id: e.id, userId: e.userId, songId: e.songId, team: e.team }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
export const lockedHash = (input: LockedInput) => sha256(lockedText(input));
export type RandomWords = { next: () => Promise<number> };
export function randomStream(seed: string, domain: string): RandomWords {
  let counter = 0,
    words: number[] = [],
    index = 0;
  return {
    async next() {
      if (index >= words.length) {
        const bytes = await crypto.subtle.digest(
          'SHA-256',
          encoder.encode('roomtune:duck:1:' + domain + ':' + seed + ':' + counter++),
        );
        const view = new DataView(bytes);
        words = Array.from({ length: 8 }, (_, i) => view.getUint32(i * 4, false));
        index = 0;
      }
      return words[index++];
    },
  };
}
export async function uniform(random: RandomWords, count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 0x100000000)
    throw new Error('Invalid sample range');
  const limit = 0x100000000 - (0x100000000 % count);
  let value: number;
  do {
    value = await random.next();
  } while (value >= limit);
  return value % count;
}
export async function shuffle<T>(values: readonly T[], random: RandomWords) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = await uniform(random, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export async function ranking(input: LockedInput, seed: string): Promise<RaceResult[]> {
  if (
    !/^[0-9a-f]{64}$/.test(seed) ||
    input.entries.length < 2 ||
    input.entries.length > 30 ||
    new Set(input.entries.map((e) => e.id)).size !== input.entries.length
  )
    throw new Error('Invalid locked race');
  const order = input.entries.map((e) => e.id).sort();
  const random = randomStream(seed, input.id + ':rank');
  const ranks = await shuffle(order, random);
  // A separate domain varies finish tension without changing the unbiased rank shuffle.
  // Positive gaps avoid ties, including with thirty entries; the last duck finishes in time.
  const timing = randomStream(seed, input.id + ':finish');
  const first = input.config.duration * 1000 - 1600 + (await uniform(timing, 100));
  const spread = 40 + (await uniform(timing, 850));
  const weights: number[] = [];
  for (let i = 1; i < ranks.length; i++) weights.push(1 + (await uniform(timing, 1000)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let accumulated = 0;
  return ranks.map((entryId, index) => ({
    entryId,
    rank: index + 1,
    finishMs:
      first + index * 12 + Math.round((spread * (accumulated += weights[index - 1] ?? 0)) / total),
    points: ranks.length - index,
  }));
}
export async function verifyRace(
  input: LockedInput,
  seed: string,
  expectedCommitment: string,
  expectedHash: string,
  results: RaceResult[],
) {
  if (input.algorithm !== 1) return false;
  return (
    (await commitment(input.id, seed)) === expectedCommitment &&
    (await lockedHash(input)) === expectedHash &&
    canonical(await ranking(input, seed)) === canonical(results)
  );
}
