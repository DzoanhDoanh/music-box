/** A monotonic presentation clock; noisy HTTP timings must not rewind the race. */
export type DuckClock = {
  server: number;
  received: number;
  correction?: number;
  correctionDuration?: number;
};

export function duckServerTime(clock: DuckClock, now: number) {
  const elapsed = now - clock.received;
  const blend = Math.max(0, Math.min(1, elapsed / (clock.correctionDuration ?? 1)));
  return clock.server + elapsed + (clock.correction ?? 0) * blend;
}

export function syncDuckClock(
  previous: DuckClock | null,
  server: number,
  received: number,
): DuckClock {
  if (!previous) return { server, received };
  if (received <= previous.received) return previous;
  const current = duckServerTime(previous, received);
  const correction = server - current;
  // A large discontinuity is a fresh timeline (e.g. restoration or a test clock jump).
  if (Math.abs(correction) > 10000) return { server, received };
  return {
    server: current,
    received,
    correction,
    // Slew by at most 10%; never pause or rewind while correcting network jitter.
    correctionDuration: Math.max(5000, Math.abs(correction) * 10),
  };
}
