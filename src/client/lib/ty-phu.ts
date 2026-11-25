import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, supabase } from './api';
import { RealtimeService } from './realtime';
import { AppError } from '../../shared/domain';
import { isConnectionError } from '../../shared/auth-errors';
import type {
  TyPhuCommand,
  TyPhuListItem,
  TyPhuPublicState,
  TyPhuRules,
  TyPhuSnapshot,
  TyPhuState,
} from '../../shared/ty-phu/contracts';

/** Engine helpers take the full state; clients never see the deck, which none of them read. */
export const asEngineState = (state: TyPhuPublicState): TyPhuState => ({ ...state, deck: [] });

export function useTyPhuList(room: string, actor: string) {
  const client = useQueryClient();
  const key = useMemo(() => ['ty-phu', room, actor, 'list'], [room, actor]);
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: () =>
      api<{ serverNow: number; matches: TyPhuListItem[] }>(
        `/rooms/${room}/ty-phu`,
        undefined,
        undefined,
        actor,
      ),
    refetchInterval: 15000,
  });
  useEffect(() => {
    const realtime = supabase ? new RealtimeService(supabase) : null;
    return realtime?.subscribeNotices(room, actor, {
      onGames: () => void client.invalidateQueries({ queryKey: key }),
      onResync: () => void client.invalidateQueries({ queryKey: key }),
    });
  }, [room, actor, client, key]);
  const create = useCallback(
    async (name: string, rules: TyPhuRules) => {
      const result = await api<TyPhuSnapshot>(
        `/rooms/${room}/ty-phu`,
        { name, rules },
        crypto.randomUUID(),
        actor,
      );
      void client.invalidateQueries({ queryKey: key });
      return result;
    },
    [room, actor, client, key],
  );
  return { query, create };
}

/**
 * Opens a fresh table with the finished game's name, rules and computer seats; returns its id.
 * The caller links it from the old game so everyone else can follow.
 */
export async function openRematch(room: string, actor: string, old: TyPhuPublicState) {
  let snapshot = await api<TyPhuSnapshot>(
    `/rooms/${room}/ty-phu`,
    { name: old.name, rules: old.rules },
    crypto.randomUUID(),
    actor,
  );
  for (let i = old.players.filter((p) => p.bot).length; i > 0; i--)
    snapshot = await api<TyPhuSnapshot>(
      `/rooms/${room}/ty-phu/${snapshot.state.id}`,
      { version: snapshot.state.version, command: { action: 'add_bot' } },
      crypto.randomUUID(),
      actor,
    );
  return snapshot.state.id;
}

export function useTyPhu(room: string, actor: string, game: string) {
  const client = useQueryClient();
  const key = useMemo(() => ['ty-phu', room, actor, game], [room, actor, game]);
  const endpoint = `/rooms/${room}/ty-phu/${game}`;
  const [pending, setPending] = useState(false);
  const [connection, setConnection] = useState('Đang kết nối');
  /** serverNow − local clock at the last response, for deadline countdowns. */
  const offset = useRef(0);
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: async () => {
      const data = await api<TyPhuSnapshot>(endpoint, undefined, undefined, actor);
      offset.current = data.serverNow - Date.now();
      const old = client.getQueryData<TyPhuSnapshot>(key);
      // Never let an older response overwrite a newer board.
      return old && old.state.version > data.state.version ? old : data;
    },
    refetchInterval: (q) =>
      q.state.error && !isConnectionError(q.state.error)
        ? false
        : q.state.data?.state.status === 'PLAYING'
          ? 5000
          : 15000,
  });
  const latest = useRef<TyPhuSnapshot | undefined>(undefined);
  latest.current = query.data;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void client.invalidateQueries({ queryKey: key }), 80);
    };
    const realtime = supabase ? new RealtimeService(supabase) : null;
    const stop = realtime?.subscribeTyPhu(game, actor, {
      onConnection: setConnection,
      onResync: refresh,
      onVersion: (version) => {
        if (version > (latest.current?.state.version ?? -1)) refresh();
      },
    });
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stop?.();
      clearTimeout(timer);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [game, actor, client, key]);
  // Ask the server to settle an expired deadline shortly after it passes.
  const deadline = query.data?.state.deadline ?? null;
  useEffect(() => {
    if (deadline === null) return;
    const wait = Math.max(0, deadline - (Date.now() + offset.current)) + 600;
    const timer = setTimeout(() => void client.invalidateQueries({ queryKey: key }), wait);
    return () => clearTimeout(timer);
  }, [deadline, client, key]);

  const send = useCallback(
    async (command: TyPhuCommand) => {
      const current = latest.current;
      if (!current || pending) return;
      setPending(true);
      try {
        const result = await api<TyPhuSnapshot>(
          endpoint,
          { version: current.state.version, command },
          crypto.randomUUID(),
          actor,
        );
        offset.current = result.serverNow - Date.now();
        client.setQueryData(key, result);
        return result;
      } catch (error) {
        if (error instanceof AppError && error.code === 'TYPHU_STALE')
          await client.invalidateQueries({ queryKey: key });
        toast.error(error instanceof Error ? error.message : 'Chưa thực hiện được thao tác.');
      } finally {
        setPending(false);
      }
    },
    [endpoint, actor, client, key, pending],
  );
  return { query, send, pending, connection, offset };
}
