import { test, expect, type BrowserContext, type WebSocketRoute } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { bauDatabase } from '../helpers/bau-database';
import { fakeMusic, gameFixture, ids, names, room } from '../game-e2e/fixture';
import {
  defaultSettings,
  type BauCommand,
  type BauSnapshot,
} from '../../src/shared/bau-cua/contracts';
import { errorMessages } from '../../src/shared/domain';
import { chooseRoomTab } from '../helpers/room-navigation';

let db: Awaited<ReturnType<typeof bauDatabase>>, fixture: ReturnType<typeof gameFixture>;
let channels: { socket: WebSocketRoute; topics: Set<string>; array: boolean }[];
const seed = 'ab'.repeat(32);
let dropNext = false,
  mute = false;
const requests: { key: string; body: BauCommand }[] = [];
async function read(actor = ids[0], table: string | null = null): Promise<BauSnapshot> {
  return (
    await db.sql`select public.bau_cua_read(${actor}::uuid,${room}::uuid,${table}::uuid,${seed}) r`
  )[0].r;
}
async function command(
  actor: string,
  body: BauCommand,
  table: string | null = null,
  key: string = randomUUID(),
): Promise<BauSnapshot> {
  return (
    await db.sql`select public.bau_cua_command(${actor}::uuid,${room}::uuid,${table}::uuid,${key}::uuid,${db.sql.json(body)},${seed}) r`
  )[0].r;
}
function send(
  channel: (typeof channels)[number],
  event: string,
  payload: unknown,
  topic: string,
  ref: string | null = null,
) {
  try {
    channel.socket.send(
      JSON.stringify(
        channel.array ? [null, ref, topic, event, payload] : { topic, event, payload, ref },
      ),
    );
  } catch {
    /* closed browser */
  }
}
async function broadcast(table: string) {
  if (mute) return;
  const rows = await db.sql`select version from public.bau_cua_tables where id=${table}`;
  const notices =
    await db.sql`select payload from realtime.messages where topic=${'room:' + room} and payload->>'kind'='penalty.updated' order by id desc limit 1`;
  for (const c of channels)
    for (const topic of c.topics)
      if (topic === 'realtime:room:' + room && notices.length)
        send(
          c,
          'broadcast',
          { type: 'broadcast', event: 'room.updated', payload: notices[0].payload },
          topic,
        );
      else if (topic === 'realtime:bau:' + table)
        send(
          c,
          'broadcast',
          {
            type: 'broadcast',
            event: 'table.updated',
            payload: { version: Number(rows[0].version) },
          },
          topic,
        );
}
async function attach(context: BrowserContext, index: number) {
  await fixture.attach(context, index);
  await fakeMusic(context);
  await context.addInitScript(() => localStorage.setItem('roomtune:bau:low', 'true'));
  await context.routeWebSocket('**/realtime/**', (socket) => {
    const c = { socket, topics: new Set<string>(), array: false };
    channels.push(c);
    socket.onMessage((data) => {
      const raw = JSON.parse(String(data));
      c.array = Array.isArray(raw);
      const m = c.array ? { topic: raw[2], event: raw[3], payload: raw[4], ref: raw[1] } : raw;
      if (m.event === 'phx_join') c.topics.add(m.topic);
      if (m.event === 'phx_leave') c.topics.delete(m.topic);
      send(c, 'phx_reply', { status: 'ok', response: {} }, m.topic, m.ref);
    });
    socket.onClose(() => c.topics.clear());
  });
  await context.route('**/api/v1/rooms/*/bau-cua**', async (route) => {
    const table = new URL(route.request().url()).pathname.split('/bau-cua/')[1] ?? null;
    try {
      if (table === 'notices') {
        const result = (
          await db.sql`select public.bau_cua_notices(${ids[index]}::uuid,${room}::uuid) r`
        )[0].r;
        return route.fulfill({ json: result });
      }
      const post = route.request().method() === 'POST',
        body = post ? route.request().postDataJSON() : null,
        key = route.request().headers()['idempotency-key'];
      if (post) requests.push({ key, body });
      const result = post
        ? await command(ids[index], body, table, key)
        : await read(ids[index], table);
      if (result.table) await broadcast(result.table.id);
      if (post && body.action === 'bet' && dropNext) {
        dropNext = false;
        return route.abort('connectionreset');
      }
      await route.fulfill({ json: result });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      await route.fulfill({
        status: code === 'PERMISSION_DENIED' ? 403 : 409,
        json: { error: { code, message: errorMessages[code] ?? code } },
      });
    }
  });
}
test.beforeAll(async () => {
  db = await bauDatabase();
});
test.afterAll(async () => {
  await db?.stop();
});
test.beforeEach(async () => {
  await db.sql`delete from public.rooms where id=${room}`;
  await db.sql`delete from auth.users where id in ${db.sql(ids)}`;
  for (const [i, id] of ids.entries()) {
    await db.sql`insert into auth.users(id,is_anonymous) values(${id},${i !== 0})`;
    await db.sql`insert into public.profiles(id,name) values(${id},${names[i]})`;
  }
  await db.sql`insert into public.system_admins(user_id) values(${ids[0]})`;
  await db.sql`insert into public.rooms(id,name,code,owner_id) values(${room},'Bầu Cua cùng bạn','GAMETEST',${ids[0]})`;
  await db.sql`insert into public.room_settings(room_id) values(${room})`;
  await db.sql`insert into public.playback_sessions(room_id) values(${room})`;
  for (const [i, id] of ids.entries())
    await db.sql`insert into public.room_members(room_id,user_id,role) values(${room},${id},${i === 0 ? 'owner' : 'member'})`;
  await read();
  fixture = gameFixture();
  channels = [];
  requests.length = 0;
  mute = false;
  dropNext = false;
});
async function readyTable() {
  const table = (await command(ids[0], { action: 'create', name: 'Bầu cua tối nay' })).table!.id;
  await command(ids[1], { action: 'join', spectator: false }, table);
  await command(ids[0], { action: 'volunteer' }, table);
  return table;
}
test('game hub, create, two real PostgreSQL wallets, bet, shared result and fairness', async ({
  page,
  browser,
}) => {
  const second = await browser.newContext();
  try {
    await attach(page.context(), 0);
    await attach(second, 1);
    const guest = await second.newPage();
    await page.goto(`/room/${room}/games`);
    await page.getByRole('link', { name: /Bầu Cua Party/ }).click();
    await page.getByRole('button', { name: 'Tạo bàn Bầu Cua' }).click();
    await page.getByRole('textbox', { name: 'Tên bàn' }).fill('Bầu cua tối nay');
    await page.getByRole('button', { name: 'Tạo bàn', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bầu cua tối nay.' })).toBeVisible();
    const table = page.url().split('/').at(-1)!;
    await guest.goto(page.url());
    await guest.getByRole('button', { name: 'Tham gia chơi', exact: true }).click();
    await page.getByRole('button', { name: 'Đăng ký cầm cái' }).click();
    await page.getByRole('button', { name: 'Sẵn sàng · Mở vòng' }).click();
    await expect(guest.getByRole('heading', { name: 'Đang nhận cược' })).toBeVisible();
    await guest.getByRole('button', { name: 'Đặt 100 coin vào Cua', exact: true }).click();
    await expect.poll(async () => (await read(ids[1], table)).wallet.reserved).toBe(100);
    await expect(guest.locator('.bau-my-stake').nth(1)).toContainText('100');
    await guest.getByRole('button', { name: 'Cam kết', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Kiểm tra lại kết quả' })).toBeDisabled();
    await db.sql`update public.bau_cua_rounds set deadline=now()-interval '60 seconds' where table_id=${table}`;
    await read(ids[0], table);
    await broadcast(table);
    await expect(guest.locator('.bau-results')).not.toContainText('Chưa mở');
    await expect(page.locator('.bau-results')).not.toContainText('Chưa mở');
    expect(await guest.locator('.bau-results').innerText()).toBe(
      await page.locator('.bau-results').innerText(),
    );
    await guest.getByRole('button', { name: 'Kiểm tra lại kết quả' }).click();
    await expect(guest.getByRole('status').filter({ hasText: 'Khớp cam kết' })).toBeVisible();
    await page.screenshot({ path: 'test-results/bau/desktop-table.png', fullPage: true });
  } finally {
    await second.close();
  }
});
test('uncertain response, refresh, same-key recovery and stale events never duplicate a bet', async ({
  page,
}) => {
  const table = await readyTable();
  await command(ids[0], { action: 'start' }, table);
  await attach(page.context(), 1);
  await page.goto(`/room/${room}/games/bau-cua/${table}`);
  dropNext = true;
  await page.getByRole('button', { name: 'Đặt 100 coin vào Cua', exact: true }).click();
  // HTTP client may safely retry itself; either way ledger must remain single.
  await expect.poll(async () => (await read(ids[1], table)).round!.stake_total).toBe(100);
  await page.reload();
  const retry = page.getByRole('button', { name: 'Xác minh thao tác trước' });
  if (await retry.isVisible()) await retry.click();
  await expect(page.locator('.bau-my-stake').nth(1)).toContainText('100');
  expect((await read(ids[1], table)).wallet.reserved).toBe(100);
  const bets = requests.filter((r) => r.body.action === 'bet');
  expect(new Set(bets.map((r) => r.key)).size).toBe(1);
  for (const c of channels)
    for (const topic of c.topics)
      send(
        c,
        'broadcast',
        { type: 'broadcast', event: 'table.updated', payload: { version: 0 } },
        topic,
      );
  await expect(page.locator('.bau-my-stake').nth(1)).toContainText('100');
});
test('mobile, light theme, keyboard access, 3D and reduced-motion fallback', async ({ page }) => {
  const table = await readyTable();
  await attach(page.context(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/room/${room}/games/bau-cua/${table}`);
  await expect(page.getByRole('heading', { name: 'Bầu cua tối nay.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByLabel('Đồ họa nhẹ').uncheck();
  await expect(page.locator('.bau-stage canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/bau/mobile-3d.png', fullPage: true });
  await command(ids[0], { action: 'start' }, table);
  await db.sql`update public.bau_cua_rounds set deadline=now()-interval '60 seconds' where table_id=${table}`;
  await read(ids[0], table);
  await broadcast(table);
  await expect(page.locator('.bau-results')).not.toContainText('Chưa mở');
  await page.locator('.bau-stage').screenshot({ path: 'test-results/bau/dice-revealed.png' });
  await page.getByLabel('Đồ họa nhẹ').check();
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await page.getByRole('button', { name: 'Luật Bầu Cua', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Coin chỉ dùng giải trí');
  await page.keyboard.press('Escape');
  const report = await new AxeBuilder({ page })
    .include('.bau-party')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(report.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/bau/mobile-light.png', fullPage: true });
});
test('owner changes penalty settings with confirmation; guests cannot see settings controls', async ({
  page,
  browser,
}) => {
  await attach(page.context(), 0);
  await page.goto(`/room/${room}/games/bau-cua`);
  await page.getByRole('button', { name: 'Cài đặt Bầu Cua' }).click();
  await page.getByLabel('Bật hình phạt nhạc', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Lưu cấu hình phòng' }).click();
  await expect(page.getByRole('dialog', { name: 'Áp dụng luật từ vòng tiếp theo?' })).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận lưu' }).click();
  await expect.poll(async () => (await read()).settings.penaltyEnabled).toBe(false);
  const ctx = await browser.newContext();
  try {
    await attach(ctx, 1);
    const guest = await ctx.newPage();
    await guest.goto(`/room/${room}/games/bau-cua`);
    await expect(guest.locator('.bau-wallet-strip')).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Cài đặt Bầu Cua' })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
test('music iframe remains the same visible DOM node while opening game and returning', async ({
  page,
}) => {
  await attach(page.context(), 1);
  await page.goto(`/room/${room}`);
  await page.getByRole('button', { name: /Bật nghe/ }).click();
  const frame = page.locator('iframe[title="YouTube fixture"]');
  await expect(frame).toBeVisible();
  await frame.evaluate((el) => el.setAttribute('data-continuity', 'original'));
  await page.evaluate((path) => {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/room/${room}/games/bau-cua`);
  await expect(page.locator('.bau-party')).toBeVisible();
  await expect(frame).toHaveAttribute('data-continuity', 'original');
  await expect(frame).toBeVisible();
  await page.evaluate((path) => {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/room/${room}`);
  await expect(frame).toHaveAttribute('data-continuity', 'original');
});
test('penalty notice, correct song and owner restore are visible after real settlement', async ({
  page,
  browser,
}) => {
  const table = await readyTable();
  await command(ids[0], {
    action: 'adjust',
    user: ids[1],
    amount: -9900,
    reason: 'Kiểm thử UI phá sản',
  });
  await db.sql`insert into public.songs(youtube_video_id,title,channel,thumbnail,duration) values('bauSong0001','Bài chờ của Bình','Fixture','/favicon.svg',180) on conflict do nothing`;
  const entry = (
    await db.sql`insert into public.queue_entries(room_id,youtube_video_id,requested_by,position,status) values(${room},'bauSong0001',${ids[1]},1,'QUEUED') returning id`
  )[0].id;
  const r = (await command(ids[0], { action: 'start' }, table)).round!;
  const dice = (await db.sql`select private.bau_dice(${r.id}::uuid,${seed}) d`)[0].d as number[];
  const symbols = ['BAU', 'CUA', 'TOM', 'CA', 'GA', 'NAI'] as const;
  await command(
    ids[1],
    { action: 'bet', round: r.id, symbol: symbols.find((_, i) => !dice.includes(i))!, amount: 100 },
    table,
  );
  await attach(page.context(), 0);
  await page.goto(`/room/${room}/games/bau-cua/${table}`);
  await expect(page.locator('.bau-party')).toBeVisible();
  const listener = await browser.newContext();
  try {
    await attach(listener, 2);
    const guest = await listener.newPage();
    await guest.goto(`/room/${room}`);
    await guest.getByRole('button', { name: /Bật nghe/ }).click();
    const frame = guest.locator('iframe[title="YouTube fixture"]');
    await expect(frame).toBeVisible();
    await frame.evaluate((el) => el.setAttribute('data-continuity', 'penalty-listener'));
    await db.sql`update public.bau_cua_rounds set deadline=now()-interval '60 seconds' where id=${r.id}`;
    await read(ids[0], table);
    await broadcast(table);
    await expect(page.getByText(/Đã gỡ 1 bài đang chờ/)).toBeVisible();
    await expect(guest.getByText(/Đã gỡ 1 bài đang chờ/)).toBeVisible();
    await broadcast(table);
    await expect(guest.getByText(/Đã gỡ 1 bài đang chờ/)).toHaveCount(1);
    await expect(frame).toHaveAttribute('data-continuity', 'penalty-listener');
    await page.locator('.bau-wallet-strip > button').click();
    await expect(page.getByText('Bài chờ của Bình', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Khôi phục bài', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await db.sql`select status from public.queue_entries where id=${entry}`)[0].status,
      )
      .toBe('QUEUED');
  } finally {
    await listener.close();
  }
});
test('host music stays visible and mounted through game interactions and settings', async ({
  page,
}) => {
  const table = await readyTable();
  await attach(page.context(), 0);
  await page.goto(`/room/${room}`);
  await chooseRoomTab(page, 'Máy phát nhạc');
  await page.getByRole('button', { name: 'Nhận quyền phát nhạc', exact: true }).click();
  const frame = page.locator('.youtube-container iframe');
  await expect(frame).toBeVisible();
  await frame.evaluate((el) => el.setAttribute('data-continuity', 'host-original'));
  await chooseRoomTab(page, 'Trò chơi');
  await page.getByRole('link', { name: /Bầu Cua Party/ }).click();
  await page.getByRole('button', { name: 'Mở bàn' }).click();
  await expect(frame).toHaveAttribute('data-continuity', 'host-original');
  await expect(frame).toBeVisible();
  const size = (await frame.boundingBox())!;
  expect(size.width).toBeGreaterThanOrEqual(200);
  expect(size.height).toBeGreaterThanOrEqual(200);
  await page.getByRole('button', { name: 'Sẵn sàng · Mở vòng' }).click();
  await expect(page.getByRole('heading', { name: 'Đang nhận cược' })).toBeVisible();
  await page.getByRole('button', { name: 'Luật Bầu Cua', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(frame).toHaveAttribute('data-continuity', 'host-original');
  expect(fixture.musicCommands.some((c) => c.action === 'pause' || c.action === 'release')).toBe(
    false,
  );
  expect((await read(ids[0], table)).round?.status).toBe('BETTING_OPEN');
  await page.screenshot({ path: 'test-results/bau/desktop-with-host.png', fullPage: true });
});
test('no-spectator tables allow joining/leaving and missed events recover on reconnect', async ({
  page,
}) => {
  const table = await readyTable();
  await command(ids[0], {
    action: 'settings',
    settings: { ...defaultSettings, spectators: false },
    confirmed: true,
  });
  await attach(page.context(), 2);
  await page.goto(`/room/${room}/games/bau-cua`);
  await page.getByRole('button', { name: 'Mở bàn' }).click();
  await expect(page.getByRole('button', { name: 'Đăng ký cầm cái' })).toBeVisible();
  mute = true;
  await command(ids[0], { action: 'start' }, table);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('heading', { name: 'Đang nhận cược' })).toBeVisible();
  await page.getByRole('button', { name: 'Rời bàn chơi', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Rời bàn Bầu Cua?' })
    .getByRole('button', { name: 'Xác nhận', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/room/${room}/games/bau-cua$`));
  await expect(page.getByRole('button', { name: 'Tạo bàn Bầu Cua' })).toBeVisible();
  const leave = [...requests].reverse().find((r) => r.body.action === 'leave')!;
  expect((await command(ids[2], { action: 'leave' }, table, leave.key)).table).toBeNull();
});

test('fairness display settings apply to current rounds, history and open dialogs', async ({
  page,
}) => {
  const table = await readyTable();
  await command(ids[0], { action: 'start' }, table);
  await db.sql`update public.bau_cua_rounds set deadline=now()-interval '60 seconds' where table_id=${table}`;
  await read(ids[0], table);
  await command(ids[0], {
    action: 'settings',
    settings: { ...defaultSettings, showVerification: false },
    confirmed: true,
  });
  await attach(page.context(), 1);
  await page.goto(`/room/${room}/games/bau-cua/${table}`);
  await page.getByRole('button', { name: 'Cam kết', exact: true }).click();
  await expect(page.getByText('SHA-256 cam kết', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kiểm tra lại kết quả' })).toHaveCount(0);
  await expect(page.getByText('Seed đã công bố', { exact: true })).toHaveCount(0);
  await command(ids[0], {
    action: 'settings',
    settings: { ...defaultSettings, showCommitment: false },
    confirmed: true,
  });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('SHA-256 cam kết', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Kiểm tra lại kết quả' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Khớp cam kết' })).toBeVisible();
  await command(ids[0], {
    action: 'settings',
    settings: { ...defaultSettings, showCommitment: false, showVerification: false },
    confirmed: true,
  });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('button', { name: 'Kiểm tra lại kết quả' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Cam kết', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Lịch sử vòng', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xác minh', exact: true })).toHaveCount(0);
});
