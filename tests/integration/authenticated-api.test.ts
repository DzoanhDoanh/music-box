import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/server/index';

const actor = '10000000-0000-4000-8000-000000000001';
const room = '20000000-0000-4000-8000-000000000001';
const key = '30000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
  SUPABASE_SECRET_KEY: 'fixture-server',
  YOUTUBE_API_KEY: '',
  APP_BASE_URL: 'http://localhost',
};
afterEach(() => vi.unstubAllGlobals());

describe('authenticated API through Supabase HTTP fixtures', () => {
  it.each([401, 403, 429, 500, 503])(
    'classifies Auth HTTP %s before invoking any business operation',
    async (status) => {
      const request = vi.fn(async (input: string | URL | Request) => {
        expect(new URL(String(input)).pathname).toBe('/auth/v1/user');
        return Response.json(
          {
            message: 'Auth fixture failure',
            code: status < 429 ? 'bad_jwt' : 'unexpected_failure',
          },
          { status },
        );
      });
      vi.stubGlobal('fetch', request);
      const response = await app.request(
        '/api/v1/rooms',
        { headers: { Authorization: 'Bearer fixture-token' } },
        env,
      );
      expect(response.status).toBe(status < 429 ? 401 : 503);
      expect(await response.json()).toMatchObject({
        error: { code: status < 429 ? 'UNAUTHORIZED' : 'BACKEND_UNAVAILABLE' },
      });
    },
  );
  it('takes actor from verified identity, preserves receipt, and keeps server credential off the response', async () => {
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        if (path === '/auth/v1/user') {
          expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-user-token');
          return Response.json({ id: actor, aud: 'authenticated', role: 'authenticated' });
        }
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push({ path, body });
        if (path.endsWith('/consume_rate_limit')) return Response.json(true);
        if (path.endsWith('/room_command')) return Response.json({ version: 7, playback: {} });
        throw new Error(`Unexpected upstream fixture: ${path}`);
      }),
    );
    const response = await app.request(
      `/api/v1/rooms/${room}/commands`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer fixture-user-token',
          'Idempotency-Key': key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'vote',
          entry_id: room,
          enabled: true,
          p_actor: 'forged-owner',
        }),
      },
      env,
    );
    expect(response.status).toBe(200);
    const mutation = calls.find((c) => c.path.endsWith('/room_command'));
    expect(mutation?.body).toMatchObject({
      p_actor: actor,
      p_room: room,
      p_request: key,
      p_command: { action: 'vote', enabled: true },
    });
    expect(mutation?.body.p_command).not.toHaveProperty('p_actor');
    expect(await response.text()).not.toContain('fixture-server');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const timing = response.headers.get('Server-Timing')!;
    expect(timing).toMatch(
      /^auth;dur=\d+\.\d, limits;dur=\d+\.\d, data;dur=\d+\.\d, total;dur=\d+\.\d$/,
    );
    expect(timing).not.toContain(actor);
    expect(timing).not.toContain('fixture');
  });
  it.each(['user', 'write'])(
    'awaits both concurrent rate limits before rejecting a %s bucket denial',
    async (bucket) => {
      const gates = new Map<string, (response: Response) => void>();
      const mutations = vi.fn();
      const verify = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
          const path = new URL(String(input)).pathname;
          if (path === '/auth/v1/user') {
            verify();
            return Response.json({ id: actor });
          }
          expect(verify).toHaveBeenCalledTimes(1);
          if (path.endsWith('/consume_rate_limit')) {
            const name = JSON.parse(String(init?.body)).p_key.split(':')[0];
            return new Promise<Response>((resolve) => gates.set(name, resolve));
          }
          mutations();
          return Response.json({});
        }),
      );
      let settled = false;
      const pending = Promise.resolve(
        app.request(
          `/api/v1/rooms/${room}/commands`,
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer fixture-token',
              'Idempotency-Key': key,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'remove', entry_id: key }),
          },
          env,
        ),
      ).then((response) => {
        settled = true;
        return response;
      });
      await vi.waitFor(() => expect(gates.size).toBe(2));
      gates.get(bucket)!(Response.json(false));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);
      expect(mutations).not.toHaveBeenCalled();
      gates.get(bucket === 'user' ? 'write' : 'user')!(Response.json(true));
      expect((await pending).status).toBe(429);
      expect(mutations).not.toHaveBeenCalled();
    },
  );
  it('revalidates identity on every request and propagates atomic queue permission denial', async () => {
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const path = new URL(String(input)).pathname;
        paths.push(path);
        if (path === '/auth/v1/user') return Response.json({ id: actor });
        if (path.endsWith('/consume_rate_limit')) return Response.json(true);
        if (path.endsWith('/room_command'))
          return Response.json({ message: 'PERMISSION_DENIED' }, { status: 400 });
        throw new Error('Unexpected upstream');
      }),
    );
    for (let i = 0; i < 2; i++) {
      const response = await app.request(
        `/api/v1/rooms/${room}/commands`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer fixture-token',
            'Idempotency-Key': key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'remove', entry_id: key }),
        },
        env,
      );
      expect(response.status).toBe(403);
    }
    expect(paths.filter((path) => path === '/auth/v1/user')).toHaveLength(2);
    expect(paths.filter((path) => path.endsWith('/room_command'))).toHaveLength(2);
    expect(paths.some((path) => path.endsWith('/room_members'))).toBe(false);
  });
  it('fails invalid identity before executing any database operation', async () => {
    const request = vi.fn(async () => Response.json({ message: 'Invalid token' }, { status: 401 }));
    vi.stubGlobal('fetch', request);
    const response = await app.request(
      '/api/v1/rooms',
      { headers: { Authorization: 'Bearer invalid-token' } },
      env,
    );
    expect(response.status).toBe(401);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('retains failed PIN counters in separate committed requests', async () => {
    const operations: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const path = new URL(String(input)).pathname;
        if (path === '/auth/v1/user') return Response.json({ id: actor });
        operations.push(path);
        if (path.endsWith('/consume_rate_limit')) return Response.json(true);
        if (path.endsWith('/join_room'))
          return Response.json({ message: 'INVALID_PIN', code: 'P0001' }, { status: 400 });
        throw new Error('Unexpected upstream fixture');
      }),
    );
    const response = await app.request(
      '/api/v1/rooms/join',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer fixture-user-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'ROOM01', name: 'Khách thử', pin: 'wrong' }),
      },
      env,
    );
    expect(response.status).toBe(409);
    expect(operations.filter((p) => p.endsWith('/consume_rate_limit'))).toHaveLength(4);
    expect(operations.at(-1)).toMatch(/join_room$/);
  });
});
