// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
  refreshSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));
const session = { access_token: 'fixture-token', user: { id: 'fixture-user' } };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth }),
}));
let api: typeof import('../../src/client/lib/api').api;
let ensureSession: typeof import('../../src/client/lib/api').ensureSession;
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'fixture-key');
  ({ api, ensureSession } = await import('../../src/client/lib/api'));
});
beforeEach(() => {
  auth.getSession.mockReset().mockResolvedValue({ data: { session } });
  auth.signInAnonymously.mockReset();
  auth.refreshSession.mockReset().mockImplementation(async () => {
    const renewed = { ...session, access_token: 'renewed-token' };
    auth.getSession.mockResolvedValue({ data: { session: renewed } });
    return { data: { session: renewed } };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('session continuity', () => {
  const unauthorized = () => Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  it('renews a rejected token once without changing the receipt or payload', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValue(Response.json({ version: 8 }));
    vi.stubGlobal('fetch', request);
    await expect(
      api('/library', { action: 'favorite.add', video_id: 'test' }, 'receipt'),
    ).resolves.toEqual({ version: 8 });
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    const first = request.mock.calls[0][1],
      second = request.mock.calls[1][1];
    expect(first.body).toBe(second.body);
    expect(first.headers['Idempotency-Key']).toBe(second.headers['Idempotency-Key']);
    expect(first.headers.Authorization).toBe('Bearer fixture-token');
    expect(second.headers.Authorization).toBe('Bearer renewed-token');
  });
  it('shares renewal between concurrent rejected requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) =>
        init.headers.Authorization === 'Bearer fixture-token'
          ? unauthorized()
          : Response.json({ ok: true }),
      ),
    );
    await Promise.all([api('/rooms'), api('/library'), api('/rooms/fixture/snapshot')]);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });
  it('uses a token already rotated by the SDK instead of rotating again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        if (init.headers.Authorization === 'Bearer fixture-token') {
          auth.getSession.mockResolvedValue({
            data: { session: { ...session, access_token: 'sdk-token' } },
          });
          return unauthorized();
        }
        return Response.json({ ok: true });
      }),
    );
    await expect(api('/rooms')).resolves.toEqual({ ok: true });
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
  it('does not loop when the renewed token is also rejected', async () => {
    const request = vi.fn().mockImplementation(unauthorized);
    vi.stubGlobal('fetch', request);
    await expect(api('/rooms')).rejects.toHaveProperty('code', 'UNAUTHORIZED');
    expect(request).toHaveBeenCalledTimes(2);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });
  it('classifies an Auth outage as temporary and retries session reading', async () => {
    vi.useFakeTimers();
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: { status: 503 } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })));
    const result = api('/rooms');
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ ok: true });
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it('does not replay after the identity changes during renewal', async () => {
    auth.refreshSession.mockImplementation(async () => {
      const other = { ...session, user: { id: 'other-user' } };
      auth.getSession.mockResolvedValue({ data: { session: other } });
      return { data: { session: other } };
    });
    const request = vi.fn().mockImplementation(unauthorized);
    vi.stubGlobal('fetch', request);
    await expect(api('/rooms')).rejects.toHaveProperty('code', 'UNAUTHORIZED');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('discards an in-flight result after explicit logout even if its HTTP status is 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        auth.onAuthStateChange.mock.calls[0][0]('SIGNED_OUT', null);
        return Response.json({ private: 'previous identity' });
      }),
    );
    await expect(api('/rooms')).rejects.toHaveProperty('code', 'UNAUTHORIZED');
  });
  it('surfaces irrecoverable renewal without creating a replacement guest', async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { status: 400 } });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(unauthorized));
    await expect(api('/rooms')).rejects.toHaveProperty('code', 'UNAUTHORIZED');
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it('keeps a temporary renewal failure recoverable instead of retrying the rejected token', async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { status: 503 } });
    const request = vi.fn().mockImplementation(unauthorized);
    vi.stubGlobal('fetch', request);
    await expect(api('/rooms')).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE', status: 503 });
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects a background request after logout without creating another identity', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(api('/rooms')).rejects.toHaveProperty('code', 'UNAUTHORIZED');
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
  it('reuses the stored session when joining another room', async () => {
    await expect(ensureSession()).resolves.toHaveProperty('access_token', 'fixture-token');
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it('creates a guest only when explicitly joining, carrying the captcha token', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.signInAnonymously.mockResolvedValue({ data: { session: { access_token: 'new-guest' } } });
    await expect(ensureSession('captcha-fixture')).resolves.toHaveProperty(
      'access_token',
      'new-guest',
    );
    expect(auth.signInAnonymously).toHaveBeenCalledExactlyOnceWith({
      options: { captchaToken: 'captcha-fixture' },
    });
  });
});

describe('client request replay', () => {
  it('rejects a stale chat draft before sending under another account', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(
      api('/rooms/fixture/chat', { action: 'send', body: 'private' }, 'key', 'previous-user'),
    ).rejects.toHaveProperty('code', 'UNAUTHORIZED');
    expect(request).not.toHaveBeenCalled();
  });
  it.each(['commands', 'chat'])(
    'keeps the exact payload and receipt key after an ambiguous %s failure',
    async (endpoint) => {
      vi.useFakeTimers();
      const request = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('network'))
        .mockResolvedValue(Response.json({ version: 4 }));
      vi.stubGlobal('fetch', request);
      const result = api(
        `/rooms/10000000-0000-4000-8000-000000000001/${endpoint}`,
        { action: 'vote', enabled: true },
        'same-receipt',
      );
      await vi.runAllTimersAsync();
      expect(await result).toEqual({ version: 4 });
      expect(request).toHaveBeenCalledTimes(2);
      const first = request.mock.calls[0][1] as RequestInit,
        second = request.mock.calls[1][1] as RequestInit;
      expect(first.body).toBe(second.body);
      expect(first.headers).toEqual(second.headers);
      expect(first.headers).toHaveProperty('Idempotency-Key', 'same-receipt');
    },
  );
  it.each(['/account/delete', '/rooms/join'])(
    'does not replay non-receipted mutation %s',
    async (path) => {
      const request = vi.fn().mockRejectedValue(new TypeError('network'));
      vi.stubGlobal('fetch', request);
      await expect(api(path, { confirmation: 'DELETE' })).rejects.toMatchObject({
        code: 'BACKEND_UNAVAILABLE',
      });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it('does not replay permission errors or quota limits', async () => {
    for (const status of [403, 429]) {
      const request = vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: status === 403 ? 'PERMISSION_DENIED' : 'RATE_LIMITED' } },
            { status },
          ),
        );
      vi.stubGlobal('fetch', request);
      await expect(
        api('/library', { action: 'playlist.create', name: 'Test' }),
      ).rejects.toHaveProperty('status', status);
      expect(request).toHaveBeenCalledTimes(1);
    }
  });
});
