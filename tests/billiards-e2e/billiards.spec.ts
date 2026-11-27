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
/**
 * Aims by tapping the table in front of the cue ball, then grips the cue behind the ball and
 * draws it back before letting go: a longer pull is a harder shot.
 */
async function shoot(
  page: Page,
  cue: { x: number; y: number },
  toward: { x: number; y: number },
  power: number,
) {
  const aim = await point(page, toward.x, toward.y);
  await page.mouse.click(aim.x, aim.y);
  const len = Math.hypot(toward.x - cue.x, toward.y - cue.y);
  const ux = (toward.x - cue.x) / len,
    uy = (toward.y - cue.y) / len;
  const grip = await point(page, cue.x - ux * 40, cue.y - uy * 40);
  const end = await point(page, cue.x - ux * (40 + power * 170), cue.y - uy * (40 + power * 170));
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(page.getByRole('status').filter({ hasText: /^Lực \d+%$/ })).toBeVisible();
  await page.mouse.up();
  // The cue snaps forward, then the balls start rolling.
  await expect(status(page, 'Bi đang lăn')).toBeVisible();
}
const BREAK_SPOT = { x: W / 4, y: H / 2 },
  APEX = { x: 750, y: H / 2 };
/** Waits until every shot (ours and any reply) has finished playing on screen. */
const settle = (page: Page) =>
  expect(status(page, /Bi đang lăn|đang đánh…/)).toBeHidden({ timeout: 60_000 });
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

  // The whole table is on screen without scrolling.
  await expect
    .poll(async () => {
      const b = (await table(page).boundingBox())!;
      return b.y >= 0 && b.y + b.height <= page.viewportSize()!.height;
    })
    .toBe(true);
  await shoot(page, BREAK_SPOT, APEX, 1);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `test-results/billiards/rolling-${test.info().project.name}.png` });
  await settle(page);
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
  // Hit with back spin: tap the bottom of the small cue ball.
  const spin = page.getByRole('group', { name: /Điểm chạm cơ/ });
  const sb = (await spin.boundingBox())!;
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height * 0.85);
  await expect(spin).toHaveAccessibleName(/Xoáy về/);
  await shoot(page, { x: 180, y: 160 }, { x: 750, y: 250 }, 0.6);
  await settle(page);
  const id = [...fixture.tables.keys()][0];
  const first = fixture.tables.get(id)!.shots[0];
  expect(first.spin?.y).toBeLessThan(-0.5);
  const cue = first.start.find((b) => b.n === 0)!;
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
  await shoot(page, { x: W / 4, y: H / 2 + 75 }, { x: 750, y: 250 }, 0.5);
  await settle(page);
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

test('the computer’s reply waits and shows its cue instead of rolling straight after ours', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await listenForSounds(page);
  const fixture = await billiardsFixture(context);
  await openLobby(page);
  await page.getByRole('radio', { name: '9 bi' }).check();
  await page.getByRole('radio', { name: 'Dễ' }).check();
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  await expect(table(page)).toBeVisible();
  // A soft break that pots nothing, so the computer takes the table.
  await shoot(page, BREAK_SPOT, APEX, 0.47);
  const id = [...fixture.tables.keys()][0];
  await expect.poll(() => fixture.tables.get(id)!.shots.some((s) => s.by === 'b')).toBe(true);
  // Once our balls stop, the computer is named and lines up before anything moves.
  await expect(status(page, 'Máy · Dễ đang đánh…')).toBeVisible({ timeout: 30_000 });
  const cues = async () => (await sounds(page)).filter((x) => x === 'cue').length;
  expect(await cues()).toBe(1);
  await page.screenshot({ path: `test-results/billiards/reply-${test.info().project.name}.png` });
  await settle(page);
  // Every shot on the server was played on screen exactly once.
  expect(await cues()).toBe(fixture.tables.get(id)!.seq);
});
