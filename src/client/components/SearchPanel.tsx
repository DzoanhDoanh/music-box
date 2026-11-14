import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Link2, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { RoomCommand, Snapshot, Song } from '../../shared/contracts';
import { formatTime, parseYouTubeUrl } from '../../shared/domain';
import { api } from '../lib/api';
import { Button, Empty, Loading, ErrorState } from './ui';
export default function SearchPanel({
  snapshot,
  execute,
}: {
  snapshot: Snapshot;
  execute: (c: RoomCommand) => Promise<unknown>;
}) {
  const [input, setInput] = useState(''),
    [search, setSearch] = useState(''),
    [link, setLink] = useState(''),
    [busy, setBusy] = useState<string | null>(null);
  const adding = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 650);
    return () => clearTimeout(timer);
  }, [input]);
  const query = useQuery({
    queryKey: ['search', snapshot.room.id, search],
    queryFn: () =>
      api<{
        items: Song[];
      }>(`/youtube/search?room=${snapshot.room.id}&q=${encodeURIComponent(search)}`),
    enabled: search.length >= 2,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
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
      <div className="search-field">
        <Search size={20} />
        <input
          aria-label="Tìm bài hát trên YouTube"
          placeholder="Tên bài hát, nghệ sĩ, một chút cảm hứng…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={120}
        />
        {input && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Xóa tìm kiếm"
            onClick={() => setInput('')}
          >
            ×
          </Button>
        )}
      </div>
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
      {input.trim().length >= 2 && (input.trim() !== search || query.isFetching) ? (
        <Loading>Đang tìm bài hát…</Loading>
      ) : search.length < 2 ? (
        <Empty title="Bài hát tiếp theo là gì?">
          Tìm kiếm một bài hát, hoặc thêm bằng liên kết YouTube.
        </Empty>
      ) : query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
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
