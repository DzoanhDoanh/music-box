// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { RoomSubscription } from '../../src/client/lib/realtime';
import type { Snapshot } from '../../src/shared/contracts';
import { defaultSettings } from '../../src/shared/contracts';
import { AppError } from '../../src/shared/domain';
import { useRoom } from '../../src/client/lib/room';

const fake = vi.hoisted(() => ({
  actor: 'alice',
  api: vi.fn(),
  refresh: vi.fn(),
  observers: [] as RoomSubscription[],
}));
vi.mock('../../src/client/lib/api', () => ({ api: fake.api, supabase: {} }));
vi.mock('../../src/client/lib/session', () => ({
  useSessionState: () => ({
    session: { user: { id: fake.actor }, access_token: fake.actor },
    error: null,
  }),
}));
vi.mock('../../src/client/lib/realtime', () => ({
  RealtimeService: class {
    refreshPresence = fake.refresh;
    subscribe(_room: string, _actor: string, observer: RoomSubscription) {
      fake.observers.push(observer);
      return () => {};
    }
  },
}));
afterEach(() => {
  cleanup();
  fake.api.mockReset();
  fake.refresh.mockClear();
  fake.observers.length = 0;
});

it('isolates presence by room and identity, ignores late callbacks and hides it after permission loss', async () => {
  fake.actor = 'alice';
  fake.api.mockImplementation(
    async (path: string) =>
      ({
        room: {
          id: path.split('/')[2],
          code: 'TEST',
          name: 'Test',
          description: '',
          owner_id: fake.actor,
          version: 1,
          created_at: '',
        },
        me: fake.actor,
        members: [{ user_id: fake.actor, name: fake.actor, role: 'member', joined_at: '' }],
        settings: defaultSettings,
        queue: [],
        role: 'member',
        playback: {
          controller_id: null,
          fence: 0,
          lease_until: null,
          run_id: null,
          entry_id: null,
          state: 'IDLE',
          intent: 'PAUSED',
          position: 0,
          updated_at: '',
        },
        version: 1,
      }) satisfies Snapshot,
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(({ room }) => useRoom(room), { initialProps: { room: 'one' }, wrapper });
  await waitFor(() => expect(fake.observers).toHaveLength(1));
  const old = fake.observers[0];
  act(() => old.onPresence?.(['alice', 'alice', 'outsider']));
  expect(view.result.current.onlineMembers).toEqual(['alice']);
  fake.actor = 'bob';
  view.rerender({ room: 'two' });
  expect(view.result.current.onlineMembers).toBeNull();
  await waitFor(() => expect(fake.observers).toHaveLength(2));
  act(() => old.onPresence?.(['alice']));
  expect(view.result.current.onlineMembers).toBeNull();
  const current = fake.observers[1];
  act(() => current.onPresence?.(['bob']));
  expect(view.result.current.onlineMembers).toEqual(['bob']);
  act(() => current.onConnection('Mất kết nối'));
  expect(view.result.current.onlineMembers).toBeNull();
  act(() => current.onPresence?.(['bob']));
  expect(view.result.current.onlineMembers).toEqual(['bob']);
  act(() => window.dispatchEvent(new Event('offline')));
  expect(view.result.current.onlineMembers).toBeNull();
  fake.api.mockRejectedValue(new AppError('PERMISSION_DENIED', 403));
  await act(async () => {
    window.dispatchEvent(new Event('online'));
    await view.result.current.refetch();
  });
  expect(fake.refresh).toHaveBeenCalledWith('two', 'bob');
  act(() => current.onPresence?.(['bob']));
  expect(view.result.current.onlineMembers).toBeNull();
  view.unmount();
  client.clear();
});
