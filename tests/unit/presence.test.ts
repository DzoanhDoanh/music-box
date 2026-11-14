// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/client/lib/api';
import { trackRoomPresence } from '../../src/client/lib/presence';

vi.mock('../../src/client/lib/api', () => ({ api: vi.fn() }));
const stops: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(api).mockReset().mockResolvedValue({ online_count: 1 });
});
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.useRealTimers();
});
function start(ready = vi.fn()) {
  const stop = trackRoomPresence('room', ready);
  stops.push(stop);
  return { stop, ready };
}
describe('authenticated room presence lifecycle', () => {
  it('refreshes one session and closes it with a newer sequence, without heartbeats after cleanup', async () => {
    const { stop, ready } = start();
    await vi.advanceTimersByTimeAsync(40000);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledTimes(3);
    const session = (vi.mocked(api).mock.calls[0][1] as { session_id: string }).session_id;
    stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(api).toHaveBeenCalledTimes(4);
    expect(vi.mocked(api).mock.calls.map(([, body]) => body)).toEqual(
      [true, true, true, false].map((online, index) => ({
        session_id: session,
        sequence: index + 1,
        online,
      })),
    );
  });
  it('suspends a page in the back/forward cache and renews on pageshow', async () => {
    const { ready } = start();
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(60000);
    expect(api).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api).toHaveBeenCalledTimes(3);
    expect(vi.mocked(api).mock.calls.at(-1)?.[1]).toMatchObject({ sequence: 3, online: true });
    expect(ready).toHaveBeenCalledTimes(2);
  });
  it('does not revive a disposed tab when an old heartbeat finishes', async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(api).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { stop, ready } = start();
    await vi.advanceTimersByTimeAsync(40000);
    expect(api).toHaveBeenCalledTimes(1);
    stop();
    resolve({ online_count: 2 });
    await vi.advanceTimersByTimeAsync(40000);
    expect(api).toHaveBeenCalledTimes(2);
    expect(ready).not.toHaveBeenCalled();
  });
  it('recovers after a failed heartbeat and after pageshow during an in-flight heartbeat', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('offline'));
    const { ready } = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(ready).not.toHaveBeenCalled();
    let resolve!: (value: unknown) => void;
    vi.mocked(api).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await vi.advanceTimersByTimeAsync(20000);
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
    resolve({});
    await vi.advanceTimersByTimeAsync(0);
    expect(api).toHaveBeenCalledTimes(4);
    expect(vi.mocked(api).mock.calls.at(-1)?.[1]).toMatchObject({ sequence: 4, online: true });
    expect(ready).toHaveBeenCalled();
  });
});
