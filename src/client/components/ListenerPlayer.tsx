import { useEffect, useRef, useState } from 'react';
import { Headphones, Volume2, MonitorSpeaker, RefreshCw } from 'lucide-react';
import type { Snapshot } from '../../shared/contracts';
import { loadYouTube, playbackError } from '../lib/youtube';
import { hostIsAvailable, listeningPosition, shouldListen } from '../lib/playback-sync';
import { AsyncButton, Button, Loading } from './ui';
import PlaybackRecovery from './PlaybackRecovery';

/** A follower has no command API: its events can never advance the shared queue. */
export default function ListenerPlayer({
  snapshot,
  onCheckHost,
  onOpenHost,
}: {
  snapshot: Snapshot;
  onCheckHost?: () => Promise<unknown>;
  onOpenHost?: () => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failure, setFailure] = useState('');
  const [externalRun, setExternalRun] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [volume, setVolume] = useState(70);
  const [expired, setExpired] = useState(
    () => !hostIsAvailable(snapshot.playback, Date.now() + (snapshot.clock_offset_ms ?? 0)),
  );
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<YT.Player | null>(null);
  const external = externalRun !== null && externalRun === snapshot.playback.run_id;
  const latest = useRef({ snapshot, volume, blocked, failure, external });
  useEffect(() => {
    latest.current = { snapshot, volume, blocked, failure, external };
  });
  const active = snapshot.queue.find((entry) => entry.id === snapshot.playback.entry_id);
  const videoId = active?.youtube_video_id;
  const runId = snapshot.playback.run_id;

  useEffect(() => {
    if (!enabled || !container.current || !videoId || !runId) return;
    let cancelled = false;
    let failed = false;
    setFailure('');
    setExternalRun(null);
    const mount = document.createElement('div');
    container.current.appendChild(mount);
    const isCurrent = () => !cancelled && latest.current.snapshot.playback.run_id === runId;
    const fail = (message: string) => {
      if (!isCurrent() || failed) return;
      failed = true;
      clearTimeout(readyTimer);
      setFailure(message);
      setBlocked(false);
      player.current?.pauseVideo?.();
    };
    const readyTimer = setTimeout(
      () => fail('YouTube tải quá lâu. Hãy thử lại hoặc mở bài trực tiếp trên YouTube.'),
      20000,
    );
    void loadYouTube()
      .then(() => {
        if (!isCurrent() || failed) return;
        const current = latest.current.snapshot;
        player.current = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: {
            origin: location.origin,
            playsinline: 1,
            controls: 1,
            autoplay: 0,
            start: Math.floor(
              listeningPosition(
                current.playback,
                active?.song.duration ?? 0,
                Date.now() + (current.clock_offset_ms ?? 0),
              ),
            ),
          },
          events: {
            onReady: () => {
              if (!isCurrent() || failed) return;
              clearTimeout(readyTimer);
              player.current?.setVolume(latest.current.volume);
              setReady(true);
            },
            onAutoplayBlocked: () => {
              if (isCurrent() && !failed && !latest.current.external) {
                clearTimeout(readyTimer);
                setBlocked(true);
              }
            },
            onStateChange: ({ data }) => {
              if (!isCurrent()) return;
              if (failed || latest.current.external) {
                if (data === YT.PlayerState.PLAYING) player.current?.pauseVideo();
                return;
              }
              setBuffering(data === YT.PlayerState.BUFFERING);
              if (data === YT.PlayerState.PLAYING) {
                const current = latest.current.snapshot;
                if (!shouldListen(current.playback, Date.now() + (current.clock_offset_ms ?? 0))) {
                  player.current?.pauseVideo();
                } else setBlocked(false);
              }
            },
            onError: ({ data }) => {
              fail(playbackError(data, active?.song.title ?? 'Video'));
            },
          },
        });
      })
      .catch((error: Error) => {
        fail(error.message);
      });
    return () => {
      cancelled = true;
      clearTimeout(readyTimer);
      player.current?.destroy();
      player.current = null;
      mount.remove();
      setReady(false);
      setBuffering(false);
      setBlocked(false);
      setFailure('');
      setExternalRun(null);
    };
  }, [enabled, videoId, runId, active?.song.duration, active?.song.title, attempt]);

  useEffect(() => {
    if (!ready || !player.current) return;
    const now = Date.now() + (snapshot.clock_offset_ms ?? 0);
    const playing = shouldListen(snapshot.playback, now);
    if (!playing) player.current.pauseVideo();
    if (blocked || failure || external || !hostIsAvailable(snapshot.playback, now)) return;
    const localState = player.current.getPlayerState();
    // Do not repeatedly seek a player that is buffering or has reached its end.
    if (localState !== YT.PlayerState.BUFFERING && localState !== YT.PlayerState.ENDED) {
      const target = listeningPosition(snapshot.playback, active?.song.duration ?? 0, now);
      if (Math.abs(player.current.getCurrentTime() - target) > 2)
        player.current.seekTo(target, true);
    }
    if (playing && localState !== YT.PlayerState.PLAYING && localState !== YT.PlayerState.ENDED) {
      player.current.playVideo();
    }
  }, [
    snapshot.playback,
    snapshot.clock_offset_ms,
    ready,
    blocked,
    failure,
    external,
    active?.song.duration,
  ]);

  useEffect(() => {
    const checkLease = () => {
      const current = latest.current.snapshot;
      const unavailable = !hostIsAvailable(
        current.playback,
        Date.now() + (current.clock_offset_ms ?? 0),
      );
      setExpired(unavailable);
      if (unavailable) player.current?.pauseVideo();
    };
    checkLease();
    const timer = setInterval(checkLease, 1000);
    window.addEventListener('online', checkLease);
    document.addEventListener('visibilitychange', checkLease);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', checkLease);
      document.removeEventListener('visibilitychange', checkLease);
    };
  }, [snapshot.playback.controller_id, snapshot.playback.lease_until, snapshot.clock_offset_ms]);

  return (
    <section className="listener-player panel" aria-label="Nghe trên thiết bị của bạn">
      <div className="panel-title">
        <h2>
          <Headphones size={20} /> Nghe trên thiết bị của bạn
        </h2>
        <span className="badge">Tất cả thiết bị</span>
      </div>
      <p>Máy host điều khiển bài chung. Bạn có thể chỉnh âm lượng hoặc tắt nghe riêng.</p>
      {expired && (
        <div className="notice listener-host-notice" role="status">
          <strong>Phòng chưa có máy host đang kết nối</strong>
          <p>
            Nhạc đang chờ máy phát của phòng. Bấm Play trong video ở máy nghe sẽ không khởi động lại
            host.
          </p>
          <p>
            {snapshot.role !== 'member'
              ? 'Bạn có thể nhận quyền host trên máy này để tiếp tục bài đang nghe. Máy host cần giữ trang mở; tải lại trang thì cần nhận quyền lại.'
              : 'Chủ phòng hoặc quản trị viên cần mở Máy phát nhạc và nhận quyền phát. Nhạc trên máy bạn sẽ tự tiếp tục khi host trở lại.'}
          </p>
          <div className="listener-host-actions">
            {onOpenHost && snapshot.role !== 'member' && (
              <Button variant="primary" onClick={onOpenHost}>
                <MonitorSpeaker size={17} /> Nhận quyền host trên máy này
              </Button>
            )}
            {onCheckHost && (
              <AsyncButton onClick={onCheckHost} loadingLabel="Đang kiểm tra…">
                <RefreshCw size={16} /> Kiểm tra lại host
              </AsyncButton>
            )}
          </div>
        </div>
      )}
      {!enabled ? (
        <Button variant="primary" onClick={() => setEnabled(true)}>
          <Headphones size={18} /> Bật nghe trên thiết bị này
        </Button>
      ) : (
        <>
          {active && runId ? (
            <div className="youtube-container" ref={container} />
          ) : (
            <p role="status">Chờ máy host chọn bài để phát.</p>
          )}
          {!expired && active && snapshot.playback.intent === 'PAUSED' && (
            <p role="status">Host đang tạm dừng bài. Nhấn Phát ở máy host để cả phòng nghe tiếp.</p>
          )}
          {!expired && active && snapshot.playback.state === 'NEEDS_USER_GESTURE' && (
            <p role="status">Máy host cần nhấn Tiếp tục phát nhạc để bật âm thanh cho phòng.</p>
          )}
          {!expired && active && (!ready || buffering) && !failure && !blocked && (
            <Loading>Đang tải nhạc trên máy này…</Loading>
          )}
          {blocked && !expired && (
            <div className="notice">
              <p>Trình duyệt cần bạn nhấn để bật âm thanh.</p>
              <Button
                variant="primary"
                onClick={() => {
                  setBlocked(false);
                  const current = latest.current.snapshot;
                  if (shouldListen(current.playback, Date.now() + (current.clock_offset_ms ?? 0))) {
                    player.current?.playVideo();
                  }
                }}
              >
                Tiếp tục nghe
              </Button>
            </div>
          )}
          <div className="listener-controls">
            <label>
              <Volume2 size={18} /> Âm lượng của bạn
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setVolume(value);
                  player.current?.setVolume(value);
                }}
              />
            </label>
            <Button onClick={() => setEnabled(false)}>Tắt nghe trên máy này</Button>
          </div>
        </>
      )}
      {active && (failure || external || snapshot.playback.state === 'ERROR') && (
        <PlaybackRecovery
          message={
            failure ||
            (external
              ? 'Bạn đang chọn nghe riêng trên YouTube. Nhấn thử lại để nghe trong phòng.'
              : 'Máy host chưa phát được bài này. Bạn có thể mở bài trên YouTube trong lúc chờ host xử lý.')
          }
          videoId={active.youtube_video_id}
          title={active.song.title}
          position={listeningPosition(
            snapshot.playback,
            active.song.duration,
            Date.now() + (snapshot.clock_offset_ms ?? 0),
          )}
          onExternal={() => {
            latest.current.external = true;
            setExternalRun(runId);
            setBlocked(false);
            player.current?.pauseVideo?.();
          }}
          onRetry={
            enabled
              ? async () => {
                  setAttempt((value) => value + 1);
                }
              : undefined
          }
        />
      )}
      <p className="muted">
        Giữ trang mở khi nghe. Các thiết bị có thể lệch nhịp khi tải mạng hoặc phát quảng cáo.
      </p>
    </section>
  );
}
