import { describe, expect, it, vi } from 'vitest';
import { musicRegions, type Song } from '../../src/shared/contracts';
import type { RecommendationContext, RoomStore } from '../../src/server/ports';
import { RecommendationService, recommend } from '../../src/server/services/recommendations';
import { AppError } from '../../src/shared/domain';
import { YouTubeService } from '../../src/server/youtube';

const song = (id: string, channel = 'Kênh quen', duration = 180): Song => ({
  youtube_video_id: id,
  title: `Bài ${id}`,
  channel,
  duration,
  thumbnail: '/favicon.svg',
  verified_at: '2026-11-16T00:00:00Z',
});
const heard = (id: string, status = 'PLAYED', day = 15, channel?: string) => ({
  song: song(id, channel),
  status,
  played_at: `2026-11-${day}T00:00:00Z`,
});
const context = (): RecommendationContext => ({ maxDuration: 900, queue: [], history: [] });

describe('room recommendations', () => {
  it('excludes queued, failed, skipped, removed metadata and overlong videos across both groups', () => {
    const data = context();
    data.queue = [{ status: 'PENDING', song: song('queued') }];
    data.history = [
      heard('bad', 'FAILED'),
      heard('skip', 'SKIPPED'),
      heard('queued'),
      heard('good'),
    ];
    const result = recommend(data, [
      song('bad'),
      song('skip'),
      song('queued'),
      song('long', 'channel', 901),
      song('gone', '', 1),
      song('new'),
    ]);
    expect(result.familiar.map((item) => item.song.youtube_video_id)).toEqual(['good']);
    expect(result.discover.map((item) => item.song.youtube_video_id)).toEqual(['new']);
  });
  it('uses latest playback outcome and counts completed listens, not skips, as preference', () => {
    const data = context();
    data.history = [
      heard('once'),
      heard('favorite', 'PLAYED', 14),
      heard('favorite', 'PLAYED', 13),
      heard('recovered', 'FAILED', 12),
      heard('recovered', 'PLAYED', 15),
      heard('now-broken', 'PLAYED', 12),
      heard('now-broken', 'FAILED', 15),
    ];
    const result = recommend(data, []);
    expect(result.familiar[0]).toMatchObject({
      song: { youtube_video_id: 'favorite' },
      reason: 'ROOM_FAVORITE',
    });
    expect(result.familiar.some((item) => item.song.youtube_video_id === 'recovered')).toBe(true);
    expect(result.familiar.some((item) => item.song.youtube_video_id === 'now-broken')).toBe(false);
  });
  it('ranks familiar channels first, deduplicates results and keeps discovery diverse', () => {
    const data = context();
    data.queue = [{ status: 'PLAYING', song: song('playing', 'Known - Topic') }];
    const result = recommend(data, [
      song('fresh', 'Other'),
      song('same1', 'Known - Topic'),
      song('same1', 'Known - Topic'),
      ...['same2', 'same3', 'same4'].map((id) => song(id, 'Known - Topic')),
    ]);
    expect(result.seed).toEqual({ label: 'Known - Topic', query: 'Known' });
    expect(result.discover.map((item) => item.song.youtube_video_id)).toEqual([
      'same1',
      'same2',
      'same3',
      'fresh',
    ]);
    expect(result.discover[0].reason).toBe('FAMILIAR_CHANNEL');
  });
  it('gives new rooms discovery without inventing listening history or repeating familiar songs', () => {
    expect(recommend(context(), [song('new')])).toMatchObject({
      familiar: [],
      seed: null,
      discover: [{ reason: 'DISCOVERY' }],
    });
    const data = context();
    data.history = [heard('old')];
    expect(recommend(data, [song('old')]).discover).toEqual([]);
  });
});

