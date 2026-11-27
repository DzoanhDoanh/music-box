import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { billiardsFixture, roomId } from './fixture';

const RAIL = 44,
  W = 1000,
  H = 500;

async function openLobby(page: Page) {
  await page.goto(`/room/${roomId}/games`);
  await page.getByRole('link', { name: /Bi-a/ }).click();
  await expect(page.getByRole('heading', { name: 'Bi-a', level: 1 })).toBeVisible();
}
const table = (page: Page) => page.locator('canvas.bi-canvas');
const status = (page: Page, text: string | RegExp) =>
  page.getByRole('status').filter({ hasText: text });
const listenForSounds = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { sounds: string[] };
    w.sounds = [];
    window.addEventListener('roomtune:table-sound', (e) => {
      w.sounds.push((e as CustomEvent<{ sound: string }>).detail.sound);
    });
  });
const sounds = (page: Page) =>
  page.evaluate(() => (window as unknown as { sounds: string[] }).sounds);
/** Screen point of a table position, for either orientation of the canvas. */
async function point(page: Page, x: number, y: number) {
  const box = (await table(page).boundingBox())!;
  const vertical = box.height > box.width;
  const scale = box.width / (vertical ? H + 2 * RAIL : W + 2 * RAIL);
  return vertical
    ? { x: box.x + (y + RAIL) * scale, y: box.y + (RAIL + W - x) * scale }
    : { x: box.x + (x + RAIL) * scale, y: box.y + (y + RAIL) * scale };
}
async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('8 bi against the computer: break, the balls roll with sound, then the computer plays', async ({
  page,
  context,
}) => {
  await listenForSounds(page);
  const fixture = await billiardsFixture(context);
  await openLobby(page);
  await page.getByRole('radio', { name: 'Dễ' }).check();
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  await expect(table(page)).toBeVisible();
  await expect(status(page, 'Lượt của bạn · được đặt bi cái')).toBeVisible();
  // Upright on phones, wide on desktop.
  const box = (await table(page).boundingBox())!;
  if (test.info().project.name === 'mobile') expect(box.height).toBeGreaterThan(box.width);
  else expect(box.width).toBeGreaterThan(box.height);
  await noHorizontalScroll(page);
  const axe = await new AxeBuilder({ page }).include('.bi-match').analyze();
  expect(axe.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual(
    [],
  );
  await page.screenshot({
    path: `test-results/billiards/aim-${test.info().project.name}.png`,
    fullPage: true,
  });

  await page.getByRole('slider').fill('100');
  await page.getByRole('button', { name: 'Đánh' }).click();
  await expect(status(page, 'Bi đang lăn')).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({ path: `test-results/billiards/rolling-${test.info().project.name}.png` });
  await expect(status(page, 'Bi đang lăn')).toBeHidden({ timeout: 30_000 });
  const played = await sounds(page);
  expect(played[0]).toBe('cue');
  expect(played).toContain('ball');
  const id = [...fixture.tables.keys()][0];
  const state = fixture.tables.get(id)!;
  expect(state.shots.length).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('region', { name: 'Các cú đánh gần đây' })).toContainText('An');
  // Whatever happened, the table ends in the server's position and it is someone's turn.
  expect(['PLAYING', 'FINISHED']).toContain(state.status);
});

test('ball in hand: dragging the cue ball places it before the break', async ({
  page,
  context,
}) => {
  const fixture = await billiardsFixture(context);
  await openLobby(page);
  await page.getByRole('radio', { name: '9 bi' }).check();
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  await expect(table(page)).toBeVisible();
  const from = await point(page, W / 4, H / 2);
  const to = await point(page, 180, 160);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Đánh' }).click();
  await expect(status(page, 'Bi đang lăn')).toBeHidden({ timeout: 30_000 });
  const id = [...fixture.tables.keys()][0];
  const cue = fixture.tables.get(id)!.shots[0].start.find((b) => b.n === 0)!;
  expect(cue.x).toBeGreaterThan(170);
  expect(cue.x).toBeLessThan(190);
  expect(cue.y).toBeGreaterThan(150);
  expect(cue.y).toBeLessThan(170);
});

test('phăng between two room members keeps score', async ({ page, context }) => {
  const fixture = await billiardsFixture(context);
  await openLobby(page);
  await page.getByRole('radio', { name: 'Phăng' }).check();
  await page.getByRole('radio', { name: '5 điểm' }).check();
  await page.getByRole('radio', { name: 'Người trong phòng' }).check();
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  await expect(status(page, 'Đang chờ đối thủ')).toBeVisible();
  const id = [...fixture.tables.keys()][0];
  fixture.join(id);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(status(page, 'Lượt của bạn')).toBeVisible();
  await expect(page.getByText('Bi trắng · 0/5 điểm')).toBeVisible();
  await page.getByRole('button', { name: 'Đánh' }).click();
  await expect(status(page, 'Bi đang lăn')).toBeHidden({ timeout: 30_000 });
  await page.screenshot({
    path: `test-results/billiards/carom-${test.info().project.name}.png`,
    fullPage: true,
  });
  // Either we scored and shoot again, or it is Bình's turn.
  await expect(status(page, /Lượt của bạn|Bình đang đánh/)).toBeVisible();
});

test('the host deletes a table after typing its name', async ({ page, context }) => {
  const fixture = await billiardsFixture(context);
  await openLobby(page);
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  await expect(table(page)).toBeVisible();
  const [id, state] = [...fixture.tables.entries()][0];
  await page.getByRole('button', { name: 'Xóa bàn', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Xóa bàn “/ });
  await dialog.getByRole('textbox').fill(state.name);
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/room/${roomId}/games/bi-a$`));
  expect(fixture.deleted).toEqual([id]);
});
