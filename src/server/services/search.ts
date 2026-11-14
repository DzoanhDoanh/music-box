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
    await this.store.consume(`search:${this.actor}`, 6);
    const normalized = query.toLocaleLowerCase();
    const cached = await this.store.cachedSearch(normalized);
    if (cached) return cached;
    await this.store.consume('search:global', 80, 86400);
    const items = await this.youtube.search(query);
    await this.store.cacheSearch(normalized, items);
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
