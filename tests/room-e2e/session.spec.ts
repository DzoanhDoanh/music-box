import { chooseRoomTab } from '../helpers/room-navigation';
import { expect, test, type Page } from '@playwright/test';
import { defaultSettings, type Snapshot } from '../../src/shared/contracts';

const roomId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
const storageKey = 'sb-roomtune-fixture-auth-token';

async function listening(page: Page, role: 'owner' | 'member') {
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    is_anonymous: role === 'member',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const state: Snapshot = {
    room: {
      id: roomId,
      code: 'FIXTURE1',
      name: 'Phòng gia hạn phiên',
      description: '',
      owner_id: userId,
      version: 1,
      created_at: new Date().toISOString(),
    },
    settings: {
      ...defaultSettings,
      playback_mode: role === 'member' ? 'ALL_DEVICES' : 'HOST_ONLY',
    },
    members: [{ user_id: userId, name: 'Người thử', role, joined_at: new Date().toISOString() }],
    me: userId,
    role,
    version: 1,
    queue: [
      {
        id: roomId,
        room_id: roomId,
        youtube_video_id: 'sIKGC2VX63I',
        requested_by: userId,
        requested_at: new Date().toISOString(),
        requester: 'Người thử',
        status: 'PLAYING',
        position: 1,
        vote_count: 0,
        voted: false,
        song: {
          youtube_video_id: 'sIKGC2VX63I',
          title: 'Bài hát đang nghe',
          channel: 'Fixture',
          thumbnail: '/favicon.svg',
          duration: 300,
          verified_at: new Date().toISOString(),
        },
      },
    ],
    playback: {
      controller_id: userId,
      fence: 1,
      lease_until: new Date(Date.now() + 120000).toISOString(),
      run_id: roomId,
      entry_id: roomId,
      state: 'PLAYING',
      intent: 'PLAYING',
      position: 12,
      updated_at: new Date().toISOString(),
    },
  };
  await page.addInitScript(
    ({ key, user }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: 'fixture-token',
          refresh_token: 'fixture-refresh',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
      class Player {
        frame = document.createElement('iframe');
        constructor(node: HTMLElement, options: YT.PlayerOptions) {
          this.frame.title = 'Trình phát kiểm thử gia hạn';
          this.frame.srcdoc =
            '<body style="background:#181620;color:white">Bài hát đang nghe</body>';
          node.replaceWith(this.frame);
          setTimeout(() => options.events?.onReady?.({ target: this as unknown as YT.Player }), 10);
        }
        setVolume() {}
        seekTo() {}
        getCurrentTime() {
          return 12;
        }
        getPlayerState() {
          return 1;
        }
        playVideo() {
          document.documentElement.dataset.plays = String(
            Number(document.documentElement.dataset.plays ?? 0) + 1,
          );
        }
        pauseVideo() {
          document.documentElement.dataset.pauses = String(
            Number(document.documentElement.dataset.pauses ?? 0) + 1,
          );
        }
        destroy() {
          this.frame.remove();
        }
      }
      Object.assign(window, {
        YT: { Player, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 } },
      });
    },
    { key: storageKey, user },
  );
  await page.routeWebSocket('**/realtime/**', (ws) => ws.close());
  const control = {
    snapshotStatus: 200,
    rejectOld: false,
    invalidRefresh: false,
    refreshes: 0,
    snapshots: 0,
    anonymous: 0,
  };
  await page.route('**/auth/v1/**', async (route) => {
    if (route.request().url().includes('/token')) {
      control.refreshes++;
      return control.invalidRefresh
        ? route.fulfill({
            status: 400,
            json: { code: 'refresh_token_not_found', message: 'Refresh token revoked' },
          })
        : route.fulfill({
            json: {
              access_token: 'renewed-token',
              refresh_token: 'renewed-refresh',
              expires_in: 3600,
              token_type: 'bearer',
              user,
            },
          });
    }
    if (route.request().url().includes('/signup')) control.anonymous++;
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/chat'))
      return route.fulfill({
        json: { messages: [], latest_sequence: 0, read_sequence: 0, unread_count: 0 },
      });
    if (control.rejectOld && route.request().headers().authorization === 'Bearer fixture-token')
      return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } });
    if (path === '/api/v1/rooms')
      return route.fulfill({
        json: { rooms: [{ role, room: state.room }], canCreate: role === 'owner' },
      });
    if (path.endsWith('/snapshot')) {
      control.snapshots++;
      if (control.snapshotStatus !== 200)
        return route.fulfill({
          status: control.snapshotStatus,
          json: {
            error: {
              code: control.snapshotStatus === 403 ? 'PERMISSION_DENIED' : 'BACKEND_UNAVAILABLE',
            },
          },
        });
      return route.fulfill({ json: state });
    }
    if (path.endsWith('/commands')) {
      const command = route.request().postDataJSON();
      if (command.action === 'claim') state.playback.controller_id = command.controller_id;
      state.playback.lease_until = new Date(Date.now() + 30000).toISOString();
      return route.fulfill({ json: { version: ++state.version, playback: state.playback } });
    }
    return route.fulfill({ json: { items: [] } });
  });
  await page.goto(`/room/${roomId}`);
  if (role === 'owner') {
    await chooseRoomTab(page, 'Máy phát nhạc');
    await page.getByRole('button', { name: 'Nhận quyền phát nhạc', exact: true }).click();
  } else
    await page.getByRole('button', { name: 'Bật nghe trên thiết bị này', exact: true }).click();
  const frame = page.locator('.youtube-container iframe');
  await expect(frame).toBeVisible();
  const original = await frame.elementHandle();
  return { control, original, frame };
}
async function resync(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

for (const role of ['owner', 'member'] as const) {
  test(`${role} keeps the playing iframe through token expiry, a rejected token and temporary snapshot failure`, async ({
    page,
  }) => {
    const { control, original, frame } = await listening(page, role);
    // The real Supabase SDK sees an expired stored access token and rotates it.
    await page.evaluate((key) => {
      const stored = JSON.parse(localStorage.getItem(key)!);
      stored.expires_at = Math.floor(Date.now() / 1000) - 1;
      localStorage.setItem(key, JSON.stringify(stored));
    }, storageKey);
    await resync(page);
    await expect.poll(() => control.refreshes).toBe(1);
    await expect.poll(() => control.snapshots).toBeGreaterThan(1);
    expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
    expect(await page.locator('html').getAttribute('data-pauses')).toBeNull();
    // A definite API 401 also renews silently; keep the same identity.
    await page.evaluate((key) => {
      const stored = JSON.parse(localStorage.getItem(key)!);
      stored.access_token = 'fixture-token';
      localStorage.setItem(key, JSON.stringify(stored));
    }, storageKey);
    control.rejectOld = true;
    await resync(page);
    await expect.poll(() => control.refreshes).toBe(2);
    control.snapshotStatus = 503;
    await resync(page);
    await expect(
      page.getByRole('status').filter({ hasText: 'Đang kết nối lại để đồng bộ phòng' }),
    ).toBeVisible();
    expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
    expect(await page.locator('html').getAttribute('data-pauses')).toBeNull();
    control.snapshotStatus = 200;
    await resync(page);
    await expect(
      page.getByText('Đang kết nối lại để đồng bộ phòng.', { exact: false }),
    ).toHaveCount(0);
    await expect(frame).toBeVisible();
    expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
    expect(control.anonymous).toBe(0);
  });

  test(`${role} offers room recovery when the refresh token is revoked`, async ({ page }) => {
    const { control, frame } = await listening(page, role);
    control.invalidRefresh = true;
    control.rejectOld = true;
    await resync(page);
    await expect(page.getByRole('heading', { name: 'Khôi phục phiên để nghe tiếp' })).toBeVisible();
    await expect(frame).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Đăng nhập lại', exact: true })).toHaveAttribute(
      'href',
      `/login?room=${roomId}`,
    );
    await expect(page.getByRole('link', { name: 'Tham gia lại bằng tên' })).toHaveAttribute(
      'href',
      '/join?code=FIXTURE1',
    );
    expect(control.refreshes).toBe(1);
    expect(control.anonymous).toBe(0);
    for (const action of await page.locator('.session-recovery .dialog-actions > *').all()) {
      await expect(action).toBeInViewport({ ratio: 1 });
      const bounds = await action.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (role === 'owner')
      await page.screenshot({
        path: `docs/session-recovery-${test.info().project.name}.png`,
        fullPage: true,
      });
  });

  test(`${role} stops listening on revoked membership`, async ({ page }) => {
    const { control, frame } = await listening(page, role);
    control.snapshotStatus = 403;
    await resync(page);
    await expect(
      page.getByText('Bạn không có quyền thực hiện thao tác này.', { exact: true }),
    ).toBeVisible();
    await expect(frame).toHaveCount(0);
    expect(control.refreshes).toBe(0);
  });

  test(`${role} stops immediately on explicit logout`, async ({ page }) => {
    const { frame } = await listening(page, role);
    await page.evaluate(async () => {
      const module = '/src/client/lib/api.ts';
      const { supabase } = await import(module);
      await supabase.auth.signOut({ scope: 'local' });
    });
    await expect(frame).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Khôi phục phiên để nghe tiếp' })).toBeVisible();
  });
}
