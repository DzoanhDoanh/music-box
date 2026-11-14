// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ListenerPlayer from '../../src/client/components/ListenerPlayer';
import { defaultSettings, type Snapshot } from '../../src/shared/contracts';
import { listeningPosition, shouldListen } from '../../src/client/lib/playback-sync';

vi.mock('sonner', () => ({ useSonner: () => ({ toasts: [] }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function snapshot(): Snapshot {
  return {
    room: {
      id: 'room',
      code: 'ROOM01',
      name: 'Room',
      description: '',
      owner_id: 'owner',
      version: 1,
      created_at: '',
    },
    settings: { ...defaultSettings, playback_mode: 'ALL_DEVICES' },
    members: [],
    me: 'member',
    role: 'member',
    version: 1,
    queue: [
      {
        id: 'entry',
        room_id: 'room',
        youtube_video_id: 'sIKGC2VX63I',
        requested_by: 'owner',
        requested_at: '',
        status: 'PLAYING',
        position: 1,
        vote_count: 0,
        voted: false,
        requester: 'Owner',
        song: {
          youtube_video_id: 'sIKGC2VX63I',
          title: 'Bài thử',
          channel: 'Channel',
          thumbnail: '',
          duration: 180,
          verified_at: '',
        },
      },
    ],
    playback: {
      controller_id: 'host',
      fence: 1,
      lease_until: new Date(Date.now() + 30000).toISOString(),
      run_id: 'run1',
      entry_id: 'entry',
      state: 'PLAYING',
      intent: 'PLAYING',
      position: 40,
      updated_at: new Date().toISOString(),
    },
  };
}
function setup() {
  const players: FixturePlayer[] = [];
  class FixturePlayer {
    playVideo = vi.fn();
    pauseVideo = vi.fn();
    destroy = vi.fn();
    setVolume = vi.fn();
    seekTo = vi.fn();
    getCurrentTime = vi.fn(() => 0);
    getPlayerState = vi.fn(() => 5);
    constructor(
      _node: HTMLElement,
      readonly options: YT.PlayerOptions,
    ) {
      players.push(this);
    }
    ready() {
      this.options.events?.onReady?.({ target: this as unknown as YT.Player });
    }
  }
  vi.stubGlobal('YT', {
    Player: FixturePlayer,
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  });
  const current = snapshot();
  const view = render(<ListenerPlayer snapshot={current} />);
  return { players, current, ...view };
}
describe('device listening', () => {
  it('explains missing host before opt-in and offers explicit recovery only to managers', async () => {
    const { current, rerender, players } = setup();
    const onOpenHost = vi.fn(),
      onCheckHost = vi.fn(async () => {});
    const missing = {
      ...current,
      playback: { ...current.playback, lease_until: new Date(Date.now() - 1000).toISOString() },
    };
    rerender(
      <ListenerPlayer
        snapshot={{ ...missing, role: 'owner' }}
        onOpenHost={onOpenHost}
        onCheckHost={onCheckHost}
      />,
    );
    expect(screen.getByText('Phòng chưa có máy host đang kết nối')).toBeTruthy();
    expect(players).toHaveLength(0);
    expect(onOpenHost).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Nhận quyền host trên máy này' }));
    expect(onOpenHost).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại host' }));
    await waitFor(() => expect(onCheckHost).toHaveBeenCalledTimes(1));
    rerender(
      <ListenerPlayer snapshot={missing} onOpenHost={onOpenHost} onCheckHost={onCheckHost} />,
    );
    expect(screen.queryByRole('button', { name: 'Nhận quyền host trên máy này' })).toBeNull();
    expect(screen.getByText(/Chủ phòng hoặc quản trị viên cần mở/)).toBeTruthy();
  });
  it('rejects local Play while the host is offline and resumes the same iframe after a valid host returns', async () => {
    vi.useFakeTimers();
    const { current, players, rerender } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Bật nghe trên thiết bị này' }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => players[0].ready());
    act(() => vi.advanceTimersByTime(31000));
    expect(screen.getByText('Phòng chưa có máy host đang kết nối')).toBeTruthy();
    players[0].pauseVideo.mockClear();
    act(() =>
      players[0].options.events?.onStateChange?.({
        target: players[0] as unknown as YT.Player,
        data: 1,
      }),
    );
    expect(players[0].pauseVideo).toHaveBeenCalledOnce();
    players[0].playVideo.mockClear();
    rerender(
      <ListenerPlayer
        snapshot={{
          ...current,
          playback: {
            ...current.playback,
            controller_id: 'replacement-host',
            fence: 2,
            lease_until: new Date(Date.now() + 30000).toISOString(),
            updated_at: new Date().toISOString(),
          },
        }}
      />,
    );
    expect(screen.queryByText('Phòng chưa có máy host đang kết nối')).toBeNull();
    expect(players).toHaveLength(1);
    expect(players[0].destroy).not.toHaveBeenCalled();
    expect(players[0].playVideo).toHaveBeenCalled();
  });
  it('offers local retry without a queue command and restores opt-in and volume', async () => {
    const { players } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Bật nghe trên thiết bị này' }));
    await waitFor(() => expect(players).toHaveLength(1));
    act(() => players[0].ready());
    fireEvent.change(screen.getByRole('slider', { name: 'Âm lượng của bạn' }), {
      target: { value: '25' },
    });
    act(() =>
      players[0].options.events?.onError?.({
        target: players[0] as unknown as YT.Player,
        data: 150,
      }),
    );
    expect(players[0].pauseVideo).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Mở trên YouTube' }).getAttribute('href')).toContain(
      'v=sIKGC2VX63I',
    );
    expect(screen.queryByRole('button', { name: 'Bỏ qua bài này' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại trong phòng' }));
    await waitFor(() => expect(players).toHaveLength(2));
    act(() => {
      players[0].options.events?.onError?.({
        target: players[0] as unknown as YT.Player,
        data: 100,
      });
      players[1].ready();
    });
    expect(players[1].setVolume).toHaveBeenCalledWith(25);
    expect(players[1].playVideo).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bật nghe trên thiết bị này' })).toBeNull();
  });

  it('offers external listening when the host fails and does not resume locally until the listener chooses to return', async () => {
    const { players, current, rerender } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Bật nghe trên thiết bị này' }));
    await waitFor(() => expect(players).toHaveLength(1));
    act(() => players[0].ready());
    rerender(
      <ListenerPlayer
        snapshot={{ ...current, playback: { ...current.playback, state: 'ERROR' } }}
      />,
    );
    const attempts = players[0].playVideo.mock.calls.length;
    fireEvent.click(screen.getByRole('link', { name: 'Mở trên YouTube' }));
    rerender(<ListenerPlayer snapshot={{ ...current, version: 3 }} />);
    expect(players[0].playVideo).toHaveBeenCalledTimes(attempts);
    expect(screen.getByRole('alert').textContent).toContain('nghe riêng trên YouTube');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại trong phòng' }));
    await waitFor(() => expect(players).toHaveLength(2));
    act(() => players[1].ready());
    expect(players[1].playVideo).toHaveBeenCalled();
  });

  it('shows the host error without opting in and clears external choice when the song changes', () => {
    const { current, players, rerender } = setup();
    rerender(
      <ListenerPlayer
        snapshot={{ ...current, playback: { ...current.playback, state: 'ERROR' } }}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Mở trên YouTube' }));
    expect(screen.queryByRole('button', { name: 'Thử lại trong phòng' })).toBeNull();
    expect(players).toHaveLength(0);
    rerender(
      <ListenerPlayer
        snapshot={{ ...current, playback: { ...current.playback, run_id: 'run2' } }}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(players).toHaveLength(0);
  });
  it('waits for opt-in, follows host pause and seek, and preserves the player across snapshots', async () => {
    const { players, current, rerender } = setup();
    expect(players).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Bật nghe trên thiết bị này' }));
    await waitFor(() => expect(players).toHaveLength(1));
    expect(players[0].playVideo).not.toHaveBeenCalled();
    act(() => players[0].ready());
    expect(players[0].playVideo).toHaveBeenCalled();
    expect(players[0].seekTo.mock.calls[0][0]).toBeCloseTo(40, 0);
    rerender(
      <ListenerPlayer
        snapshot={{
          ...current,
          playback: { ...current.playback, intent: 'PAUSED', state: 'PAUSED', position: 75 },
        }}
      />,
    );
    expect(players).toHaveLength(1);
    expect(players[0].pauseVideo).toHaveBeenCalled();
    expect(players[0].seekTo).toHaveBeenLastCalledWith(75, true);
    fireEvent.click(screen.getByRole('button', { name: 'Tắt nghe trên máy này' }));
    expect(players[0].destroy).toHaveBeenCalledTimes(1);
  });
  it('handles autoplay rejection and ignores callbacks from an old playback run', async () => {
    const { players, current, rerender } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Bật nghe trên thiết bị này' }));
    await waitFor(() => expect(players).toHaveLength(1));
    act(() => players[0].ready());
    act(() =>
      players[0].options.events?.onAutoplayBlocked?.({
        target: players[0] as unknown as YT.Player,
      }),
    );
    const attempts = players[0].playVideo.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục nghe' }));
    expect(players[0].playVideo.mock.calls.length).toBeGreaterThan(attempts);
    rerender(
      <ListenerPlayer
        snapshot={{ ...current, playback: { ...current.playback, run_id: 'run2' } }}
      />,
    );
    await waitFor(() => expect(players).toHaveLength(2));
    act(() => {
      players[0].options.events?.onError?.({
        target: players[0] as unknown as YT.Player,
        data: 100,
      });
      players[0].options.events?.onAutoplayBlocked?.({
        target: players[0] as unknown as YT.Player,
      });
      players[1].ready();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tiếp tục nghe' })).toBeNull();
    expect(players[0].destroy).toHaveBeenCalledTimes(1);
  });
  it('stops when the host lease expires even without another broadcast, and destroys on leave', async () => {
    vi.useFakeTimers();
    const { players, unmount } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Bật nghe trên thiết bị này' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(players).toHaveLength(1);
    act(() => players[0].ready());
    expect(players[0].pauseVideo).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(31000));
    expect(players[0].pauseVideo).toHaveBeenCalled();
    unmount();
    expect(players[0].destroy).toHaveBeenCalledTimes(1);
  });
  it('uses server-adjusted time, freezes while paused/buffering and clamps the end', () => {
    const { playback } = snapshot();
    const now = Date.parse(playback.updated_at) + 5000;
    expect(listeningPosition(playback, 180, now)).toBe(45);
    expect(listeningPosition({ ...playback, state: 'BUFFERING' }, 180, now)).toBe(40);
    expect(listeningPosition({ ...playback, intent: 'PAUSED' }, 180, now)).toBe(40);
    expect(listeningPosition({ ...playback, position: 179 }, 180, now)).toBe(179.9);
    expect(shouldListen(playback, now + 30000)).toBe(false);
  });
});
