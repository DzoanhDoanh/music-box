import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gameFixture, ids, match, openGame } from './fixture';
import { defaultRules } from '../../src/shared/game/contracts';
import { pieceSkins } from '../../src/shared/game/piece-skins';

test('camera rotates and zooms without making a move; projected targets remain clickable and reset works', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const state = f.seed(2, { ...defaultRules, turnSeconds: 90 });
  state.players[0].pieces[0] = 9;
  state.players[1].pieces[0] = 55;
  state.phase = 'MOVE';
  state.dice = 1;
  state.version++;
  f.commit(state);
  await f.attach(context, 0);
  await openGame(page);
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  const viewport = page.locator('.ludo-viewport'),
    canvas = page.locator('.ludo-scene canvas');
  await expect(canvas).toBeVisible({ timeout: 20000 });
  const originalYaw = await viewport.getAttribute('data-camera-yaw');
  const original = await page.locator(`[data-piece="${ids[0]}:0"]`).boundingBox();
  if (info.project.name === 'desktop') {
    // Starting a drag on the movable horse must never submit that horse's move.
    await page.mouse.move(original!.x + original!.width / 2, original!.y + original!.height / 2);
    await page.mouse.down();
    await page.mouse.move(original!.x + 95, original!.y + 30, { steps: 12 });
    await page.mouse.up();
    const bounds = (await viewport.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, -130);
  } else {
    const bounds = (await viewport.boundingBox())!;
    const cx = bounds.x + bounds.width / 2,
      cy = bounds.y + bounds.height / 2;
    const session = await context.newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: cx - 25, y: cy, id: 0 },
          { x: cx + 25, y: cy, id: 1 },
        ],
      });
      for (let i = 1; i <= 6; i++)
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: cx - 25 + i * 2, y: cy + i * 2, id: 0 },
            { x: cx + 25 + i * 6, y: cy + i * 2, id: 1 },
          ],
        });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await session.detach();
    }
  }
  await expect(viewport).not.toHaveAttribute('data-camera-yaw', originalYaw!);
  await expect
    .poll(async () => Number(await viewport.getAttribute('data-camera-zoom')))
    .toBeGreaterThan(1);
  expect(f.games.get(match)!.version).toBe(state.version);
  expect(f.requests.filter((r) => (r.body as { action: string }).action === 'move')).toHaveLength(
    0,
  );
  const moved = await page.locator(`[data-piece="${ids[0]}:0"]`).boundingBox();
  expect(Math.abs(moved!.x - original!.x) + Math.abs(moved!.y - original!.y)).toBeGreaterThan(15);
  await page.screenshot({ path: info.outputPath('board-rotated-sharp.png') });
  // Pinch zoom intentionally crops the far edge. Zoom out without resetting rotation
  // before tapping that edge, just as a player would; never force a clipped target.
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Thu nhỏ bàn cờ', exact: true }).tap();
    await page.getByRole('button', { name: 'Thu nhỏ bàn cờ', exact: true }).tap();
    await page.getByRole('button', { name: 'Thu nhỏ bàn cờ', exact: true }).tap();
  }
  // Resizing must preserve camera orientation and reproject both models and controls.
  await page.setViewportSize(
    info.project.name === 'desktop' ? { width: 1366, height: 900 } : { width: 393, height: 852 },
  );
  await expect(viewport).not.toHaveAttribute('data-camera-yaw', originalYaw!);
  // A rotated board's destination is projected with the same camera, including an enemy underneath.
  if (info.project.name === 'desktop') await page.locator('[data-destination="13"]').click();
  else await page.locator('[data-destination="13"]').tap();
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(13);
  expect(f.games.get(match)!.players[1].pieces[0]).toBe(-1);
  await page.getByRole('button', { name: 'Đặt lại góc nhìn', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-camera-yaw', originalYaw!);
  await expect(viewport).toHaveAttribute('data-camera-zoom', '1.0000');
  const ratio = () =>
    canvas.evaluate((c) => (c as HTMLCanvasElement).width / c.getBoundingClientRect().width);
  await expect.poll(ratio).toBeGreaterThan(1.9);
  await page.getByRole('button', { name: 'Đồ họa: Rõ nét', exact: true }).click();
  await expect.poll(ratio).toBeLessThan(1.1);
  await page.getByRole('button', { name: 'Đồ họa: Nhẹ', exact: true }).click();
  await expect.poll(ratio).toBeGreaterThan(1.9);
  await page.screenshot({ path: info.outputPath('board-sharp-reset.png') });
  expect(f.musicCommands).toEqual([]);
});

