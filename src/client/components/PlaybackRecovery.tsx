import { ExternalLink, RotateCw, Search, SkipForward } from 'lucide-react';
import { AsyncButton, Button } from './ui';
import { youtubeWatchUrl } from '../lib/youtube';

/** Recovery stays outside the iframe. External playback is always a user choice. */
export default function PlaybackRecovery({
  message,
  videoId,
  title,
  position,
  onRetry,
  onSkip,
  onExternal,
}: {
  message: string;
  videoId: string;
  title: string;
  position: number;
  onRetry?: () => Promise<unknown>;
  onSkip?: () => Promise<unknown>;
  onExternal?: () => void;
}) {
  return (
    <div className="playback-recovery">
      <p className="form-error" role="alert">
        {message}
      </p>
      <div className="playback-recovery-actions">
        <Button asChild variant="primary">
          <a
            href={youtubeWatchUrl(videoId, position)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onExternal}
          >
            <ExternalLink size={17} aria-hidden="true" /> Mở trên YouTube
          </a>
        </Button>
        {onRetry && (
          <AsyncButton onClick={onRetry} loadingLabel="Đang thử lại…">
            <RotateCw size={17} aria-hidden="true" /> Thử lại trong phòng
          </AsyncButton>
        )}
        <Button asChild variant="ghost">
          <a
            href={`https://www.youtube.com/results?${new URLSearchParams({ search_query: title })}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onExternal}
          >
            <Search size={17} aria-hidden="true" /> Tìm bản khác trên YouTube
          </a>
        </Button>
        {onSkip && (
          <AsyncButton onClick={onSkip} loadingLabel="Đang bỏ qua…" variant="ghost">
            <SkipForward size={17} aria-hidden="true" /> Bỏ qua bài này
          </AsyncButton>
        )}
      </div>
      <p className="muted">
        YouTube mở ở tab hoặc ứng dụng riêng, không đồng bộ với phòng. Giữ ROOMTUNE mở để quay lại;
        tắt nhạc trên YouTube trước khi thử lại trong phòng. Nếu tìm được bản khác, sao chép liên
        kết rồi dán vào mục Tìm & thêm bài.
      </p>
    </div>
  );
}
