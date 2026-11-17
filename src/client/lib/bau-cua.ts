import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import { commandSchema, type BauCommand, type BauSnapshot } from '../../shared/bau-cua/contracts';
import { api, supabase } from './api';
import { RealtimeService } from './realtime';
import { uncertainGameRequest, clearGameRequest, saveGameRequest } from './game-outbox';
import { isConnectionError } from '../../shared/auth-errors';

const pendingSchema = z.object({ key: z.uuid(), body: commandSchema }).strict();
export function readBauRequest(key: string) {
  try {
    return pendingSchema.parse(JSON.parse(sessionStorage.getItem(key) ?? 'null'));
  } catch {
    return null;
  }
}
export function useBauCua(room: string, actor: string, table: string | null) {
  const client = useQueryClient(),
    [connection, setConnection] = useState('Đang kết nối');
  const [, render] = useState(0);
  const scope = useMemo(() => {
    const storage = `roomtune:bau:pending:v1:${actor}:${room}:${table ?? 'lobby'}`;
    return { storage, request: readBauRequest(storage), busy: false, active: true };
  }, [room, actor, table]);
  const endpoint = `/rooms/${room}/bau-cua${table ? '/' + table : ''}`;
  const key = useMemo(() => ['bau', room, actor, table], [room, actor, table]);
  const offset = useRef(0);
  useEffect(() => {
    scope.active = true;
    return () => {
      scope.active = false;
    };
  }, [scope]);
  const update = useCallback(
    (result: BauSnapshot) => {
      client.setQueryData<BauSnapshot>(key, (old) =>
        old?.table &&
        result.table &&
        old.table.id === result.table.id &&
        old.table.version > result.table.version
          ? old
          : result,
      );
    },
    [client, key],
  );
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: async () => {
      const started = Date.now();
      const result = await api<BauSnapshot>(endpoint, undefined, undefined, actor);
      if (scope.active) offset.current = result.serverNow - (Date.now() + started) / 2;
      const old = client.getQueryData<BauSnapshot>(key);
      return old?.table &&
        result.table &&
        old.table.id === result.table.id &&
        old.table.version > result.table.version
        ? old
        : result;
    },
    refetchInterval: (q) => (q.state.error && !isConnectionError(q.state.error) ? false : 15000),
  });
  const latest = useRef(query.data);
  latest.current = query.data;
  useEffect(() => {
    if (!supabase || !table) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void client.invalidateQueries({ queryKey: key }), 120);
    };
    const stop = new RealtimeService(supabase).subscribeBau(table, actor, {
      onVersion: (v) => {
        if (v > (latest.current?.table?.version ?? -1)) refresh();
      },
      onResync: refresh,
      onConnection: setConnection,
    });
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stop();
      clearTimeout(timer);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [table, actor, client, key]);
  useEffect(() => {
    const deadline = query.data?.round?.deadline;
    if (!deadline || query.error) return;
    const delay = Math.max(250, Date.parse(deadline) - Date.now() - offset.current + 100);
    const timer = setTimeout(
      () => void client.invalidateQueries({ queryKey: key }),
      Math.min(delay, 120000),
    );
    return () => clearTimeout(timer);
  }, [query.data?.round?.deadline, query.data?.table?.version, query.error, client, key]);
  const send = useCallback(
    async (body?: BauCommand) => {
      if (scope.busy) throw new Error('Thao tác trước đang được xử lý.');
      if (scope.request && body) throw new Error('Hãy xác minh thao tác trước trước khi gửi thêm.');
      const request =
        scope.request ??
        (body ? { key: crypto.randomUUID(), body: commandSchema.parse(body) } : null);
      if (!request) throw new Error('Không có thao tác cần gửi lại.');
      scope.busy = true;
      render((v) => v + 1);
      try {
        saveGameRequest(scope.storage, request);
        scope.request = request;
        const result = await api<BauSnapshot>(endpoint, request.body, request.key, actor);
        clearGameRequest(scope.storage, request.key);
        scope.request = null;
        if (scope.active) {
          update(result);
          void client.invalidateQueries({ queryKey: ['bau', room, actor] });
          if (!['advance', 'watch', 'reaction'].includes(request.body.action))
            toast.success(
              request.body.action === 'bet'
                ? 'Đã nhận cược.'
                : request.body.action === 'undo'
                  ? 'Đã hoàn coin cược.'
                  : 'Đã cập nhật Bầu Cua.',
            );
        }
        return result;
      } catch (error) {
        if (!uncertainGameRequest(error)) {
          clearGameRequest(scope.storage, request.key);
          scope.request = null;
        }
        if (scope.active) {
          toast.error(error instanceof Error ? error.message : 'Chưa thể xử lý.');
          void client.invalidateQueries({ queryKey: key });
        }
        throw error;
      } finally {
        scope.busy = false;
        if (scope.active) render((v) => v + 1);
      }
    },
    [scope, endpoint, actor, update, client, room, key],
  );
  return {
    query,
    data: query.error && !isConnectionError(query.error) ? undefined : query.data,
    send,
    pending: scope.busy,
    retry: !!scope.request && !scope.busy,
    connection,
    offset,
  };
}
