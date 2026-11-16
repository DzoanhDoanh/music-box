import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, RefreshCw, Sparkles, ArrowUpRight } from 'lucide-react';
import type {
  MusicRegion,
  RecommendationFeed,
  Snapshot,
  SongRecommendation,
} from '../../shared/contracts';
import { formatTime } from '../../shared/domain';
import { api } from '../lib/api';
import { Button, Loading } from './ui';
import './recommendations.css';

const moods = [
  ['Nhạc Việt', 'nhạc Việt mới'],
  ['Chill', 'nhạc chill Việt'],
  ['Acoustic', 'nhạc acoustic Việt'],
  ['Lofi', 'lofi music'],
  ['Âu Mỹ', 'pop music official'],
  ['Ballad', 'ballad Việt'],
  ['Rap Việt', 'rap Việt official'],
  ['EDM', 'EDM music'],
] as const;
const sources: { value: 'ALL' | MusicRegion; label: string }[] = [
  { value: 'ALL', label: 'Tổng hợp' },
  { value: 'VN', label: 'Việt Nam' },
  { value: 'US', label: 'Mỹ' },
  { value: 'KR', label: 'Hàn Quốc' },
  { value: 'JP', label: 'Nhật Bản' },
];
const reasons: Record<SongRecommendation['reason'], string> = {
  ROOM_FAVORITE: 'Phòng hay nghe',
  ROOM_RECENT: 'Đã nghe cùng nhau',
  FAMILIAR_CHANNEL: 'Kênh quen của phòng',
  DISCOVERY: 'Khám phá trên YouTube',
};

