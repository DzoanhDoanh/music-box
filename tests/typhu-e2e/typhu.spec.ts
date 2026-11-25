import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { bot, me, roomId, tyPhuFixture } from './fixture';

async function openNewTable(page: Page) {
  await page.goto(`/room/${roomId}/games`);
  await page.getByRole('link', { name: /Tỷ Phú Phố Nhạc/ }).click();
  await expect(page.getByRole('heading', { name: 'Tỷ Phú Phố Nhạc', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  await expect(page.getByRole('group', { name: 'Bàn cờ Tỷ Phú Phố Nhạc' })).toBeVisible();
}
async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('the picker opens the lobby, a table starts and the first city can be bought', async ({
  page,
  context,
}) => {
  const fixture = await tyPhuFixture(context);
  await openNewTable(page);
  const players = page.getByRole('region', { name: 'Người chơi' });
  await expect(players).toContainText('An (bạn)');
  await expect(players).toContainText('Bình');
  await page.getByRole('button', { name: 'Bắt đầu ván' }).click();
  await expect(page.getByRole('heading', { name: 'Lượt của bạn' })).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Bàn cờ Tỷ Phú Phố Nhạc' }).getByRole('button'),
  ).toHaveCount(32);

  fixture.nextDice.push(2, 3); // 5 steps → Sa Pa (80)
  await page.getByRole('button', { name: 'Tung xúc xắc' }).click();
  await page.getByRole('button', { name: 'Mua đất · 80' }).click();
  await expect(page.getByRole('button', { name: /^Sa Pa · An · Đất/ })).toBeVisible();
  expect(fixture.match!.tiles[5]).toMatchObject({ owner: me, level: 0 });
  // The opponent moves automatically and the turn comes back.
  await expect(page.getByRole('heading', { name: 'Lượt của bạn' })).toBeVisible();
  await expect(players).toContainText('1.920');
  await noHorizontalScroll(page);
  await page.screenshot({
    path: `test-results/typhu/match-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('a lap-1 purchase offers up to level 2 and builds in the same stop', async ({
  page,
  context,
}) => {
  const fixture = await tyPhuFixture(context);
  await openNewTable(page);
  await page.getByRole('button', { name: 'Bắt đầu ván' }).click();
  fixture.nextDice.push(1, 2); // 3 steps → Lạng Sơn (70)
  await page.getByRole('button', { name: 'Tung xúc xắc' }).click();
  await expect(page.getByRole('button', { name: 'Mua + Cấp 2 · 140' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Cấp 3/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mua + Cấp 2 · 140' }).click();
  expect(fixture.match!.tiles[3]).toMatchObject({ owner: me, level: 2 });
});

test('attack cards highlight valid targets and lower the chosen city', async ({
  page,
  context,
}) => {
  const fixture = await tyPhuFixture(context);
  await openNewTable(page);
  await page.getByRole('button', { name: 'Bắt đầu ván' }).click();
  await expect(page.getByRole('heading', { name: 'Lượt của bạn' })).toBeVisible();
  fixture.edit((s) => {
    s.tiles[21] = { owner: bot, level: 2, blackout: 0 };
    s.players.find((p) => p.id === me)!.position = 7;
    s.deck = ['STORM', ...s.deck.filter((c) => c !== 'STORM')];
  });
  await page.reload();
  fixture.nextDice.push(2, 3); // 7 → 12 (Cơ hội)
  await page.getByRole('button', { name: 'Tung xúc xắc' }).click();
  await expect(page.getByText('Bão quét qua sân khấu', { exact: true })).toBeVisible();
  const target = page.getByRole('button', { name: /^Nha Trang · Bình · Cấp 2 · có thể chọn/ });
  await expect(target).toBeVisible();
  await target.click();
  await expect.poll(() => fixture.match!.tiles[21]?.level).toBe(1);
});

test('tile details explain rent per level and the board stays accessible', async ({
  page,
  context,
}, info) => {
  await tyPhuFixture(context);
  await openNewTable(page);
  await page.getByRole('button', { name: /^TP\. Hồ Chí Minh/ }).click();
  const detail = page.getByRole('region', { name: 'Thông tin TP. Hồ Chí Minh' });
  await expect(detail).toContainText('Khách sạn');
  await expect(detail).toContainText('1.600');
  await noHorizontalScroll(page);
  if (info.project.name !== 'desktop') return;
  const report = await new AxeBuilder({ page })
    .include('.typhu-party')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(report.violations.map((v) => v.id)).toEqual([]);
});
