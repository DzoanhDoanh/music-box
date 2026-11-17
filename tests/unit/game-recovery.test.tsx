// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useGame } from '../../src/client/lib/game';
import { gameOutboxKey } from '../../src/client/lib/game-outbox';
import { createInitialGameState } from '../../src/shared/game/engine';
import type { GameSnapshot } from '../../src/shared/game/contracts';
import { AppError } from '../../src/shared/domain';
const request = vi.hoisted(() => vi.fn());
vi.mock('../../src/client/lib/api', () => ({ api: request, supabase: null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
const room = '10000000-0000-4000-8000-000000000001',
  actor = '20000000-0000-4000-8000-000000000001';
const game = '30000000-0000-4000-8000-000000000001',
  other = '30000000-0000-4000-8000-000000000002';
let state: GameSnapshot, client: QueryClient;
beforeEach(() => {
  sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state = {
    state: createInitialGameState(game, room, actor, 'Bàn', 'Bạn'),
    serverNow: Date.now(),
    spectators: [],
    results: [],
  };
  request
    .mockReset()
    .mockImplementation(async (path: string) => (path.includes('?page=') ? [state.state] : state));
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
describe('durable game requests', () => {
  it('retains original key, command and version through an unmount/reload after an ambiguous reply', async () => {
    const first = renderHook(() => useGame(room, actor, game, false), { wrapper });
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    const mutations: unknown[][] = [];
    request.mockImplementation(async (...args: unknown[]) => {
      if (args[1]) {
        mutations.push(args);
        throw new AppError('BACKEND_UNAVAILABLE', 503);
      }
      return state;
    });
    await act(async () => {
      await expect(first.result.current.send({ action: 'ready', ready: true })).rejects.toThrow();
    });
    expect(first.result.current.retry).toBe(true);
    const persisted = JSON.parse(sessionStorage.getItem(gameOutboxKey(room, actor, game))!);
    expect(persisted.body).toEqual({ action: 'ready', ready: true, version: 0 });
    first.unmount();
    state = { ...state, state: { ...state.state, version: 3 } };
    const next = renderHook(() => useGame(room, actor, game, false), { wrapper });
    await waitFor(() => expect(next.result.current.retry).toBe(true));
    request.mockImplementation(async (...args: unknown[]) => {
      if (args[1]) mutations.push(args);
      return state;
    });
    await act(async () => {
      await next.result.current.send();
    });
    expect(mutations[0]).toEqual(mutations[1]);
    expect(sessionStorage.getItem(gameOutboxKey(room, actor, game))).toBeNull();
    expect(next.result.current.retry).toBe(false);
  });
  it('keeps an old pending response isolated when switching game or actor', async () => {
    const h = renderHook(({ id, who }) => useGame(room, who, id, false), {
      initialProps: { id: game, who: actor },
      wrapper,
    });
    await waitFor(() => expect(h.result.current.data).toBeDefined());
    let finish!: (value: GameSnapshot) => void;
    request.mockImplementation(async (_path: string, body: unknown) =>
      body
        ? new Promise<GameSnapshot>((done) => {
            finish = done;
          })
        : { ...state, state: { ...state.state, id: other } },
    );
    let pending!: Promise<GameSnapshot | undefined>;
    await act(async () => {
      pending = h.result.current.send({ action: 'ready', ready: true });
    });
    h.rerender({ id: other, who: 'new-actor' });
    await waitFor(() => expect(h.result.current.data?.state.id).toBe(other));
    await act(async () => {
      finish({ ...state, state: { ...state.state, version: 8 } });
      await pending;
    });
    expect(h.result.current.data?.state.id).toBe(other);
    expect(h.result.current.pending).toBe(false);
    expect(h.result.current.retry).toBe(false);
  });
  it('keeps newer snapshots when a delayed read/watch arrives and hides denied cached boards', async () => {
    const h = renderHook(() => useGame(room, actor, game, false), { wrapper });
    await waitFor(() => expect(h.result.current.data).toBeDefined());
    await act(async () => {
      client.setQueryData(['game', room, actor, game], {
        ...state,
        state: { ...state.state, version: 9 },
      });
    });
    await act(async () => {
      await h.result.current.query.refetch();
    });
    await waitFor(() => expect(h.result.current.data?.state.version).toBe(9));
    request.mockRejectedValue(new AppError('PERMISSION_DENIED', 403));
    await act(async () => {
      await h.result.current.query.refetch();
    });
    await waitFor(() => expect(h.result.current.data).toBeUndefined());
  });
  it('does not send a mutation if its recovery receipt cannot be saved', async () => {
    const h = renderHook(() => useGame(room, actor, game, false), { wrapper });
    await waitFor(() => expect(h.result.current.data).toBeDefined());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage full');
    });
    await act(async () => {
      await h.result.current.send({ action: 'ready', ready: true });
    });
    expect(request.mock.calls.filter((call) => call[1])).toHaveLength(0);
  });
});
