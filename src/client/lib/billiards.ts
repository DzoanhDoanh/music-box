import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, supabase } from './api';
import { RealtimeService } from './realtime';
import { AppError } from '../../shared/domain';
import { isConnectionError } from '../../shared/auth-errors';
import type {
  BilliardsCommand,
  BilliardsListItem,
  BilliardsSnapshot,
  CreateBilliards,
} from '../../shared/billiards/contracts';

export function useBilliardsList(room: string, actor: string) {
  const client = useQueryClient();
  const key = useMemo(() => ['billiards', room, actor, 'list'], [room, actor]);
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: () =>
      api<{ serverNow: number; matches: BilliardsListItem[] }>(
        `/rooms/${room}/billiards`,
        undefined,
        undefined,
        actor,
      ),
    refetchInterval: 15000,
  });
  useEffect(() => {
    const realtime = supabase ? new RealtimeService(supabase) : null;
    return realtime?.subscribeNotices(room, actor, {
      onBilliards: () => void client.invalidateQueries({ queryKey: key }),
      onResync: () => void client.invalidateQueries({ queryKey: key }),
    });
  }, [room, actor, client, key]);
  const create = useCallback(
    async (command: CreateBilliards) => {
      const result = await api<BilliardsSnapshot>(
        `/rooms/${room}/billiards`,
        command,
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

export function useBilliards(room: string, actor: string, game: string) {
  const client = useQueryClient();
  const key = useMemo(() => ['billiards', room, actor, game], [room, actor, game]);
  const endpoint = `/rooms/${room}/billiards/${game}`;
  const [pending, setPending] = useState(false);
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: async () => {
      const data = await api<BilliardsSnapshot>(endpoint, undefined, undefined, actor);
      const old = client.getQueryData<BilliardsSnapshot>(key);
      // Never let an older response overwrite a newer board.
      return old && old.state.version > data.state.version ? old : data;
    },
    refetchInterval: (q) =>
      q.state.error && !isConnectionError(q.state.error)
        ? false
        : q.state.data?.state.status === 'PLAYING'
          ? 8000
          : 15000,
  });
  const latest = useRef<BilliardsSnapshot | undefined>(undefined);
  latest.current = query.data;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void client.invalidateQueries({ queryKey: key }), 80);
    };
    const realtime = supabase ? new RealtimeService(supabase) : null;
    const stop = realtime?.subscribeNotices(room, actor, {
      onResync: refresh,
      onBilliards: (changed, version) => {
        if (changed === game && version > (latest.current?.state.version ?? -1)) refresh();
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
  }, [room, game, actor, client, key]);

  const send = useCallback(
    async (command: BilliardsCommand) => {
      const current = latest.current;
      if (!current || pending) return;
      setPending(true);
      try {
        const result = await api<BilliardsSnapshot>(
          endpoint,
          { version: current.state.version, command },
          crypto.randomUUID(),
          actor,
        );
        client.setQueryData(key, result);
        return result;
      } catch (error) {
        if (error instanceof AppError && error.code === 'BILLIARDS_STALE')
          await client.invalidateQueries({ queryKey: key });
        toast.error(error instanceof Error ? error.message : 'Chưa thực hiện được thao tác.');
      } finally {
        setPending(false);
      }
    },
    [endpoint, actor, client, key, pending],
  );
  return { query, send, pending };
}
