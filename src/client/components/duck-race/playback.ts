import type { Race } from '../../../shared/duck-race/contracts';
import { playbackDelayMs, sampleFrames } from '../../../shared/duck-race/engine';
import { duckServerTime, type DuckClock } from '../../lib/duck-clock';
export type Replay = { at: number; anchor: number; speed: number; paused: boolean };
export type RacePlayback = DuckClock & { race: Race; replay: Replay | null };
export function elapsedRace(view: RacePlayback, now = performance.now()) {
  if (view.replay)
    return Math.max(
      0,
      Math.min(
        view.race.config.duration * 1000,
        view.replay.at + (view.replay.paused ? 0 : (now - view.replay.anchor) * view.replay.speed),
      ),
    );
  if (view.race.startAt === null) return -3000;
  return duckServerTime(view, now) - view.race.startAt - playbackDelayMs;
}
export function positionsAt(view: RacePlayback, now = performance.now()) {
  return sampleFrames(view.race.frames, elapsedRace(view, now), view.race.entries.length);
}
export function waitingForFrames(view: RacePlayback, now = performance.now()) {
  const elapsed = elapsedRace(view, now);
  const available = view.race.frames.at(-1)?.at ?? 0;
  return (
    !view.replay &&
    view.race.status !== 'CANCELLED' &&
    view.race.startAt !== null &&
    available < view.race.config.duration * 1000 &&
    elapsed > available + 250
  );
}
export function displayFinished(view: RacePlayback, now = performance.now()) {
  return (
    view.race.status === 'FINISHED' && elapsedRace(view, now) >= view.race.config.duration * 1000
  );
}
