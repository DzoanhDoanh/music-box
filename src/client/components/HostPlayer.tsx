import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, Volume2, MonitorSpeaker } from 'lucide-react';
import { toast } from 'sonner';
import type { RoomCommand, Snapshot } from '../../shared/contracts';
import { AppError, formatTime } from '../../shared/domain';
import { isConnectionError } from '../../shared/auth-errors';
import { AsyncButton, Loading } from './ui';
import { loadYouTube, playbackError } from '../lib/youtube';
import PlaybackRecovery from './PlaybackRecovery';

type CommandResult = {
  playback: Snapshot['playback'];
  version: number;
};
type Execute = (command: RoomCommand, options?: { feedback?: boolean }) => Promise<CommandResult>;
export default function HostPlayer({
  snapshot,
  execute,
  onOwnershipChange,
  claimOnMount = false,
  onClaimRequestHandled,
}: {
  snapshot: Snapshot;
  execute: Execute;
  onOwnershipChange?: (lease: { controller: string; fence: number } | null) => void;
  claimOnMount?: boolean;
  onClaimRequestHandled?: () => void;
}) {
  const [controller] = useState(() => crypto.randomUUID()),
    [fence, setFence] = useState<number | null>(null),
    [ready, setReady] = useState(false),
    [blocked, setBlocked] = useState(false),
    [time, setTime] = useState(0),
    [volume, setVolume] = useState(70),
    [reconnecting, setReconnecting] = useState(false),
    [failure, setFailure] = useState(''),
    [autoSkipping, setAutoSkipping] = useState(false),
    [recoveryActionError, setRecoveryActionError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const claimPending = useRef(false);
  const initialClaimStarted = useRef(false);
  const container = useRef<HTMLDivElement>(null),
    player = useRef<YT.Player | null>(null),
    latest = useRef({ snapshot, execute, fence }),
    loadedRun = useRef<string | null>(null),
    leaseDeadline = useRef(0),
    lastReport = useRef(''),
    recovery = useRef<{ runId: string; position: number } | null>(null),
    recoveryReport = useRef<Promise<CommandResult | false> | null>(null),
    generation = useRef(0),
    advancing = useRef(false),
    failureStreak = useRef(0),
    healthyPlayback = useRef<{ since: number; position: number } | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentPosition = useCallback(() => {
    const current = latest.current.snapshot.playback;
    if (recovery.current?.runId === current.run_id) return recovery.current.position;
    return loadedRun.current === current.run_id
      ? (player.current?.getCurrentTime?.() ?? current.position)
      : current.position;
  }, []);
  const loseLease = useCallback((message: string) => {
    // Fence callbacks immediately, before React commits the unmount.
    latest.current.fence = null;
    leaseDeadline.current = 0;
    player.current?.pauseVideo();
    setFence(null);
    setReconnecting(false);
    setAutoSkipping(false);
    setFailure(message);
  }, []);
  useEffect(() => {
    latest.current = { snapshot, execute, fence };
  }, [snapshot, execute, fence]);
  const claim = useCallback(async () => {
    if (claimPending.current || latest.current.fence !== null) return;
    claimPending.current = true;
    setClaiming(true);
    try {
      const startedAt = Date.now();
      const result = await latest.current.execute({ action: 'claim', controller_id: controller });
      if (!mounted.current) return;
      if (
        result.playback.controller_id !== controller ||
        !Number.isSafeInteger(result.playback.fence)
      ) {
        setFailure('Chưa xác nhận được quyền host. Hãy thử lại.');
        return;
      }
      leaseDeadline.current = startedAt + 25000;
      if (Date.now() >= leaseDeadline.current) {
        setFailure('Kết nối quá chậm để giữ quyền phát nhạc. Hãy thử lại.');
        return;
      }
      setFence(result.playback.fence);
      setReconnecting(false);
      setFailure('');
    } catch {
      // The command reports permission/busy/network errors through its existing toast.
    } finally {
      claimPending.current = false;
      if (mounted.current) setClaiming(false);
    }
  }, [controller]);
  useEffect(() => {
    // Set only by the explicit listener recovery button; never claim on a normal page load.
    if (!claimOnMount || initialClaimStarted.current) return;
    initialClaimStarted.current = true;
    onClaimRequestHandled?.();
    void claim();
  }, [claimOnMount, claim, onClaimRequestHandled]);
  const active = snapshot.queue.find((e) => e.id === snapshot.playback.entry_id);
  const videoId = active?.youtube_video_id;
  useEffect(() => {
    onOwnershipChange?.(fence === null ? null : { controller, fence });
    return () => onOwnershipChange?.(null);
  }, [controller, fence, onOwnershipChange]);
  const hasQueued = snapshot.queue.some((entry) => entry.status === 'QUEUED');
  async function command(
    action: 'next' | 'play' | 'pause' | 'ended' | 'failed' | 'report' | 'seek',
    state?: 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'NEEDS_USER_GESTURE' | 'ERROR' | 'LOADING',
    expectedRun?: string | null,
    position?: number,
    quiet = false,
  ) {
    const current = latest.current;
    if (
      current.fence === null ||
      (expectedRun !== undefined && expectedRun !== current.snapshot.playback.run_id)
    )
      return false;
    if (Date.now() > leaseDeadline.current) {
      loseLease('Quyền phát nhạc đã hết hạn. Hãy nhận lại quyền host.');
      return false;
    }
    const changesTrack = action === 'next' || action === 'ended' || action === 'failed';
    if (changesTrack && advancing.current) return false;
    if (changesTrack) advancing.current = true;
    try {
      const result = await current.execute(
        {
          action,
          controller_id: controller,
          fence: current.fence,
          run_id: current.snapshot.playback.run_id,
          state,
          position: position ?? currentPosition(),
        },
        { feedback: !quiet },
      );
      return result;
    } catch (error) {
      if (
        latest.current.fence === current.fence &&
        error instanceof AppError &&
        ['UNAUTHORIZED', 'PERMISSION_DENIED', 'BANNED', 'STALE_HOST', 'ROOM_NOT_FOUND'].includes(
          error.code,
        )
      )
        loseLease(error.message);
      if (
        (action === 'ended' || action === 'failed') &&
        latest.current.snapshot.playback.run_id === current.snapshot.playback.run_id
      )
        player.current?.pauseVideo();
      return false;
    } finally {
      if (changesTrack) advancing.current = false;
    }
  }
  const commandRef = useRef(command);
  useEffect(() => {
    commandRef.current = command;
  });
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        latest.current.fence === null ||
        event.defaultPrevented ||
        document.querySelector('.game-screen') ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        document.querySelector('[role="dialog"]')
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('input,textarea,select,button,a,[role="button"],[contenteditable="true"]')
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (recovery.current?.runId === latest.current.snapshot.playback.run_id) return;
        const { snapshot } = latest.current;
        if (!snapshot.playback.entry_id && !snapshot.queue.some((e) => e.status === 'QUEUED'))
          return;
        const playing = snapshot.playback.intent === 'PLAYING';
        if (playing) player.current?.pauseVideo();
        else if (loadedRun.current) player.current?.playVideo();
        void commandRef.current(playing ? 'pause' : 'play');
      }
      if (event.shiftKey && event.code === 'ArrowRight') {
        event.preventDefault();
        void commandRef.current('next');
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);
  const runId = snapshot.playback.run_id;
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);
  useEffect(() => {
    if (!runId && fence !== null) {
      recovery.current = null;
      recoveryReport.current = null;
      setFailure('');
      setAutoSkipping(false);
    }
    if (fence === null || !container.current || !runId || !videoId) return;
    const currentGeneration = ++generation.current;
    let cancelled = false;
    const resumePosition =
      recovery.current?.runId === runId
        ? recovery.current.position
        : latest.current.snapshot.playback.position;
    recovery.current = null;
    healthyPlayback.current = null;
    setAutoSkipping(false);
    setBlocked(false);
    setFailure('');
    setRecoveryActionError('');
    setTime(resumePosition);
    // A player instance belongs to one playback run. Events queued by a destroyed
    // iframe must never be attributed to the next video or a new host lease.
    const isCurrent = () =>
      !cancelled &&
      latest.current.fence === fence &&
      latest.current.snapshot.playback.run_id === runId;
    const fail = (message: string, skipVideo = false) => {
      if (!isCurrent() || recovery.current) return;
      const position = currentPosition();
      recovery.current = { runId, position };
      healthyPlayback.current = null;
      clearTimeout(readyTimer);
      setFailure(message);
      setBlocked(false);
      // Fence late events before pausing or advancing. Device/page failures are
      // not evidence that every remaining song is broken.
      if (loadedRun.current === runId) player.current?.pauseVideo();
      if (skipVideo) failureStreak.current++;
      if (skipVideo && failureStreak.current < 3) {
        setAutoSkipping(true);
        const failedGeneration = generation.current;
        const title =
          latest.current.snapshot.queue.find(
            (entry) => entry.id === latest.current.snapshot.playback.entry_id,
          )?.song.title ?? 'Video';
        recoveryReport.current = (async () => {
          // An unplayable track is skipped even when normal end-of-song auto
          // advance is disabled. The existing atomic next command fences runs.
          const result = await commandRef.current('next', undefined, runId, position, true);
          if (!mounted.current || latest.current.fence !== fence) return result;
          if (result) {
            toast.warning(`Đã bỏ qua “${title}” vì lỗi phát nhạc.`, {
              description: result.playback.entry_id
                ? 'Đang chuyển sang bài tiếp theo.'
                : 'Hàng chờ đã hết. Thêm bài để nghe tiếp.',
            });
          } else if (generation.current === failedGeneration) {
            setAutoSkipping(false);
            setRecoveryActionError(
              'Chưa thể chuyển bài. Hãy kiểm tra kết nối rồi nhấn Bỏ qua bài này.',
            );
            await commandRef.current('report', 'ERROR', runId, position);
          }
          return result;
        })();
      } else {
        if (skipVideo)
          setRecoveryActionError(
            '3 bài liên tiếp không phát được. Đã dừng chuyển bài tự động để giữ hàng chờ; hãy kiểm tra mạng hoặc thử lại.',
          );
        recoveryReport.current = commandRef.current('report', 'ERROR', runId, position);
      }
    };
    const readyTimer = setTimeout(
      () => fail('YouTube tải quá lâu. Hãy thử lại hoặc mở bài trực tiếp trên YouTube.'),
      20000,
    );
    const mount = document.createElement('div');
    container.current.appendChild(mount);
    void loadYouTube()
      .then(() => {
        if (!isCurrent() || recovery.current) return;
        player.current = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: {
            origin: location.origin,
            playsinline: 1,
            controls: 1,
            autoplay: 0,
            start: Math.max(0, Math.floor(resumePosition)),
          },
          events: {
            onReady: () => {
              if (isCurrent() && !recovery.current) {
                clearTimeout(readyTimer);
                loadedRun.current = runId;
                lastReport.current = '';
                setReady(true);
                player.current?.setVolume(volumeRef.current);
              }
            },
            onStateChange: (event) => {
              if (!isCurrent()) return;
              if (recovery.current) {
                if (event.data === YT.PlayerState.PLAYING) player.current?.pauseVideo();
                return;
              }
              const state = event.data,
                current = latest.current;
              if (Date.now() > leaseDeadline.current) {
                player.current?.pauseVideo();
                return;
              }
              if (loadedRun.current !== current.snapshot.playback.run_id) return;
              if (state === YT.PlayerState.ENDED) {
                void commandRef.current('ended', undefined, runId);
                return;
              }
              const name =
                state === YT.PlayerState.PLAYING
                  ? 'PLAYING'
                  : state === YT.PlayerState.PAUSED
                    ? 'PAUSED'
                    : state === YT.PlayerState.BUFFERING
                      ? 'BUFFERING'
                      : null;
              if (name && lastReport.current !== name) {
                lastReport.current = name;
                healthyPlayback.current =
                  name === 'PLAYING' ? { since: Date.now(), position: currentPosition() } : null;
                void commandRef.current('report', name, runId);
                if (name === 'PLAYING') setBlocked(false);
              }
            },
            onError: (event) => {
              if (!isCurrent()) return;
              const title = latest.current.snapshot.queue.find(
                (entry) => entry.id === latest.current.snapshot.playback.entry_id,
              )?.song.title;
              fail(
                playbackError(event.data, title ?? 'Video'),
                [2, 5, 100, 101, 150].includes(event.data),
              );
            },
            onAutoplayBlocked: () => {
              if (isCurrent() && !recovery.current) {
                clearTimeout(readyTimer);
                setBlocked(true);
                void commandRef.current('report', 'NEEDS_USER_GESTURE', runId);
              }
            },
          },
        });
      })
      .catch((e) => {
        fail((e as Error).message);
      });
    return () => {
      cancelled = true;
      generation.current = currentGeneration + 1;
      clearTimeout(readyTimer);
      player.current?.destroy();
      player.current = null;
      setReady(false);
      loadedRun.current = null;
      mount.remove();
    };
  }, [controller, fence, runId, videoId, attempt, currentPosition]);
  useEffect(() => {
    if (!ready || !player.current || !runId || loadedRun.current !== runId || recovery.current)
      return;
    if (snapshot.playback.intent === 'PAUSED') player.current.pauseVideo();
    else if (!blocked) player.current.playVideo();
  }, [ready, runId, snapshot.playback.intent, blocked]);
  useEffect(() => {
    if (fence === null) return;
    let cancelled = false;
    let running = false;
    let nextHeartbeat = Date.now() + 10000;
    const timer = setInterval(() => {
      setTime(currentPosition());
      const healthy = healthyPlayback.current;
      if (
        healthy &&
        Date.now() - healthy.since >= 5000 &&
        currentPosition() - healthy.position >= 4
      )
        failureStreak.current = 0;
      if (latest.current.fence !== fence) return;
      if (Date.now() >= leaseDeadline.current) {
        loseLease(
          'Chưa thể kết nối lại. Nhạc đã tạm dừng; hãy nhận lại quyền phát nhạc khi mạng ổn định.',
        );
        return;
      }
      if (running || Date.now() < nextHeartbeat) return;
      running = true;
      const startedAt = Date.now();
      void latest.current
        .execute({
          action: 'heartbeat',
          controller_id: controller,
          fence,
          run_id: latest.current.snapshot.playback.run_id,
          position: currentPosition(),
        })
        .then((result) => {
          if (cancelled || latest.current.fence !== fence) return;
          if (
            Date.now() >= leaseDeadline.current ||
            result.playback.fence !== fence ||
            result.playback.controller_id !== controller
          ) {
            loseLease('Quyền phát nhạc đã hết hạn. Hãy nhận lại quyền host.');
            return;
          }
          // Only a matching server acknowledgement renews the local watchdog.
          leaseDeadline.current = startedAt + 25000;
          nextHeartbeat = startedAt + 10000;
          setReconnecting(false);
        })
        .catch((error: unknown) => {
          if (!cancelled && latest.current.fence === fence) {
            if (isConnectionError(error) && Date.now() < leaseDeadline.current) {
              setReconnecting(true);
              nextHeartbeat = Date.now() + 2000;
            } else loseLease('Mất quyền host hoặc không thể khôi phục kết nối. Hãy kết nối lại.');
          }
        })
        .finally(() => {
          running = false;
        });
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fence, controller, loseLease, currentPosition]);
  useEffect(() => {
    if (
      fence !== null &&
      (snapshot.playback.controller_id !== controller || snapshot.playback.fence !== fence)
    ) {
      loseLease('Quyền phát nhạc đã chuyển sang thiết bị khác.');
    }
  }, [snapshot.playback.controller_id, snapshot.playback.fence, controller, fence, loseLease]);
  return (
    <section className="host-player panel">
      <div className="panel-title">
        <h2>
          <MonitorSpeaker size={20} /> Máy phát của phòng
        </h2>
        <span className="badge">
          {fence !== null ? 'Đang giữ quyền host' : 'Chưa nhận quyền host'}
        </span>
        {fence !== null && (
          <AsyncButton
            loadingLabel="Đang dừng…"
            onClick={async () => {
              player.current?.pauseVideo();
              try {
                await execute({ action: 'release', controller_id: controller, fence });
              } catch {
                /* mutation displays the error; the local device still stops */
              } finally {
                setFence(null);
                setAutoSkipping(false);
              }
            }}
          >
            Dừng máy phát
          </AsyncButton>
        )}
      </div>
      {fence === null ? (
        <div className="host-welcome">
          <MonitorSpeaker size={42} />
          <h3>
            {active ? 'Nhận host để tiếp tục bài đang nghe' : 'Kết nối loa. Sẵn sàng hòa nhịp.'}
          </h3>
          <p>
            {snapshot.settings.playback_mode === 'ALL_DEVICES'
              ? 'Giữ trang này mở để điều khiển bài chung. Mỗi thành viên có thể bật nghe trên thiết bị của mình.'
              : 'Giữ trang này mở trên máy tính nối loa để phát nhạc cho cả phòng.'}
          </p>
          <AsyncButton
            loadingLabel="Đang kết nối…"
            variant="primary"
            loading={claiming}
            onClick={claim}
          >
            <Play size={17} /> Nhận quyền phát nhạc
          </AsyncButton>
        </div>
      ) : (
        <>
          <div className="youtube-container" ref={container}>
            {!active && (
              <div className="host-welcome">
                <MonitorSpeaker size={42} />
                <p>Chưa có bài đang phát. Thêm bài vào hàng chờ rồi nhấn Phát.</p>
              </div>
            )}
          </div>
          {blocked && (
            <div className="notice">
              <p>Trình duyệt đang chờ bạn cho phép phát nhạc.</p>
              <AsyncButton
                loadingLabel="Đang phát…"
                variant="primary"
                onClick={() => {
                  player.current?.playVideo();
                  setBlocked(false);
                  return command('play');
                }}
              >
                Tiếp tục phát nhạc
              </AsyncButton>
            </div>
          )}
          <div className="player-controls">
            <AsyncButton
              size="icon"
              aria-label="Phát"
              disabled={active ? !ready || !!failure : !hasQueued}
              onClick={() => {
                if (ready && loadedRun.current) player.current?.playVideo();
                return command('play');
              }}
            >
              <Play size={19} />
            </AsyncButton>
            <AsyncButton
              size="icon"
              aria-label="Tạm dừng"
              disabled={!active || !ready || !!failure}
              onClick={() => {
                player.current?.pauseVideo();
                return command('pause');
              }}
            >
              <Pause size={19} />
            </AsyncButton>
            <AsyncButton
              size="icon"
              aria-label="Bài tiếp theo"
              disabled={autoSkipping || (!active && !hasQueued)}
              onClick={() => command('next')}
            >
              <SkipForward size={19} />
            </AsyncButton>
            <span>
              {formatTime(time)} / {formatTime(active?.song.duration ?? 0)}
            </span>
            <Volume2 size={18} />
            <input
              aria-label="Âm lượng"
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                player.current?.setVolume(Number(e.target.value));
              }}
            />
          </div>
          {active &&
            !failure &&
            !blocked &&
            (!ready ||
              snapshot.playback.state === 'BUFFERING' ||
              snapshot.playback.state === 'LOADING') && <Loading>Đang tải nhạc…</Loading>}
          {active && (
            <input
              type="range"
              aria-label="Vị trí phát"
              disabled={!ready || !!failure}
              min="0"
              max={active.song.duration}
              value={Math.min(time, active.song.duration)}
              onChange={(e) => {
                const value = Number(e.target.value);
                player.current?.seekTo(value, true);
                setTime(value);
              }}
              onPointerUp={() => void command('seek', undefined, runId, time)}
              onKeyUp={() => void command('seek', undefined, runId, time)}
            />
          )}
          <p className="muted">
            Player: {!active ? 'Chờ bài hát' : ready ? snapshot.playback.state : 'Đang tải'} ·
            Space: phát/dừng · Shift + →: bài tiếp theo · Quyền host tự hết hạn khi mất kết nối
          </p>
        </>
      )}
      {reconnecting && (
        <p className="notice" role="status">
          Đang khôi phục kết nối máy phát…
        </p>
      )}
      {autoSkipping && <Loading>Đang bỏ qua bài lỗi…</Loading>}
      {failure && !autoSkipping && fence !== null && active && runId ? (
        <PlaybackRecovery
          message={recoveryActionError ? `${failure} ${recoveryActionError}` : failure}
          videoId={active.youtube_video_id}
          title={active.song.title}
          position={recovery.current?.position ?? time}
          onRetry={async () => {
            const startedGeneration = generation.current;
            setRecoveryActionError('');
            // Keep ERROR -> LOADING ordered even when the original report is slow.
            await recoveryReport.current;
            if (generation.current !== startedGeneration) return;
            const ok = await command('report', 'LOADING', runId);
            if (generation.current !== startedGeneration) return;
            if (
              ok &&
              latest.current.fence === fence &&
              latest.current.snapshot.playback.run_id === runId &&
              Date.now() < leaseDeadline.current
            ) {
              failureStreak.current = 0;
              setAttempt((value) => value + 1);
            } else if (
              latest.current.fence === fence &&
              latest.current.snapshot.playback.run_id === runId
            )
              setRecoveryActionError(
                'Chưa thể kết nối với phòng để thử lại. Hãy kiểm tra mạng rồi nhấn lại.',
              );
          }}
          onSkip={async () => {
            const result = await command('next', undefined, runId);
            if (result) failureStreak.current = 0;
          }}
        />
      ) : failure && !autoSkipping ? (
        <p className="form-error" role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  );
}
