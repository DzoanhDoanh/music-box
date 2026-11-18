import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gameFixture, ids, match, openGame } from './fixture';
import { defaultRules } from '../../src/shared/game/contracts';

test('effect catalogue replays and stops locally, restores focus and preserves the real board', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const state = f.seed(2, { ...defaultRules, turnSeconds: 90 });
  state.players[0].skin = 'HERO';
  f.commit(state);
  await f.attach(context, 0);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install();
  await openGame(page);
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  await page.getByRole('button', { name: 'Xoay bàn sang trái', exact: true }).click();
  const yaw = await page.locator('.ludo-viewport').getAttribute('data-camera-yaw');
  const unchanged = structuredClone(f.games.get(match));
  const requests = f.requests.length;
  const opener = page.getByRole('button', { name: 'Thử hiệu ứng', exact: true });
  await expect(opener).toBeInViewport({ ratio: 1 });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Thử hiệu ứng', exact: true });
  await expect(dialog.getByRole('combobox', { name: 'Hiệu ứng', exact: true })).toHaveValue(
    'capture-burst',
  );
  const stage = dialog.locator('.effect-preview-stage');
  await expect(stage.locator('canvas')).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include('.effect-preview-dialog')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await dialog.getByRole('button', { name: 'Xem thử K/O', exact: true }).click();
  await expect(dialog.locator('.ludo-finisher')).toHaveAttribute('data-phase', 'impact');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.clock.runFor(200);
  await page.screenshot({ path: info.outputPath('effect-preview.png') });
  await page.clock.resume();
  await expect(stage).toHaveAttribute('data-playing', 'false', { timeout: 10000 });
  await dialog.getByRole('button', { name: 'Phát lại', exact: true }).click();
  await expect(stage).toHaveAttribute('data-playing', 'true');
  await dialog.getByRole('button', { name: 'Dừng', exact: true }).click();
  await expect(stage).toHaveAttribute('data-playing', 'false');
  await expect(dialog.locator('.ludo-finisher')).toBeHidden();
  await dialog.getByRole('button', { name: 'Phát lại', exact: true }).click();
  await dialog.getByRole('button', { name: 'Phát lại', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator('.effect-preview-stage')).toHaveCount(0);
  await expect(page.locator('.ludo-viewport')).toHaveAttribute('data-camera-yaw', yaw!);
  await expect(page.locator(`[data-piece="${ids[0]}:0"]`)).toHaveAccessibleName(/chưa ra quân/);
  await opener.click();
  await expect(dialog.getByRole('button', { name: 'Xem thử K/O', exact: true })).toBeEnabled();
  await expect(stage).toHaveAttribute('data-playing', 'false');
  await page.keyboard.press('Escape');
  expect(f.games.get(match)).toEqual(unchanged);
  expect(f.requests).toHaveLength(requests);
  expect(f.musicCommands).toEqual([]);
  expect(errors).toEqual([]);
});

test('preview fits a small viewport, respects reduced motion and isolates WebGL failure', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  f.seed(2, { ...defaultRules, turnSeconds: 90 });
  await f.attach(context, 0);
  await page.setViewportSize(
    info.project.name === 'desktop' ? { width: 844, height: 390 } : { width: 320, height: 568 },
  );
  await openGame(page);
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  const opener = page.getByRole('button', { name: 'Thử hiệu ứng', exact: true });
  await expect(opener).toBeInViewport({ ratio: 1 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Thử hiệu ứng', exact: true });
  await expect(dialog).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole('button', { name: 'Xem thử K/O', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('status')).toContainText('giảm chuyển động');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await dialog.getByRole('button', { name: 'Xem thử K/O', exact: true }).click();
  await expect(dialog.locator('.effect-preview-stage')).toHaveAttribute('data-playing', 'true');
  await dialog.locator('canvas').evaluate((c) => c.dispatchEvent(new Event('webglcontextlost')));
  await expect(dialog.locator('.effect-preview-error')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Phát lại', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page.locator('.ludo-scene canvas')).toBeVisible();
  await expect(opener).toBeFocused();
  expect(f.musicCommands).toEqual([]);
});