export default function Recommendations({
  snapshot,
  busy,
  add,
  search,
}: {
  snapshot: Snapshot;
  busy: string | null;
  add: (id: string) => Promise<void>;
  search: (query: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [source, setSource] = useState<'ALL' | MusicRegion>('ALL');
  const [visible, setVisible] = useState({ familiar: 6, discover: 12 });
  const query = useQuery({
    queryKey: [
      'recommendations',
      snapshot.room.id,
      snapshot.me,
      snapshot.playback.entry_id,
      snapshot.settings.max_duration,
    ],
    queryFn: () =>
      api<RecommendationFeed>(
        `/rooms/${snapshot.room.id}/recommendations`,
        undefined,
        undefined,
        snapshot.me,
      ),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const denied =
    query.error &&
    'code' in query.error &&
    ['UNAUTHORIZED', 'PERMISSION_DENIED'].includes(String(query.error.code));
  const data = denied ? undefined : query.data;
  const sourceUnavailable = Boolean(
    data?.discoveryUnavailable &&
      (source === 'ALL' || !data.unavailableRegions || data.unavailableRegions.includes(source)),
  );
  const discover =
    data?.discover.filter((item) => source === 'ALL' || item.regions?.includes(source)) ?? [];
  const slice = (items: SongRecommendation[], count: number, rotate: boolean) => {
    const start = rotate ? (page * 12) % Math.max(1, items.length) : 0;
    return [...items.slice(start), ...items.slice(0, start)].slice(0, count);
  };
  const more = (kind: 'familiar' | 'discover', items: SongRecommendation[]) => (
    <div className="recommendation-more">
      <span role="status">
        Đang hiện {Math.min(visible[kind], items.length)} / {items.length} bài
      </span>
      {visible[kind] < items.length && (
        <Button
          onClick={() => setVisible((current) => ({ ...current, [kind]: current[kind] + 12 }))}
          aria-label={kind === 'familiar' ? 'Xem thêm bài quen' : 'Xem thêm bài khám phá'}
        >
          <Plus size={16} /> Xem thêm {Math.min(12, items.length - visible[kind])} bài
        </Button>
      )}
    </div>
  );
  const cards = (items: SongRecommendation[], count: number, rotate = false) => (
    <div className="recommendation-grid">
      {slice(items, count, rotate).map(({ song, reason }) => {
        const exists = snapshot.queue.some(
          (entry) => entry.youtube_video_id === song.youtube_video_id,
        );
        return (
          <article className="recommendation-card" key={song.youtube_video_id}>
            <a
              className="recommendation-cover"
              href={`https://www.youtube.com/watch?v=${song.youtube_video_id}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Mở ${song.title} trên YouTube`}
            >
              <img src={song.thumbnail} alt="" loading="lazy" />
              <span>{formatTime(song.duration)}</span>
            </a>
            <div className="recommendation-details">
              <span className="recommendation-reason">{reasons[reason]}</span>
              <a
                className="recommendation-title"
                href={`https://www.youtube.com/watch?v=${song.youtube_video_id}`}
                target="_blank"
                rel="noopener noreferrer"
                title={song.title}
              >
                {song.title}
              </a>
              <span className="recommendation-channel" title={song.channel}>
                {song.channel}
              </span>
              <Button
                loading={busy === song.youtube_video_id}
                loadingLabel="Đang thêm…"
                disabled={Boolean(busy) || exists}
                aria-label={exists ? `${song.title} đã có trong hàng chờ` : `Thêm ${song.title}`}
                onClick={() => void add(song.youtube_video_id)}
              >
                {exists ? <Check size={16} /> : <Plus size={16} />}{' '}
                {exists ? 'Đã có trong hàng chờ' : 'Thêm bài'}
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
  return (
    <section className="music-recommendations" aria-label="Gợi ý nhạc">
      <div className="recommendation-heading">
        <div>
          <span className="recommendation-kicker">
            <Sparkles size={15} /> GỢI Ý CHO PHÒNG
          </span>
          <h3>Chưa biết nghe gì tiếp?</h3>
          <p>Một chút quen thuộc, một chút khám phá.</p>
        </div>
        {discover.length > 12 && (
          <Button
            variant="ghost"
            onClick={() => {
              setPage((value) => value + 1);
              setVisible((current) => ({ ...current, discover: 12 }));
            }}
          >
            <RefreshCw size={16} /> Đổi gợi ý
          </Button>
        )}
      </div>
      <div className="recommendation-moods" role="group" aria-label="Chọn nhanh thể loại nhạc">
        {moods.map(([label, value]) => (
          <Button key={label} onClick={() => search(value)}>
            {label}
          </Button>
        ))}
        {data?.seed && (
          <Button className="recommendation-seed" onClick={() => search(data.seed!.query)}>
            <Sparkles size={14} />
            <span>Tìm thêm: {data.seed.label}</span>
            <ArrowUpRight size={14} />
          </Button>
        )}
      </div>
      {query.isPending && <Loading>Đang chọn nhạc cho phòng…</Loading>}
      {query.error && (
        <div className="recommendation-notice" role="alert">
          <p>
            {query.error.message || 'Chưa tải được gợi ý. Bạn vẫn có thể tìm và thêm bài ở trên.'}
          </p>
          <Button loading={query.isFetching} onClick={() => void query.refetch()}>
            Thử lại gợi ý
          </Button>
        </div>
      )}
      {data && (
        <>
          {data.familiar.length > 0 && (
            <section className="recommendation-group" aria-label="Nghe lại cùng phòng">
              <h4>Nghe lại cùng phòng</h4>
              <p>Những bài đã nghe trọn vẹn, ưu tiên bài phòng thường chọn.</p>
              {cards(data.familiar, visible.familiar)}
              {more('familiar', data.familiar)}
            </section>
          )}
          <section className="recommendation-group" aria-label="Khám phá nhạc mới">
            <h4>Khám phá nhạc mới</h4>
            <p>Thêm lựa chọn từ Việt Nam và thế giới, ưu tiên kênh quen của phòng.</p>
            <div className="recommendation-sources" role="group" aria-label="Nguồn nhạc khám phá">
              {sources.map(({ value, label }) => (
                <Button
                  key={value}
                  aria-pressed={source === value}
                  onClick={() => {
                    setSource(value);
                    setPage(0);
                    setVisible((current) => ({ ...current, discover: 12 }));
                  }}
                >
                  {label}
                  <span>
                    {value === 'ALL'
                      ? data.discover.length
                      : data.discover.filter((item) => item.regions?.includes(value)).length}
                  </span>
                </Button>
              ))}
            </div>
            {data.discoveryUnavailable && discover.length > 0 && (
              <div className="recommendation-notice" role="status">
                <p>Một số nguồn nhạc chưa tải được. Bạn vẫn có thể chọn các bài bên dưới.</p>
                <Button loading={query.isFetching} onClick={() => void query.refetch()}>
                  Thử lại nguồn nhạc
                </Button>
              </div>
            )}
            {discover.length > 0 ? (
              <>
                {cards(discover, visible.discover, true)}
                {more('discover', discover)}
              </>
            ) : (
              <div className="recommendation-notice">
                <p>
                  {sourceUnavailable
                    ? 'YouTube đang tạm chậm hoặc đã hết lượt truy cập. Bạn vẫn có thể chọn bài quen ở trên hoặc dán liên kết.'
                    : 'Nguồn này chưa có bài phù hợp với hàng chờ và giới hạn của phòng. Chọn Tổng hợp hoặc thử một thể loại ở trên nhé.'}
                </p>
                {sourceUnavailable && (
                  <Button loading={query.isFetching} onClick={() => void query.refetch()}>
                    Tải lại khám phá
                  </Button>
                )}
              </div>
            )}
          </section>
          <p className="recommendation-footnote">
            Gợi ý từ hoạt động trong phòng và danh mục nhạc YouTube. Chọn “Thêm bài” để đưa vào hàng
            chờ.
          </p>
        </>
      )}
    </section>
  );
}
