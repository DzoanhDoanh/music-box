import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/server/index';
const room = '10000000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
  SUPABASE_SECRET_KEY: 'fixture-server',
  YOUTUBE_API_KEY: '',
  APP_BASE_URL: 'http://localhost',
};
const song = {
  youtube_video_id: 'dQw4w9WgXcQ',
  title: 'Nhạc đã nghe',
  channel: 'Kênh thử',
  duration: 180,
  thumbnail: '/favicon.svg',
  verified_at: '2026-11-16T00:00:00Z',
};
afterEach(() => vi.unstubAllGlobals());
describe('recommendation API with Supabase HTTP fixtures', () => {
  it.each([true, false])('scopes all reads and requires membership: member=%s', async (member) => {
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        const path = url.pathname;
        paths.push(path);
        if (path === '/auth/v1/user') return Response.json({ id: actor });
        if (path.endsWith('/consume_rate_limit')) return Response.json(true);
        expect(init?.method ?? 'GET').toBe('GET');
        if (path.endsWith('/room_members')) {
          expect(url.searchParams.get('user_id')).toBe('eq.' + actor);
          expect(url.searchParams.get('room_id')).toBe('eq.' + room);
          return Response.json(member ? { role: 'member' } : null);
        }
        expect(member).toBe(true);
        if (path.endsWith('/youtube_search_cache')) {
          expect(url.searchParams.get('query')).toMatch(
            /^eq\.discovery:popular-music:(VN|US|KR|JP):v2$/,
          );
          return Response.json({ payload: { items: [] } });
        }
        expect(url.searchParams.get('room_id')).toBe('eq.' + room);
        if (path.endsWith('/room_settings')) return Response.json({ max_duration: 900 });
        if (path.endsWith('/queue_entries')) {
          expect(url.searchParams.get('limit')).toBe('500');
          return Response.json([]);
        }
        if (path.endsWith('/playback_history')) {
          expect(url.searchParams.get('limit')).toBe('300');
          return Response.json([
            { status: 'PLAYED', played_at: '2026-11-16T00:00:00Z', entry: { song } },
          ]);
        }
        throw new Error('Unexpected path ' + path);
      }),
    );
    const response = await app.request(
      `/api/v1/rooms/${room}/recommendations`,
      { headers: { Authorization: 'Bearer fixture' } },
      env,
    );
    expect(response.status).toBe(member ? 200 : 403);
    if (member) {
      expect(await response.json()).toMatchObject({
        familiar: [{ song }],
        discover: [],
        discoveryUnavailable: false,
      });
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    } else
      expect(
        paths.some(
          (path) => path.endsWith('/playback_history') || path.endsWith('/youtube_search_cache'),
        ),
      ).toBe(false);
  });
});
