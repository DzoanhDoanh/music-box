import { AppError } from '../../shared/domain';
import type { RoomStore } from '../ports';
import type { YouTubePort } from '../youtube';

export class SearchService {
  constructor(
    private store: RoomStore,
    private youtube: YouTubePort,
    private actor: string,
  ) {}
  async search(room: string, query: string) {
    await this.store.requireMember(this.actor, room);
    // Search has no separate per-user or daily application cap. Authentication
    // still applies the shared API abuse limit; YouTube enforces its own quota.
    const text = query.trim().replace(/\s+/g, ' ').toLowerCase();
    // Version the cache because availability now checks Vietnam specifically.
    const normalized = 'search:vn:v2:' + text;
    const cached = await this.store.cachedSearch(normalized);
    if (cached) return cached;
    const items = await this.youtube.search(text);
    // Metadata is checked again on enqueue. Reuse discovery results across rooms.
    await this.store.cacheSearch(normalized, items, 6 * 60 * 60);
    return { items };
  }
}
export class MaintenanceService {
  constructor(
    private store: RoomStore,
    private youtube: YouTubePort | null,
  ) {}
  async run() {
    await this.store.call('maintenance_cleanup', {});
    if (!this.youtube) return;
    for (const id of await this.store.staleVideos()) {
      try {
        await this.store.saveSong(await this.youtube.video(id));
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'VIDEO_UNAVAILABLE') throw error;
        await this.store.markUnavailable(id);
      }
    }
  }
}
