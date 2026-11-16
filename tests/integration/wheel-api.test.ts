import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { app } from '../../src/server/index';
const actor = '10000000-0000-4000-8000-000000000001',
  room = '20000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_SECRET_KEY: 'fixture-secret',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
  YOUTUBE_API_KEY: '',
  APP_BASE_URL: 'http://localhost',
  ENABLE_WHEEL: 'true',
};
const command = {
  action: 'spin',
  mode: 'CUSTOM',
  reward: 'NONE',
  labels: ['Phở', 'Bún'],
  previous_id: null,
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
      if (path.endsWith('consume_rate_limit')) return Response.json(true);
      if (denied) return Response.json({ message: 'PERMISSION_DENIED' }, { status: 400 });
      if (path.endsWith('wheel_spin')) return Response.json({ id: 'receipt' });
      if (path.endsWith('wheel_snapshot'))
        return Response.json({ online: [], latest: null, recent: [] });
      throw new Error('Unexpected ' + path);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
const request = (body?: unknown, override = env) =>
  app.request(
    `http://localhost/api/v1/rooms/${room}/wheel`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer fixture',
        Origin: 'http://localhost',
        'Content-Type': 'application/json',
        'Idempotency-Key': '30000000-0000-4000-8000-000000000001',
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    override,
  );
it('is opt-in on the server and requires authentication', async () => {
  expect((await request(undefined, { ...env, ENABLE_WHEEL: 'false' })).status).toBe(404);
  expect((await app.request(`http://localhost/api/v1/rooms/${room}/wheel`, {}, env)).status).toBe(
    401,
  );
  expect(calls.some((x) => x.path.includes('wheel_'))).toBe(false);
});
it('takes actor and randomness authority from the server, forwards the durable request key', async () => {
  expect((await request(command)).status).toBe(200);
  expect(calls.find((x) => x.path.endsWith('wheel_spin'))?.body).toEqual({
    p_actor: actor,
    p_room: room,
    p_request: '30000000-0000-4000-8000-000000000001',
    p_command: command,
  });
  denied = true;
  expect((await request()).status).toBe(403);
});
it.each([
  { ...command, winner_index: 0 },
  { ...command, actor },
  { ...command, reward: 'TWO_FIRST' },
  { ...command, labels: ['One'] },
  { ...command, labels: ['Phở', ' phở '] },
  { ...command, labels: ['A'.repeat(61), 'B'] },
])('rejects forged/invalid spin %j', async (body) => {
  expect((await request(body)).status).toBe(400);
  expect(calls.some((x) => x.path.endsWith('wheel_spin'))).toBe(false);
});
