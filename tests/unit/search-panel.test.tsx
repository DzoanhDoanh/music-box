// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SearchPanel from '../../src/client/components/SearchPanel';
import { defaultSettings, type Snapshot, type Song } from '../../src/shared/contracts';

const request = vi.hoisted(() => vi.fn());
vi.mock('../../src/client/lib/api', () => ({ api: request }));
vi.mock('../../src/client/components/Recommendations', () => ({
  default: () => <div>Bài gợi ý</div>,
}));
let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  request.mockReset().mockResolvedValue({ items: [] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});
function setup() {
  const snapshot: Snapshot = {
    room: {
      id: 'room',
      code: 'TEST123',
      name: 'Test',
      description: '',
      owner_id: 'member',
      version: 1,
      created_at: '',
    },
    me: 'member',
    queue: [],
    settings: defaultSettings,
    members: [],
    role: 'member',
    version: 1,
    playback: {
      entry_id: null,
      controller_id: null,
      fence: 0,
      lease_until: null,
      run_id: null,
      state: 'IDLE',
      intent: 'PAUSED',
      position: 0,
      updated_at: '',
    },
  };
  render(
    <QueryClientProvider client={client}>
      <SearchPanel snapshot={snapshot} execute={vi.fn()} />
    </QueryClientProvider>,
  );
  return screen.getByRole('textbox', { name: 'Tìm bài hát trên YouTube' });
}
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });
const song = (title: string): Song => ({
  youtube_video_id: 'dQw4w9WgXcQ',
  title,
  channel: 'Fixture',
  thumbnail: '/favicon.svg',
  duration: 225,
  verified_at: '',
});

it('debounces rapid typing for 650ms, deduplicates normalized queries and cancels cleared input', async () => {
  const input = setup();
  type(input, 'b');
  await advance(700);
  expect(request).not.toHaveBeenCalled();
  type(input, 'ba');
  await advance(300);
  type(input, 'bad');
  await advance(649);
  expect(request).not.toHaveBeenCalled();
  await advance(1);
  expect(request).toHaveBeenCalledExactlyOnceWith(
    '/youtube/search?room=room&q=bad',
    undefined,
    undefined,
    'member',
  );
  await advance(1);
  type(input, ' BAD  ');
  await advance(700);
  expect(request).toHaveBeenCalledTimes(1);
  type(input, 'bad song');
  await advance(300);
  fireEvent.click(screen.getByRole('button', { name: 'Xóa tìm kiếm' }));
  await advance(700);
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Bài gợi ý')).toBeTruthy();
});

it('waits for composition to finish and lets Enter submit without a second debounce request', async () => {
  const input = setup();
  fireEvent.compositionStart(input);
  type(input, 'nha');
  await advance(700);
  expect(request).not.toHaveBeenCalled();
  type(input, 'nhạc');
  fireEvent.compositionEnd(input);
  await advance(649);
  expect(request).not.toHaveBeenCalled();
  fireEvent.submit(input.closest('form')!);
  await advance(1);
  expect(request).toHaveBeenCalledExactlyOnceWith(
    '/youtube/search?room=room&q=nh%E1%BA%A1c',
    undefined,
    undefined,
    'member',
  );
  await advance(700);
  expect(request).toHaveBeenCalledTimes(1);
});

it('searches the latest text while an older request is pending and ignores its late results', async () => {
  let finishOld!: (value: { items: Song[] }) => void;
  request.mockImplementation((path: string) =>
    path.endsWith('q=ba')
      ? new Promise((resolve) => {
          finishOld = resolve;
        })
      : Promise.resolve({ items: [song('Kết quả mới')] }),
  );
  const input = setup();
  type(input, 'ba');
  await advance(651);
  expect(request).toHaveBeenCalledTimes(1);
  type(input, 'bad');
  await advance(651);
  expect(request).toHaveBeenCalledTimes(2);
  // Flush React Query's scheduled observer notification after the new fetch.
  await advance(1);
  expect(screen.getByText('Kết quả mới')).toBeTruthy();
  await act(async () => finishOld({ items: [song('Kết quả cũ')] }));
  await advance(1);
  expect(screen.queryByText('Kết quả cũ')).toBeNull();
  expect(screen.getByText('Kết quả mới')).toBeTruthy();
});

it('cancels the debounce when the search panel is unmounted', async () => {
  const input = setup();
  type(input, 'bad');
  await advance(300);
  cleanup();
  await advance(700);
  expect(request).not.toHaveBeenCalled();
});
