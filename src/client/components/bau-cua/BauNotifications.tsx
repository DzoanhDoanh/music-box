import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Penalty } from '../../../shared/bau-cua/contracts';
import { api, supabase } from '../../lib/api';
import { RealtimeService } from '../../lib/realtime';
import { isConnectionError } from '../../../shared/auth-errors';

export default function BauNotifications({ room, actor }: { room: string; actor: string }) {
  const client = useQueryClient();
  const key = useMemo(() => ['bau-notices', room, actor], [room, actor]);
  const seen = useMemo(
    () => ({ room, actor, initialized: false, ids: new Set<string>() }),
    [room, actor],
  );
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<Penalty[]>(`/rooms/${room}/bau-cua/notices`, undefined, undefined, actor),
    retry: false,
    refetchInterval: (q) => (q.state.error && !isConnectionError(q.state.error) ? false : 30000),
  });
  useEffect(() => {
    if (!supabase) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void client.invalidateQueries({ queryKey: key }), 120);
    };
    const stop = new RealtimeService(supabase).subscribeNotices(room, actor, {
      onBauNotice: refresh,
      onResync: refresh,
    });
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      stop();
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [room, actor, key, client]);
  useEffect(() => {
    // A background notice feed must never take down the room screen.
    if (!Array.isArray(query.data)) return;
    for (const p of query.data) {
      if (seen.initialized && !seen.ids.has(p.id)) {
        toast.info(
          p.status === 'APPLIED'
            ? `${p.name} hết coin theo luật Bầu Cua. Đã gỡ ${p.songs?.length ?? 0} bài đang chờ.`
            : `${p.name} hết coin; không có bài đang chờ phù hợp để gỡ.`,
          { id: `bau-penalty:${actor}:${p.id}` },
        );
      }
      seen.ids.add(p.id);
    }
    seen.initialized = true;
  }, [query.data, seen, actor]);
  return null;
}
