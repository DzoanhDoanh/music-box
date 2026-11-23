import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  duckCommandSchema,
  type DuckCommand,
  type DuckSnapshot,
} from '../../shared/duck-race/contracts';
import { api, supabase } from './api';
import { RealtimeService } from './realtime';
import { clearGameRequest, saveGameRequest, uncertainGameRequest } from './game-outbox';
import { isConnectionError } from '../../shared/auth-errors';
import { AppError } from '../../shared/domain';
import { syncDuckClock, type DuckClock } from './duck-clock';

const requestSchema = z.object({ key: z.uuid(), body: duckCommandSchema }).strict();
function readPending(key: string) {
  try {
    return requestSchema.parse(JSON.parse(sessionStorage.getItem(key) ?? 'null'));
  } catch {
    return null;
  }
}
// Frequent personal actions already show their effect on screen; a toast each time is noise.
const quietActions = new Set(['reaction', 'ready', 'skin', 'join', 'leave']);
function parseCommand(body: unknown) {
  const parsed = duckCommandSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue?.path.includes('name')
    ? 'Tên không được để trống và tối đa 80 ký tự.'
    : issue?.path.includes('entries')
      ? 'Danh sách vịt chưa hợp lệ (2–30 tên, mỗi tên tối đa 80 ký tự).'
      : 'Thông tin cuộc đua chưa hợp lệ. Hãy kiểm tra lại các ô vừa nhập.';
  throw new Error(field);
}
export function newerDuckSnapshot(old: DuckSnapshot | undefined, next: DuckSnapshot) {
  if (
    old?.race &&
    next.race &&
    old.race.id === next.race.id &&
    (old.race.version > next.race.version ||
      (old.race.version === next.race.version && old.serverNow > next.serverNow))
  )
    return old;
  return next;
}
export function useDuckRace(room: string, actor: string, race: string | null) {
  const client = useQueryClient();
  const key = useMemo(() => ['duck', room, actor, race], [room, actor, race]);
  const endpoint = `/rooms/${room}/duck-race${race ? '/' + race : ''}`;
  const scope = useMemo(() => {
    const storage = `roomtune:duck:v1:${actor}:${room}:${race ?? 'lobby'}`;
    return {
      storage,
      request: readPending(storage),
      busy: false,
      active: true,
      clock: null as DuckClock | null,
    };
  }, [room, actor, race]);
  const [, render] = useState(0);
  const [connection, setConnection] = useState('Đang kết nối');
  const [reactions, setReactions] = useState<{ id: string; emoji: string; at: number }[]>([]);
  const clock = useRef<DuckClock>({ server: Date.now(), received: performance.now() });
  const latest = useRef<DuckSnapshot | undefined>(undefined);
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: async () => {
      const start = performance.now();
      const data = await api<DuckSnapshot>(endpoint, undefined, undefined, actor);
      const accepted = newerDuckSnapshot(client.getQueryData(key), data);
      if (scope.active && accepted === data) {
        const received = performance.now();
        clock.current = scope.clock = syncDuckClock(
          scope.clock,
          data.serverNow + Math.min(1000, (received - start) / 2),
          received,
        );
      }
      return accepted;
    },
    refetchInterval: (q) =>
      q.state.error && !isConnectionError(q.state.error)
        ? false
        : ['COUNTDOWN', 'RACING'].includes(q.state.data?.race?.status ?? '')
          ? 1000
          : 10000,
  });
  latest.current = query.data;
  useEffect(() => {
    scope.active = true;
    return () => {
      scope.active = false;
    };
  }, [scope]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void client.invalidateQueries({ queryKey: key }), 100);
    };
    const realtime = supabase ? new RealtimeService(supabase) : null;
    const stopRoom = realtime?.subscribeNotices(room, actor, {
      onGames: refresh,
      onResync: refresh,
      ...(!race ? { onConnection: setConnection } : {}),
    });
    const stopRace = race
      ? realtime?.subscribeDuck(race, actor, {
          onConnection: setConnection,
          onResync: refresh,
          onVersion: (v) => {
            if (v > (latest.current?.race?.version ?? -1)) refresh();
          },
          onDuckReaction: (reaction) =>
            setReactions((old) =>
              old.some((r) => r.id === reaction.id)
                ? old
                : [
                    ...old.filter((r) => Date.now() - r.at < 5000).slice(-11),
                    { ...reaction, at: Date.now() },
                  ],
            ),
        })
      : undefined;
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stopRoom?.();
      stopRace?.();
      clearTimeout(timer);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [key, room, race, actor, client]);
  const send = useCallback(
    async (body?: DuckCommand) => {
      if (scope.busy) throw new Error('Thao tác trước đang được xử lý.');
      if (scope.request && body) throw new Error('Hãy xác minh thao tác trước trước khi gửi thêm.');
      const request =
        scope.request ?? (body ? { key: crypto.randomUUID(), body: parseCommand(body) } : null);
      if (!request) throw new Error('Không có thao tác cần gửi lại.');
      scope.busy = true;
      render((v) => v + 1);
      try {
        saveGameRequest(scope.storage, request);
        scope.request = request;
        const start = performance.now();
        const result = await api<DuckSnapshot>(endpoint, request.body, request.key, actor);
        clearGameRequest(scope.storage, request.key);
        scope.request = null;
        if (scope.active) {
          const accepted = newerDuckSnapshot(client.getQueryData(key), result);
          if (accepted === result) {
            const received = performance.now();
            clock.current = scope.clock = syncDuckClock(
              scope.clock,
              result.serverNow + Math.min(1000, (received - start) / 2),
              received,
            );
          }
          // A rematch answers with a different race; never store it under this race's key.
          if (!race || !result.race || result.race.id === race)
            client.setQueryData<DuckSnapshot>(key, accepted);
          if (!quietActions.has(request.body.action)) toast.success('Đã cập nhật cuộc đua.');
          void client.invalidateQueries({ queryKey: ['duck', room, actor], exact: false });
        }
        return result;
      } catch (error) {
        if (!uncertainGameRequest(error)) {
          clearGameRequest(scope.storage, request.key);
          scope.request = null;
        }
        if (scope.active) toast.error(error instanceof Error ? error.message : 'Chưa thể xử lý.');
        if (scope.active && error instanceof AppError && error.code === 'DUCK_SETTINGS_STALE')
          await client.invalidateQueries({ queryKey: ['duck', room, actor], exact: false });
        throw error;
      } finally {
        scope.busy = false;
        if (scope.active) render((v) => v + 1);
      }
    },
    [scope, endpoint, actor, client, key, room, race],
  );
  return {
    query,
    data: query.error && !isConnectionError(query.error) ? undefined : query.data,
    send,
    pending: scope.busy,
    retry: !!scope.request && !scope.busy,
    clock,
    connection,
    reactions,
  };
}
