import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/server/index';
import { YouTubeService } from '../../src/server/youtube';
const env = {
  SUPABASE_URL: '',
  SUPABASE_PUBLISHABLE_KEY: '',
  SUPABASE_SECRET_KEY: '',
  YOUTUBE_API_KEY: '',
  APP_BASE_URL: 'https://roomtune.test',
};
describe('Hono boundary', () => {
  it('reports unconfigured health without secrets', async () => {
    const response = await app.request('/api/v1/system/health', {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'configuration_required',
      youtubeConfigured: false,
      version: '0.1.0',
    });
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
  it.each([
    '/rooms',
    '/rooms/00000000-0000-0000-0000-000000000001/snapshot',
    '/library',
    '/youtube/search?q=music',
  ])('rejects missing identity at %s', async (path) => {
    const response = await app.request(`/api/v1${path}`, {}, env);
    expect(response.status).toBe(401);
  });
  it('rejects cross-origin requests', async () => {
    const response = await app.request(
      '/api/v1/rooms',
      {
        method: 'POST',
        headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' },
        body: '{}',
      },
      env,
    );
    expect(response.status).toBe(403);
  });
  it('fails closed when secrets are absent', async () => {
    const response = await app.request(
      '/api/v1/rooms',
      { headers: { Authorization: 'Bearer fake' } },
      env,
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('CONFIG_REQUIRED');
  });
  it('rejects oversized payload', async () => {
    const response = await app.request(
      '/api/v1/rooms',
      { method: 'POST', body: 'x'.repeat(40000), headers: { 'Content-Length': '40000' } },
      env,
    );
    expect(response.status).toBe(413);
  });
});
const metadata = {
  id: 'dQw4w9WgXcQ',
  snippet: {
    title: 'Fixture song',
    channelTitle: 'Fixture channel',
    liveBroadcastContent: 'none',
    thumbnails: { medium: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' } },
  },
  contentDetails: { duration: 'PT3M12S' },
  status: { embeddable: true, privacyStatus: 'public', uploadStatus: 'processed' },
};
describe('official YouTube adapter with HTTP fixtures', () => {
  it('preserves the native fetch receiver required by Cloudflare Workers', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockImplementation(function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(Response.json({ items: [metadata] }));
    });
    try {
      expect((await new YouTubeService('fixture-key').video(metadata.id)).duration).toBe(192);
    } finally {
      request.mockRestore();
    }
  });
  it('normalizes valid metadata', async () => {
    const service = new YouTubeService('fixture-key', async () =>
      Response.json({ items: [metadata] }),
    );
    expect((await service.video(metadata.id)).duration).toBe(192);
  });
  it('rejects non-embeddable video', async () => {
    const service = new YouTubeService('fixture-key', async () =>
      Response.json({
        items: [{ ...metadata, status: { ...metadata.status, embeddable: false } }],
      }),
    );
    await expect(service.video(metadata.id)).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
  });
  it('rejects live and region-restricted videos', async () => {
    for (const v of [
      { ...metadata, snippet: { ...metadata.snippet, liveBroadcastContent: 'live' } },
      {
        ...metadata,
        contentDetails: { ...metadata.contentDetails, regionRestriction: { allowed: ['US'] } },
      },
    ]) {
      const service = new YouTubeService('fixture-key', async () => Response.json({ items: [v] }));
      await expect(service.video(metadata.id)).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
    }
  });
  it('maps quota errors', async () => {
    const service = new YouTubeService('fixture-key', async () =>
      Response.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 }),
    );
    await expect(service.search('music')).rejects.toMatchObject({ code: 'YOUTUBE_QUOTA_EXCEEDED' });
  });
  it('does not report a rejected API key as quota exhaustion', async () => {
    const service = new YouTubeService('fixture-key', async () =>
      Response.json({ error: { errors: [{ reason: 'accessNotConfigured' }] } }, { status: 403 }),
    );
    await expect(service.search('music')).rejects.toMatchObject({
      code: 'YOUTUBE_UNAVAILABLE',
      status: 503,
    });
  });
  it('fails without API configuration', async () => {
    await expect(new YouTubeService('').video(metadata.id)).rejects.toMatchObject({
      code: 'YOUTUBE_UNAVAILABLE',
    });
  });
});
