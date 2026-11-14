// @vitest-environment jsdom
import { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HostPlayer from '../../src/client/components/HostPlayer';
import { defaultSettings, type RoomCommand, type Snapshot } from '../../src/shared/contracts';
import { AppError } from '../../src/shared/domain';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn() },
  useSonner: () => ({ toasts: [] }),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup({
  idle = false,
  paused = false,
  heartbeat,
  beforeCommand,
  queued = 0,
  autoAdvance = true,
  autoClaim = false,
  manualClaim = true,
  strict = false,
  claimResult,
}: {
  idle?: boolean;
  paused?: boolean;
  heartbeat?: () => Promise<void>;
  beforeCommand?: (command: RoomCommand) => Promise<void>;
  queued?: number;
  autoAdvance?: boolean;
  autoClaim?: boolean;
  manualClaim?: boolean;
  strict?: boolean;
  claimResult?: Partial<Snapshot['playback']>;
} = {}) {
  const players: FixturePlayer[] = [];
  class FixturePlayer {
    playVideo = vi.fn();
    pauseVideo = vi.fn();
    setVolume = vi.fn();
    destroy = vi.fn();
    getCurrentTime = vi.fn(() => 12);
    constructor(
      _node: HTMLElement,
      readonly options: YT.PlayerOptions,
    ) {
      players.push(this);
    }
    ready() {
      this.options.events?.onReady?.({ target: this as unknown as YT.Player });
    }
    error(code: number) {
      this.options.events?.onError?.({ target: this as unknown as YT.Player, data: code });
    }
    blocked() {
      this.options.events?.onAutoplayBlocked?.({ target: this as unknown as YT.Player });
    }
  }
  vi.stubGlobal('YT', {
    Player: FixturePlayer,
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 },
  });
  const entry: Snapshot['queue'][number] = {
    id: 'entry',
    room_id: 'room',
    youtube_video_id: 'sIKGC2VX63I',
    requested_by: 'owner',
    requested_at: '',
    status: 'QUEUED',
    position: 1,
    vote_count: 0,
    voted: false,
    requester: 'Owner',
    song: {
      youtube_video_id: 'sIKGC2VX63I',
      title: 'Bài kiểm thử',
      channel: 'Fixture',
      thumbnail: '',
      duration: 180,
      verified_at: '',
    },
  };
  const initial: Snapshot = {
    room: {
      id: 'room',
      code: 'ROOM01',
      name: 'Room',
      description: '',
      owner_id: 'owner',
      version: 1,
      created_at: '',
    },
    settings: { ...defaultSettings, auto_advance: autoAdvance },
    members: [],
    me: 'owner',
    role: 'owner',
    version: 1,
    queue: idle
      ? []
      : [
          entry,
          ...Array.from({ length: queued }, (_, index) => ({
            ...entry,
            id: `entry-${index}`,
            position: index + 2,
          })),
        ],
    playback: {
      controller_id: null,
      fence: 0,
      run_id: idle ? null : 'run',
      entry_id: idle ? null : entry.id,
      lease_until: null,
      state: idle ? 'IDLE' : paused ? 'PAUSED' : 'PLAYING',
      intent: idle || paused ? 'PAUSED' : 'PLAYING',
      position: idle ? 0 : 12.5,
      updated_at: '',
    },
  };
  const commands: RoomCommand[] = [];
  const handled = vi.fn();
  function Harness() {
    const [snapshot, setSnapshot] = useState(initial);
    const [requested, setRequested] = useState(autoClaim);
    async function execute(command: RoomCommand) {
      commands.push(command);
      if (beforeCommand) await beforeCommand(command);
      if (command.action === 'heartbeat') await heartbeat?.();
      let playback = snapshot.playback;
      let queue = snapshot.queue;
      if (command.action === 'claim')
        playback = { ...playback, controller_id: command.controller_id, fence: 1, ...claimResult };
      if (command.action === 'play')
        playback = { ...playback, run_id: 'run', entry_id: entry.id, intent: 'PLAYING' };
      if (command.action === 'report')
        playback = { ...playback, state: command.state ?? playback.state };
      if (command.action === 'failed' || command.action === 'next') {
        queue = queue.filter((item) => item.id !== playback.entry_id);
        const next = queue[0];
        playback = {
          ...playback,
          run_id: next ? `${next.id}-run` : null,
          entry_id: next?.id ?? null,
          state: next ? 'LOADING' : 'IDLE',
          intent: next ? 'PLAYING' : 'PAUSED',
          position: 0,
        };
      }
      setSnapshot((current) => ({
        ...current,
        playback,
        queue,
      }));
      return { playback, version: 1 };
    }
    return (
      <>
        <button onClick={() => setSnapshot((current) => ({ ...current, queue: [entry] }))}>
          Enqueue
        </button>
        <button
          onClick={() =>
            setSnapshot((current) => ({
              ...current,
              queue: [...current.queue],
              playback: { ...current.playback, position: 24 },
            }))
          }
        >
          Refresh snapshot
        </button>
        <HostPlayer
          snapshot={snapshot}
          execute={execute}
          claimOnMount={requested}
          onClaimRequestHandled={() => {
            handled();
            setRequested(false);
          }}
        />
      </>
    );
  }
  const view = render(
    strict ? (
      <StrictMode>
        <Harness />
      </StrictMode>
    ) : (
      <Harness />
    ),
  );
  if (!autoClaim && manualClaim)
    fireEvent.click(screen.getByRole('button', { name: /Nhận quyền phát nhạc/ }));
  return { players, commands, handled, ...view };
}