function setup() {
  const store = {
    requireMember: vi.fn(),
    consume: vi.fn(),
    recommendationContext: vi.fn().mockResolvedValue({ ...context(), history: [heard('old')] }),
    cachedSearch: vi.fn(),
    cacheSearch: vi.fn(),
    command: vi.fn(),
  };
  const youtube = {
    video: vi.fn(),
    search: vi.fn(),
    popularMusic: vi.fn().mockResolvedValue([song('new')]),
  };
  return {
    store,
    youtube,
    service: new RecommendationService(store as unknown as RoomStore, youtube, 'actor'),
  };
}
describe('recommendation service boundaries', () => {
  it('checks membership before reading listening data, cache or spending provider quota', async () => {
    const { store, youtube, service } = setup();
    store.requireMember.mockRejectedValue(new AppError('PERMISSION_DENIED', 403));
    await expect(service.read('other-room')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(store.recommendationContext).not.toHaveBeenCalled();
    expect(store.cachedSearch).not.toHaveBeenCalled();
    expect(youtube.popularMusic).not.toHaveBeenCalled();
  });
  it('uses a shared raw provider cache, never caches room rankings or consumes search budget', async () => {
    const { store, youtube, service } = setup();
    const result = await service.read('room');
    expect(store.requireMember).toHaveBeenCalledWith('actor', 'room');
    expect(store.recommendationContext).toHaveBeenCalledWith('room');
    for (const region of musicRegions) {
      expect(store.cacheSearch).toHaveBeenCalledWith(
        `discovery:popular-music:${region}:v2`,
        [song('new')],
        1800,
      );
      expect(youtube.popularMusic).toHaveBeenCalledWith(region);
    }
    expect(result.familiar).toHaveLength(1);
    expect(store.consume).toHaveBeenCalledWith('discovery:global', 300, 86400);
    expect(store.consume.mock.calls.some(([key]) => key.startsWith('search:'))).toBe(false);
    expect(youtube.search).not.toHaveBeenCalled();
    expect(store.command).not.toHaveBeenCalled();
  });
  it('serves a cache hit without another YouTube call or global quota charge', async () => {
    const { store, youtube, service } = setup();
    store.cachedSearch.mockResolvedValue({ items: [song('cached')] });
    expect((await service.read('room')).discover[0].song.youtube_video_id).toBe('cached');
    expect(youtube.popularMusic).not.toHaveBeenCalled();
    expect(store.consume).toHaveBeenCalledTimes(1);
  });
  it.each(['YOUTUBE_UNAVAILABLE', 'YOUTUBE_QUOTA_EXCEEDED', 'RATE_LIMITED'])(
    'keeps room suggestions when discovery fails with %s',
    async (code) => {
      const { youtube, service } = setup();
      youtube.popularMusic.mockRejectedValue(new AppError(code, 503));
      expect(await service.read('room')).toMatchObject({
        discoveryUnavailable: true,
        discover: [],
        familiar: [{ song: { youtube_video_id: 'old' } }],
      });
    },
  );
  it('does not suppress a failure to load the room context', async () => {
    const { store, youtube, service } = setup();
    store.recommendationContext.mockRejectedValue(new AppError('BACKEND_UNAVAILABLE', 503));
    await expect(service.read('room')).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
    expect(youtube.popularMusic).not.toHaveBeenCalled();
  });
  it('keeps a larger pool of unique songs and room favorites without weakening exclusions', () => {
    const data = context();
    data.history = Array.from({ length: 30 }, (_, i) => heard(`old-${i}`));
    const popular = Array.from({ length: 150 }, (_, i) => song(`new-${i}`, `Channel ${i}`));
    data.queue = [{ status: 'QUEUED', song: popular[0] }];
    const result = recommend(data, [...popular, ...popular]);
    expect(result.familiar).toHaveLength(24);
    expect(result.discover).toHaveLength(120);
    expect(new Set(result.discover.map(({ song }) => song.youtube_video_id)).size).toBe(120);
    expect(result.discover.some(({ song }) => song.youtube_video_id === 'new-0')).toBe(false);
  });
  it('interleaves markets and deduplicates shared songs while retaining their filter membership', async () => {
    const { store, service } = setup();
    store.cachedSearch.mockImplementation((key: string) => {
      const region = key.split(':')[2];
      return {
        items: [
          song('shared'),
          ...Array.from({ length: 30 }, (_, i) => song(`${region}-${i}`, `${region}-channel-${i}`)),
        ],
      };
    });
    const result = await service.read('room');
    expect(result.discover).toHaveLength(120);
    expect(result.discover.filter(({ song }) => song.youtube_video_id === 'shared')).toHaveLength(
      1,
    );
    expect(result.discover[0].regions).toEqual([...musicRegions]);
    expect(result.discover.slice(1, 5).map(({ song }) => song.youtube_video_id)).toEqual([
      'VN-0',
      'US-0',
      'KR-0',
      'JP-0',
    ]);
  });
  it('keeps the other markets and familiar songs when one chart fails', async () => {
    const { youtube, service } = setup();
    youtube.popularMusic.mockImplementation(async (region: string) => {
      if (region === 'KR') throw new AppError('YOUTUBE_UNAVAILABLE', 503);
      return [song(region, region)];
    });
    const result = await service.read('room');
    expect(result.discover.map(({ song }) => song.youtube_video_id)).toEqual(['VN', 'US', 'JP']);
    expect(result.unavailableRegions).toEqual(['KR']);
    expect(result.discoveryUnavailable).toBe(true);
    expect(result.familiar).toHaveLength(1);
  });
  it('keeps familiar songs when YouTube returns malformed JSON or schema', async () => {
    for (const body of ['not-json', '{"unexpected":true}']) {
      const { store } = setup();
      const youtube = new YouTubeService('fixture-key', async () => new Response(body));
      const service = new RecommendationService(store as unknown as RoomStore, youtube, 'actor');
      expect(await service.read('room')).toMatchObject({
        discoveryUnavailable: true,
        discover: [],
        familiar: [{ song: { youtube_video_id: 'old' } }],
      });
    }
  });
  it('preserves fetched discovery and room songs if writing the shared cache fails', async () => {
    const { store, service } = setup();
    store.cacheSearch.mockRejectedValue(new AppError('BACKEND_UNAVAILABLE', 503));
    expect(await service.read('room')).toMatchObject({
      discoveryUnavailable: true,
      discover: [{ song: { youtube_video_id: 'new' } }],
      familiar: [{ song: { youtube_video_id: 'old' } }],
    });
  });
});
