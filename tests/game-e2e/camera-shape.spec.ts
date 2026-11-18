import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { defaultRules } from '../../src/shared/game/contracts';
import { gameFixture, ids, match, openGame } from './fixture';

// Three resting pieces form a square on the board. Its projected singular values
// measure flattening independently of yaw, viewport shape and zoom.
async function boardShape(page: Page) {
  return page.locator('.ludo-viewport').evaluate((host, actor) => {
    const points = [0, 1, 2].map((piece) => {
      const node = host.querySelector<HTMLElement>(`[data-piece="${actor}:${piece}"]`)!;
      return { x: parseFloat(node.style.left), y: parseFloat(node.style.top) };
    });
    const u = { x: points[1].x - points[0].x, y: points[1].y - points[0].y };
    const v = { x: points[2].x - points[0].x, y: points[2].y - points[0].y };
    const a = u.x ** 2 + u.y ** 2;
    const b = u.x * v.x + u.y * v.y;
    const d = v.x ** 2 + v.y ** 2;
    const discriminant = Math.hypot(a - d, 2 * b);
    return Math.sqrt((a + d - discriminant) / (a + d + discriminant));
  }, ids[0]);
}

async function tilt(page: Page, context: BrowserContext, mobile: boolean, direction: number) {
  const bounds = (await page.locator('.ludo-viewport').boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const distance = Math.min(160, bounds.height * 0.65);
  const y = bounds.y + bounds.height / 2 + (direction * distance) / 2;
  if (!mobile) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - direction * distance, { steps: 12 });
    await page.mouse.up();
    return;
  }
  const session = await context.newCDPSession(page);
  try {
    const touches = (offset: number) => [
      { x: x - 30, y: y - offset, id: 0 },
      { x: x + 30, y: y - offset, id: 1 },
    ];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(0) });
    for (let step = 1; step <= 12; step++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: touches((direction * distance * step) / 12),
      });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

test('board keeps its shape at the tilt limit, after resize and when resetting', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const state = f.seed(4, { ...defaultRules, turnSeconds: 90 });
  await f.attach(context, 0);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page);
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  const canvas = page.locator('.ludo-scene canvas');
  const viewport = page.locator('.ludo-viewport');
  await expect(canvas).toBeVisible();
  await expect(viewport).toHaveAttribute('data-camera-yaw', '0.0000');
  await expect.poll(() => boardShape(page)).toBeGreaterThan(0.7);
  expect(await boardShape(page)).toBeLessThan(0.73);
  const initialShape = await boardShape(page);
  await page.screenshot({ path: info.outputPath('board-default-3d.png') });
  const mobile = info.project.name === 'mobile';
  await tilt(page, context, mobile, 1);
  await page.screenshot({ path: info.outputPath('board-max-tilt.png') });
  await expect.poll(() => boardShape(page)).toBeGreaterThan(0.7);
  expect(await boardShape(page)).toBeLessThan(0.73);

  await page.getByRole('button', { name: 'Xoay bàn sang trái', exact: true }).click();
  const sizes = mobile
    ? [
        [320, 568],
        [844, 390],
        [390, 844],
      ]
    : [
        [1920, 1080],
        [1366, 768],
        [1024, 768],
      ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => boardShape(page)).toBeGreaterThan(0.7);
    await expect
      .poll(() =>
        canvas.evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          const bounds = canvas.getBoundingClientRect();
          return Math.abs(canvas.width / canvas.height / (bounds.width / bounds.height) - 1);
        }),
      )
      .toBeLessThan(0.01);
    await expect(page.locator('.game-controls')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath(`board-proportions-${width}.png`) });
  }
  await tilt(page, context, mobile, -1);
  await expect.poll(() => boardShape(page)).toBeGreaterThan(0.98);
  await page.getByRole('button', { name: 'Đặt lại góc nhìn', exact: true }).click();
  expect(await boardShape(page)).toBeCloseTo(initialShape, 3);
  await expect(viewport).toHaveAttribute('data-camera-yaw', '0.0000');
  await page.getByRole('button', { name: 'Xoay bàn sang trái', exact: true }).click();
  await page.getByRole('button', { name: 'Phẳng', exact: true }).click();
  await expect(page.locator('svg.ludo-board')).toBeVisible();
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  await expect(canvas).toBeVisible();
  await expect(viewport).toHaveAttribute('data-camera-yaw', '0.0000');
  expect(await boardShape(page)).toBeCloseTo(initialShape, 3);
  expect(f.games.get(match)!.version).toBe(state.version);
  expect(f.requests.filter((r) => (r.body as { action: string }).action === 'move')).toHaveLength(
    0,
  );
  expect(f.musicCommands).toEqual([]);
  expect(errors).toEqual([]);
});
