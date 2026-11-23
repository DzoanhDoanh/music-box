// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AppError } from '../../src/shared/domain';
import {
  defaultRaceConfig,
  type DuckSnapshot,
  defaultDuckRoomSettings,
  type Race,
} from '../../src/shared/duck-race/contracts';
import { newerDuckSnapshot, useDuckRace } from '../../src/client/lib/duck-race';
import { elapsedRace, positionsAt } from '../../src/client/components/duck-race/playback';
import { DuckAudio } from '../../src/client/components/duck-race/audio';

const request = vi.hoisted(() => vi.fn());
vi.mock('../../src/client/lib/api', () => ({ api: request, supabase: null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const race: Race = {
  id: 'race',
  roomId: 'room',
  host: 'alice',
  name: 'Test',
  config: defaultRaceConfig,
  version: 3,
  status: 'RACING',
  entries: [],
  banned: [],
  lobbyClosed: true,
  createdAt: 0,
  startAt: 1000,
  commitment: '',
  lockedHash: '',
  algorithm: 1,
  seed: null,
  results: [],
  frames: [
    { at: 0, positions: [0, 0] },
    { at: 2000, positions: [0.2, 0.3] },
  ],
  round: 1,
  seriesId: 'race',
  previousId: null,
  songReward: 'NONE',
};
const snapshot = (version = 3, now = 8000): DuckSnapshot => ({
  serverNow: now,
  settings: defaultDuckRoomSettings,
  race: { ...race, version },
  races: [],
  rounds: [],
  standings: [],
  leaderboard: [],
  presets: [],
});
let clients: QueryClient[] = [];
function hook(actor = 'alice') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return renderHook(({ actor }) => useDuckRace('room', actor, 'race'), {
    initialProps: { actor },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
beforeEach(() => {
  sessionStorage.clear();
  request.mockReset().mockResolvedValue(snapshot());
});
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('Duck client recovery and playback', () => {
  it('retains newer snapshots against delayed reads and duplicate events', () => {
    const current = snapshot();
    expect(newerDuckSnapshot(current, snapshot(2, 9000))).toBe(current);
    expect(newerDuckSnapshot(current, snapshot(3, 7000))).toBe(current);
    const moreFrames = snapshot(3, 9000);
    expect(newerDuckSnapshot(current, moreFrames)).toBe(moreFrames);
    expect(newerDuckSnapshot(current, snapshot(4, 9000)).race!.version).toBe(4);
  });
  it('persists uncertain commands, blocks a new command and retries the same receipt after remount', async () => {
    const first = hook();
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    request.mockImplementation(async (_url, body) => {
      if (body) throw new AppError('OFFLINE', 503);
      return snapshot();
    });
    await act(async () => {
      await expect(first.result.current.send({ action: 'ready', ready: true })).rejects.toThrow();
    });
    const sent = request.mock.calls.find((c) => c[1])!;
    expect(first.result.current.retry).toBe(true);
    await expect(first.result.current.send({ action: 'leave' })).rejects.toThrow();
    first.unmount();
    request.mockResolvedValue(snapshot(4));
    const second = hook();
    await waitFor(() => expect(second.result.current.data).toBeDefined());
    expect(second.result.current.retry).toBe(true);
    await act(async () => {
      await second.result.current.send();
    });
    const retries = request.mock.calls.filter((c) => c[1]);
    expect(retries).toHaveLength(2);
    expect(retries[1]).toEqual(sent);
    expect(second.result.current.retry).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });
  it('does not replay another identity’s pending command', async () => {
    sessionStorage.setItem(
      'roomtune:duck:v1:alice:room:race',
      JSON.stringify({ key: crypto.randomUUID(), body: { action: 'start' } }),
    );
    const current = hook('bob');
    await waitFor(() => expect(current.result.current.data).toBeDefined());
    expect(current.result.current.retry).toBe(false);
    expect(request.mock.calls.every((c) => c[3] === 'bob' && c[1] === undefined)).toBe(true);
  });
  it('never sends a mutation if durable storage is unavailable', async () => {
    const current = hook();
    await waitFor(() => expect(current.result.current.data).toBeDefined());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    await act(async () => {
      await expect(current.result.current.send({ action: 'start' })).rejects.toThrow(
        'Storage blocked',
      );
    });
    expect(request.mock.calls.some((c) => c[1])).toBe(false);
  });
  it('holds at the published endpoint and seeks replay without inventing movement', () => {
    const view = { race, server: 8000, received: 0, replay: null };
    expect(positionsAt(view, 200000)).toEqual([0.2, 0.3]);
    const replay = { ...view, replay: { at: 1000, anchor: 0, speed: 0.25, paused: true } };
    expect(elapsedRace(replay, 100000)).toBe(1000);
    expect(positionsAt(replay, 100000)).toEqual([0.1, 0.15]);
    replay.replay.paused = false;
    expect(elapsedRace(replay, 2000)).toBe(1500);
  });
  it('audio remains harmless when the browser refuses an AudioContext', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('Unavailable');
        }
      },
    );
    const audio = new DuckAudio();
    expect(() => {
      audio.setVolume(0.5);
      audio.play('finish');
      audio.dispose();
    }).not.toThrow();
  });
});
