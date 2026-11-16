import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { app } from '../../src/server/index';
import { createInitialGameState, transition } from '../../src/shared/game/engine';
import type { GameCommand, GameSnapshot } from '../../src/shared/game/contracts';
import { secureDice } from '../../src/server/services/game';

const actor = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
const room = '20000000-0000-4000-8000-000000000001',
  game = '30000000-0000-4000-8000-000000000001';
const key = '40000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
  SUPABASE_SECRET_KEY: 'fixture-secret',
  YOUTUBE_API_KEY: '',
  APP_BASE_URL: 'http://localhost',
  ENABLE_LUDO: 'true',
};
let state: GameSnapshot,
  denied = false,
  receipt: GameSnapshot | null = null;
let calls: { path: string; body: Record<string, unknown> }[];
beforeEach(() => {
  let s = createInitialGameState(game, room, actor, 'Bàn thử', 'A');
  s = transition(s, other, 'B', false, { action: 'join', color: 1, version: s.version }, 0);
  for (const id of [actor, other])
    s = transition(
      s,
      id,
      id === actor ? 'A' : 'B',
      false,
      { action: 'ready', ready: true, version: s.version },
      0,
    );
  s = transition(s, actor, 'A', false, { action: 'start', version: s.version }, Date.now());
  state = { state: s, serverNow: Date.now(), spectators: [], results: [] };
  calls = [];
  denied = false;
  receipt = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === '/auth/v1/user') return Response.json({ id: actor });
      const body = JSON.parse(String(init?.body));
      calls.push({ path, body });
      if (path.endsWith('/consume_rate_limit')) return Response.json(true);
      if (denied) return Response.json({ message: 'PERMISSION_DENIED' }, { status: 400 });
      if (path.endsWith('/game_context'))
        return Response.json(
          receipt
            ? { receipt }
            : {
                snapshot: state,
                members: [
                  { id: actor, name: 'A', role: 'member' },
                  { id: other, name: 'B', role: 'member' },
                ],
              },
        );
      if (path.endsWith('/game_commit')) return Response.json({ ...state, state: body.p_state });
      if (path.endsWith('/game_create')) return Response.json({ ...state, state: body.p_state });
      if (path.endsWith('/game_list')) return Response.json([state.state]);
      if (path.endsWith('/game_watch')) return Response.json(state);
      throw new Error('Unexpected upstream ' + path);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const request = (body?: unknown, suffix = '/' + game, settings = env) =>
  app.request(
    `/api/v1/rooms/${room}/games${suffix}`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer fixture',
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    settings,
  );
describe('trusted game API', () => {
  it('does not call game SQL on a minute tick while the feature is disabled', async () => {
    await worker.scheduled({ cron: '* * * * *' }, { ...env, ENABLE_LUDO: undefined });
    expect(calls).toEqual([]);
  });
  it('is disabled by default, including snapshots and commands', async () => {
    for (const suffix of ['', '/' + game])
      expect((await request(undefined, suffix, { ...env, ENABLE_LUDO: '' })).status).toBe(404);
    expect(
      (
        await request({ action: 'roll', version: state.state.version }, '/' + game, {
          ...env,
          ENABLE_LUDO: '',
        })
      ).status,
    ).toBe(404);
    expect(calls.some((c) => c.path.includes('/game_'))).toBe(false);
  });
  it('requires authentication and current membership', async () => {
    expect((await app.request(`/api/v1/rooms/${room}/games`, {}, env)).status).toBe(401);
    denied = true;
    expect((await request()).status).toBe(403);
    expect((await request({ action: 'roll', version: state.state.version })).status).toBe(403);
  });
  it.each([
    { action: 'roll', version: 4, dice: 6 },
    { action: 'roll', version: 4, actor: other },
    { action: 'move', version: 4, piece: 0, to: 57 },
    { action: 'move', version: 4, piece: 4 },
    { action: 'roll', version: -1 },
    { action: 'sync', version: 4 },
    { action: 'roll', version: 4, state: {} },
  ])('rejects forged command %j before game RPC', async (body) => {
    expect((await request(body)).status).toBe(400);
    expect(calls.some((c) => c.path.includes('/game_'))).toBe(false);
  });
  it('generates a die on the trusted side and commits with verified actor/CAS', async () => {
    const version = state.state.version;
    const response = await request({ action: 'roll', version });
    expect(response.status).toBe(200);
    const result = (await response.json()) as GameSnapshot;
    expect(result.state.last.dice).toBeGreaterThanOrEqual(1);
    expect(result.state.last.dice).toBeLessThanOrEqual(6);
    expect(calls.find((c) => c.path.endsWith('/game_commit'))?.body).toMatchObject({
      p_actor: actor,
      p_room: room,
      p_game: game,
      p_request: key,
      p_version: version,
      p_command: { action: 'roll', version },
    });
  });
  it('returns the original receipt without generating another die', async () => {
    receipt = state;
    const rng = vi.spyOn(crypto, 'getRandomValues');
    expect((await request({ action: 'roll', version: 0 })).status).toBe(200);
    expect(rng).not.toHaveBeenCalled();
    expect(calls.some((c) => c.path.endsWith('/game_commit'))).toBe(false);
  });
  it('rejects stale rolls before requesting random bytes', async () => {
    const rng = vi.spyOn(crypto, 'getRandomValues');
    expect((await request({ action: 'roll', version: 0 })).status).toBe(409);
    expect(rng).not.toHaveBeenCalled();
  });
  it('rejection sampling rejects bytes 252–255 and maps all accepted residues', () => {
    for (let face = 1; face <= 6; face++) {
      const bytes = [252, 253, 254, 255, face - 1];
      vi.spyOn(crypto, 'getRandomValues').mockImplementation(
        <T extends ArrayBufferView | null>(buffer: T): T => {
          (buffer as Uint8Array)[0] = bytes.shift()!;
          return buffer;
        },
      );
      expect(secureDice()).toBe(face);
      expect(bytes).toHaveLength(0);
    }
  });
  it('watching does not run the engine and creating supplies a trusted initial state', async () => {
    expect((await request({ action: 'watch' } satisfies GameCommand)).status).toBe(200);
    expect(calls.some((c) => c.path.endsWith('/game_commit'))).toBe(false);
    expect((await request({ name: ' Bàn mới ', rules: {} }, '')).status).toBe(201);
    expect(calls.find((c) => c.path.endsWith('/game_create'))?.body).toMatchObject({
      p_actor: actor,
      p_state: { host: actor, name: 'Bàn mới', version: 0, status: 'WAITING' },
    });
  });
});
