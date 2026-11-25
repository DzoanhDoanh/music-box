import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/server/index';
import { createTyPhuState, transition } from '../../src/shared/ty-phu/engine';
import type { TyPhuState } from '../../src/shared/ty-phu/contracts';

const actor = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
const room = '20000000-0000-4000-8000-000000000001',
  id = '30000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public-fixture',
  SUPABASE_SECRET_KEY: 'server-fixture',
  YOUTUBE_API_KEY: '',
  APP_BASE_URL: 'http://localhost',
  ENABLE_TY_PHU: 'true',
};
const fixed = { die: () => 3, index: (n: number) => n - 1 };
let state: TyPhuState, calls: string[], committed: unknown[];

beforeEach(() => {
  calls = [];
  committed = [];
  let s = createTyPhuState(id, room, actor, 'An', 'Bàn API');
  s = transition(s, other, 'Bình', { action: 'join' }, 0, fixed);
  s = transition(s, other, 'Bình', { action: 'ready', ready: true }, 0, fixed);
  state = transition(s, actor, 'An', { action: 'start' }, 0, fixed);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === '/auth/v1/user') return Response.json({ id: actor });
      calls.push(path);
      if (path.endsWith('/consume_rate_limit')) return Response.json(true);
      const body = JSON.parse(String(init?.body ?? '{}'));
      const visible = (s: TyPhuState) => {
        const { deck, ...rest } = s;
        return { state: { ...rest, deckCount: deck.length }, serverNow: 1000 };
      };
      if (path.endsWith('/ty_phu_context'))
        return Response.json({
          state,
          serverNow: 1000,
          members: [
            { id: actor, name: 'An', role: 'owner' },
            { id: other, name: 'Bình', role: 'member' },
          ],
        });
      if (path.endsWith('/ty_phu_commit')) {
        committed.push(body.p_state);
        state = body.p_state;
        return Response.json(visible(state));
      }
      throw new Error('Unexpected RPC ' + path);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function request(path: string, body?: unknown, flags: Record<string, string> = env) {
  return app.request(
    `/api/v1/rooms/${room}/ty-phu${path}`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer fixture',
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    flags,
  );
}

describe('Tỷ Phú HTTP boundary', () => {
  it('is hidden unless the runtime flag is on', async () => {
    expect((await request('/' + id, undefined, { ...env, ENABLE_TY_PHU: 'false' })).status).toBe(
      404,
    );
    expect(calls.filter((path) => path.includes('ty_phu'))).toEqual([]);
  });
  it('never returns the chance deck order', async () => {
    const response = await request('/' + id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.state.deck).toBeUndefined();
    expect(body.state.deckCount).toBe(15);
  });
  it('rolls server-side dice for the player whose turn it is', async () => {
    const response = await request('/' + id, {
      version: state.version,
      command: { action: 'roll' },
    });
    expect(response.status).toBe(200);
    const saved = committed[0] as TyPhuState;
    expect(saved.version).toBe(state.version);
    expect(saved.dice).not.toBeNull();
    expect((await response.json()).state.deck).toBeUndefined();
  });
  it('rejects malformed commands and stale versions before committing', async () => {
    expect(
      (await request('/' + id, { version: state.version, command: { action: 'roll', dice: 12 } }))
        .status,
    ).toBe(400);
    expect(
      (await request('/' + id, { version: state.version - 1, command: { action: 'roll' } })).status,
    ).toBe(409);
    expect(committed).toEqual([]);
  });
});
