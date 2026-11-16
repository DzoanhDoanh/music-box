import { afterEach, expect, it, vi } from 'vitest';
import { app } from '../../src/server/index';

const actor = '10000000-0000-4000-8000-000000000001';
const room = '20000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
  SUPABASE_SECRET_KEY: 'fixture-server',
  YOUTUBE_API_KEY: 'fixture-youtube',
  APP_BASE_URL: 'http://localhost',
};
afterEach(() => vi.unstubAllGlobals());

function searchFixture(options: { member?: boolean; quota?: boolean } = {}) {
  const limits: { p_key: string; p_limit: number; p_seconds: number }[] = [];
  const provider = vi.fn();
  const writes = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') return Response.json({ id: actor });
      if (url.pathname.endsWith('/consume_rate_limit')) {
        const params = JSON.parse(String(init?.body));
        limits.push(params);
        // Old search buckets are exhausted. They must never be consulted.
        return Response.json(!params.p_key.startsWith('search:'));
      }
      if (url.pathname.endsWith('/room_members'))
        return Response.json(options.member === false ? null : { role: 'member' });
      if (url.pathname.endsWith('/youtube_search_cache')) {
        if (init?.method === 'POST') {
          writes();
          return new Response(null, { status: 201 });
        }
        return Response.json(null);
      }
      if (url.hostname === 'www.googleapis.com') {
        provider();
        if (options.quota)
          return Response.json(
            { error: { errors: [{ reason: 'quotaExceeded' }] } },
            { status: 403 },
          );
        return Response.json({ items: [] });
      }
      throw new Error('Unexpected upstream fixture');
    }),
  );
  return { limits, provider, writes };
}
const searchRequest = (query: string) =>
  app.request(
    `/api/v1/youtube/search?room=${room}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: 'Bearer fixture-user' } },
    env,
  );

it('allows more than 80 uncached searches without consulting exhausted search buckets', async () => {
  const f = searchFixture();
  for (let index = 0; index < 85; index++) {
    const response = await searchRequest(`song ${index}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
  }
  expect(f.provider).toHaveBeenCalledTimes(85);
  expect(f.writes).toHaveBeenCalledTimes(85);
  expect(f.limits).toHaveLength(85);
  expect(
    f.limits.every(
      (limit) => limit.p_key === `user:${actor}` && limit.p_limit === 180 && limit.p_seconds === 60,
    ),
  ).toBe(true);
});

it('still enforces membership before spending provider quota or writing cache', async () => {
  const f = searchFixture({ member: false });
  const response = await searchRequest('bad');
  expect(response.status).toBe(403);
  expect(f.provider).not.toHaveBeenCalled();
  expect(f.writes).not.toHaveBeenCalled();
});

it('preserves real YouTube quota errors without inventing a one-minute reset or caching failure', async () => {
  const f = searchFixture({ quota: true });
  const response = await searchRequest('bad');
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBeNull();
  expect(await response.json()).toMatchObject({ error: { code: 'YOUTUBE_QUOTA_EXCEEDED' } });
  expect(f.provider).toHaveBeenCalledTimes(1);
  expect(f.writes).not.toHaveBeenCalled();
});

it.each([
  [`user:${actor}`, 'RATE_LIMITED', '60'],
  [`enqueue:${actor}`, 'ENQUEUE_RATE_LIMITED', '60'],
] as const)(
  'identifies %s without calling YouTube or mutating the queue',
  async (denied, code, retry) => {
    const provider = vi.fn();
    const mutation = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.hostname === 'www.googleapis.com') {
          provider();
          throw new Error('Unexpected provider request');
        }
        if (url.pathname === '/auth/v1/user') return Response.json({ id: actor });
        if (url.pathname.endsWith('/consume_rate_limit'))
          return Response.json(JSON.parse(String(init?.body)).p_key !== denied);
        if (url.pathname.endsWith('/room_members')) return Response.json({ role: 'member' });
        if (url.pathname.endsWith('/youtube_search_cache')) return Response.json(null);
        mutation();
        throw new Error('Unexpected mutation');
      }),
    );
    const enqueue = denied.startsWith('enqueue:');
    const response = await app.request(
      enqueue ? `/api/v1/rooms/${room}/commands` : `/api/v1/youtube/search?room=${room}&q=bad`,
      {
        method: enqueue ? 'POST' : 'GET',
        headers: {
          Authorization: 'Bearer fixture-user',
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: enqueue ? JSON.stringify({ action: 'enqueue', video_id: '-q_S27LbNKU' }) : undefined,
      },
      env,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe(retry);
    expect(await response.json()).toMatchObject({ error: { code } });
    expect(provider).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
  },
);
