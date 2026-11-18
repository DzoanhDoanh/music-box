import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RealtimeService } from '../../src/client/lib/realtime';

function fixture() {
  const created: ReturnType<typeof makeChannel>[] = [];
  function makeChannel() {
    let status: (value: string) => void = () => {};
    const events = new Map<string, (value: unknown) => void>();
    const channel = {
      on: vi.fn((_: string, filter: { event: string }, fn: (value: unknown) => void) => {
        events.set(filter.event, fn);
        return channel;
      }),
      subscribe: vi.fn((fn: typeof status) => {
        status = fn;
        return channel;
      }),
      track: vi.fn(async () => 'ok'),
      untrack: vi.fn(async () => 'ok'),
      teardown: vi.fn(),
      presenceState: vi.fn<() => Record<string, unknown[]>>(() => ({ actor: [{}] })),
      status: (value: string) => status(value),
      event: (name: string, payload = {}) => events.get(name)?.({ payload }),
    };
    return channel;
  }
  const client = {
    channel: vi.fn(() => {
      const channel = makeChannel();
      created.push(channel);
      return channel;
    }),
    removeChannel: vi.fn(async () => 'ok'),
  };
  return { client, created, service: new RealtimeService(client as unknown as SupabaseClient) };
}
const callbacks = () => ({
  onVersion: vi.fn(),
  onOnline: vi.fn(),
  onPresence: vi.fn(),
  onConnection: vi.fn(),
  onResync: vi.fn(),
  onChat: vi.fn(),
});
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
afterEach(() => vi.useRealTimers());

