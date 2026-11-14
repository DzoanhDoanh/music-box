import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChatSnapshot } from '../../shared/contracts';
import { api } from './api';
import { isConnectionError } from '../../shared/auth-errors';

export function readChatMarker(key: string): number | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return null;
    const value = Number(stored);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

// Mount with a room/actor key: messages and drafts never cross identities.
export function useChat(room: string, actor: string, open: boolean, enabled = true) {
  const storageKey = `roomtune:chat-read:${actor}:${room}`;
  const [read, setRead] = useState(() => readChatMarker(storageKey));
  const marker = useRef(read);
  const markRead = useCallback(
    (sequence: number) => {
      if (marker.current !== null && sequence <= marker.current) return;
      marker.current = sequence;
      setRead(sequence);
      try {
        localStorage.setItem(storageKey, String(sequence));
      } catch {
        /* In-memory fallback. */
      }
    },
    [storageKey],
  );
  const query = useQuery({
    queryKey: ['chat', room, actor],
    enabled,
    queryFn: () =>
      api<ChatSnapshot>(
        `/rooms/${room}/chat?since=${marker.current ?? 0}`,
        undefined,
        undefined,
        actor,
      ),
    staleTime: 0,
    retry: false,
    refetchInterval: (query) =>
      query.state.error && !isConnectionError(query.state.error) ? false : open ? 15000 : 30000,
  });
  useEffect(() => {
    // First visit establishes a baseline rather than announcing the entire history as new.
    if (read === null && query.data) markRead(query.data.latest_sequence);
  }, [read, query.data, markRead]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      const value = readChatMarker(storageKey);
      if (value !== null) markRead(value);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [storageKey, markRead]);
  const data = query.data;
  const unread =
    !data || read === null || read >= data.latest_sequence
      ? 0
      : read === data.read_sequence
        ? data.unread_count
        : data.messages.filter((m) => m.sequence > read && m.sender_id !== actor && !m.deleted)
            .length;
  return { ...query, unread, markRead };
}
