import { useQuery } from '@tanstack/react-query';
import type { Room } from '../../shared/contracts';
import { api } from './api';
import { useSession } from './session';

export function rememberRoom(userId: string, roomId: string) {
  try {
    localStorage.setItem(`roomtune:last-room:${userId}`, roomId);
  } catch {
    // Storage can be disabled; membership still comes from the server.
  }
}
export function lastRoom(userId: string) {
  try {
    return localStorage.getItem(`roomtune:last-room:${userId}`);
  } catch {
    return null;
  }
}
export function useJoinedRooms(refetchInterval: number | false = false) {
  const session = useSession();
  const query = useQuery({
    queryKey: ['rooms', session?.user.id],
    enabled: Boolean(session),
    refetchInterval,
    queryFn: () => api<{ rooms: { role: string; room: Room }[]; canCreate: boolean }>('/rooms'),
    staleTime: 0,
    retry: false,
  });
  const recentId = session ? lastRoom(session.user.id) : null;
  // A saved ID only orders rooms that this identity can still access.
  const rooms = [...(query.data?.rooms ?? [])].sort(
    (a, b) => Number(b.room.id === recentId) - Number(a.room.id === recentId),
  );
  return { ...query, rooms, recentId, session, restoring: session === undefined };
}
