import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, MessageCircle, Minus, Search, X, AudioLines } from 'lucide-react';
import { useJoinedRooms } from '../lib/joined-rooms';
import { supabase } from '../lib/api';
import { RealtimeService } from '../lib/realtime';
import { useFloatingChatPosition } from '../lib/floating-chat-position';
import { isConnectionError } from '../../shared/auth-errors';
import { Button, Loading } from './ui';
import ChatPanel from './ChatPanel';

export default function FloatingChat({ children }: { children: ReactNode }) {
  const query = useJoinedRooms(30000);
  const location = useLocation();
  const currentRoom = matchPath('/room/:id', location.pathname)?.params.id ?? null;
  if (!query.session) return children;
  return (
    <ChatDock
      key={query.session.user.id}
      actor={query.session.user.id}
      query={query}
      currentRoom={currentRoom}
    >
      {children}
    </ChatDock>
  );
}

function ChatDock({
  actor,
  currentRoom,
  query,
  children,
}: {
  actor: string;
  currentRoom: string | null;
  query: ReturnType<typeof useJoinedRooms>;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [choosing, setChoosing] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(currentRoom);
  const [visited, setVisited] = useState<string[]>(currentRoom ? [currentRoom] : []);
  const [unread, setUnread] = useState(0);
  const [search, setSearch] = useState('');
  const launcher = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const windowId = useId();
  const client = useQueryClient();
  const { ref, canOpen } = useFloatingChatPosition(expanded);
  const permitted = !query.error || isConnectionError(query.error);
  const rooms = permitted ? query.rooms : [];
  const selected = rooms.find((item) => item.room.id === selectedId);
  const roomId = selected?.room.id;
  const showList = choosing || !selected;
  const visible = expanded && canOpen;
  const close = useCallback(() => {
    setExpanded(false);
    launcher.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (visible) heading.current?.focus({ preventScroll: true });
  }, [visible, showList, roomId]);
  useEffect(() => {
    if (!roomId || !supabase) return;
    const recover = () => {
      void client.invalidateQueries({ queryKey: ['chat', roomId, actor] });
      void client.invalidateQueries({ queryKey: ['rooms', actor] });
    };
    const dispose = new RealtimeService(supabase).subscribeChat(roomId, actor, {
      onChat: recover,
      onResync: recover,
      onVersion: () => {
        recover();
      },
    });
    window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', recover);
    return () => {
      dispose();
      window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [roomId, actor, client]);
  const choose = (id: string) => {
    setUnread(0);
    setSelectedId(id);
    setVisited((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setChoosing(false);
    setSearch('');
  };
  return (
    <div
      ref={ref}
      className="chat-dock"
      data-expanded={visible}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && visible && !event.defaultPrevented) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <section id={windowId} className="chat-window" aria-label="Hộp trò chuyện" hidden={!visible}>
        <header className="chat-window-header">
          {!showList ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Chọn phòng chat"
              onClick={() => setChoosing(true)}
            >
              <ArrowLeft size={18} />
            </Button>
          ) : (
            <span className="chat-window-symbol">
              <MessageCircle size={21} />
            </span>
          )}
          <div>
            <h2 ref={heading} tabIndex={-1}>
              {showList ? 'Trò chuyện' : selected?.room.name}
            </h2>
            <p>
              {showList
                ? 'Chọn phòng để bắt chuyện'
                : currentRoom === roomId
                  ? 'Phòng bạn đang nghe'
                  : 'Chat tại đây · Nhạc vẫn tiếp tục'}
            </p>
          </div>
          <Button size="icon" variant="ghost" aria-label="Thu nhỏ trò chuyện" onClick={close}>
            <Minus size={18} />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Đóng trò chuyện" onClick={close}>
            <X size={18} />
          </Button>
        </header>
        {showList && (
          <div className="chat-room-picker">
            <label className="chat-room-search">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label="Tìm phòng chat"
                placeholder="Tìm phòng của bạn…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            {query.isPending ? (
              <Loading>Đang tải các phòng…</Loading>
            ) : query.error ? (
              <div className="chat-error" role="alert">
                <p>{query.error.message}</p>
                <Button onClick={() => void query.refetch()}>Tải lại danh sách phòng</Button>
              </div>
            ) : null}
            <div className="chat-room-list">
              {rooms
                .filter(({ room }) =>
                  room.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')),
                )
                .map(({ room }) => (
                  <button
                    key={room.id}
                    className="chat-room-option"
                    aria-label={`Chat trong ${room.name}`}
                    onClick={() => choose(room.id)}
                  >
                    <span className="chat-room-avatar" data-listening={room.id === currentRoom}>
                      <AudioLines size={22} />
                    </span>
                    <span>
                      <strong>{room.name}</strong>
                      <small>
                        {room.id === currentRoom ? 'Đang nghe tại đây' : 'Phòng đã tham gia'}
                      </small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              {!query.isPending && rooms.length === 0 && !query.error && (
                <p className="chat-list-empty">
                  Tham gia một phòng nhạc để trò chuyện với mọi người.
                </p>
              )}
              {rooms.length > 0 &&
                !rooms.some(({ room }) =>
                  room.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')),
                ) && <p className="chat-list-empty">Không có phòng khớp với tên này.</p>}
            </div>
            <p className="chat-room-footnote">Chọn phòng chat không đổi phòng đang nghe.</p>
          </div>
        )}
        {visited.map((id) => {
          const membership = rooms.find((item) => item.room.id === id);
          return membership ? (
            <ChatPanel
              key={id}
              roomId={id}
              actor={actor}
              manager={membership.role !== 'member'}
              open={visible && !showList && id === roomId}
              enabled={id === roomId}
              onUnreadChange={setUnread}
            />
          ) : null;
        })}
      </section>
      <div className="chat-dock-actions">
        {children}
        <button
          ref={launcher}
          type="button"
          className="chat-launcher"
          aria-label="Trò chuyện"
          aria-expanded={visible}
          aria-controls={windowId}
          title={expanded && !canOpen ? 'Cuộn ra khỏi video để mở khung chat' : 'Trò chuyện'}
          onClick={() => {
            if (visible) close();
            else setExpanded(true);
          }}
        >
          {visible ? (
            <X size={25} aria-hidden="true" />
          ) : (
            <MessageCircle size={26} aria-hidden="true" />
          )}
          {unread > 0 && selected && (
            <span className="chat-unread" aria-label={`${unread} tin chưa đọc`}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
