import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Link2, Plus, Check, CircleAlert, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { RoomCommand, Snapshot, Song } from '../../shared/contracts';
import { AppError, formatTime, parseYouTubeUrl } from '../../shared/domain';
import { api } from '../lib/api';
import { Button, Empty, Loading } from './ui';
import Recommendations from './Recommendations';
const normalizeQuery = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

function SearchFailure({
  error,
  search,
  retry,
  focusLink,
  suggestions,
}: {
  error: Error;
  search: string;
  retry: () => void;
  focusLink: () => void;
  suggestions: () => void;
}) {
  const code = error instanceof AppError ? error.code : '';
  const limited = code === 'YOUTUBE_QUOTA_EXCEEDED';
  const [remaining, setRemaining] = useState(
    error instanceof AppError ? (error.retryAfterSeconds ?? 0) : 0,
  );
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  return (
    <div className="search-feedback" role="alert">
      <CircleAlert aria-hidden="true" />
      <h3>{limited ? 'Tìm kiếm đang hết lượt' : 'Chưa tìm được bài hát'}</h3>
      <p>{error.message}</p>
      <div className="search-feedback-actions">
        {!limited && (
          <Button disabled={remaining > 0} onClick={retry}>
            {remaining > 0 ? `Thử lại sau ${remaining}s` : 'Thử lại'}
          </Button>
        )}
        <Button onClick={suggestions}>Xem bài gợi ý</Button>
        <Button onClick={focusLink}>Dán liên kết</Button>
        <a
          className="button button-secondary"
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(search)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Tìm trên YouTube <ExternalLink size={16} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
export default function SearchPanel({
  snapshot,
  execute,
}: {
  snapshot: Snapshot;
  execute: (c: RoomCommand) => Promise<unknown>;
}) {
  const [input, setInput] = useState(''),
    [search, setSearch] = useState(''),
    [composing, setComposing] = useState(false),
    [link, setLink] = useState(''),
    [busy, setBusy] = useState<string | null>(null);
  const adding = useRef(false);
  const linkInput = useRef<HTMLInputElement>(null);
  const normalizedInput = normalizeQuery(input);
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => setSearch(normalizedInput), 650);
    return () => clearTimeout(timer);
  }, [normalizedInput, composing]);
  const query = useQuery({
    queryKey: ['search', snapshot.room.id, snapshot.me, search],
    queryFn: () =>
      api<{
        items: Song[];
      }>(
        `/youtube/search?room=${snapshot.room.id}&q=${encodeURIComponent(search)}`,
        undefined,
        undefined,
        snapshot.me,
      ),
    enabled: search.length >= 2 && search === normalizedInput && !composing,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
  function submitSearch(value: string) {
    const next = normalizeQuery(value);
    if (next.length < 2 || composing || (next === search && query.isFetching)) return;
    if (next === search) {
      if (query.isError || query.isStale) void query.refetch();
    } else setSearch(next);
  }
  function clearSearch() {
    setInput('');
    setSearch('');
  }
  async function add(id: string) {
    if (adding.current) return;
    adding.current = true;
    setBusy(id);
    const submittedLink = link;
    try {
      await execute({ action: 'enqueue', video_id: id });
      setLink((current) => (current === submittedLink ? '' : current));
    } catch {
      /* mutation displays error */
    } finally {
      adding.current = false;
      setBusy(null);
    }
  }
  return (
    <section className="search-panel">
      <div className="section-heading">
        <div>
          <h2>Chọn một bài bạn thích</h2>
          <p>Tìm trên YouTube hoặc dán một liên kết.</p>
        </div>
        <span className="youtube-label">YouTube</span>
      </div>
      <form
        className="search-field"
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch(input);
        }}
      >
        <Search size={20} />
        <input
          aria-label="Tìm bài hát trên YouTube"
          enterKeyHint="search"
          placeholder="Tên bài hát, nghệ sĩ, một chút cảm hứng…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(e) => {
            setInput(e.currentTarget.value);
            setComposing(false);
          }}
          maxLength={120}
        />
        {input && (
          <Button variant="ghost" size="icon" aria-label="Xóa tìm kiếm" onClick={clearSearch}>
            ×
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={
            normalizedInput.length < 2 ||
            composing ||
            (normalizedInput === search && query.isFetching)
          }
        >
          Tìm
        </Button>
      </form>
      <form
        className="link-form"
        onSubmit={(e) => {
          e.preventDefault();
          const id = parseYouTubeUrl(link);
          if (!id) {
            toast.error('Hãy nhập liên kết YouTube hợp lệ.');
            return;
          }
          void add(id);
        }}
      >
        <Link2 size={18} />
        <input
          ref={linkInput}
          aria-label="Liên kết YouTube"
          type="url"
          required
          placeholder="Dán liên kết YouTube tại đây"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <Button
          type="submit"
          loading={Boolean(busy) && parseYouTubeUrl(link) === busy}
          loadingLabel="Đang thêm…"
          disabled={Boolean(busy)}
          variant="primary"
        >
          <Plus size={17} /> Thêm bài
        </Button>
      </form>
      {input.trim().length < 2 ? (
        <Recommendations
          key={`${snapshot.room.id}:${snapshot.me}`}
          snapshot={snapshot}
          busy={busy}
          add={add}
          search={(value) => {
            setInput(value);
            submitSearch(value);
          }}
        />
      ) : composing || normalizedInput !== search || query.isFetching ? (
        <Loading>Đang tìm bài hát…</Loading>
      ) : query.isPending ? (
        <Loading />
      ) : query.error ? (
        <SearchFailure
          key={`${snapshot.room.id}:${snapshot.me}:${query.errorUpdatedAt}`}
          error={query.error}
          search={search}
          retry={() => void query.refetch()}
          focusLink={() => linkInput.current?.focus()}
          suggestions={clearSearch}
        />
      ) : query.data?.items.length ? (
        <div className="song-results">
          {query.data.items.map((song) => {
            const exists = snapshot.queue.some((e) => e.youtube_video_id === song.youtube_video_id);
            return (
              <article className="song-row" key={song.youtube_video_id}>
                <img src={song.thumbnail} alt="" loading="lazy" />
                <div className="song-info">
                  <a
                    href={`https://www.youtube.com/watch?v=${song.youtube_video_id}`}
                    target="_blank"
                    rel="noopener"
                  >
                    {song.title}
                  </a>
                  <span>
                    {song.channel} · {formatTime(song.duration)}
                  </span>
                </div>
                <Button
                  size="icon"
                  aria-label={exists ? 'Đã có trong hàng chờ' : `Thêm ${song.title}`}
                  loading={busy === song.youtube_video_id}
                  disabled={Boolean(busy) || (exists && !snapshot.settings.allow_duplicates)}
                  onClick={() => void add(song.youtube_video_id)}
                >
                  {exists ? <Check size={18} /> : <Plus size={18} />}
                </Button>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty title="Chưa tìm thấy bài phù hợp">
          Thử từ khóa khác hoặc thêm bài bằng liên kết.
        </Empty>
      )}
    </section>
  );
}
