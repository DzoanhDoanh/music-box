import { test, expect, type Page } from '@playwright/test';
import { gameFixture, openGame, room, match, nav, fakeMusic } from './fixture';
import { ids } from './fixture';
import { createInitialGameState } from '../../src/shared/game/engine';

async function fits(page: Page, selector: string) {
  const rect = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize()!;
  expect(rect, selector).not.toBeNull();
  expect(rect!.y, selector).toBeGreaterThanOrEqual(0);
  expect(rect!.x, selector).toBeGreaterThanOrEqual(0);
  expect(rect!.y + rect!.height, selector).toBeLessThanOrEqual(viewport.height + 1);
  expect(rect!.x + rect!.width, selector).toBeLessThanOrEqual(viewport.width + 1);
}
test('dedicated routes keep essential controls in view at laptop, phone and landscape sizes', async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Viewport matrix runs once.');
  const f = gameFixture();
  f.seed();
  await f.attach(context, 0);
  await openGame(page); // Legacy invitation redirects without a full page navigation.
  await expect(page).toHaveURL(new RegExp('/games/' + match + '$'));
  await page.getByRole('button', { name: 'Tung xúc xắc', exact: true }).click();
  await expect(page.locator('.game-move-choices')).toBeVisible();
  for (const [width, height] of [
    [1366, 768],
    [1024, 768],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await fits(page, '.game-board-frame');
    await fits(page, '.game-controls');
    await fits(page, '.game-move-choices');
    const rosterButton = page.getByRole('button', { name: 'Người chơi trong bàn', exact: true });
    if (width > 760 && height > 540) {
      const board = (await page.locator('.game-board-frame').boundingBox())!;
      const roster = (await page.locator('.game-roster').boundingBox())!;
      const controls = (await page.locator('.game-controls').boundingBox())!;
      expect(board.height).toBeGreaterThan(height * 0.75);
      expect(roster.x).toBeGreaterThanOrEqual(board.x + board.width);
      expect(roster.y).toBeGreaterThanOrEqual(controls.y + controls.height);
      await expect(rosterButton).toBeHidden();
      await expect(page.locator('.game-roster .game-player')).toHaveCount(4);
    } else {
      await expect(page.locator('.game-roster')).toBeHidden();
      await expect(rosterButton).toBeInViewport({ ratio: 1 });
      const boardBefore = await page.locator('.game-board-frame').boundingBox();
      await rosterButton.click();
      const dialog = page.getByRole('dialog', { name: 'Người chơi trong bàn', exact: true });
      await expect(dialog.locator('.game-player')).toHaveCount(4);
      const colors = await dialog
        .locator('.game-player-symbol')
        .evaluateAll((symbols) =>
          symbols.map((symbol) => getComputedStyle(symbol).backgroundColor),
        );
      expect(new Set(colors).size).toBe(4);
      expect(colors).not.toContain('rgba(0, 0, 0, 0)');
      await expect(dialog).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: info.outputPath(`players-${width}.png`) });
      await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
      await expect(rosterButton).toBeFocused();
      expect(await page.locator('.game-board-frame').boundingBox()).toEqual(boardBefore);
    }
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({ path: info.outputPath(`dedicated-${width}.png`) });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Danh sách bàn', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/games$'));
  await page.goBack();
  await expect(page.locator('.game-move-choices')).toBeVisible();
  await page.getByRole('button', { name: 'Về phòng nhạc', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/room/' + room + '$'));
  expect(f.games.get(match)!.players).toHaveLength(4);
});

test('relocated player list keeps joining, changing color and ready status reachable', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  f.commit(createInitialGameState(match, room, ids[0], 'Đường đua bạn bè', 'An'));
  await f.attach(context, 1);
  await openGame(page);
  const opener = page.getByRole('button', { name: 'Người chơi trong bàn', exact: true });
  const compact = info.project.name === 'mobile';
  if (compact) await opener.click();
  const roster = compact
    ? page.getByRole('dialog', { name: 'Người chơi trong bàn', exact: true })
    : page.getByRole('region', { name: 'Người chơi trong bàn', exact: true });
  await roster.locator('.ludo-color-2').getByRole('button', { name: 'Ngồi đây' }).click();
  await expect.poll(() => f.games.get(match)!.players.find((p) => p.id === ids[1])?.color).toBe(2);
  await roster.locator('.ludo-color-3').getByRole('button', { name: 'Đổi màu' }).click();
  await expect.poll(() => f.games.get(match)!.players.find((p) => p.id === ids[1])?.color).toBe(3);
  if (compact) await roster.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Tôi đã sẵn sàng', exact: true }).click();
  await expect
    .poll(() => f.games.get(match)!.players.find((p) => p.id === ids[1])?.ready)
    .toBe(true);
  if (compact) await opener.click();
  await expect(roster.locator('.ludo-color-3')).toContainText('Đã sẵn sàng');
  await page.screenshot({ path: info.outputPath('players-waiting.png') });
  expect(f.musicCommands).toEqual([]);
});

