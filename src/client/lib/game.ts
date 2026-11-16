import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, supabase } from './api';
import { RealtimeService } from './realtime';
import { AppError } from '../../shared/domain';
import { isConnectionError } from '../../shared/auth-errors';
import type { GameCommand, GameSnapshot, GameState } from '../../shared/game/contracts';
import {
  clearGameRequest,
  gameOutboxKey,
  readGameRequest,
  saveGameRequest,
  uncertainGameRequest,
} from './game-outbox';

export type GameInput = GameCommand extends infer T
  ? T extends GameCommand
    ? Omit<T, 'version'>
    : never
  : never;
export function useGame(room: string, actor: string, game: string | null, visible: boolean) {
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const [connection, setConnection] = useState('Đang kết nối');
  const [, render] = useState(0);
  const scope = useMemo(() => {
    const storage = gameOutboxKey(room, actor, game);
    return { storage, busy: false, active: false, request: readGameRequest<GameCommand>(storage) };
  }, [room, actor, game]);
  const offset = useRef(0);
  useEffect(() => {
    scope.active = true;
    return () => {
      scope.active = false;
    };
  }, [scope]);
  const key = ['game', room, actor, game];
  const listKey = ['games', room, actor, page];
  const list = useQuery({
    queryKey: listKey,
    enabled: visible,
    retry: false,
    queryFn: () =>
      api<GameState[]>('/rooms/' + room + '/games?page=' + page, undefined, undefined, actor),
    refetchInterval: visible ? 15000 : false,
  });
  const query = useQuery({
    queryKey: key,
    enabled: !!game,
    retry: false,
    queryFn: async () => {
      const start = Date.now();
      const result = await api<GameSnapshot>(
        '/rooms/' + room + '/games/' + game,
        undefined,
        undefined,
        actor,
      );
      if (scope.active) offset.current = result.serverNow - (start + Date.now()) / 2;
      const old = client.getQueryData<GameSnapshot>(key);
      return old && old.state.version > result.state.version ? old : result;
    },
    refetchInterval: (q) => (q.state.error && !isConnectionError(q.state.error) ? false : 5000),
  });
  const latest = useRef(query.data);
  useEffect(() => {
    latest.current = query.data;
  }, [query.data]);
  useEffect(() => {
    if (!supabase) return;
    const service = new RealtimeService(supabase);
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ['games', room, actor] });
    };
    return service.subscribeChat(room, actor, { onGames: refresh, onResync: refresh });
  }, [room, actor, client]);
  useEffect(() => {
    if (!game || !supabase) return;
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ['game', room, actor, game] });
    };
    const stop = new RealtimeService(supabase).subscribeGame(game, actor, {
      onVersion: (version) => {
        if (version > (latest.current?.state.version ?? -1)) refresh();
      },
      onResync: refresh,
      onConnection: setConnection,
    });
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stop();
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [game, room, actor, client]);
  useEffect(() => {
    if (!game || !visible || (query.error && !isConnectionError(query.error))) return;
    let active = true;
    const watch = () =>
      void api<GameSnapshot>(
        '/rooms/' + room + '/games/' + game,
        { action: 'watch' },
        crypto.randomUUID(),
        actor,
      )
        .then((result) => {
          if (active)
            client.setQueryData<GameSnapshot>(['game', room, actor, game], (old) =>
              old && old.state.version > result.state.version ? old : result,
            );
        })
        .catch(() => {});
    watch();
    const timer = setInterval(watch, 25000);
    return () => {
      active = false;
      clearInterval(timer);
      void api(
        '/rooms/' + room + '/games/' + game,
        { action: 'unwatch' },
        crypto.randomUUID(),
        actor,
      ).catch(() => {});
    };
  }, [game, visible, room, actor, client, query.error]);
  const send = useCallback(
    async (input?: GameInput) => {
      if (scope.busy) return;
      const snapshot = latest.current;
      if (!game) return;
      const path = '/rooms/' + room + '/games/' + game;
      if (scope.request && input) {
        toast.info('Hãy xác minh thao tác trước trước khi gửi lệnh mới.');
        return;
      }
      const request =
        scope.request ??
        (input && snapshot?.state.id === game
          ? {
              key: crypto.randomUUID(),
              body: { ...input, version: snapshot.state.version } as GameCommand,
            }
          : null);
      if (!request) return;
      try {
        saveGameRequest(scope.storage, request);
      } catch {
        toast.error('Hãy cho phép bộ nhớ trình duyệt để lưu và khôi phục thao tác của bạn.');
        return;
      }
      scope.request = request;
      scope.busy = true;
      render((v) => v + 1);
      try {
        const result = await api<GameSnapshot>(path, request.body, request.key, actor);
        clearGameRequest(scope.storage, request.key);
        scope.request = null;
        if (!scope.active) return;
        client.setQueryData<GameSnapshot>(['game', room, actor, game], (old) =>
          old && old.state.version > result.state.version ? old : result,
        );
        void client.invalidateQueries({ queryKey: ['game', room, actor, game] });
        void client.invalidateQueries({ queryKey: ['games', room, actor] });
        if (!['roll', 'move'].includes(request.body.action)) toast.success('Đã cập nhật bàn chơi.');
      } catch (error) {
        if (!uncertainGameRequest(error)) {
          clearGameRequest(scope.storage, request.key);
          scope.request = null;
        }
        if (scope.active) {
          toast.error(error instanceof Error ? error.message : 'Không thể cập nhật bàn.');
          void client.invalidateQueries({ queryKey: ['game', room, actor, game] });
        }
        throw error;
      } finally {
        scope.busy = false;
        if (scope.active) render((v) => v + 1);
      }
    },
    [game, room, actor, client, scope],
  );
  const denied = query.error instanceof AppError && !isConnectionError(query.error);
  return {
    list,
    query,
    data: denied ? undefined : query.data,
    send,
    pending: scope.busy,
    pendingAction: scope.request?.body.action,
    retry: !!scope.request && !scope.busy,
    connection,
    offset,
    page,
    setPage,
  };
}