describe('host playback recovery', () => {
  it('does not claim host on an ordinary mount or snapshot refresh', () => {
    const { commands, players, handled } = setup({ manualClaim: false, strict: true });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh snapshot' }));
    expect(commands).toHaveLength(0);
    expect(players).toHaveLength(0);
    expect(handled).not.toHaveBeenCalled();
  });
  it('consumes the explicit request once in StrictMode and blocks duplicate pending claims', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { commands, players, handled } = setup({
      autoClaim: true,
      strict: true,
      beforeCommand: (command) => (command.action === 'claim' ? pending : Promise.resolve()),
    });
    const button = screen.getByRole('button', { name: /Đang kết nối/ });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(commands).toHaveLength(1);
    expect(handled).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(players).toHaveLength(1);
    expect(screen.getByText('Đang giữ quyền host')).toBeTruthy();
  });
  it('leaves a busy claim retryable without automatic takeover or playback', async () => {
    let busy = true;
    const { commands, players } = setup({
      autoClaim: true,
      beforeCommand: async (command) => {
        if (command.action === 'claim' && busy) throw new AppError('HOST_BUSY', 409);
      },
    });
    const retry = await screen.findByRole('button', { name: /Nhận quyền phát nhạc/ });
    expect(players).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh snapshot' }));
    expect(commands).toHaveLength(1);
    busy = false;
    fireEvent.click(retry);
    await waitFor(() => expect(players).toHaveLength(1));
    expect(commands.filter((command) => command.action === 'claim')).toHaveLength(2);
  });
  it('does not start playback from a claim acknowledgement after its watchdog deadline', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { players } = setup({ autoClaim: true, beforeCommand: () => pending });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(26000);
      finish();
    });
    expect(players).toHaveLength(0);
    expect(screen.getByText('Chưa nhận quyền host')).toBeTruthy();
    expect(screen.getByText('Kết nối quá chậm để giữ quyền phát nhạc. Hãy thử lại.')).toBeTruthy();
  });
  it('ignores a claim acknowledgement after leaving the player', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { players, unmount } = setup({ autoClaim: true, beforeCommand: () => pending });
    unmount();
    await act(async () => finish());
    expect(players).toHaveLength(0);
  });
  it('rejects an acknowledgement for another controller', async () => {
    const { players } = setup({ autoClaim: true, claimResult: { controller_id: 'another-host' } });
    await screen.findByText('Chưa xác nhận được quyền host. Hãy thử lại.');
    expect(players).toHaveLength(0);
    expect(screen.getByText('Chưa nhận quyền host')).toBeTruthy();
  });
  it('claims once after an explicit listener recovery request and resumes the saved song', async () => {
    const { players, commands } = setup({ autoClaim: true });
    await waitFor(() => expect(players).toHaveLength(1));
    act(() => players[0].ready());
    expect(players[0].options.playerVars?.start).toBe(12);
    expect(players[0].playVideo).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh snapshot' }));
    expect(commands.filter((command) => command.action === 'claim')).toHaveLength(1);
    expect(players).toHaveLength(1);
  });
  it.each([2, 5, 100, 101, 150])(
    'skips video error %s exactly once, even with normal auto advance disabled',
    async (code) => {
      const { players, commands } = setup({ queued: 1, autoAdvance: false });
      await waitFor(() => expect(players).toHaveLength(1));
      await act(async () => players[0].ready());
      await act(async () => {
        players[0].error(code);
        players[0].error(code);
        players[0].options.events?.onStateChange?.({
          target: players[0] as unknown as YT.Player,
          data: 0,
        });
      });
      await waitFor(() => expect(players).toHaveLength(2));
      expect(players[0].destroy).toHaveBeenCalledTimes(1);
      expect(commands.filter((c) => c.action === 'next')).toHaveLength(1);
      expect(commands.find((c) => c.action === 'next')).toMatchObject({ run_id: 'run', fence: 1 });
      expect(toast.warning).toHaveBeenCalledTimes(1);
      await act(async () => players[1].ready());
      expect(players[1].playVideo).toHaveBeenCalled();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('stops at the third consecutive failure and permits deliberate recovery', async () => {
    const { players, commands } = setup({ queued: 4 });
    await waitFor(() => expect(players).toHaveLength(1));
    for (let index = 0; index < 3; index++) {
      await act(async () => {
        players[index].ready();
        players[index].error(150);
      });
    }
    expect(players).toHaveLength(3);
    expect(commands.filter((c) => c.action === 'next')).toHaveLength(2);
    expect(screen.getByRole('alert').textContent).toContain('3 bài liên tiếp không phát được');
    expect(commands.at(-1)).toMatchObject({
      action: 'report',
      state: 'ERROR',
      run_id: 'entry-1-run',
    });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Thử lại trong phòng' })),
    );
    expect(players).toHaveLength(4);
    await act(async () => {
      players[3].ready();
      players[3].error(150);
    });
    expect(players).toHaveLength(5);
    expect(commands.filter((c) => c.action === 'next')).toHaveLength(3);
  });

  it('resets the consecutive-error limit only after sustained playback progress', async () => {
    vi.useFakeTimers();
    const { players, commands } = setup({ queued: 5 });
    await act(async () => {});
    await act(async () => {
      players[0].ready();
      players[0].error(150);
    });
    await act(async () => {
      players[1].ready();
      players[1].error(100);
    });
    await act(async () => players[2].ready());
    act(() =>
      players[2].options.events?.onStateChange?.({
        target: players[2] as unknown as YT.Player,
        data: 1,
      }),
    );
    players[2].getCurrentTime.mockReturnValue(18);
    await act(() => vi.advanceTimersByTimeAsync(6000));
    await act(async () => players[2].error(5));
    expect(players).toHaveLength(4);
    expect(commands.filter((c) => c.action === 'next')).toHaveLength(3);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows loading while an automatic skip is pending and ignores duplicate/keyboard advances', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { players, commands } = setup({
      queued: 1,
      beforeCommand: async (command) => {
        if (command.action === 'next') await gate;
      },
    });
    await waitFor(() => expect(players).toHaveLength(1));
    await act(async () => players[0].ready());
    act(() => {
      players[0].error(100);
      players[0].error(100);
    });
    expect(screen.getByText('Đang bỏ qua bài lỗi…')).toBeTruthy();
    expect(toast.warning).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { code: 'ArrowRight', shiftKey: true });
    expect(commands.filter((c) => c.action === 'next')).toHaveLength(1);
    await act(async () => finish());
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(players).toHaveLength(2);
  });

  it('ends cleanly after the last bad song without claiming that a next song is playing', async () => {
    const { players } = setup();
    await waitFor(() => expect(players).toHaveLength(1));
    await act(async () => players[0].ready());
    await act(async () => players[0].error(150));
    expect(screen.getByText(/Player: Chờ bài hát/)).toBeTruthy();
    expect(screen.queryByText('Đang bỏ qua bài lỗi…')).toBeNull();
    expect(toast.warning).toHaveBeenCalledWith(expect.any(String), {
      description: 'Hàng chờ đã hết. Thêm bài để nghe tiếp.',
    });
  });
  async function timedHost(heartbeat: () => Promise<void>) {
    vi.useFakeTimers();
    const fixture = setup({ heartbeat });
    await act(async () => {});
    await act(async () => fixture.players[0].ready());
    return fixture;
  }
  it('keeps the same playing iframe through a transient heartbeat failure and recovery', async () => {
    const heartbeat = vi
      .fn()
      .mockRejectedValueOnce(new AppError('BACKEND_UNAVAILABLE', 503))
      .mockResolvedValue(undefined);
    const { players } = await timedHost(heartbeat);
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(screen.getByText('Đang khôi phục kết nối máy phát…')).toBeTruthy();
    expect(players[0].pauseVideo).not.toHaveBeenCalled();
    expect(players[0].destroy).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(16000));
    expect(screen.queryByText('Đang khôi phục kết nối máy phát…')).toBeNull();
    expect(players).toHaveLength(1);
    expect(players[0].playVideo).toHaveBeenCalledTimes(1);
    expect(players[0].pauseVideo).not.toHaveBeenCalled();
    expect(heartbeat).toHaveBeenCalledTimes(3);
  });
  it('stops at the last acknowledged deadline during a sustained outage', async () => {
    const { players } = await timedHost(vi.fn().mockRejectedValue(new AppError('OFFLINE')));
    await act(() => vi.advanceTimersByTimeAsync(24999));
    expect(players[0].pauseVideo).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(players[0].pauseVideo).toHaveBeenCalled();
    expect(players[0].destroy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Chưa nhận quyền host')).toBeTruthy();
  });
  it.each(['UNAUTHORIZED', 'PERMISSION_DENIED', 'STALE_HOST'])(
    'stops immediately on authoritative %s',
    async (code) => {
      const { players } = await timedHost(vi.fn().mockRejectedValue(new AppError(code, 401)));
      await act(() => vi.advanceTimersByTimeAsync(10000));
      expect(players[0].pauseVideo).toHaveBeenCalled();
      expect(players[0].destroy).toHaveBeenCalledTimes(1);
    },
  );
  it('never overlaps heartbeats or revives an expired lease from a late response', async () => {
    let resolve!: () => void;
    const heartbeat = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { players } = await timedHost(heartbeat);
    await act(() => vi.advanceTimersByTimeAsync(26000));
    expect(heartbeat).toHaveBeenCalledTimes(1);
    expect(players[0].destroy).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(screen.getByText('Chưa nhận quyền host')).toBeTruthy();
    expect(players).toHaveLength(1);
  });
  it('never creates an empty iframe and waits for readiness before playing the selected video', async () => {
    const { players, commands } = setup({ idle: true });
    await screen.findByText('Đang giữ quyền host');
    expect(players).toHaveLength(0);
    expect((screen.getByRole('button', { name: 'Phát' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document.body, { code: 'Space' });
    expect(commands.map((c) => c.action)).toEqual(['claim']);
    fireEvent.click(screen.getByRole('button', { name: 'Enqueue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Phát' }));
    await waitFor(() => expect(players).toHaveLength(1));
    expect(players[0].options.videoId).toBe('sIKGC2VX63I');
    expect(players[0].playVideo).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Phát' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => players[0].ready());
    expect(players[0].playVideo).toHaveBeenCalledTimes(1);
  });

  it('restores a paused video without autoplay and does not replay on snapshot/position refresh', async () => {
    const { players } = setup({ paused: true });
    await waitFor(() => expect(players).toHaveLength(1));
    expect(players[0].options.playerVars?.start).toBe(12);
    await act(async () => players[0].ready());
    expect(players[0].playVideo).not.toHaveBeenCalled();
    expect(players[0].pauseVideo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Phát' }));
    await waitFor(() => expect(players[0].playVideo).toHaveBeenCalled());
    const calls = players[0].playVideo.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh snapshot' }));
    expect(players).toHaveLength(1);
    expect(players[0].playVideo).toHaveBeenCalledTimes(calls);
  });

  it.each([153, 999])(
    'keeps the same song on error %s and exposes its exact external URL',
    async (code) => {
      const { players, commands } = setup();
      await waitFor(() => expect(players).toHaveLength(1));
      await act(async () => players[0].ready());
      await act(async () => players[0].error(code));
      expect(screen.getByRole('alert').textContent).toContain(`Mã ${code}`);
      expect(players[0].destroy).not.toHaveBeenCalled();
      expect(players).toHaveLength(1);
      await act(async () => {
        players[0].error(2);
        players[0].options.events?.onStateChange?.({
          target: players[0] as unknown as YT.Player,
          data: 0,
        });
      });
      expect(screen.getByRole('alert').textContent).toContain(`Mã ${code}`);
      expect(commands.filter((c) => c.action === 'report' && c.state === 'ERROR')).toHaveLength(1);
      expect(commands.some((c) => ['failed', 'next', 'ended'].includes(c.action))).toBe(false);
      const link = screen.getByRole('link', { name: 'Mở trên YouTube' });
      expect(link.getAttribute('href')).toBe('https://www.youtube.com/watch?v=sIKGC2VX63I&t=12s');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(
        screen.getByRole('link', { name: 'Tìm bản khác trên YouTube' }).getAttribute('href'),
      ).toContain(encodeURIComponent('Bài'));
      expect((screen.getByRole('button', { name: 'Phát' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      fireEvent.keyDown(document.body, { code: 'Space' });
      expect(commands.some((c) => c.action === 'play')).toBe(false);
    },
  );

  it('retries the same run at its saved position/volume and ignores callbacks from the old attempt', async () => {
    const { players, commands } = setup();
    await waitFor(() => expect(players).toHaveLength(1));
    await act(async () => players[0].ready());
    fireEvent.change(screen.getByRole('slider', { name: 'Âm lượng' }), { target: { value: '35' } });
    await act(async () => players[0].error(153));
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại trong phòng' }));
    await waitFor(() => expect(players).toHaveLength(2));
    expect(players[0].destroy).toHaveBeenCalledTimes(1);
    expect(players[1].options.videoId).toBe('sIKGC2VX63I');
    expect(players[1].options.playerVars?.start).toBe(12);
    expect(screen.getByText('Đang tải nhạc…')).toBeTruthy();
    await act(async () => {
      players[0].error(150);
      players[0].blocked();
      players[0].ready();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tiếp tục phát nhạc' })).toBeNull();
    await act(async () => players[1].ready());
    expect(players[1].setVolume).toHaveBeenLastCalledWith(35);
    expect(players[1].playVideo).toHaveBeenCalledTimes(1);
    expect(commands.flatMap((c) => (c.action === 'report' ? [c.state] : []))).toEqual([
      'ERROR',
      'LOADING',
    ]);
  });

  it('keeps recovery visible after a rejected skip and advances only after an acknowledged explicit skip', async () => {
    let attempts = 0;
    const { players, commands } = setup({
      beforeCommand: async (command) => {
        if (command.action === 'next' && ++attempts === 1) throw new AppError('OFFLINE');
      },
    });
    await waitFor(() => expect(players).toHaveLength(1));
    await act(async () => players[0].ready());
    await act(async () => players[0].error(150));
    expect(screen.getByRole('link', { name: 'Mở trên YouTube' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Chưa thể chuyển bài');
    expect(toast.warning).not.toHaveBeenCalled();
    expect(players[0].destroy).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua bài này' })));
    expect(players[0].destroy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: 'Mở trên YouTube' })).toBeNull();
    expect(commands.filter((c) => c.action === 'next')).toHaveLength(2);
  });

  it('keeps recovery on rejected retry and does not recreate an iframe without acknowledgement', async () => {
    const { players } = setup({
      beforeCommand: async (command) => {
        if (command.action === 'report' && command.state === 'LOADING')
          throw new AppError('OFFLINE');
      },
    });
    await waitFor(() => expect(players).toHaveLength(1));
    await act(async () => players[0].ready());
    await act(async () => players[0].error(153));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Thử lại trong phòng' })),
    );
    expect(players).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toContain(
      'Chưa thể kết nối với phòng để thử lại',
    );
  });

  it('does not send a queued retry after leaving while the error report is still pending', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { players, commands, unmount } = setup({
      beforeCommand: async (command) => {
        if (command.action === 'report' && command.state === 'ERROR') await gate;
      },
    });
    await waitFor(() => expect(players).toHaveLength(1));
    await act(async () => players[0].ready());
    act(() => players[0].error(153));
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại trong phòng' }));
    expect(screen.getByRole('button', { name: 'Đang thử lại…' }).getAttribute('aria-busy')).toBe(
      'true',
    );
    unmount();
    await act(async () => finish());
    expect(commands.some((c) => c.action === 'report' && c.state === 'LOADING')).toBe(false);
    expect(players).toHaveLength(1);
  });

  it('offers recovery for an iframe that never becomes ready and cancels its timeout on leave', async () => {
    vi.useFakeTimers();
    const { players, commands, unmount } = setup();
    await act(async () => {});
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(screen.getByRole('alert').textContent).toContain('YouTube tải quá lâu');
    expect(commands.some((c) => c.action === 'failed')).toBe(false);
    await act(async () => players[0].ready());
    expect(players[0].playVideo).not.toHaveBeenCalled();
    unmount();
    const before = commands.length;
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(commands).toHaveLength(before);
  });

  it('requests a gesture for blocked autoplay without failing or skipping the song', async () => {
    const { players, commands } = setup();
    await waitFor(() => expect(players).toHaveLength(1));
    await act(async () => players[0].ready());
    await act(async () => players[0].blocked());
    expect(commands.at(-1)).toMatchObject({ action: 'report', state: 'NEEDS_USER_GESTURE' });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục phát nhạc' }));
    await waitFor(() => expect(commands.at(-1)).toMatchObject({ action: 'play' }));
    expect(commands.some((c) => ['failed', 'next', 'ended'].includes(c.action))).toBe(false);
  });
});