test('active local music stays visible at least 200px and Space on a horse never pauses host music', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  f.seed();
  await f.attach(context, 0);
  await fakeMusic(context);
  await page.goto(`/room/${room}`);
  await nav(page, 'Máy phát nhạc');
  await page.getByRole('button', { name: 'Nhận quyền phát nhạc', exact: true }).click();
  const iframe = page.locator('.youtube-container iframe');
  await expect(iframe).toHaveCount(1);
  const handle = await iframe.elementHandle();
  await nav(page, 'Trò chơi');
  await page.getByRole('button', { name: /Đường đua bạn bè/ }).click();
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  await expect(page.locator('.ludo-scene canvas')).toBeVisible({ timeout: 20000 });
  await fits(page, '.game-controls');
  await fits(page, '.youtube-container iframe');
  const size = (await iframe.boundingBox())!;
  expect(size.width).toBeGreaterThanOrEqual(200);
  expect(size.height).toBeGreaterThanOrEqual(200);
  const controls = (await page.locator('.game-controls').boundingBox())!;
  const dock = (await page.locator('.chat-dock').boundingBox())!;
  expect(dock.y + dock.height).toBeLessThanOrEqual(controls.y);
  await page.getByRole('button', { name: 'Tung xúc xắc', exact: true }).click();
  const horse = page
    .getByRole('group', { name: /Bàn cờ/ })
    .getByRole('button', { name: /Ngựa 1 · Đỏ/ });
  await expect(horse).toHaveAttribute('aria-disabled', 'false');
  await horse.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(0);
  expect(f.musicCommands.some((c) => c.action === 'pause')).toBe(false);
  expect(
    await handle!.evaluate((node) => node === document.querySelector('.youtube-container iframe')),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('dedicated-with-music.png') });
});

test('reduced motion and reconnect settle directly on committed positions', async ({
  page,
  context,
}) => {
  const f = gameFixture();
  f.seed();
  await f.attach(context, 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await page.getByRole('button', { name: 'Tung xúc xắc', exact: true }).click();
  await page
    .locator('.game-move-choices')
    .getByRole('button', { name: /Ngựa 1/ })
    .click();
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(0);
  expect(
    await page
      .locator('.ludo-board')
      .evaluate((board) => board.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.reload();
  await expect(page.locator('.game-dice-cube')).toHaveAttribute('data-value', '6');
  expect(
    await page
      .locator('.ludo-board')
      .evaluate((board) => board.getAnimations({ subtree: true }).length),
  ).toBe(0);
});

test('room chat recognizes a dedicated match and leaves game controls reachable', async ({
  page,
  context,
}) => {
  const f = gameFixture();
  f.seed();
  await f.attach(context, 0);
  await openGame(page);
  const before = await page.locator('.game-controls').boundingBox();
  await page.getByRole('button', { name: 'Trò chuyện', exact: true }).click();
  await page.getByRole('button', { name: 'Chat trong Nhạc & những nước đi', exact: true }).click();
  await expect(page.getByText('Phòng bạn đang nghe', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Tin nhắn của bạn')).toBeVisible();
  const chat = (await page.locator('.chat-dock').boundingBox())!;
  const controls = (await page.locator('.game-controls').boundingBox())!;
  expect(controls).toEqual(before);
  expect(
    chat.x + chat.width <= controls.x ||
      chat.x >= controls.x + controls.width ||
      chat.y + chat.height <= controls.y ||
      chat.y >= controls.y + controls.height,
  ).toBe(true);
  await page.getByRole('button', { name: 'Thu nhỏ trò chuyện', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tung xúc xắc', exact: true })).toBeEnabled();
  expect(f.musicCommands).toHaveLength(0);
});
