import { test, expect } from '@playwright/test';
import { caNguaRulesSchema, defaultRules } from '../../src/shared/game/contracts';
import { gameFixture, ids, match, openGame } from './fixture';

test('rolling one offers a system-decided step for a blocked horse and jump for a clear horse', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const initial = f.seed(2, { ...defaultRules, turnSeconds: 90 });
  await f.attach(context, 0);
  for (const piece of [0, 1]) {
    const s = structuredClone(initial);
    s.players[0].pieces = [2, 13, -1, -1];
    s.players[1].pieces[0] = 0;
    s.phase = 'MOVE';
    s.dice = 1;
    s.version += piece * 3 + 1;
    f.commit(s);
    if (piece === 0) await openGame(page);
    else await page.reload();
    const choices = page.locator('.game-move-choices');
    await expect(choices.getByRole('button')).toHaveCount(2);
    await expect(
      choices.getByRole('button', { name: 'Ngựa 1 Đi 1 bước', exact: true }),
    ).toBeVisible();
    await expect(
      choices.getByRole('button', { name: 'Ngựa 2 Nhảy tới cửa chuồng · 13 bước', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Chọn đi 1 ô hoặc nhảy', { exact: true })).toHaveCount(0);
    await expect(page.locator('.choosing-move')).toHaveCount(0);
    if (piece === 0) await page.screenshot({ path: info.outputPath('automatic-per-piece.png') });
    await choices.getByRole('button').nth(piece).click();
    await expect
      .poll(() => f.games.get(match)!.players[0].pieces[piece])
      .toBe(piece === 0 ? 3 : 27);
    expect(f.games.get(match)!.last.moveKind).toBe(piece === 0 ? 'STEP' : 'JUMP');
    expect(f.games.get(match)!.players[1].pieces[0]).toBe(0);
    expect(f.games.get(match)!.version).toBe(s.version + 1);
    await expect(page.locator('.choosing-move')).toHaveCount(0);
  }
  expect(f.musicCommands).toEqual([]);
});

test('one click chooses the automatic jump without a step/jump menu on desktop and mobile', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const s = f.seed(2, { ...defaultRules, turnSeconds: 90 });
  s.players[0].pieces[0] = 13;
  s.players[1].pieces[0] = 0;
  s.phase = 'MOVE';
  s.dice = 1;
  s.version++;
  f.commit(s);
  await f.attach(context, 0);
  await openGame(page);
  await expect(
    page.getByRole('button', { name: /Ngựa 1 Nhảy tới cửa chuồng · 13 bước/ }),
  ).toBeVisible();
  await expect(page.getByText('Chọn đi 1 ô hoặc nhảy', { exact: true })).toHaveCount(0);
  if (info.project.name === 'desktop') {
    for (const [width, height] of [
      [1366, 768],
      [320, 568],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      for (const selector of ['.game-board-frame', '.game-controls', '.game-move-choices']) {
        const rect = (await page.locator(selector).boundingBox())!;
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.y + rect.height).toBeLessThanOrEqual(height + 1);
        expect(rect.x + rect.width).toBeLessThanOrEqual(width + 1);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.screenshot({ path: info.outputPath('automatic-jump.png'), fullPage: true });
  const horse = page
    .getByRole('group', { name: /Bàn cờ/ })
    .getByRole('button', { name: /Ngựa 1 · Đỏ/ });
  if (info.project.name === 'desktop') {
    await horse.focus();
    await page.keyboard.press('Enter');
  } else await horse.click();
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(27);
  expect(f.games.get(match)!.last.moveKind).toBe('JUMP');
  expect(f.games.get(match)!.players[1].pieces[0]).toBe(0);
  await expect(page.locator('.choosing-move')).toHaveCount(0);
  await page.reload();
  await expect(horse).toHaveAttribute('aria-disabled', 'true');
  expect(f.games.get(match)!.players[0].pieces[0]).toBe(27);
  expect(f.musicCommands).toEqual([]);
});

test('a blocked jump steps across a protected start, while a blocker on the counted destination disables that horse', async ({
  page,
  context,
}) => {
  const f = gameFixture();
  const s = f.seed(2, { ...defaultRules, turnSeconds: 90 });
  s.players[0].pieces[0] = 13;
  s.players[1].pieces = [0, 2, -1, -1];
  s.phase = 'MOVE';
  s.dice = 1;
  s.version++;
  f.commit(s);
  await f.attach(context, 0);
  await openGame(page);
  await page.getByRole('button', { name: 'Ngựa 1 Đi 1 bước', exact: true }).click();
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(15);
  expect(f.games.get(match)!.last.moveKind).toBe('STEP');
  const next = structuredClone(f.games.get(match)!);
  next.players[0].pieces = [13, 15, -1, -1];
  next.turn = ids[0];
  next.phase = 'MOVE';
  next.dice = 1;
  next.version++;
  f.commit(next);
  const horse = page
    .getByRole('group', { name: /Bàn cờ/ })
    .getByRole('button', { name: /Ngựa 1 · Đỏ/ });
  await expect(horse).toHaveAttribute('aria-disabled', 'true');
  expect(f.musicCommands).toEqual([]);
});

test('automatic move with a lost reply survives reload and verification without moving twice', async ({
  page,
  context,
}) => {
  const f = gameFixture();
  const s = f.seed(2, { ...defaultRules, turnSeconds: 90 });
  s.players[0].pieces[0] = 2;
  s.phase = 'MOVE';
  s.dice = 1;
  s.version++;
  f.commit(s);
  await f.attach(context, 0);
  await openGame(page);
  f.dropReplies.add(ids[0]);
  await page.getByRole('button', { name: /Ngựa 1 Nhảy tới cửa chuồng/ }).click();
  await expect(page.getByRole('button', { name: 'Xác minh thao tác', exact: true })).toBeVisible({
    timeout: 20000,
  });
  expect(f.games.get(match)!.players[0].pieces[0]).toBe(13);
  const version = f.games.get(match)!.version;
  f.dropReplies.clear();
  await page.reload();
  await page.getByRole('button', { name: 'Xác minh thao tác', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xác minh thao tác', exact: true })).toHaveCount(0);
  expect(f.games.get(match)!.version).toBe(version);
  expect(f.games.get(match)!.players[0].pieces[0]).toBe(13);
  const requests = f.requests.filter((r) => (r.body as { action: string }).action === 'move');
  expect(requests.length).toBeGreaterThan(1);
  expect(new Set(requests.map((r) => r.key)).size).toBe(1);
});

test('waiting saved table can adopt the new movement explicitly and keeps its other settings', async ({
  page,
  context,
}) => {
  const f = gameFixture();
  const rules = caNguaRulesSchema.parse({
    variant: 'CANGUA_V2',
    safe: 'STARTS',
    turnSeconds: 90,
    entry: 'ONE_OR_SIX',
  });
  const s = f.seed(2, rules);
  s.status = 'READY';
  s.phase = 'ROLL';
  s.dice = null;
  s.turn = null;
  s.deadline = null;
  s.version++;
  f.commit(s);
  await f.attach(context, 0);
  await openGame(page);
  await page.getByRole('button', { name: 'Tùy chọn bàn', exact: true }).click();
  await page.getByRole('button', { name: 'Tùy chỉnh luật', exact: true }).click();
  await page.getByRole('button', { name: 'Áp dụng luật di chuyển mới', exact: true }).click();
  await expect(page.getByText('Di chuyển tự động theo từng quân', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lưu luật chơi', exact: true }).click();
  await expect
    .poll(() => f.games.get(match)!.rules)
    .toEqual({ ...rules, safe: 'STARTS', jumpOnOne: true, movement: 'SPAWN_ONLY_AUTO_JUMP' });
  expect(f.games.get(match)!.players.every((p) => !p.ready)).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Tùy chỉnh luật', exact: true })).toHaveCount(0);
  await page
    .getByRole('dialog', { name: 'Tùy chọn bàn', exact: true })
    .getByRole('button', { name: 'Đóng', exact: true })
    .click();
  await page.getByRole('button', { name: 'Luật chơi', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('bỏ qua ô đó khi đếm bước');
  await expect(page.getByRole('dialog')).toContainText('chọn ngựa là tự nhảy');
});
