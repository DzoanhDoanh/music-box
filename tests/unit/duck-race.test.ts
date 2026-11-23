import { describe, it, expect } from 'vitest';
import { defaultRaceConfig, type LockedInput } from '../../src/shared/duck-race/contracts';
import {
  canonical,
  commitment,
  lockedHash,
  ranking,
  randomStream,
  uniform,
  verifyRace,
} from '../../src/shared/duck-race/fairness';
import {
  buildPlan,
  publishedFrames,
  sampleFrames,
  nextEntries,
  rewardsFor,
  standings,
} from '../../src/shared/duck-race/engine';
import { parseEntries } from '../../src/shared/duck-race/import';
const seed = 'ab'.repeat(32);
const input: LockedInput = {
  id: 'race',
  algorithm: 1,
  config: defaultRaceConfig,
  entries: Array.from({ length: 4 }, (_, i) => ({
    id: 'entry-' + i,
    userId: 'user-' + i,
    songId: null,
    name: 'Vịt ' + i,
    skin: 'YELLOW',
    team: i % 2 ? 'B' : 'A',
    ready: true,
  })),
};
describe('Duck Race fairness and simulation', () => {
  it('matches independent Node SHA-256 commitment and big-endian stream vectors', async () => {
    expect(await commitment('race', seed)).toBe(
      '440c574ddfa3446afc90d5dac6fc58134be8ed2db1a155ba64e7eb6479a90a6a',
    );
    const stream = randomStream(seed, 'race:rank'),
      values: number[] = [];
    for (let i = 0; i < 8; i++) values.push(await stream.next());
    expect(values).toEqual([
      424278617, 317336084, 3396229250, 3964432081, 2677708840, 245279644, 758627898, 3984001632,
    ]);
    expect((await ranking(input, seed)).map((r) => r.entryId)).toEqual([
      'entry-3',
      'entry-0',
      'entry-2',
      'entry-1',
    ]);
  });
  it('varies finish gaps but keeps unique crossings before the deadline for 2–30 ducks', async () => {
    const gaps = new Set<number>();
    for (const count of [2, 12, 30])
      for (const duration of [30, 120] as const)
        for (let i = 0; i < 10; i++) {
          const race = {
            ...input,
            config: { ...input.config, duration },
            entries: Array.from({ length: count }, (_, n) => ({
              ...input.entries[0],
              id: 'duck-' + n,
            })),
          };
          const result = await ranking(race, i.toString(16).padStart(64, '0'));
          expect(result[0].finishMs).toBeGreaterThan(duration * 1000 - 1700);
          expect(result.at(-1)!.finishMs).toBeLessThan(duration * 1000);
          for (let j = 1; j < count; j++) {
            const gap = result[j].finishMs - result[j - 1].finishMs;
            expect(gap).toBeGreaterThanOrEqual(12);
            gaps.add(gap);
          }
        }
    expect(gaps.size).toBeGreaterThan(20);
    await expect(ranking(input, 'bad')).rejects.toThrow();
    await expect(
      ranking({ ...input, entries: [input.entries[0], input.entries[0]] }, seed),
    ).rejects.toThrow();
  });
  it('binds race/seed and canonical locked input across JSONB ordering', async () => {
    const result = await ranking(input, seed);
    const reordered = {
      ...input,
      config: Object.fromEntries(Object.entries(input.config).reverse()),
    };
    expect(canonical(reordered)).toBe(canonical(input));
    const jsonbResults = result.map(({ points, finishMs, rank, entryId }) => ({
      points,
      finishMs,
      rank,
      entryId,
    }));
    expect(
      await verifyRace(
        input,
        seed,
        await commitment(input.id, seed),
        await lockedHash(input),
        jsonbResults,
      ),
    ).toBe(true);
    expect(
      await verifyRace(
        input,
        seed,
        await commitment(input.id, seed),
        await lockedHash(input),
        jsonbResults.map((r, i) => (i ? r : { ...r, points: r.points + 1 })),
      ),
    ).toBe(false);
    expect(
      await verifyRace(
        input,
        seed,
        await commitment(input.id, seed),
        await lockedHash(input),
        result,
      ),
    ).toBe(true);
    expect(
      await verifyRace(
        { ...input, id: 'other' },
        seed,
        await commitment(input.id, seed),
        await lockedHash(input),
        result,
      ),
    ).toBe(false);
    expect(
      await verifyRace(
        input,
        'ac'.repeat(32),
        await commitment(input.id, seed),
        await lockedHash(input),
        result,
      ),
    ).toBe(false);
  });
  it('rejects the biased tail instead of using modulo for arbitrary counts', async () => {
    const words = [0xffffffff, 0xfffffffe, 7];
    let i = 0;
    expect(await uniform({ next: async () => words[i++] }, 3)).toBe(2);
    expect(i).toBe(2);
    await expect(uniform({ next: async () => 0 }, 0)).rejects.toThrow();
  });
  it('is a deterministic permutation independent of skins and input order', async () => {
    const changed = {
      ...input,
      entries: [...input.entries]
        .reverse()
        .map((e) => ({ ...e, skin: 'KING' as const, name: 'renamed' })),
    };
    expect(await ranking(changed, seed)).toEqual(await ranking(input, seed));
    expect(new Set((await ranking(input, seed)).map((r) => r.entryId)).size).toBe(4);
  });
  it('statistical smoke check detects obvious first-entry bias', async () => {
    const wins = [0, 0, 0, 0];
    for (let i = 0; i < 800; i++) {
      const result = await ranking(input, i.toString(16).padStart(64, '0'));
      wins[Number(result[0].entryId.split('-')[1])]++;
    }
    for (const value of wins) expect(value).toBeGreaterThan(140);
    for (const value of wins) expect(value).toBeLessThan(260);
  });
  it('generates monotone continuous paths, correct crossings and exact replay', async () => {
    const plan = await buildPlan(input, seed);
    expect(await buildPlan(input, seed)).toEqual(plan);
    for (let i = 1; i < plan.frames.length; i++) {
      for (let j = 0; j < 4; j++)
        expect(plan.frames[i].positions[j]).toBeGreaterThanOrEqual(plan.frames[i - 1].positions[j]);
    }
    for (const result of plan.results) {
      const index = plan.order.indexOf(result.entryId);
      expect(sampleFrames(plan.frames, result.finishMs, 4)[index]).toBeCloseTo(1, 8);
      expect(sampleFrames(plan.frames, result.finishMs - 1, 4)[index]).toBeLessThan(1);
    }
    expect(plan.results.map((r) => r.finishMs)).toEqual(
      [...plan.results.map((r) => r.finishMs)].sort((a, b) => a - b),
    );
  });
  it('discloses no future endpoints; network loss holds at the last endpoint', async () => {
    const plan = await buildPlan(input, seed);
    const frames = publishedFrames(plan, 10000, 16100);
    expect(frames.at(-1)!.at).toBe(6100);
    expect(frames.at(-1)!.positions).toEqual(sampleFrames(plan.frames, 6100, 4));
    expect(frames.every((f) => f.at <= 6100)).toBe(true);
    expect(sampleFrames(frames, 60000, 4)).toEqual(frames.at(-1)!.positions);
  });
  it('caps rewards and preserves explicit tournament advancement', async () => {
    const results = await ranking(input, seed);
    const config = {
      ...defaultRaceConfig,
      rewards: { enabled: true, winner: 500, runnerUp: 200, participation: 50, budget: 600 },
    };
    expect(rewardsFor(input.entries, results, config).reduce((a, b) => a + b.amount, 0)).toBe(600);
    expect(rewardsFor(input.entries, results, { ...config, mode: 'CUSTOM' })).toEqual([]);
    expect(
      nextEntries(input.entries, results, {
        ...config,
        tournament: { kind: 'ELIMINATION', advance: 2, rounds: 3 },
      }),
    ).toHaveLength(2);
    expect(
      nextEntries(input.entries, results, {
        ...config,
        tournament: { kind: 'WINNER_REMOVAL', advance: 2, rounds: 3 },
      }).some((e) => e.id === results[0].entryId),
    ).toBe(false);
    expect(standings([{ entries: input.entries, results }], true)).toHaveLength(2);
  });
  it('validates CSV with quoted commas/escaped quotes and bounded rows', () => {
    expect(parseEntries('name,team\n"Vịt, vàng",A\n"Vịt ""xanh""",B').map((e) => e.name)).toEqual([
      'Vịt, vàng',
      'Vịt "xanh"',
    ]);
    expect(() => parseEntries('"unfinished')).toThrow();
    expect(() => parseEntries('a')).toThrow();
    expect(() => parseEntries(Array(31).fill('duck').join('\n'))).toThrow();
  });
});
