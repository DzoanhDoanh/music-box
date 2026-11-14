import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/shared/domain';
import type { RoomStore } from '../../src/server/ports';
import { AuthService } from '../../src/server/services/auth';
import { QueueService } from '../../src/server/services/commands';
import { MaintenanceService } from '../../src/server/services/search';

function fixtureStore(): RoomStore {
  return {
    call: vi.fn(),
    consume: vi.fn(),
    requireMember: vi.fn(),
    command: vi.fn(),
    listRooms: vi.fn(),
    history: vi.fn(),
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
  it('checks membership before consuming YouTube quota', async () => {
    const store = fixtureStore(),
      youtube = { video: vi.fn(), search: vi.fn() };
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
      youtube = { video: vi.fn(), search: vi.fn() };
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