describe('shared room transport', () => {
  it('routes coin invalidations over the existing private room channel without adding presence', async () => {
    const f = fixture(),
      onWallet = vi.fn(),
      room = callbacks();
    f.service.subscribe('A', 'alice', room);
    const stop = f.service.subscribeNotices('A', 'alice', { onWallet });
    expect(f.client.channel).toHaveBeenCalledTimes(1);
    expect(f.client.channel).toHaveBeenCalledWith('room:A', {
      config: { private: true, presence: { key: 'alice' } },
    });
    const channel = f.created[0];
    channel.event('room.updated', { kind: 'wallet.updated', user: 'bob', version: 1 });
    expect(onWallet).toHaveBeenCalledExactlyOnceWith('bob');
    channel.event('room.updated', { kind: 'wallet.updated', user: 5 });
    channel.event('room.updated', { kind: 'other', user: 'alice' });
    expect(onWallet).toHaveBeenCalledTimes(1);
    stop();
    channel.event('room.updated', { kind: 'wallet.updated', user: 'alice' });
    expect(onWallet).toHaveBeenCalledTimes(1);
  });
  it('refreshes after a brief network interruption without a second channel or chat-only presence', async () => {
    const f = fixture(),
      room = callbacks();
    const stop = f.service.subscribe('A', 'alice', room);
    const channel = f.created[0];
    channel.status('SUBSCRIBED');
    await flush();
    channel.event('sync');
    expect(channel.track).toHaveBeenCalledTimes(1);
    f.service.refreshPresence('A', 'old-identity');
    expect(channel.track).toHaveBeenCalledTimes(1);
    f.service.refreshPresence('A', 'alice');
    expect(room.onPresence).toHaveBeenLastCalledWith(null);
    await flush();
    expect(channel.track).toHaveBeenCalledTimes(2);
    channel.event('sync');
    expect(room.onPresence).toHaveBeenLastCalledWith(['actor']);
    f.service.subscribeChat('A', 'alice', callbacks());
    stop();
    await flush();
    f.service.refreshPresence('A', 'alice');
    expect(channel.track).toHaveBeenCalledTimes(2);
    expect(f.client.channel).toHaveBeenCalledTimes(1);
  });
  it('reports unique members only after sync, replays to observers and clears stale presence on reconnect', async () => {
    const f = fixture(),
      first = callbacks(),
      second = callbacks();
    f.service.subscribe('A', 'alice', first);
    const channel = f.created[0];
    channel.presenceState.mockReturnValue({ alice: [{}, {}], bob: [{}], empty: [] });
    channel.status('SUBSCRIBED');
    await flush();
    expect(first.onPresence).toHaveBeenLastCalledWith(null);
    channel.event('sync');
    expect(first.onPresence).toHaveBeenLastCalledWith(['alice', 'bob']);
    expect(first.onOnline).toHaveBeenLastCalledWith(2);
    f.service.subscribeChat('A', 'alice', second);
    expect(second.onPresence).toHaveBeenLastCalledWith(['alice', 'bob']);
    channel.presenceState.mockReturnValue({ alice: [{}] });
    channel.event('sync');
    expect(first.onPresence).toHaveBeenLastCalledWith(['alice']);
    channel.status('CHANNEL_ERROR');
    expect(first.onPresence).toHaveBeenLastCalledWith(null);
    channel.event('sync');
    expect(first.onPresence).toHaveBeenLastCalledWith(null);
    channel.status('SUBSCRIBED');
    await flush();
    expect(first.onPresence).toHaveBeenLastCalledWith(null);
    channel.event('sync');
    expect(first.onPresence).toHaveBeenLastCalledWith(['alice']);
    expect(second.onPresence).toHaveBeenLastCalledWith(['alice']);
  });
  it('isolates private game updates from music, recovers snapshots and never tracks game presence', async () => {
    const f = fixture(),
      room = callbacks(),
      game = callbacks();
    const list = vi.fn();
    f.service.subscribe('A', 'me', { ...room, onGames: list });
    f.service.subscribeGame('match', 'me', game);
    expect(f.client.channel).toHaveBeenLastCalledWith('game:match', {
      config: { private: true, presence: { key: 'me' } },
    });
    const channel = f.created[1];
    channel.status('SUBSCRIBED');
    channel.event('game.state_updated', { version: 42 });
    expect(game.onVersion).toHaveBeenCalledWith(42);
    expect(room.onVersion).not.toHaveBeenCalled();
    channel.event('game.state_updated', { version: 'forged' });
    expect(game.onVersion).toHaveBeenCalledTimes(1);
    channel.status('CHANNEL_ERROR');
    channel.status('SUBSCRIBED');
    expect(game.onResync).toHaveBeenCalledTimes(2);
    expect(channel.track).not.toHaveBeenCalled();
    f.created[0].event('games.updated');
    expect(list).toHaveBeenCalledTimes(1);
  });
  it('shares one channel and untracks when only chat remains', async () => {
    vi.useFakeTimers();
    const f = fixture(),
      room = callbacks(),
      chat = callbacks();
    const leaveChat = f.service.subscribeChat('A', 'me', chat);
    const channel = f.created[0];
    channel.status('SUBSCRIBED');
    expect(channel.track).not.toHaveBeenCalled();
    const leaveRoom = f.service.subscribe('A', 'me', room);
    await flush();
    expect(f.client.channel).toHaveBeenCalledTimes(1);
    expect(channel.track).toHaveBeenCalledTimes(1);
    channel.event('chat.updated');
    expect(chat.onChat).toHaveBeenCalledTimes(1);
    expect(room.onChat).toHaveBeenCalledTimes(1);
    leaveRoom();
    await flush();
    expect(channel.untrack).toHaveBeenCalledTimes(1);
    channel.status('CHANNEL_ERROR');
    channel.status('SUBSCRIBED');
    expect(channel.track).toHaveBeenCalledTimes(1);
    leaveChat();
    await vi.advanceTimersByTimeAsync(101);
    expect(f.client.removeChannel).toHaveBeenCalledTimes(1);
    channel.event('chat.updated');
    expect(chat.onChat).toHaveBeenCalledTimes(1);
  });
  it('reuses rapid handoffs, serializes delayed Presence and retries after reconnect', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const leave = f.service.subscribe('A', 'me', callbacks());
    const channel = f.created[0];
    let finish!: (value: string) => void;
    channel.track.mockImplementationOnce(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    channel.status('SUBSCRIBED');
    leave();
    const chat = f.service.subscribeChat('A', 'me', callbacks());
    finish('ok');
    await flush();
    expect(channel.untrack).toHaveBeenCalledTimes(1);
    expect(f.client.channel).toHaveBeenCalledTimes(1);
    const listener = f.service.subscribe('A', 'me', callbacks());
    await flush();
    channel.status('CHANNEL_ERROR');
    channel.status('SUBSCRIBED');
    await flush();
    expect(channel.track).toHaveBeenCalledTimes(3);
    listener();
    chat();
    await vi.advanceTimersByTimeAsync(101);
    expect(f.client.removeChannel).toHaveBeenCalledTimes(1);
  });
  it('ignores an old track ACK after a channel reconnect and tracks the new join', async () => {
    const f = fixture();
    f.service.subscribe('A', 'me', callbacks());
    const channel = f.created[0];
    let finish!: (value: string) => void;
    channel.track.mockImplementationOnce(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    channel.status('SUBSCRIBED');
    channel.status('CHANNEL_ERROR');
    channel.status('SUBSCRIBED');
    finish('ok');
    await flush();
    expect(channel.track).toHaveBeenCalledTimes(2);
  });
  it('waits for old identity teardown and ignores its late callbacks or cleanup', async () => {
    vi.useFakeTimers();
    const f = fixture(),
      old = callbacks(),
      next = callbacks();
    const leaveOld = f.service.subscribe('A', 'old', old);
    const channel = f.created[0];
    channel.status('SUBSCRIBED');
    await flush();
    let finish!: (value: string) => void;
    f.client.removeChannel.mockImplementationOnce(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    const leaveNext = f.service.subscribeChat('A', 'new', next);
    await flush();
    expect(f.client.channel).toHaveBeenCalledTimes(1);
    channel.event('chat.updated');
    expect(old.onChat).not.toHaveBeenCalled();
    leaveOld();
    finish('ok');
    await flush();
    expect(f.client.channel).toHaveBeenCalledTimes(2);
    f.created[1].status('SUBSCRIBED');
    expect(f.created[1].track).not.toHaveBeenCalled();
    expect(next.onResync).toHaveBeenCalledTimes(1);
    leaveNext();
    await vi.advanceTimersByTimeAsync(101);
    expect(f.client.removeChannel).toHaveBeenCalledTimes(2);
  });
});
