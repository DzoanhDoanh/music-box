import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/shared/domain';
import type { RoomStore } from '../../src/server/ports';
import { AuthService } from '../../src/server/services/auth';
import { QueueService } from '../../src/server/services/commands';
import { MaintenanceService, SearchService } from '../../src/server/services/search';

function fixtureStore(): RoomStore {
  return {
    call: vi.fn(),
    consume: vi.fn(),
    requireMember: vi.fn(),
    command: vi.fn(),
    listRooms: vi.fn(),
    history: vi.fn(),
    recommendationContext: vi.fn(),
    administration: vi.fn(),
    library: vi.fn(),
    exportData: vi.fn(),
    ownsRoom: vi.fn(),
    saveSong: vi.fn(),
    cachedSearch: vi.fn(),
    cacheSearch: vi.fn(),
    staleVideos: vi.fn(),
    markUnavailable: vi.fn(),
  };
}
describe('provider independent services', () => {
  it('serves a shared cached search without a provider call or search rate bucket', async () => {
    const store = fixtureStore();
    const youtube = { video: vi.fn(), search: vi.fn(), popularMusic: vi.fn() };
    vi.mocked(store.cachedSearch).mockResolvedValue({ items: [] });
    expect(
      await new SearchService(store, youtube, 'actor').search('room', '  BAD   song '),
    ).toEqual({ items: [] });
    expect(store.cachedSearch).toHaveBeenCalledWith('search:vn:v2:bad song');
    expect(store.consume).not.toHaveBeenCalled();
    expect(youtube.search).not.toHaveBeenCalled();
  });
  it('keeps search results for six hours without a separate application cap', async () => {
    const store = fixtureStore();
    const youtube = {
      video: vi.fn(),
      search: vi.fn().mockResolvedValue([]),
      popularMusic: vi.fn(),
    };
    await new SearchService(store, youtube, 'actor').search('room', 'BAD');
    expect(store.consume).not.toHaveBeenCalled();
    expect(youtube.search).toHaveBeenCalledExactlyOnceWith('bad');
    expect(store.cacheSearch).toHaveBeenCalledWith('search:vn:v2:bad', [], 21600);
  });
  it('checks search membership before reading cache or calling YouTube', async () => {
    const store = fixtureStore();
    const youtube = { video: vi.fn(), search: vi.fn(), popularMusic: vi.fn() };
    vi.mocked(store.requireMember).mockRejectedValue(new AppError('PERMISSION_DENIED', 403));
    await expect(
      new SearchService(store, youtube, 'outsider').search('room', 'bad'),
    ).rejects.toHaveProperty('code', 'PERMISSION_DENIED');
    expect(store.consume).not.toHaveBeenCalled();
    expect(store.cachedSearch).not.toHaveBeenCalled();
    expect(youtube.search).not.toHaveBeenCalled();
  });
  it('checks membership before consuming YouTube quota', async () => {
    const store = fixtureStore(),
      youtube = { video: vi.fn(), search: vi.fn(), popularMusic: vi.fn() };
    vi.mocked(store.requireMember).mockRejectedValue(new AppError('PERMISSION_DENIED', 403));
    await expect(
      new QueueService(store, 'actor', youtube).execute('room', 'receipt', {
        action: 'enqueue',
        video_id: 'dQw4w9WgXcQ',
      }),
    ).rejects.toHaveProperty('code', 'PERMISSION_DENIED');
    expect(youtube.video).not.toHaveBeenCalled();
    expect(store.command).not.toHaveBeenCalled();
  });
  it('blocks owner deletion before touching Auth', async () => {
    const store = fixtureStore(),
      identity = { verify: vi.fn(), deleteIdentity: vi.fn() };
    vi.mocked(store.ownsRoom).mockResolvedValue(true);
    await expect(new AuthService(identity, store).deleteAccount('owner')).rejects.toHaveProperty(
      'code',
      'OWNER_ACCOUNT',
    );
    expect(identity.deleteIdentity).not.toHaveBeenCalled();
  });
  it('does not hide maintenance storage failures', async () => {
    const store = fixtureStore(),
      youtube = { video: vi.fn(), search: vi.fn(), popularMusic: vi.fn() };
    vi.mocked(store.staleVideos).mockResolvedValue(['dQw4w9WgXcQ']);
    youtube.video.mockResolvedValue({ youtube_video_id: 'dQw4w9WgXcQ' });
    vi.mocked(store.saveSong).mockRejectedValue(new AppError('BACKEND_UNAVAILABLE', 503));
    await expect(new MaintenanceService(store, youtube).run()).rejects.toHaveProperty(
      'code',
      'BACKEND_UNAVAILABLE',
    );
    expect(store.markUnavailable).not.toHaveBeenCalled();
  });
});
