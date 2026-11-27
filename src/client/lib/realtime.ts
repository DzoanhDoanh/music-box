import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface RoomSubscription {
  onVersion(version: number): void;
  onOnline?(count: number): void;
  /** null means the connection has not supplied a current Presence snapshot. */
  onPresence?(members: string[] | null): void;
  onConnection(message: string): void;
  onResync(): void;
  onChat?(): void;
  onGames?(): void;
  onBauNotice?(): void;
  onWallet?(user: string): void;
  onDuckReaction?(reaction: { id: string; emoji: string }): void;
  /** A Cờ Tướng table in the room changed (or was created or deleted). */
  onCoTuong?(game: string, version: number): void;
}
type Observer = { callbacks: Partial<RoomSubscription>; presence: boolean };
type SharedChannel = {
  actor: string;
  channel?: RealtimeChannel;
  ready: Promise<void>;
  observers: Set<Observer>;
  subscribed: boolean;
  tracked: boolean;
  syncing: boolean;
  stopped: boolean;
  generation: number;
  connection: string;
  onlineMembers: string[] | null;
  refreshPresence?: () => void;
  closeTimer?: ReturnType<typeof setTimeout>;
  retryTimer?: ReturnType<typeof setTimeout>;
};
type Registry = { entries: Map<string, SharedChannel>; retiring: Map<string, Promise<void>> };
const channels = new WeakMap<SupabaseClient, Registry>();