test('3D board renders sculpted pieces, preserves selection, and captures through the real controls', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const s = f.seed(4, { ...defaultRules, turnSeconds: 90 });
  s.players[0].pieces = [9, -1, -1, -1];
  s.players[1].pieces = [55, -1, -1, -1];
  s.players[2].skin = 'HERO';
  s.players[3].skin = 'CAT';
  s.phase = 'MOVE';
  s.dice = 1;
  s.version++;
  f.commit(s);
  await f.attach(context, 0);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openGame(page);
  await expect(page.locator('svg.ludo-board')).toBeVisible(); // Existing default remains flat.
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  await expect(page.locator('.ludo-scene canvas')).toBeVisible({ timeout: 20000 });
  // Wait for the first rendered frame, not just the empty Canvas element.
  await expect
    .poll(() => page.locator('.ludo-scene canvas').evaluate((c) => (c as HTMLCanvasElement).width))
    .toBeGreaterThan(100);
  await page.screenshot({ path: info.outputPath('board-3d.png') });
  expect(
    (await new AxeBuilder({ page }).include('.game-hub').withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
  const horse = page.locator(`[data-piece="${ids[0]}:0"]`);
  await expect(horse).toHaveAttribute('aria-disabled', 'false');
  if (info.project.name === 'desktop') {
    await horse.focus();
    await page.keyboard.press('Space');
  } else await horse.tap();
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(13);
  await expect.poll(() => f.games.get(match)!.players[1].pieces[0]).toBe(-1);
  await expect(page.locator(`[data-piece="${ids[1]}:0"]`)).toHaveAccessibleName(/chưa ra quân/);
  await page.reload();
  await expect(page.locator('.ludo-scene canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Phẳng', exact: true }).click();
  await expect(page.locator('svg.ludo-board')).toBeVisible();
  expect(f.requests.filter((r) => (r.body as { action: string }).action === 'move')).toHaveLength(
    1,
  );
  expect(f.musicCommands).toEqual([]);
  expect(errors).toEqual([]);
});

test('3D destinations under enemy pieces remain tappable, controls fit phones and short screens', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const s = f.seed(2, { ...defaultRules, turnSeconds: 90 });
  s.players[0].pieces = [13, 5, -1, -1];
  s.players[1].pieces = [0, 2, -1, -1];
  s.phase = 'MOVE';
  s.dice = 2;
  s.version++;
  f.commit(s);
  await f.attach(context, 0);
  await openGame(page);
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  await expect(page.locator('.ludo-scene canvas')).toBeVisible();
  const sizes =
    info.project.name === 'desktop'
      ? [
          [1366, 768],
          [1024, 768],
          [844, 390],
        ]
      : [
          [390, 844],
          [320, 568],
        ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const selector of [
      '.game-board-frame',
      '.game-controls',
      '.game-move-choices',
      '.game-view-switch',
    ]) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`board-3d-${width}.png`) });
  }
  // Collision-free overlay lets a destination beneath the opponent receive the tap.
  await page.locator('[data-destination="16"]').click();
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(16);
  expect(f.games.get(match)!.players[1].pieces).toEqual([0, -1, -1, -1]);
  expect(f.musicCommands).toEqual([]);
});

test('all saved skins render, reduced motion works, and graphics context loss falls back without losing the turn', async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'GPU recovery and all models run once.');
  const f = gameFixture();
  const s = f.seed(4, { ...defaultRules, turnSeconds: 90 });
  s.phase = 'MOVE';
  s.dice = 6;
  s.version++;
  f.commit(s);
  await f.attach(context, 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  await expect(page.locator('.ludo-scene')).toHaveAttribute('data-motion', 'reduced');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (let i = 0; i < pieceSkins.length; i += 4) {
    const next = structuredClone(f.games.get(match)!);
    next.players.forEach((p, n) => (p.skin = pieceSkins[i + n].id));
    next.version++;
    f.commit(next);
    for (let n = 0; n < 4; n++)
      await expect(page.locator(`[data-piece="${ids[n]}:0"]`)).toHaveAttribute(
        'data-skin',
        pieceSkins[i + n].id,
      );
    await page.screenshot({ path: info.outputPath(`models-${i}.png`) });
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    expect(
      (
        await new AxeBuilder({ page })
          .include('.game-hub')
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page
    .locator('.ludo-scene canvas')
    .evaluate((c) => c.dispatchEvent(new Event('webglcontextlost')));
  await expect(page.locator('svg.ludo-board')).toBeVisible();
  await expect(
    page.getByText('Thiết bị chưa hỗ trợ 3D. Bạn vẫn chơi được trên bàn phẳng.'),
  ).toBeVisible();
  await page.locator('.game-move-choices button').first().click();
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(0);
  expect(errors).toEqual([]);
});
