// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HostPlayer from '../../src/client/components/HostPlayer';
import { defaultSettings, type RoomCommand, type Snapshot } from '../../src/shared/contracts';

vi.mock('sonner', () => ({ toast: { success: vi.fn() }, useSonner: () => ({ toasts: [] }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('host player run isolation', () => {
  it('ignores delayed events from the destroyed video and accepts the current run', async () => {
    const players: FixturePlayer[] = [];
    class FixturePlayer {
      events: YT.Events;
      pauseVideo = vi.fn();
      destroy = vi.fn();
      setVolume = vi.fn();
      playVideo = vi.fn();
      loadVideoById = vi.fn();
      getCurrentTime() {
        return 12;
      }
      constructor(_node: HTMLElement, options: YT.PlayerOptions) {
        this.events = options.events ?? {};
        players.push(this);
        queueMicrotask(() => this.events.onReady?.({ target: this as unknown as YT.Player }));
      }
    }
    vi.stubGlobal('YT', {
      Player: FixturePlayer,
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 },
    });
    const run1 = '10000000-0000-4000-8000-000000000001',
      run2 = '10000000-0000-4000-8000-000000000002';
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
      settings: defaultSettings,
      members: [],
      me: 'owner',
      role: 'owner',
      version: 1,
      queue: [
        {
          id: 'entry',
          room_id: 'room',
          youtube_video_id: 'dQw4w9WgXcQ',
          requested_by: 'owner',
          requested_at: '',
          status: 'PLAYING',
          position: 1,
          vote_count: 0,
          voted: false,
          requester: 'Owner',
          song: {
            youtube_video_id: 'dQw4w9WgXcQ',
            title: 'Fixture',
            channel: 'Fixture',
            thumbnail: '',
            duration: 180,
            verified_at: '',
          },
        },
      ],
      playback: {
        controller_id: null,
        fence: 0,
        run_id: run1,
        entry_id: 'entry',
        lease_until: null,
        state: 'PLAYING',
        intent: 'PLAYING',
        position: 0,
        updated_at: '',
      },
    };
    const commands: RoomCommand[] = [];
    function Harness() {
      const [snapshot, setSnapshot] = useState(initial);
      async function execute(command: RoomCommand) {
        commands.push(command);
        const playback =
          command.action === 'claim'
            ? { ...snapshot.playback, controller_id: command.controller_id, fence: 1 }
            : snapshot.playback;
        setSnapshot((current) => ({ ...current, playback }));
        return { playback, version: 1 };
      }
      return (
        <>
          <button
            onClick={() =>
              setSnapshot((current) => ({
                ...current,
                playback: { ...current.playback, run_id: run2 },
              }))
            }
          >
            Change run
          </button>
          <HostPlayer snapshot={snapshot} execute={execute} />
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Nhận quyền phát nhạc/ }));
    await waitFor(() => expect(players[0]?.playVideo).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Change run' }));
    await waitFor(() => expect(players[1]?.playVideo).toHaveBeenCalled());
    expect(players[0].destroy).toHaveBeenCalledTimes(1);
    const before = commands.length;
    await act(async () => {
      players[0].events.onStateChange?.({ target: players[0] as unknown as YT.Player, data: 0 });
      players[0].events.onError?.({ target: players[0] as unknown as YT.Player, data: 100 });
      players[0].events.onAutoplayBlocked?.({ target: players[0] as unknown as YT.Player });
    });
    expect(commands).toHaveLength(before);
    await act(async () =>
      players[1].events.onStateChange?.({ target: players[1] as unknown as YT.Player, data: 0 }),
    );
    expect(commands.at(-1)).toMatchObject({ action: 'ended', run_id: run2, fence: 1 });
  });
});
