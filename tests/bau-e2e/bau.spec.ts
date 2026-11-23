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
  dropGrant = false,
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
      if (post && body.action === 'adjust') {
        const notice = (
          await db.sql`select payload from realtime.messages where topic=${'room:' + room} and payload->>'kind'='wallet.updated' order by id desc limit 1`
        )[0];
        if (notice && !mute)
          for (const c of channels)
            for (const topic of c.topics)
              if (topic === 'realtime:room:' + room)
                send(
                  c,
                  'broadcast',
                  { type: 'broadcast', event: 'room.updated', payload: notice.payload },
                  topic,
                );
        if (dropGrant) {
          dropGrant = false;
          return route.abort('connectionreset');
        }
      }
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
  dropGrant = false;
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
test('other players bets stay visible live, including undo, full names and a fresh round', async ({
  page,
  browser,
}) => {
  const second = await browser.newContext();
  const longName = 'Chi Nguyễn Thị Minh Phương';
  try {
    await command(ids[0], {
      action: 'settings',
      settings: { ...defaultSettings, bettingSeconds: 120 },
      confirmed: true,
    });
    const table = await readyTable();
    await command(ids[2], { action: 'join', spectator: false }, table);
    await command(ids[3], { action: 'join', spectator: false }, table);
    await db.sql`update public.profiles set name=${longName} where id=${ids[2]}`;
    await attach(page.context(), 0);
    await attach(second, 1);
    const guest = await second.newPage();
    const url = `/room/${room}/games/bau-cua/${table}`;
    await page.goto(url);
    await guest.goto(url);
    await page.getByRole('button', { name: 'Sẵn sàng · Mở vòng' }).click();
    const crab = page.getByRole('group', { name: 'Ô Cua', exact: true });
    await guest.getByRole('button', { name: 'Đặt 100 coin vào Cua', exact: true }).click();
    // The other client must update before the 15-second fallback poll.
    await expect(crab.locator('.bau-bettors-preview')).toContainText('Bình', { timeout: 5000 });
    await expect(crab.locator('.bau-bettors-preview')).toContainText('100');
    await expect(crab.locator('.bau-symbol-total')).toHaveText('Cả bàn 100');
    await guest.getByRole('button', { name: '500', exact: true }).click();
    await guest.getByRole('button', { name: 'Đặt 500 coin vào Cua', exact: true }).click();
    await expect(crab.locator('.bau-bettors-preview')).toContainText('600', { timeout: 5000 });
    const round = (await read(ids[0], table)).round!.id;
    await command(ids[2], { action: 'bet', round, symbol: 'CUA', amount: 1000 }, table);
    await command(ids[3], { action: 'bet', round, symbol: 'CUA', amount: 100 }, table);
    await command(ids[3], { action: 'bet', round, symbol: 'TOM', amount: 500 }, table);
    await broadcast(table);
    await expect(crab.locator('.bau-symbol-total')).toHaveText('Cả bàn 1.700');
    await expect(crab.locator('.bau-bettors-preview li')).toHaveCount(2);
    await expect(page.getByRole('group', { name: 'Ô Tôm', exact: true })).toContainText('Dũng');
    // A dealer cannot bet, but can still inspect every other player's bets.
    await expect(
      crab.getByRole('button', { name: 'Đặt 100 coin vào Cua', exact: true }),
    ).toBeDisabled();
    await crab.getByRole('button', { name: 'Xem tất cả 3 người đặt ô Cua' }).click();
    const dialog = page.getByRole('dialog', { name: 'Người đặt ô Cua', exact: true });
    await expect(dialog.getByRole('listitem')).toHaveCount(3);
    await expect(dialog).toContainText(longName);
    await expect(dialog).toContainText('Tổng 1.700 coin');
    await guest.getByRole('button', { name: /^Hoàn toàn bộ .* vào Cua$/ }).click();
    await expect(dialog.getByRole('listitem')).toHaveCount(2, { timeout: 5000 });
    await expect(dialog).not.toContainText('Bình');
    await expect(dialog).toContainText('Tổng 1.100 coin');
    await page.keyboard.press('Escape');
    await expect(crab.getByRole('button', { name: 'Xem người đặt ô Cua' })).toBeFocused();
    await expect(crab.locator('.bau-bettors-preview')).not.toContainText('Bình');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.screenshot({ path: 'test-results/bau/mobile-shared-bets.png', fullPage: true });
    await crab.getByRole('button', { name: 'Xem người đặt ô Cua' }).click();
    await expect(dialog).toContainText(longName);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.screenshot({ path: 'test-results/bau/mobile-bet-details.png' });
    const report = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(report.violations).toEqual([]);
    await db.sql`update public.bau_cua_rounds set deadline=now()-interval '120 seconds' where id=${round}`;
    await read(ids[0], table);
    await command(ids[0], { action: 'start' }, table);
    await broadcast(table);
    await expect(dialog).toContainText('Ô này chưa có cược trong vòng hiện tại.');
    await expect(dialog).not.toContainText(longName);
    await page.keyboard.press('Escape');
    await expect(crab.locator('.bau-symbol-total')).toHaveText('Cả bàn 0');
    await expect(crab.locator('.bau-bettors-empty')).toHaveText('Chưa có cược');
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
test('admin grants coins from the lobby, validates the form and updates the recipient wallet live', async ({
  page,
  browser,
}) => {
  const second = await browser.newContext();
  try {
    await attach(page.context(), 0);
    await attach(second, 1);
    const guest = await second.newPage();
    await page.goto(`/room/${room}/games/bau-cua`);
    await guest.goto(`/room/${room}/games/bau-cua`);
    await expect(guest.locator('.bau-wallet-strip')).toContainText('10.000');
    await expect(guest.getByRole('button', { name: 'Cấp coin', exact: true })).toHaveCount(0);
    await guest.locator('.bau-wallet-strip button').click();
    await page.getByRole('button', { name: 'Cấp coin', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Cấp coin cho thành viên', exact: true });
    await expect(modal.getByLabel('Người nhận').locator('option')).toHaveCount(6);
    await modal.getByLabel('Người nhận').selectOption(ids[1]);
    await modal.getByLabel('Lý do cấp coin').fill('Thưởng tham gia phòng');
    for (const amount of ['0', '-1', '1.5', '1000001']) {
      await modal.getByLabel('Số coin cấp', { exact: true }).fill(amount);
      await expect(modal.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled();
    }
    await modal.getByRole('button', { name: '5.000', exact: true }).click();
    await modal.getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(modal.getByRole('heading', { name: 'Kiểm tra lần cuối' })).toBeFocused();
    await expect(modal).toContainText('Bình');
    await expect(modal).toContainText('+5.000');
    await expect(modal).toContainText('Thưởng tham gia phòng');
    await page.screenshot({ path: 'test-results/bau/coin-grant-desktop.png' });
    await modal.getByRole('button', { name: 'Xác nhận cấp coin' }).click();
    await expect(modal.getByRole('heading', { name: 'Đã cấp 5.000 coin' })).toBeVisible();
    // Realtime updates an already-open lobby wallet before the 15-second fallback poll.
    await expect(guest.getByRole('dialog', { name: 'Ví coin của bạn' })).toContainText(
      '15.000 coin tổng cộng',
      { timeout: 5000 },
    );
    await expect(guest.locator('.bau-ledger')).toContainText('Điều chỉnh quản trị');
    await expect(guest.locator('.bau-ledger')).toContainText('+5.000');
    expect(requests.filter((r) => r.body.action === 'adjust')).toHaveLength(1);
    await modal.getByRole('button', { name: 'Cấp thêm coin' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.screenshot({ path: 'test-results/bau/coin-grant-mobile.png' });
    const report = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(report.violations).toEqual([]);
  } finally {
    await second.close();
  }
});

test('an uncertain coin grant survives reload and is never credited twice', async ({ page }) => {
  await attach(page.context(), 0);
  await page.goto(`/room/${room}/games/bau-cua`);
  await page.getByRole('button', { name: 'Cấp coin', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Cấp coin cho thành viên', exact: true });
  await modal.getByLabel('Người nhận').selectOption(ids[2]);
  await modal.getByLabel('Lý do cấp coin').fill('Thưởng người chưa vào bàn');
  await modal.getByRole('button', { name: 'Tiếp tục' }).click();
  dropGrant = true;
  await modal.getByRole('button', { name: 'Xác nhận cấp coin' }).click();
  await expect(modal.getByRole('button', { name: 'Xác minh thao tác trước' })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Xác nhận cấp coin' })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: 'Cấp coin', exact: true }).click();
  await modal.getByRole('button', { name: 'Xác minh thao tác trước' }).click();
  await expect(modal.getByRole('button', { name: 'Xác minh thao tác trước' })).toHaveCount(0);
  const grants = requests.filter((r) => r.body.action === 'adjust');
  expect(grants.length).toBeGreaterThanOrEqual(2);
  expect(new Set(grants.map((r) => r.key)).size).toBe(1);
  const wallet = await read(ids[2]);
  expect(wallet.wallet.available).toBe(11000);
  expect(wallet.ledger.filter((entry) => entry.reason === 'ADMIN_ADJUSTMENT')).toHaveLength(1);
});

test('a room owner without system admin status has no coin grant control', async ({ page }) => {
  await db.sql`delete from public.system_admins where user_id=${ids[0]}`;
  await attach(page.context(), 0);
  await page.goto(`/room/${room}/games/bau-cua`);
  await expect(page.locator('.bau-wallet-strip')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cấp coin', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cài đặt Bầu Cua' }).click();
  await expect(page.getByRole('dialog')).not.toContainText('Chính sách coin toàn ROOMTUNE');
  await expect(page.getByRole('dialog')).toContainText('Lưu cấu hình phòng');
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
