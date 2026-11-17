import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/server/index';
const actor = '10000000-0000-4000-8000-000000000001',
  room = '20000000-0000-4000-8000-000000000001',
  table = '30000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://bau-fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
  SUPABASE_SECRET_KEY: 'fixture-secret',
  YOUTUBE_API_KEY: '',
  APP_BASE_URL: 'http://localhost',
  ENABLE_BAU_CUA: 'true',
};
let calls: { path: string; body: Record<string, unknown> }[],
  denied = false;
beforeEach(() => {
  calls = [];
  denied = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === '/auth/v1/user') return Response.json({ id: actor });
      const body = JSON.parse(String(init?.body));
      calls.push({ path, body });
      if (path.endsWith('/consume_rate_limit')) return Response.json(true);
      if (denied) return Response.json({ message: 'PERMISSION_DENIED' }, { status: 400 });
      return Response.json({ table: { id: table }, wallet: { available: 10000 } });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function request(body?: unknown, headers: Record<string, string> = {}, flags = env) {
  return app.request(
    `/api/v1/rooms/${room}/bau-cua/${table}`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer bau-fixture',
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    flags,
  );
}
describe('Bầu Cua trusted API boundary', () => {
  it('serves notices through an authorized read-only RPC without creating a wallet or seed', async () => {
    const response = await app.request(
      `/api/v1/rooms/${room}/bau-cua/notices`,
      { headers: { Authorization: 'Bearer bau-fixture' } },
      env,
    );
    expect(response.status).toBe(200);
    expect(calls.find((c) => c.path.endsWith('/bau_cua_notices'))?.body).toEqual({
      p_actor: actor,
      p_room: room,
    });
    expect(
      calls.some((c) => c.path.endsWith('/bau_cua_read') || c.path.endsWith('/bau_cua_command')),
    ).toBe(false);
  });
  it('requires authentication, feature flag and a valid same-origin request', async () => {
    expect((await request(undefined, { Authorization: '' })).status).toBe(401);
    expect((await request(undefined, {}, { ...env, ENABLE_BAU_CUA: 'false' })).status).toBe(404);
    expect(
      (await request({ action: 'daily' }, { Origin: 'https://attacker.invalid' })).status,
    ).toBe(403);
    expect(calls.filter((c) => c.path.endsWith('/bau_cua_command'))).toHaveLength(0);
  });
  it('derives actor and cryptographic seed on the server, preserving the retry key', async () => {
    const key = crypto.randomUUID();
    expect((await request({ action: 'start' }, { 'Idempotency-Key': key })).status).toBe(200);
    const c = calls.find((c) => c.path.endsWith('/bau_cua_command'))!.body;
    expect(c).toMatchObject({
      p_actor: actor,
      p_room: room,
      p_table: table,
      p_request: key,
      p_command: { action: 'start' },
    });
    expect(c.p_seed).toMatch(/^[0-9a-f]{64}$/);
    await request({ action: 'start' });
    expect(calls.filter((c) => c.path.endsWith('/bau_cua_command'))[1].body.p_seed).not.toBe(
      c.p_seed,
    );
  });
  it('rejects forged results, identity, balance, settings and noninteger bets before RPC', async () => {
    for (const body of [
      { action: 'start', dice: [0, 0, 0] },
      { action: 'settle' },
      { action: 'daily', balance: 100000 },
      { action: 'bet', round: table, symbol: 'CUA', amount: 1.5 },
      { action: 'bet', round: table, symbol: 'CUA', amount: 100, user: actor },
      { action: 'settings', settings: {}, confirmed: false },
    ])
      expect((await request(body)).status).toBe(400);
    expect(calls.filter((c) => c.path.endsWith('/bau_cua_command'))).toHaveLength(0);
  });
  it('requires idempotency and propagates database authorization failures', async () => {
    expect((await request({ action: 'daily' }, { 'Idempotency-Key': '' })).status).toBe(400);
    denied = true;
    expect((await request()).status).toBe(403);
  });
});
