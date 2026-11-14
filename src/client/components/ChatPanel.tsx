import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send, Trash2, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useChat } from '../lib/chat';
import { withFeedback } from '../lib/feedback';
import { isConnectionError } from '../../shared/auth-errors';
import { AsyncButton, Button, Loading } from './ui';
import type { ChatMessage } from '../../shared/contracts';

export default function ChatPanel({
  roomId,
  actor,
  manager,
  open,
  enabled = true,
  onUnreadChange,
}: {
  roomId: string;
  actor: string;
  manager: boolean;
  open: boolean;
  enabled?: boolean;
  onUnreadChange?: (count: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState('');
  const [sent, setSent] = useState(false);
  const [confirmed, setConfirmed] = useState<ChatMessage[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const request = useRef<{ body: string; key: string } | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const scroll = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const panelId = useId();
  const composer = useRef<HTMLTextAreaElement>(null);
  const client = useQueryClient();
  const chat = useChat(roomId, actor, open, enabled);
  const data = chat.data;
  const { markRead, error: chatError } = chat;
  const denied = Boolean(chat.error && !isConnectionError(chat.error));
  const loaded = Boolean(data);
  const messages = data
    ? [
        ...data.messages,
        ...confirmed.filter((message) => message.sequence > data.latest_sequence),
      ].sort((a, b) => a.sequence - b.sequence)
    : [];

  useLayoutEffect(() => {
    if (!open || !composer.current) return;
    const field = composer.current;
    field.style.height = '44px';
    field.style.height = `${Math.min(96, Math.max(44, field.scrollHeight))}px`;
  }, [draft, open]);
  useEffect(() => {
    if (data)
      setConfirmed((items) => items.filter((message) => message.sequence > data.latest_sequence));
  }, [data]);

  useEffect(() => {
    if (enabled) onUnreadChange?.(denied ? 0 : chat.unread);
  }, [enabled, denied, chat.unread, onUnreadChange]);

  useEffect(() => {
    if (!open || !scroll.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(scroll.current);
    return () => observer.disconnect();
  }, [open, loaded, denied]);

  useEffect(() => {
    mounted.current = true;
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!open || !element) return;
    if (atBottom) element.scrollTop = element.scrollHeight;
    else if (anchor.current) {
      const previous = anchor.current;
      const row = Array.from(element.querySelectorAll<HTMLElement>('[data-message]')).find(
        (node) => node.dataset.message === previous.id,
      );
      if (row)
        element.scrollTop +=
          row.getBoundingClientRect().top - element.getBoundingClientRect().top - previous.top;
    }
  }, [data, confirmed, open, atBottom]);
  useEffect(() => {
    if (open && visible && inView && atBottom && data && !chatError) markRead(data.latest_sequence);
  }, [open, visible, inView, atBottom, data, chatError, markRead]);

  function rememberScroll() {
    const element = scroll.current;
    if (!element) return;
    setAtBottom(element.scrollHeight - element.clientHeight - element.scrollTop < 32);
    const top = element.getBoundingClientRect().top;
    const row = Array.from(element.querySelectorAll<HTMLElement>('[data-message]')).find(
      (node) => node.getBoundingClientRect().bottom > top,
    );
    anchor.current = row
      ? { id: row.dataset.message!, top: row.getBoundingClientRect().top - top }
      : null;
  }
  async function send() {
    const body = draft.trim();
    if (!body || body.length > 1000 || running.current || denied) return;
    running.current = true;
    setSending(true);
    setFailure('');
    setSent(false);
    // Preserve a receipt across manual retries when the response was lost.
    if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
    try {
      const receipt = await api<{ id: string; sequence: number }>(
        `/rooms/${roomId}/chat`,
        { action: 'send', body },
        request.current.key,
        actor,
      );
      if (!mounted.current) return;
      // Show only server-acknowledged messages here; a background read reconciles
      // sender/time without holding the composer disabled for another round trip.
      if (receipt?.id && Number.isSafeInteger(receipt.sequence))
        setConfirmed((items) =>
          [
            ...items.filter((item) => item.id !== receipt.id),
            {
              id: receipt.id,
              sequence: receipt.sequence,
              sender_id: actor,
              sender: 'Bạn',
              body,
              created_at: new Date().toISOString(),
              deleted: false,
            },
          ].slice(-100),
        );
      request.current = null;
      setDraft('');
      setSent(true);
      setAtBottom(true);
      void client.invalidateQueries({ queryKey: ['chat', roomId, actor] });
    } catch (error) {
      if (!mounted.current) return;
      const message = error instanceof Error ? error.message : 'Chưa gửi được tin nhắn.';
      setFailure(message);
      toast.error(message);
    } finally {
      running.current = false;
      if (mounted.current) setSending(false);
    }
  }
  return (
    <section className="chat-panel" aria-label="Trò chuyện trong phòng" hidden={!open}>
      {open && (
        <div id={panelId} className="chat-body">
          <div className="chat-description">
            <p>100 tin gần nhất · Lưu trong 30 ngày</p>
          </div>
          {chat.isPending ? <Loading>Đang tải trò chuyện…</Loading> : null}
          {chat.error && (
            <div className="chat-error" role="alert">
              <p>
                {denied
                  ? chat.error.message
                  : 'Chưa đồng bộ được tin nhắn. Nội dung đang soạn vẫn được giữ.'}
              </p>
              <AsyncButton onClick={() => chat.refetch()} loadingLabel="Đang kết nối…">
                Kết nối lại chat
              </AsyncButton>
            </div>
          )}
          {!denied && data && (
            <>
              <div
                ref={scroll}
                className="chat-messages"
                tabIndex={0}
                role="region"
                aria-label="Tin nhắn trong phòng"
                onScroll={rememberScroll}
              >
                {messages.length === 0 && (
                  <div className="chat-empty">
                    <MessageCircle size={28} aria-hidden="true" />
                    <strong>Mở lời với cả phòng</strong>
                    <p>Gửi một lời chào hay chia sẻ bài hát bạn thích.</p>
                  </div>
                )}
                {messages.map((message) => (
                  <article
                    className={`chat-message${message.sender_id === actor ? ' chat-mine' : ''}`}
                    key={message.id}
                    data-message={message.id}
                  >
                    <div className="chat-message-meta">
                      <strong>{message.sender_id === actor ? 'Bạn' : message.sender}</strong>
                      <time
                        dateTime={message.created_at}
                        title={new Date(message.created_at).toLocaleString('vi-VN')}
                      >
                        {new Date(message.created_at).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      {!message.deleted && (manager || message.sender_id === actor) && (
                        <AsyncButton
                          variant="ghost"
                          size="icon"
                          aria-label={`Xóa tin nhắn của ${message.sender_id === actor ? 'bạn' : message.sender}`}
                          onClick={() =>
                            withFeedback(
                              async () => {
                                await api(
                                  `/rooms/${roomId}/chat`,
                                  { action: 'remove', message_id: message.id },
                                  undefined,
                                  actor,
                                );
                                await client.invalidateQueries({
                                  queryKey: ['chat', roomId, actor],
                                });
                              },
                              'Đang xóa tin nhắn…',
                              'Đã xóa tin nhắn.',
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </AsyncButton>
                      )}
                    </div>
                    <p className={message.deleted ? 'chat-deleted' : ''}>
                      {message.deleted ? 'Tin nhắn đã được xóa' : message.body}
                    </p>
                  </article>
                ))}
              </div>
              {!atBottom && (
                <Button
                  className="chat-jump"
                  onClick={() => {
                    setAtBottom(true);
                    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
                  }}
                >
                  <ArrowDown size={15} />
                  {chat.unread ? `${chat.unread} tin mới` : 'Đến tin mới nhất'}
                </Button>
              )}
            </>
          )}
          {!denied && (
            <form
              className="chat-compose"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <label className="sr-only" htmlFor={`${panelId}-draft`}>
                Tin nhắn của bạn
              </label>
              <textarea
                ref={composer}
                id={`${panelId}-draft`}
                value={draft}
                maxLength={1000}
                rows={1}
                disabled={sending}
                placeholder="Nhắn với cả phòng…"
                onChange={(event) => {
                  setDraft(event.target.value);
                  setFailure('');
                  setSent(false);
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    window.matchMedia('(pointer: fine)').matches
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="chat-compose-actions">
                <Button
                  type="submit"
                  variant="primary"
                  size="icon"
                  loading={sending}
                  loadingLabel="Đang gửi…"
                  aria-label={sending ? 'Đang gửi…' : failure ? 'Gửi lại' : 'Gửi tin'}
                  title={failure ? 'Gửi lại tin nhắn' : 'Gửi tin nhắn'}
                  disabled={!draft.trim() || chat.isPending}
                >
                  <Send size={16} />
                  <span className="sr-only">{failure ? 'Gửi lại' : 'Gửi tin'}</span>
                </Button>
              </div>
              <div className="chat-compose-hint">
                <span className="chat-keyboard-hint">Enter gửi · Shift+Enter xuống dòng</span>
                <small>{draft.length}/1.000</small>
              </div>
              <p className={failure ? 'chat-send-error' : 'sr-only'} role="status">
                {failure || (sent ? 'Đã gửi tin nhắn.' : '')}
              </p>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
