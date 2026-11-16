import type { RecommendationFeed, Song, SongRecommendation } from '../../shared/contracts';
import { musicRegions, type MusicRegion } from '../../shared/contracts';
import { AppError } from '../../shared/domain';
import type { RecommendationContext, RoomStore } from '../ports';
import type { YouTubePort } from '../youtube';

const channelKey = (song: Song) => song.channel.trim().toLocaleLowerCase();

/** Room-only listening signals; never read another room or another member's private library. */
export function recommend(
  context: RecommendationContext,
  popular: Song[],
  regions = new Map<string, MusicRegion[]>(),
): Omit<RecommendationFeed, 'discoveryUnavailable'> {
  const blocked = new Set(
    context.queue.flatMap(({ song }) => (song ? [song.youtube_video_id] : [])),
  );
  const latest = new Map<string, string>();
  const counts = new Map<string, number>();
  const channels = new Set<string>();
  const history = [...context.history].sort((a, b) => b.played_at.localeCompare(a.played_at));
  for (const item of history) {
    if (!item.song) continue;
    const id = item.song.youtube_video_id;
    if (!latest.has(id)) latest.set(id, item.status);
    if (item.status === 'PLAYED') counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const [id, status] of latest) if (status !== 'PLAYED') blocked.add(id);
  const valid = (song: Song) =>
    Boolean(song.channel.trim()) && song.duration > 1 && song.duration <= context.maxDuration;
  const available = (song: Song) => valid(song) && !blocked.has(song.youtube_video_id);
  for (const item of history) {
    if (item.song && latest.get(item.song.youtube_video_id) === 'PLAYED' && valid(item.song))
      channels.add(channelKey(item.song));
  }
  const seedSong =
    context.queue.find(
      (entry) => ['PLAYING', 'PREPARING'].includes(entry.status) && entry.song && valid(entry.song),
    )?.song ??
    context.queue.find((entry) => entry.song && valid(entry.song))?.song ??
    history.find((entry) => entry.song && available(entry.song))?.song;
  if (seedSong) channels.add(channelKey(seedSong));
  const familiarSongs = new Map<string, { song: Song; score: number }>();
  history.forEach((entry, index) => {
    const song = entry.song;
    if (
      !song ||
      entry.status !== 'PLAYED' ||
      !available(song) ||
      familiarSongs.has(song.youtube_video_id)
    )
      return;
    familiarSongs.set(song.youtube_video_id, {
      song,
      score:
        (counts.get(song.youtube_video_id) ?? 1) * 4 +
        3 / (index + 1) +
        (seedSong && channelKey(song) === channelKey(seedSong) ? 2 : 0),
    });
  });
  const familiar: SongRecommendation[] = [...familiarSongs.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 24)
    .map(({ song }) => ({
      song,
      reason: (counts.get(song.youtube_video_id) ?? 0) > 1 ? 'ROOM_FAVORITE' : 'ROOM_RECENT',
    }));
  const used = new Set(familiar.map(({ song }) => song.youtube_video_id));
  const channelCounts = new Map<string, number>();
  const discover: SongRecommendation[] = [];
  const ranked = popular
    .map((song, index) => ({ song, index }))
    .sort(
      (a, b) =>
        Number(channels.has(channelKey(b.song))) - Number(channels.has(channelKey(a.song))) ||
        a.index - b.index,
    );
  for (const { song } of ranked) {
    const channel = channelKey(song);
    if (
      !available(song) ||
      used.has(song.youtube_video_id) ||
      (channelCounts.get(channel) ?? 0) >= 3
    )
      continue;
    used.add(song.youtube_video_id);
    channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + 1);
    discover.push({
      song,
      reason: channels.has(channel) ? 'FAMILIAR_CHANNEL' : 'DISCOVERY',
      ...(regions.has(song.youtube_video_id)
        ? { regions: regions.get(song.youtube_video_id) }
        : {}),
    });
    if (discover.length === 120) break;
  }
  const query = seedSong?.channel
    .replace(/\s*-\s*Topic$/iu, '')
    .trim()
    .slice(0, 110);
  return {
    familiar,
    discover,
    seed: query && query.length >= 2 ? { label: seedSong!.channel, query } : null,
  };
}

export class RecommendationService {
  constructor(
    private store: RoomStore,
    private youtube: YouTubePort,
    private actor: string,
  ) {}
  private async chart(region: MusicRegion) {
    const key = `discovery:popular-music:${region}:v2`;
    let items: Song[] = [];
    try {
      const cached = await this.store.cachedSearch(key);
      if (cached) items = cached.items;
      else {
        // Four shared half-hour charts need ~192 refreshes/day; search quota is untouched.
        await this.store.consume('discovery:global', 300, 86400);
        items = await this.youtube.popularMusic(region);
        await this.store.cacheSearch(key, items, 1800);
      }
      return { region, items, unavailable: false };
    } catch (error) {
      // A provider/cache outage must not hide room suggestions or stop ordinary search.
      if (
        !(error instanceof AppError) ||
        ![
          'YOUTUBE_UNAVAILABLE',
          'YOUTUBE_QUOTA_EXCEEDED',
          'BACKEND_UNAVAILABLE',
          'RATE_LIMITED',
        ].includes(error.code)
      )
        throw error;
      return { region, items, unavailable: true };
    }
  }
  async read(room: string): Promise<RecommendationFeed> {
    await this.store.requireMember(this.actor, room);
    await this.store.consume(`recommendations:${this.actor}`, 12);
    const context = await this.store.recommendationContext(room);
    const results = await Promise.allSettled(musicRegions.map((region) => this.chart(region)));
    const charts: Awaited<ReturnType<RecommendationService['chart']>>[] = [];
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      charts.push(result.value);
    }
    const regions = new Map<string, MusicRegion[]>();
    for (const chart of charts) {
      for (const song of chart.items) {
        const sources = regions.get(song.youtube_video_id) ?? [];
        if (!sources.includes(chart.region)) sources.push(chart.region);
        regions.set(song.youtube_video_id, sources);
      }
    }
    // Interleave charts before affinity ranking so one market cannot fill the entire feed.
    const popular: Song[] = [];
    for (
      let index = 0;
      index < Math.max(0, ...charts.map((chart) => chart.items.length));
      index++
    ) {
      for (const chart of charts) if (chart.items[index]) popular.push(chart.items[index]);
    }
    const unavailableRegions = charts
      .filter((chart) => chart.unavailable)
      .map((chart) => chart.region);
    return {
      ...recommend(context, popular, regions),
      discoveryUnavailable: unavailableRegions.length > 0,
      unavailableRegions,
    };
  }
}
