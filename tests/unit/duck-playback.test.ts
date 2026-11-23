import { describe, expect, it } from 'vitest';
import { defaultRaceConfig, type Race } from '../../src/shared/duck-race/contracts';
import { buildPlan, publishedFrames, sampleFrames } from '../../src/shared/duck-race/engine';
import { ranking } from '../../src/shared/duck-race/fairness';
import { duckServerTime, syncDuckClock, type DuckClock } from '../../src/client/lib/duck-clock';
import {
  elapsedRace,
  positionsAt,
  waitingForFrames,
  type RacePlayback,
} from '../../src/client/components/duck-race/playback';

const seed = 'ab'.repeat(32);
const race: Race = {
  id: 'movement-audit',
  roomId: 'room',
  host: 'host',
  name: 'Movement',
  algorithm: 1,
  config: { ...defaultRaceConfig, duration: 60 },
  version: 1,
  status: 'RACING',
  startAt: 0,
  createdAt: 0,
  lobbyClosed: true,
  banned: [],
  commitment: '',
  lockedHash: '',
  seed: null,
  frames: [],
  results: [],
  round: 1,
  seriesId: 'movement-audit',
  previousId: null,
  songReward: 'NONE',
  entries: Array.from({ length: 12 }, (_, i) => ({
    id: 'duck-' + i,
    userId: null,
    songId: null,
    name: 'Duck ' + i,
    skin: 'YELLOW',
    team: '',
    ready: true,
  })),
};

describe('Duck live movement under variable latency', () => {
  it('corrects clock jitter continuously without pausing, rewinding or speeding the race up abruptly', () => {
    let clock = syncDuckClock(null, 10000, 0);
    for (const [received, error] of [
      [1000, -750],
      [2200, 650],
      [3500, -900],
      [4900, 120],
    ] as const) {
      const before = duckServerTime(clock, received);
      clock = syncDuckClock(clock, 10000 + received + error, received);
      expect(duckServerTime(clock, received)).toBeCloseTo(before, 8);
      for (let t = received; t < received + 1000; t += 20) {
        const advance = duckServerTime(clock, t + 20) - duckServerTime(clock, t);
        expect(advance).toBeGreaterThanOrEqual(18 - 1e-8);
        expect(advance).toBeLessThanOrEqual(22 + 1e-8);
      }
    }
    expect(syncDuckClock(clock, 0, clock.received - 1)).toBe(clock);
    const end = clock.received + clock.correctionDuration!;
    expect(duckServerTime(clock, end)).toBeCloseTo(
      clock.server + clock.correction! + clock.correctionDuration!,
      8,
    );
  });

  it.each([30, 60, 120] as const)(
    'keeps every duck moving at 60 FPS during a %is race with 180–1700ms HTTP jitter',
    async (duration) => {
      const current = { ...race, config: { ...race.config, duration } };
      const plan = await buildPlan(current, seed);
      const latencies = [180, 1200, 300, 1500, 200, 900, 1700, 250];
      const responses: { received: number; server: number; frameAt: number }[] = [];
      let sent = 0,
        poll = 0;
      while (sent < duration * 1000) {
        const rtt = latencies[poll++ % latencies.length];
        responses.push({
          received: sent + rtt,
          server: sent + rtt * 0.3 + Math.min(1000, rtt / 2),
          frameAt: sent + rtt * 0.3,
        });
        // React Query waits its interval after the previous response has completed.
        sent += rtt + 1000;
      }
      let clock: DuckClock | null = null;
      let view: RacePlayback | null = null;
      let next = 0,
        previousElapsed = -Infinity,
        samples = 0;
      let previous: number[] = [];
      for (let now = 0; now < duration * 1000 - 3500; now += 1000 / 60) {
        while (responses[next]?.received <= now) {
          const response = responses[next++];
          clock = syncDuckClock(clock, response.server, response.received);
          view = {
            ...clock,
            replay: null,
            race: { ...current, frames: publishedFrames(plan, 0, response.frameAt) },
          };
        }
        if (!view) continue;
        const elapsed = elapsedRace(view, now);
        expect(elapsed).toBeGreaterThan(previousElapsed);
        const positions = positionsAt(view, now);
        if (previous.length && previousElapsed > 5000 && elapsed < duration * 800) {
          positions.forEach((p, i) =>
            expect(p, `duck ${i} at ${elapsed}ms`).toBeGreaterThan(previous[i]),
          );
          expect(waitingForFrames(view, now)).toBe(false);
          samples++;
        }
        previousElapsed = elapsed;
        previous = positions;
      }
      expect(samples).toBeGreaterThan(500);
    },
  );

  it('holds at real data during an outage, signals buffering and preserves replay', async () => {
    const plan = await buildPlan(race, seed);
    const frames = publishedFrames(plan, 0, 7350);
    const view = { race: { ...race, frames }, server: 7350, received: 0, replay: null };
    expect(frames.at(-1)!.at).toBe(7350);
    expect(frames.every((f) => f.at <= 7350)).toBe(true);
    expect(positionsAt(view, 12000)).toEqual(sampleFrames(plan.frames, 7350, 12));
    expect(waitingForFrames(view, 12000)).toBe(true);
    const replay = {
      ...view,
      race: { ...race, status: 'FINISHED' as const, frames: plan.frames },
      replay: { at: 12000, anchor: 0, speed: 0.25, paused: true },
    };
    expect(waitingForFrames(replay, 12000)).toBe(false);
    expect(positionsAt(replay, 12000)).toEqual(sampleFrames(plan.frames, 12000, 12));
    expect(publishedFrames(plan, 0, 90000)).toEqual(plan.frames);
  });

  it('keeps a cruising pace, overtakes and exact committed finish order for 2–30 ducks', async () => {
    let overtakes = 0;
    for (const count of [2, 12, 30])
      for (const duration of [30, 45, 60, 90, 120] as const) {
        const current = {
          ...race,
          config: { ...race.config, duration },
          entries: Array.from({ length: count }, (_, i) => ({
            ...race.entries[0],
            id: 'duck-' + i,
          })),
        };
        const plan = await buildPlan(current, seed);
        expect(plan.results).toEqual(await ranking(current, seed));
        for (let i = 1; i < plan.frames.length; i++) {
          const a = plan.frames[i - 1],
            b = plan.frames[i];
          if (b.at > duration * 800) break;
          b.positions.forEach((p, j) => {
            const speed = ((p - a.positions[j]) * duration * 1000) / (b.at - a.at);
            expect(speed).toBeGreaterThan(0.6);
            expect(speed).toBeLessThan(1.8);
            if (j && (a.positions[j] - a.positions[j - 1]) * (p - b.positions[j - 1]) < 0)
              overtakes++;
          });
        }
        for (const result of plan.results) {
          const i = plan.order.indexOf(result.entryId);
          expect(sampleFrames(plan.frames, result.finishMs - 1, count)[i]).toBeLessThan(1);
          expect(sampleFrames(plan.frames, result.finishMs, count)[i]).toBeCloseTo(1, 8);
        }
      }
    expect(overtakes).toBeGreaterThan(10);
  });
});
