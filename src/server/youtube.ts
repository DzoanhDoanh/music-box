import { z } from 'zod';
import { AppError, durationSeconds } from '../shared/domain';
import type { Song } from '../shared/contracts';
const videoSchema = z.object({
  id: z.string(),
  snippet: z.object({
    title: z.string(),
    channelTitle: z.string(),
    liveBroadcastContent: z.string(),
    thumbnails: z.record(z.string(), z.object({ url: z.url() })),
  }),
  contentDetails: z.object({
    duration: z.string(),
    contentRating: z.record(z.string(), z.string()).optional(),
    regionRestriction: z.unknown().optional(),
  }),
  status: z.object({
    embeddable: z.boolean(),
    privacyStatus: z.string(),
    uploadStatus: z.string(),
  }),
});
export interface YouTubePort {
  video(id: string): Promise<Song>;
  search(query: string): Promise<Song[]>;
}
export class YouTubeService implements YouTubePort {
  constructor(
    private key: string,
    private request: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}
  private async call(path: string, params: Record<string, string>): Promise<unknown> {
    if (!this.key) throw new AppError('YOUTUBE_UNAVAILABLE', 503);
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    Object.entries({ ...params, key: this.key }).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
    let response: Response;
    try {
      response = await this.request(url, { signal: AbortSignal.timeout(8000) });
    } catch (error) {
      console.warn(
        JSON.stringify({
          service: 'youtube',
          operation: path,
          failure: error instanceof Error ? error.name : 'NETWORK_ERROR',
          detail:
            error instanceof Error
              ? error.message.replaceAll(this.key, '[redacted]').slice(0, 240)
              : undefined,
        }),
      );
      throw new AppError('YOUTUBE_UNAVAILABLE', 503);
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const text = JSON.stringify(body);
      const quota = /quotaExceeded|dailyLimitExceeded/.test(text);
      console.warn(
        JSON.stringify({
          service: 'youtube',
          operation: path,
          status: response.status,
          reasons: body?.error?.errors
            ?.map((item: { reason?: string }) => item.reason)
            .filter((reason: unknown) => typeof reason === 'string' && /^[\w]{1,64}$/.test(reason)),
        }),
      );
      throw new AppError(
        quota ? 'YOUTUBE_QUOTA_EXCEEDED' : 'YOUTUBE_UNAVAILABLE',
        quota ? 429 : 503,
      );
    }
    return response.json();
  }
  private normalize(raw: unknown): Song | null {
    const parsed = videoSchema.safeParse(raw);
    if (!parsed.success) return null;
    const v = parsed.data,
      duration = durationSeconds(v.contentDetails.duration);
    if (
      !v.status.embeddable ||
      v.status.privacyStatus !== 'public' ||
      v.status.uploadStatus !== 'processed' ||
      v.snippet.liveBroadcastContent !== 'none' ||
      !duration ||
      v.contentDetails.contentRating?.ytRating === 'ytAgeRestricted' ||
      v.contentDetails.regionRestriction
    )
      return null;
    return {
      youtube_video_id: v.id,
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      thumbnail: v.snippet.thumbnails.medium?.url ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
      duration,
      verified_at: new Date().toISOString(),
    };
  }
  async video(id: string): Promise<Song> {
    const body = z
      .object({ items: z.array(z.unknown()) })
      .parse(await this.call('videos', { id, part: 'snippet,contentDetails,status' }));
    const song = this.normalize(body.items[0]);
    if (!song) throw new AppError('VIDEO_UNAVAILABLE');
    return song;
  }
  async search(query: string): Promise<Song[]> {
    const search = z
      .object({ items: z.array(z.object({ id: z.object({ videoId: z.string() }) })) })
      .parse(
        await this.call('search', {
          q: query,
          part: 'snippet',
          type: 'video',
          videoEmbeddable: 'true',
          maxResults: '12',
          safeSearch: 'moderate',
        }),
      );
    if (!search.items.length) return [];
    const videos = z.object({ items: z.array(z.unknown()) }).parse(
      await this.call('videos', {
        id: search.items.map((i) => i.id.videoId).join(','),
        part: 'snippet,contentDetails,status',
      }),
    );
    return videos.items.map((v) => this.normalize(v)).filter((v): v is Song => v !== null);
  }
}
