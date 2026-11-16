import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commandFeedback, withFeedback } from './feedback';
import type { RoomCommand, Snapshot } from '../../shared/contracts';
import { api, supabase } from './api';
import { RealtimeService } from './realtime';
import { rememberRoom } from './joined-rooms';
import { useSessionState } from './session';
import { AppError } from '../../shared/domain';
import { isConnectionError } from '../../shared/auth-errors';
import { trackRoomPresence } from './presence';
export function useRoom(id: string) {
  const client = useQueryClient();
  const { session, error: sessionError } = useSessionState();
  const user = session?.user.id;
  const queryKey = ['room', id, user];
  const query = useQuery({
    queryKey,
    enabled: Boolean(session),
    queryFn: async () => {
      const started = Date.now();
      const snapshot = await api<Snapshot>(`/rooms/${id}/snapshot`);
      const serverTime = Date.parse(snapshot.server_time ?? '');
      return {
        ...snapshot,
        clock_offset_ms: Number.isFinite(serverTime) ? serverTime - (started + Date.now()) / 2 : 0,
      };
    },
    // Recover missed broadcasts and renew the observed lease, even after reconnects.
    refetchInterval: (query) =>
      isConnectionError(query.state.error)
        ? 3000
        : query.state.data?.reorder?.proposal?.status === 'OPEN'
          ? 3000
          : query.state.data?.settings.playback_mode === 'ALL_DEVICES' ||
              query.state.data?.settings.reorder_approval
            ? 15000
            : 30000,
    retry: false,
  });
  const [realtime, setRealtime] = useState<{
    room: string;
    actor: string;
    connection: string;
    members: string[] | null;
  } | null>(null);
  const me = query.data?.me;
  const accessLost = Boolean(query.error && !isConnectionError(query.error));
  const reorderApproval = query.data?.settings.reorder_approval;
  useEffect(() => {
    if (
      !user ||
      !me ||
      accessLost ||
      (!reorderApproval && import.meta.env.VITE_ENABLE_WHEEL !== 'true')
    )
      return;
    return trackRoomPresence(id, () => {
      void client.invalidateQueries({ queryKey: ['room', id, user] });
    });
  }, [id, me, user, accessLost, reorderApproval, client]);
  const previousToken = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (previousToken.current && session?.access_token !== previousToken.current)
      void client.invalidateQueries({ queryKey: ['room', id, user] });
    previousToken.current = session?.access_token;
  }, [session?.access_token, id, user, client]);
  const visitedRoom = query.data?.room.id;
  useEffect(() => {
    if (query.isSuccess && me && visitedRoom) rememberRoom(me, visitedRoom);
  }, [query.isSuccess, me, visitedRoom]);
  useEffect(() => {
    if (!supabase || !me || !user || accessLost) return;
    let active = true;
    let connection = 'Đang kết nối';
    let members: string[] | null = null;
    const publish = () => {
      if (active)
        setRealtime({
          room: id,
          actor: user,
          connection: navigator.onLine ? connection : 'Mất kết nối',
          members: navigator.onLine && connection === 'Đã kết nối' ? members : null,
        });
    };
    const recover = () => {
      void client.invalidateQueries({ queryKey: ['room', id, user] });
      void client.invalidateQueries({ queryKey: ['chat', id, user] });
    };
    const service = new RealtimeService(supabase);
    const dispose = service.subscribe(id, me, {
      onVersion: (version) => {
        const current = client.getQueryData<Snapshot>(['room', id, user]);
        if (!current || version > current.version) recover();
      },
      onPresence: (current) => {
        members = current;
        if (current !== null) connection = 'Đã kết nối';
        publish();
      },
      onChat: () => {
        void client.invalidateQueries({ queryKey: ['chat', id, user] });
      },
      onConnection: (status) => {
        connection = status;
        if (status !== 'Đã kết nối') members = null;
        publish();
      },
      onResync: recover,
    });
    const offline = () => {
      members = null;
      connection = 'Mất kết nối';
      publish();
    };
    const reconnect = () => {
      recover();
      service.refreshPresence(id, me);
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', recover);
    return () => {
      active = false;
      dispose();
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [id, me, user, accessLost, client]);
  const mutation = useMutation({
    mutationFn: ({ command, key }: { command: RoomCommand; key: string }) =>
      api<{
        playback: Snapshot['playback'];
        version: number;
      }>(`/rooms/${id}/commands`, command, key),
    onMutate: async ({ command }) => {
      if (command.action !== 'vote') return undefined;
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<Snapshot>(queryKey);
      client.setQueryData<Snapshot>(queryKey, (current) =>
        current
          ? {
              ...current,
              queue: current.queue.map((entry) =>
                entry.id === command.entry_id
                  ? {
                      ...entry,
                      voted: command.enabled,
                      vote_count:
                        entry.vote_count + (command.enabled ? 1 : 0) - (entry.voted ? 1 : 0),
                    }
                  : entry,
              ),
            }
          : current,
      );
      return { previous, queryKey };
    },
    onSuccess: (result) => {
      client.setQueryData<Snapshot>(queryKey, (current) =>
        current && result.version >= current.version
          ? { ...current, version: result.version, playback: result.playback }
          : current,
      );
      void client.invalidateQueries({ queryKey: ['room', id] });
      void client.invalidateQueries({ queryKey: ['history', id] });
      void client.invalidateQueries({ queryKey: ['admin', id] });
    },
    onError: (_error: Error, _variables, context) => {
      if (context?.previous) client.setQueryData(context.queryKey, context.previous);
      void client.invalidateQueries({ queryKey: ['room', id] });
    },
  });
  const execute = (command: RoomCommand, options?: { feedback?: boolean }) => {
    const task = () => mutation.mutateAsync({ command, key: crypto.randomUUID() });
    const messages = commandFeedback(command, query.data?.settings.require_approval ?? false);
    return messages && options?.feedback !== false ? withFeedback(task, ...messages) : task();
  };
  const currentPresence = realtime?.room === id && realtime.actor === user && !accessLost;
  const onlineIds = currentPresence && realtime.members !== null ? new Set(realtime.members) : null;
  // Presence is an informational hint, never authority for room membership or voting.
  const onlineMembers = onlineIds
    ? (query.data?.members ?? [])
        .filter((member) => onlineIds.has(member.user_id))
        .map((member) => member.user_id)
    : null;
  return {
    ...query,
    error: sessionError ?? (session === null ? new AppError('UNAUTHORIZED', 401) : query.error),
    isPending: session === undefined ? !sessionError : Boolean(session) && query.isPending,
    execute,
    pending: mutation.isPending,
    connection: currentPresence ? realtime.connection : 'Đang kết nối',
    online: onlineMembers?.length ?? 0,
    onlineMembers,
  };
}
