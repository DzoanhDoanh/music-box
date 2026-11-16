// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import Recommendations from '../../src/client/components/Recommendations';
import {
  defaultSettings,
  type RecommendationFeed,
  type Snapshot,
} from '../../src/shared/contracts';
const request = vi.hoisted(() => vi.fn());
vi.mock('../../src/client/lib/api', () => ({ api: request }));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  request.mockReset();
});

it('does not reveal a late response or cached suggestions across rooms and identities', async () => {
  let finish!: (feed: RecommendationFeed) => void;
  request.mockImplementation((path: string) =>
    path.includes('/room-one/')
      ? new Promise<RecommendationFeed>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({ familiar: [], discover: [], seed: null, discoveryUnavailable: false }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const snapshot = (room: string, me: string): Snapshot => ({
    room: {
      id: room,
      code: 'TEST123',
      name: 'Test',
      description: '',
      owner_id: me,
      version: 1,
      created_at: '',
    },
    me,
    members: [],
    role: 'member',
    version: 1,
    queue: [],
    settings: defaultSettings,
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
  });
  const renderFor = (room: string, me: string) => (
    <QueryClientProvider client={client}>
      <Recommendations snapshot={snapshot(room, me)} busy={null} add={vi.fn()} search={vi.fn()} />
    </QueryClientProvider>
  );
  const view = render(renderFor('room-one', 'alice'));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      '/rooms/room-one/recommendations',
      undefined,
      undefined,
      'alice',
    ),
  );
  view.rerender(renderFor('room-two', 'bob'));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      '/rooms/room-two/recommendations',
      undefined,
      undefined,
      'bob',
    ),
  );
  await act(async () =>
    finish({
      familiar: [],
      discover: [],
      discoveryUnavailable: false,
      seed: { label: 'Private old channel', query: 'old' },
    }),
  );
  expect(screen.queryByText(/Private old channel/)).toBeNull();
});
