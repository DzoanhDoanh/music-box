import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gameFixture, ids, match, openGame, room, nav } from './fixture';
import { defaultRules } from '../../src/shared/game/contracts';
import { heroSkins, pieceSkinName } from '../../src/shared/game/piece-skins';

async function picker(page: Page) {
  await page.getByRole('button', { name: 'Tùy chọn bàn', exact: true }).click();
  await page.getByRole('button', { name: 'Quân của tôi', exact: true }).click();
  return page.getByRole('dialog', { name: 'Quân của tôi', exact: true });
}
async function closeOptions(page: Page) {
  await page
    .getByRole('dialog', { name: 'Tùy chọn bàn', exact: true })
    .getByRole('button', { name: 'Đóng', exact: true })
    .click();
}

test('each player chooses their own skin and every viewer sees it without changing a pending move', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const s = f.seed(2, { ...defaultRules, turnSeconds: 90 });
  s.players[0].pieces[0] = 2;
  s.phase = 'MOVE';
  s.dice = 1;
  s.version++;
  f.commit(s);
  const before = structuredClone(s),
    music = structuredClone(f.music.playback);
  // A saved match without a skin still uses horses, even if the device prefers a different skin.
  await context.addInitScript(
    (id) => localStorage.setItem('roomtune:ludo:skin:' + id, 'GHOST'),
    ids[0],
  );
  await f.attach(context, 0);
  const friend = await context.browser()!.newContext({ viewport: { width: 1000, height: 800 } });
  try {
    await f.attach(friend, 1);
    const friendPage = await friend.newPage();
    await openGame(friendPage);
    await openGame(page);
    const dialog = await picker(page);
    await expect(dialog.getByRole('radio')).toHaveCount(16);
    await expect(dialog.getByRole('radio', { name: 'Ngựa', exact: true })).toBeChecked();
    await dialog.getByRole('radio', { name: 'Mèo', exact: true }).check();
    for (const theme of ['dark', 'light']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      // The picker is portaled outside .game-hub: its figures must retain the team color.
      expect(
        await dialog
          .locator('.piece-picker-preview .ludo-horse')
          .evaluateAll((figures) => figures.map((figure) => getComputedStyle(figure).fill)),
      ).toEqual(Array(4).fill('rgb(239, 114, 123)'));
      await expect(
        dialog.getByRole('button', { name: 'Lưu hình quân', exact: true }),
      ).toBeInViewport({ ratio: 1 });
      expect(
        (
          await new AxeBuilder({ page })
            .include('.piece-picker')
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath('skin-picker-' + theme + '.png'),
        fullPage: true,
      });
    }
    await dialog.getByRole('button', { name: 'Lưu hình quân', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await closeOptions(page);
    for (const p of [page, friendPage])
      await expect(p.locator(`[data-piece^="${ids[0]}:"][data-skin="CAT"]`)).toHaveCount(4);
    const otherDialog = await picker(friendPage);
    await otherDialog.getByRole('radio', { name: 'Tên lửa', exact: true }).check();
    expect(
      await otherDialog
        .locator('.piece-picker-preview .ludo-horse')
        .first()
        .evaluate((figure) => getComputedStyle(figure).fill),
    ).toBe('rgb(104, 205, 165)');
    await otherDialog.getByRole('button', { name: 'Lưu hình quân', exact: true }).click();
    await expect(otherDialog).toHaveCount(0);
    await closeOptions(friendPage);
    await expect(page.locator(`[data-piece^="${ids[1]}:"][data-skin="ROCKET"]`)).toHaveCount(4);
    const after = f.games.get(match)!;
    expect(after.players.map((p) => p.pieces)).toEqual(before.players.map((p) => p.pieces));
    expect(after.turn).toBe(before.turn);
    expect(after.dice).toBe(1);
    expect(after.deadline).toBe(before.deadline);
    await page.screenshot({ path: info.outputPath('custom-pieces.png'), fullPage: true });
    await page.reload();
    await expect(page.locator(`[data-piece^="${ids[0]}:"][data-skin="CAT"]`)).toHaveCount(4);
    const cat = page
      .getByRole('group', { name: /Bàn cờ/ })
      .getByRole('button', { name: /Mèo 1 · Đỏ/ });
    await cat.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(13);
    expect(f.music.playback).toEqual(music);
    expect(f.musicCommands).toEqual([]);
  } finally {
    await friend.close();
  }
});

test('superhero figures keep their team color and numbered pieces through selection and reload', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const s = f.seed(4, { ...defaultRules, turnSeconds: 90 });
  s.players.forEach((player, i) => {
    player.skin = heroSkins[i];
    player.pieces[0] = 2 + i * 2;
  });
  s.phase = 'MOVE';
  s.dice = 1;
  f.commit(s);
  await f.attach(context, 0);
  await openGame(page);
  const dialog = await picker(page);
  await expect(
    dialog.getByRole('group', { name: 'Siêu anh hùng', exact: true }).getByRole('radio'),
  ).toHaveCount(4);
  for (const skin of heroSkins) {
    await dialog.getByRole('radio', { name: pieceSkinName(skin), exact: true }).check();
    await expect(dialog.locator(`.piece-picker-preview [data-hero="${skin}"]`)).toHaveCount(4);
    expect(
      await dialog.locator('.piece-picker-preview .ludo-piece-number').allTextContents(),
    ).toEqual(['1', '2', '3', '4']);
    expect(
      await dialog
        .locator('.piece-picker-preview .ludo-horse')
        .first()
        .evaluate((figure) => getComputedStyle(figure).fill),
    ).toBe('rgb(239, 114, 123)');
  }
  await dialog.getByRole('radio', { name: 'Siêu nhân', exact: true }).check();
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    await dialog.locator('.piece-picker-body').evaluate((body) => (body.scrollTop = 0));
    await expect(dialog.getByRole('button', { name: 'Lưu hình quân', exact: true })).toBeInViewport(
      { ratio: 1 },
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include('.piece-picker')
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await dialog.screenshot({ path: info.outputPath(`superhero-picker-${theme}.png`) });
  }
  await dialog.getByRole('button', { name: 'Lưu hình quân', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await closeOptions(page);
  await page.reload();
  for (const [i, skin] of heroSkins.entries()) {
    const pieces = page.locator(`[data-piece^="${ids[i]}:"][data-skin="${skin}"]`);
    await expect(pieces).toHaveCount(4);
    await expect(pieces.locator(`[data-hero="${skin}"]`)).toHaveCount(4);
    expect(await pieces.locator('.ludo-piece-number').allTextContents()).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
  }
  await page.screenshot({ path: info.outputPath('superhero-board.png'), fullPage: true });
  await page
    .getByRole('group', { name: /Bàn cờ/ })
    .getByRole('button', { name: /Siêu nhân 1 · Đỏ/ })
    .click();
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(13);
  expect(f.musicCommands).toEqual([]);
});

test('picker keeps save visible and the last choice reachable on small and landscape screens', async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Viewport matrix runs once on desktop Chromium.');
  const f = gameFixture();
  f.seed(2, { ...defaultRules, turnSeconds: 90 });
  await f.attach(context, 0);
  await openGame(page);
  const dialog = await picker(page);
  for (const [width, height] of [
    [320, 568],
    [844, 390],
    [1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await dialog.getByRole('radio', { name: 'Mèo', exact: true }).check();
    await dialog.getByRole('radio', { name: 'Ngôi sao', exact: true }).check();
    await expect(dialog.getByRole('radio', { name: 'Ngôi sao', exact: true })).toBeChecked();
    await expect(dialog.getByRole('button', { name: 'Lưu hình quân', exact: true })).toBeInViewport(
      { ratio: 1 },
    );
    await expect(dialog.getByRole('button', { name: 'Đóng', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await page.screenshot({
      path: info.outputPath(`skin-picker-${width}x${height}.png`),
      fullPage: true,
    });
  }
  await dialog.getByRole('button', { name: 'Lưu hình quân', exact: true }).click();
  await expect.poll(() => f.games.get(match)!.players[0].skin).toBe('STAR');
});

test('skin preference is used for the next created table and joined seat, spectators cannot change seats cosmetics', async ({
  page,
  context,
}) => {
  const f = gameFixture();
  await f.attach(context, 0);
  await page.goto(`/room/${room}`);
  await nav(page, 'Trò chơi');
  await page.getByRole('button', { name: 'Quân của tôi', exact: true }).click();
  await page.getByRole('radio', { name: 'Vương miện', exact: true }).check();
  await page.getByRole('button', { name: 'Lưu hình quân', exact: true }).click();
  await page.getByRole('button', { name: /Tạo bàn mới/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo bàn', exact: true }).click();
  await expect.poll(() => f.games.get(match)?.players[0].skin).toBe('CROWN');
  const friend = await context.browser()!.newContext();
  try {
    await friend.addInitScript(
      (id) => localStorage.setItem('roomtune:ludo:skin:' + id, 'FISH'),
      ids[1],
    );
    await f.attach(friend, 1);
    const other = await friend.newPage();
    await openGame(other);
    await other.getByRole('button', { name: 'Tùy chọn bàn', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Quân của tôi', exact: true })).toHaveCount(0);
    await closeOptions(other);
    await other.locator('.game-player').nth(1).getByRole('button', { name: 'Ngồi đây' }).click();
    await expect.poll(() => f.games.get(match)!.players[1].skin).toBe('FISH');
    await expect(page.locator(`[data-piece^="${ids[1]}:"][data-skin="FISH"]`)).toHaveCount(4);
  } finally {
    await friend.close();
  }
});

test('a lost skin response is recovered with the same receipt and remains chosen after reload', async ({
  page,
  context,
}) => {
  const f = gameFixture();
  f.seed(2, { ...defaultRules, turnSeconds: 90 });
  await f.attach(context, 0);
  await openGame(page);
  const dialog = await picker(page);
  await dialog.getByRole('radio', { name: 'Thỏ', exact: true }).check();
  f.dropReplies.add(ids[0]);
  await dialog.getByRole('button', { name: 'Lưu hình quân', exact: true }).click();
  await expect.poll(() => f.games.get(match)!.players[0].skin).toBe('RABBIT');
  const version = f.games.get(match)!.version;
  await expect(dialog.getByRole('button', { name: 'Lưu hình quân', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await closeOptions(page);
  await expect(page.getByRole('button', { name: 'Xác minh thao tác', exact: true })).toBeVisible({
    timeout: 20000,
  });
  f.dropReplies.clear();
  await page.reload();
  await page.getByRole('button', { name: 'Xác minh thao tác', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xác minh thao tác', exact: true })).toHaveCount(0);
  expect(f.games.get(match)!.version).toBe(version);
  await expect(page.locator(`[data-piece^="${ids[0]}:"][data-skin="RABBIT"]`)).toHaveCount(4);
  const requests = f.requests.filter((r) => (r.body as { action: string }).action === 'skin');
  expect(requests.length).toBeGreaterThan(1);
  expect(new Set(requests.map((r) => r.key)).size).toBe(1);
  expect(
    await page.evaluate((id) => localStorage.getItem('roomtune:ludo:skin:' + id), ids[0]),
  ).toBe('RABBIT');
});
