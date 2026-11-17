import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gameFixture, room, match, ids, openGame, nav, fakeMusic } from './fixture';
import { getLegalMoves } from '../../src/shared/game/engine';
import { caNguaRulesSchema } from '../../src/shared/game/contracts';

test('four independent players create, choose seats, ready, finish a whole game and rematch', async ({
  browser,
}, info) => {
  test.skip(
    info.project.name === 'mobile',
    'Full multi-context flow runs on desktop; mobile gets dedicated coverage.',
  );
  test.setTimeout(240000);
  const f = gameFixture(),
    contexts = await Promise.all(ids.slice(0, 4).map(() => browser.newContext()));
  const pages: Page[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      await f.attach(contexts[i], i);
      pages.push(await contexts[i].newPage());
      await pages[i].emulateMedia({ reducedMotion: 'reduce' });
    }
    await pages[0].goto(`/room/${room}`);
    await nav(pages[0], 'Trò chơi');
    await pages[0].getByRole('button', { name: /Tạo bàn mới/ }).click();
    const dialog = pages[0].getByRole('dialog');
    await dialog.getByLabel('Tên bàn', { exact: true }).fill('Đường đua bạn bè');
    await expect(
      dialog.getByText('Di chuyển tự động theo từng quân', { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Ô xuất quân', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await dialog.getByLabel('Thời gian mỗi lượt').selectOption('90');
    await dialog.getByRole('button', { name: 'Tạo bàn', exact: true }).click();
    await expect(pages[0].getByRole('group', { name: /Bàn cờ/ })).toBeVisible();
    expect(f.games.get(match)!.rules).toMatchObject({
      movement: 'SPAWN_ONLY_AUTO_JUMP',
      safe: 'STARTS',
      jumpOnOne: true,
    });
    for (let i = 1; i < 4; i++) {
      await openGame(pages[i]);
      await pages[i]
        .locator('.game-player')
        .nth(i)
        .getByRole('button', { name: 'Ngồi đây' })
        .click();
      await expect.poll(() => f.games.get(match)?.players.length).toBe(i + 1);
    }
    for (const page of pages)
      await page.getByRole('button', { name: 'Tôi đã sẵn sàng', exact: true }).click();
    await pages[0].getByRole('button', { name: 'Bắt đầu ván', exact: true }).click();
    await expect.poll(() => f.games.get(match)?.status).toBe('PLAYING');
    const beforeMusic = structuredClone(f.music.playback);
    let actions = 0;
    while (f.games.get(match)!.status === 'PLAYING' && actions++ < 600) {
      const s = f.games.get(match)!,
        page = pages[ids.indexOf(s.turn!)];
      if (s.phase === 'ROLL')
        await page.getByRole('button', { name: 'Tung xúc xắc', exact: true }).click();
      else {
        const move = getLegalMoves(s).sort((a, b) => b.to - a.to)[0];
        await page
          .locator('.game-move-choices')
          .getByRole('button', { name: new RegExp('Ngựa ' + (move.piece + 1)) })
          .click();
        if (getLegalMoves(s).filter((m) => m.piece === move.piece).length > 1)
          await page
            .locator('.game-move-choices')
            .getByRole('button', {
              name: move.moveKind === 'JUMP' ? /Nhảy tới cửa chuồng/ : /Đi 1 bước/,
            })
            .click();
      }
      await expect.poll(() => f.games.get(match)!.version).toBeGreaterThan(s.version);
    }
    expect(f.games.get(match)!.status).toBe('FINISHED');
    for (const page of pages)
      await expect(page.getByRole('region', { name: 'Kết quả ván' })).toBeVisible();
    expect(new Set(f.games.get(match)!.players.map((p) => p.rank)).size).toBe(4);
    expect(f.music.playback).toEqual(beforeMusic);
    expect(f.musicCommands).toEqual([]);
    await pages[0].getByRole('button', { name: 'Chơi lại', exact: true }).click();
    for (const page of pages)
      await expect(
        page.getByRole('button', { name: 'Tôi đã sẵn sàng', exact: true }),
      ).toBeVisible();
    expect(f.games.get(match)!.round).toBe(2);
    expect(f.view(match).results).toHaveLength(1);
  } finally {
    for (const context of contexts) await context.close();
  }
});

test('pending roll survives reload; missed events and revoked access recover safely', async ({
  page,
  context,
}) => {
  const f = gameFixture();
  f.seed();
  await f.attach(context, 0);
  await openGame(page);
  f.dropReplies.add(ids[0]);
  await page.getByRole('button', { name: 'Tung xúc xắc', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xác minh thao tác', exact: true })).toBeVisible({
    timeout: 20000,
  });
  const first = f.requests.find((r) => (r.body as { action: string }).action === 'roll')!;
  expect(f.games.get(match)!.dice).toBe(6);
  const version = f.games.get(match)!.version;
  f.dropReplies.clear();
  await page.reload();
  await page.getByRole('button', { name: 'Xác minh thao tác', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xác minh thao tác', exact: true })).toHaveCount(0);
  expect(f.games.get(match)!.version).toBe(version);
  expect(
    f.requests
      .filter((r) => (r.body as { action: string }).action === 'roll')
      .every((r) => r.key === first.key),
  ).toBe(true);
  f.setMissedEvents(true);
  const state = structuredClone(f.games.get(match)!);
  state.status = 'PAUSED';
  state.deadline = null;
  state.remaining = 45000;
  state.version++;
  f.commit(state);
  await expect(page.getByRole('button', { name: 'Tiếp tục ván', exact: true })).toBeVisible({
    timeout: 10000,
  });
  f.revoked.add(ids[0]);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('group', { name: /Bàn cờ cá ngựa/ })).toHaveCount(0);
});

test('spectator, keyboard, mobile layout, themes, rules and reduced motion', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  f.seed();
  await f.attach(context, 4);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await expect(page.getByText('BÀN LUẬT CŨ · 52 Ô', { exact: true })).toBeVisible();
  await expect(page.locator('[data-home] .ludo-lane-number')).toHaveCount(24);
  // The old central decoration used to cover rank 6 in all four home lanes.
  const center = (await page.locator('.ludo-center').boundingBox())!;
  for (const color of [0, 1, 2, 3]) {
    const rank = (await page.locator(`[data-home="${color}:6"]`).boundingBox())!;
    expect(
      center.x >= rank.x + rank.width ||
        center.x + center.width <= rank.x ||
        center.y >= rank.y + rank.height ||
        center.y + center.height <= rank.y,
    ).toBe(true);
  }
  await expect(page.getByRole('button', { name: 'Tung xúc xắc', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Đầu hàng', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Luật chơi', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const violations = (
      await new AxeBuilder({ page }).include('.game-hub').withTags(['wcag2a', 'wcag2aa']).analyze()
    ).violations;
    expect(violations).toEqual([]);
    await page.locator('.game-hub').screenshot({ path: info.outputPath(`game-${theme}.png`) });
  }
});

for (const role of ['host', 'listener'] as const)
  test(`game navigation preserves the same ${role} music iframe`, async ({ page, context }) => {
    const f = gameFixture();
    f.seed();
    const index = role === 'host' ? 0 : 1;
    await f.attach(context, index);
    await fakeMusic(context);
    await page.goto(`/room/${room}`);
    if (role === 'host') {
      await nav(page, 'Máy phát nhạc');
      await page.getByRole('button', { name: 'Nhận quyền phát nhạc', exact: true }).click();
    } else {
      f.music.playback.controller_id = '60000000-0000-4000-8000-000000000001';
      await page.getByRole('button', { name: 'Bật nghe trên thiết bị này', exact: true }).click();
    }
    const frame = page.locator('.youtube-container iframe');
    await expect(frame).toHaveCount(1);
    const handle = await frame.elementHandle();
    const dangerousBefore = f.musicCommands.filter(
      (c) => !['heartbeat', 'report', 'claim'].includes(String(c.action)),
    );
    await nav(page, 'Trò chơi');
    await page.getByRole('button', { name: /Đường đua bạn bè/ }).click();
    await expect(page.getByRole('group', { name: /Bàn cờ/ })).toBeVisible();
    await nav(page, 'Tìm & thêm bài');
    await nav(page, 'Trò chơi');
    await nav(page, 'Không gian nghe');
    expect(
      await handle!.evaluate(
        (node) => node === document.querySelector('.youtube-container iframe'),
      ),
    ).toBe(true);
    expect(
      f.musicCommands.filter((c) => !['heartbeat', 'report', 'claim'].includes(String(c.action))),
    ).toEqual(dangerousBefore);
  });

test('legal horses are operable with keyboard and surrender requires confirmation', async ({
  page,
  context,
}) => {
  const f = gameFixture();
  f.seed();
  await f.attach(context, 0);
  await openGame(page);
  await page.getByRole('button', { name: 'Tung xúc xắc', exact: true }).click();
  const horse = page
    .getByRole('group', { name: /Bàn cờ/ })
    .getByRole('button', { name: /Ngựa 1 · Đỏ/ });
  await expect(horse).toHaveAttribute('aria-disabled', 'false');
  await horse.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(0);
  await page.getByRole('button', { name: 'Tùy chọn bàn', exact: true }).click();
  await page.getByRole('button', { name: 'Đầu hàng', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Đầu hàng ván này?' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(f.games.get(match)!.players[0].status).toBe('ACTIVE');
});

test('saved v2 shows all home ranks and retains explicit jump choices', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const s = f.seed(
    2,
    caNguaRulesSchema.parse({ variant: 'CANGUA_V2', safe: 'STARTS', turnSeconds: 90 }),
  );
  s.players[0].pieces[0] = 2;
  s.dice = 1;
  s.phase = 'MOVE';
  s.version++;
  f.commit(s);
  await f.attach(context, 0);
  await openGame(page);
  await expect(page.locator('[data-track]')).toHaveCount(56);
  await expect(page.locator('[data-gate]')).toHaveCount(4);
  await expect(page.locator('[data-home]')).toHaveCount(24);
  const horse = page
    .getByRole('group', { name: /Bàn cờ/ })
    .getByRole('button', { name: /Ngựa 1 · Đỏ/ });
  await horse.focus();
  await page.keyboard.press('Enter');
  expect(f.games.get(match)!.players[0].pieces[0]).toBe(2);
  const jump = page.getByRole('button', { name: /Ngựa 1 Nhảy tới cửa chuồng/ });
  await expect(jump).toBeVisible();
  await expect(page.getByRole('button', { name: /Ngựa 1 Đi 1 bước/ })).toBeFocused();
  if (info.project.name === 'desktop') {
    for (const [width, height] of [
      [1366, 768],
      [1024, 768],
      [390, 844],
      [320, 568],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      for (const selector of ['.game-board-frame', '.game-controls', '.game-move-choices']) {
        const rect = (await page.locator(selector).boundingBox())!;
        expect(rect.y, selector).toBeGreaterThanOrEqual(0);
        expect(rect.y + rect.height, selector).toBeLessThanOrEqual(height + 1);
        expect(rect.x + rect.width, selector).toBeLessThanOrEqual(width + 1);
      }
      expect(await page.evaluate(() => scrollY)).toBe(0);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include('.game-hub')
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath('cangua-v2-' + theme + '.png'), fullPage: true });
  }
  await jump.click();
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(13);
  expect(f.games.get(match)!.last.moveKind).toBe('JUMP');
  await page.reload();
  await expect(page.getByRole('button', { name: /Ngựa 1 · Đỏ/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(f.games.get(match)!.players[0].pieces[0]).toBe(13);
  expect(f.musicCommands).toEqual([]);
});