// One transport per topic. Chat alone never announces listening Presence.
export class RealtimeService {
  constructor(private client: SupabaseClient) {}
  refreshPresence(room: string, actor: string): void {
    const entry = channels.get(this.client)?.entries.get(room);
    if (entry?.actor === actor && !entry.stopped) entry.refreshPresence?.();
  }
  subscribe(room: string, actor: string, callbacks: RoomSubscription): () => void {
    return this.watch(room, actor, callbacks, true);
  }
  subscribeChat(room: string, actor: string, callbacks: Partial<RoomSubscription>): () => void {
    return this.watch(room, actor, callbacks, false);
  }
  subscribeGame(game: string, actor: string, callbacks: Partial<RoomSubscription>): () => void {
    return this.watch('game:' + game, actor, callbacks, false);
  }
  subscribeBau(table: string, actor: string, callbacks: Partial<RoomSubscription>): () => void {
    return this.watch('bau:' + table, actor, callbacks, false);
  }
  subscribeDuck(race: string, actor: string, callbacks: Partial<RoomSubscription>): () => void {
    return this.watch('duck:' + race, actor, callbacks, false);
  }
  subscribeTyPhu(game: string, actor: string, callbacks: Partial<RoomSubscription>): () => void {
    return this.watch('typhu:' + game, actor, callbacks, false);
  }
  subscribeNotices(room: string, actor: string, callbacks: Partial<RoomSubscription>): () => void {
    return this.watch(room, actor, callbacks, false);
  }
  private watch(
    room: string,
    actor: string,
    callbacks: Partial<RoomSubscription>,
    presence: boolean,
  ) {
    let registry = channels.get(this.client);
    if (!registry) {
      registry = { entries: new Map(), retiring: new Map() };
      channels.set(this.client, registry);
    }
    const state = registry;
    const stop = (entry: SharedChannel) => {
      if (entry.stopped) return;
      entry.stopped = true;
      entry.observers.clear();
      clearTimeout(entry.closeTimer);
      clearTimeout(entry.retryTimer);
      if (state.entries.get(room) === entry) state.entries.delete(room);
      // The SDK reuses topics: serialize teardown before creating a new identity's channel.
      const retiring = entry.ready.then(async () => {
        if (!entry.channel) return;
        try {
          const status = await this.client.removeChannel(entry.channel);
          if (status !== 'ok') entry.channel.teardown();
        } catch {
          entry.channel.teardown();
        }
      });
      state.retiring.set(room, retiring);
      void retiring.then(() => {
        if (state.retiring.get(room) === retiring) state.retiring.delete(room);
      });
    };
    let shared = state.entries.get(room);
    if (shared && shared.actor !== actor) {
      stop(shared);
      shared = undefined;
    }
    const fresh = !shared;
    if (!shared) {
      shared = {
        actor,
        ready: Promise.resolve(),
        observers: new Set(),
        subscribed: false,
        tracked: false,
        syncing: false,
        stopped: false,
        generation: 0,
        connection: 'Đang kết nối',
        onlineMembers: null,
      };
      state.entries.set(room, shared);
    }
    const entry = shared;
    clearTimeout(entry.closeTimer);
    const observer = { callbacks, presence };
    entry.observers.add(observer);
    const emitConnection = (message: string) => {
      if (entry.stopped) return;
      entry.connection = message;
      for (const { callbacks } of entry.observers) callbacks.onConnection?.(message);
    };
    const emitPresence = (members: string[] | null) => {
      if (entry.stopped) return;
      entry.onlineMembers = members;
      for (const { callbacks } of entry.observers) {
        callbacks.onPresence?.(members === null ? null : [...members]);
        callbacks.onOnline?.(members?.length ?? 0);
      }
    };
    const syncPresence = async () => {
      if (entry.syncing || !entry.subscribed || entry.stopped || !entry.channel) return;
      clearTimeout(entry.retryTimer);
      entry.syncing = true;
      try {
        for (;;) {
          const desired = [...entry.observers].some((o) => o.presence);
          if (!entry.subscribed || entry.stopped || desired === entry.tracked) break;
          const generation = entry.generation;
          const result = desired
            ? await entry.channel.track({ online_at: new Date().toISOString() })
            : await entry.channel.untrack();
          if (entry.stopped) break;
          if (generation !== entry.generation) continue;
          if (result !== 'ok') throw new Error('Presence unavailable');
          entry.tracked = desired;
          emitConnection('Đã kết nối');
        }
      } catch {
        emitPresence(null);
        emitConnection('Đang kết nối lại');
        if (!entry.stopped) entry.retryTimer = setTimeout(() => void syncPresence(), 1000);
      } finally {
        entry.syncing = false;
      }
    };
    entry.refreshPresence = () => {
      // A brief offline event may leave the WebSocket open, so no rejoin/sync follows.
      // Retrack through the same serialized path to request fresh server Presence.
      if (!entry.subscribed || entry.stopped || ![...entry.observers].some((o) => o.presence))
        return;
      emitPresence(null);
      entry.tracked = false;
      void syncPresence();
    };
    const start = () => {
      if (entry.stopped) return;
      const channel = this.client.channel(
        /^(game|bau|duck|typhu):/.test(room) ? room : `room:${room}`,
        {
          config: { private: true, presence: { key: actor } },
        },
      );
      entry.channel = channel;
      channel
        .on('broadcast', { event: 'room.updated' }, ({ payload }) => {
          if (!entry.stopped && typeof payload?.version === 'number')
            for (const { callbacks } of entry.observers) callbacks.onVersion?.(payload.version);
          if (!entry.stopped && payload?.kind === 'penalty.updated')
            for (const { callbacks } of entry.observers) callbacks.onBauNotice?.();
          if (
            !entry.stopped &&
            payload?.kind === 'wallet.updated' &&
            typeof payload.user === 'string'
          )
            for (const { callbacks } of entry.observers) callbacks.onWallet?.(payload.user);
        })
        .on('broadcast', { event: 'chat.updated' }, () => {
          if (!entry.stopped) for (const { callbacks } of entry.observers) callbacks.onChat?.();
        })
        .on('broadcast', { event: 'games.updated' }, () => {
          if (!entry.stopped) for (const { callbacks } of entry.observers) callbacks.onGames?.();
        })
        .on('broadcast', { event: 'game.state_updated' }, ({ payload }) => {
          if (!entry.stopped && typeof payload?.version === 'number')
            for (const { callbacks } of entry.observers) callbacks.onVersion?.(payload.version);
        })
        .on('broadcast', { event: 'table.updated' }, ({ payload }) => {
          if (!entry.stopped && typeof payload?.version === 'number')
            for (const { callbacks } of entry.observers) callbacks.onVersion?.(payload.version);
        })
        .on('broadcast', { event: 'duck.updated' }, ({ payload }) => {
          if (!entry.stopped && typeof payload?.version === 'number')
            for (const { callbacks } of entry.observers) callbacks.onVersion?.(payload.version);
        })
        .on('broadcast', { event: 'ty_phu.updated' }, ({ payload }) => {
          if (!entry.stopped && typeof payload?.version === 'number')
            for (const { callbacks } of entry.observers) callbacks.onVersion?.(payload.version);
        })
        .on('broadcast', { event: 'co_tuong.updated' }, ({ payload }) => {
          if (
            !entry.stopped &&
            typeof payload?.game === 'string' &&
            typeof payload.version === 'number'
          )
            for (const { callbacks } of entry.observers)
              callbacks.onCoTuong?.(payload.game, payload.version);
        })
        .on('broadcast', { event: 'ty_phu.list' }, () => {
          if (!entry.stopped) for (const { callbacks } of entry.observers) callbacks.onGames?.();
        })
        .on('broadcast', { event: 'duck.reaction' }, ({ payload }) => {
          if (
            !entry.stopped &&
            typeof payload?.id === 'string' &&
            ['🦆', '🔥', '👏', '💜', '🏁'].includes(payload.emoji)
          )
            for (const { callbacks } of entry.observers)
              callbacks.onDuckReaction?.({ id: payload.id, emoji: payload.emoji });
        })
        .on('broadcast', { event: 'wallet.updated' }, ({ payload }) => {
          if (!entry.stopped && typeof payload?.user === 'string')
            for (const { callbacks } of entry.observers) callbacks.onWallet?.(payload.user);
        })
        .on('presence', { event: 'sync' }, () => {
          if (!entry.stopped && entry.subscribed)
            emitPresence(
              Object.entries(channel.presenceState())
                .filter(([, sessions]) => sessions.length > 0)
                .map(([member]) => member),
            );
        })
        .subscribe((status) => {
          if (entry.stopped) return;
          entry.generation++;
          entry.subscribed = status === 'SUBSCRIBED';
          entry.tracked = false;
          emitPresence(null);
          emitConnection(
            entry.subscribed
              ? 'Đã kết nối'
              : status === 'CLOSED'
                ? 'Mất kết nối'
                : 'Đang kết nối lại',
          );
          if (entry.subscribed) {
            for (const { callbacks } of entry.observers) callbacks.onResync?.();
            void syncPresence();
          }
        });
    };
    if (fresh) {
      const retiring = state.retiring.get(room);
      if (retiring) entry.ready = retiring.then(start);
      else start();
    } else {
      callbacks.onConnection?.(entry.connection);
      if (entry.subscribed && entry.channel) {
        callbacks.onPresence?.(entry.onlineMembers === null ? null : [...entry.onlineMembers]);
        callbacks.onOnline?.(entry.onlineMembers?.length ?? 0);
        callbacks.onResync?.();
        void syncPresence();
      }
    }
    return () => {
      if (entry.stopped || !entry.observers.delete(observer)) return;
      void syncPresence();
      if (!entry.observers.size) entry.closeTimer = setTimeout(() => stop(entry), 100);
    };
  }
}
