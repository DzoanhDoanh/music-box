import { test, expect } from '@playwright/test';
import { gameFixture, ids, match, openGame } from './fixture';
import { defaultRules } from '../../src/shared/game/contracts';
import { pauseAnimationClock } from './animation-clock';

function captureFixture() {
  const f = gameFixture();
  const state = f.seed(2, { ...defaultRules, turnSeconds: 90 });
  state.players[0].skin = 'CAT';
  state.players[0].pieces = [8, -1, -1, -1];
  state.players[1].pieces = [1, -1, -1, -1];
  state.dice = 6;
  state.phase = 'MOVE';
  state.version++;
  f.commit(state);
  return f;
}

test('Goku preview transforms an animal, restores it, stops cleanly and never edits the game', async ({
  page,
  context,
}, info) => {
  const f = captureFixture();
  await f.attach(context, 0);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install();
  await openGame(page);
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Đồ họa: Rõ nét', exact: true }).click();
  const before = structuredClone(f.games.get(match)),
    count = f.requests.length;
  const opener = page.getByRole('button', { name: 'Thử hiệu ứng', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Thử hiệu ứng', exact: true });
  await dialog.getByRole('combobox', { name: 'Hiệu ứng', exact: true }).selectOption('kamehameha');
  const effect = dialog.locator('.ludo-finisher');
  await expect(effect).toHaveAttribute('data-attacker-form', 'piece');
  await dialog.getByRole('button', { name: 'Xem thử Kamehameha', exact: true }).click();
  await pauseAnimationClock(page);
  await page.clock.runFor(1000);
  await expect(effect).toHaveAttribute('data-attacker-form', 'goku');
  await expect(effect).toHaveAttribute('data-beam-phase', 'charging');
  await page.screenshot({ path: info.outputPath('goku-charge.png') });
  await page.clock.runFor(650);
  await expect(effect).toHaveAttribute('data-beam-phase', 'firing');
  await page.screenshot({ path: info.outputPath('goku-beam.png') });
  await page.clock.runFor(250);
  await expect(effect).toHaveAttribute('data-phase', 'impact');
  await page.screenshot({ path: info.outputPath('goku-impact.png') });
  await page.clock.runFor(1000);
  await expect(effect).toHaveAttribute('data-attacker-form', 'piece');
  await page.screenshot({ path: info.outputPath('goku-restored.png') });
  await page.clock.resume();
  await expect(dialog.locator('.effect-preview-stage')).toHaveAttribute('data-playing', 'false', {
    timeout: 10000,
  });
  await dialog.getByRole('button', { name: 'Phát lại', exact: true }).click();
  await expect(effect).toHaveAttribute('data-attacker-form', 'goku');
  await dialog.getByRole('button', { name: 'Dừng', exact: true }).click();
  await expect(effect).toHaveAttribute('data-attacker-form', 'piece');
  await expect(effect).toBeHidden();
  await dialog.getByRole('button', { name: 'Phát lại', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(dialog.locator('.effect-preview-stage')).toHaveAttribute('data-playing', 'false');
  await expect(effect).toHaveAttribute('data-attacker-form', 'piece');
  await expect(dialog.getByRole('button', { name: 'Phát lại', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  expect(f.games.get(match)).toEqual(before);
  expect(f.requests).toHaveLength(count);
  expect(f.musicCommands).toEqual([]);
  expect(errors).toEqual([]);
});

test('Goku capture persists only the effect choice, restores the saved skin and consumes interrupted transformations', async ({
  page,
  context,
}, info) => {
  const f = captureFixture();
  await f.attach(context, 0);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openGame(page);
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Đồ họa: Rõ nét', exact: true }).click();
  const opener = page.getByRole('button', { name: 'Thử hiệu ứng', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Thử hiệu ứng', exact: true });
  const picker = dialog.getByRole('combobox', { name: 'Hiệu ứng', exact: true });
  await opener.click();
  await picker.selectOption('kamehameha');
  await dialog.getByRole('button', { name: 'Dùng Kamehameha', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await opener.click();
  await expect(picker).toHaveValue('kamehameha');
  await expect(dialog.locator('.effect-preview-stage')).toHaveAttribute('data-playing', 'false');
  await page.keyboard.press('Escape');
  const piece = page.locator(`[data-piece="${ids[0]}:0"]`);
  await piece.click();
  const effect = page.locator('.ludo-viewport .ludo-finisher');
  await expect(effect).toHaveAttribute('data-effect', 'kamehameha');
  await expect(effect).toHaveAttribute('data-attacker-form', 'goku');
  await expect(effect).toHaveAttribute('data-phase', 'impact', { timeout: 10000 });
  await page.screenshot({ path: info.outputPath('goku-capture.png') });
  await expect(effect).toHaveAttribute('data-attacker-form', 'piece');
  await expect(effect).toHaveAttribute('data-phase', 'done', { timeout: 10000 });
  expect(f.games.get(match)!.players[0].skin).toBe('CAT');
  expect(f.games.get(match)!.players[1].pieces[0]).toBe(-1);
  await expect(piece).toHaveAccessibleName(/Mèo 1/);
  f.commit(structuredClone(f.games.get(match)!));
  await expect(effect).toHaveAttribute('data-phase', 'done');

  // Interrupt another confirmed capture via OS reduced motion: restore the real
  // skin immediately, and never resume the transformation when motion is re-enabled.
  const next = structuredClone(f.games.get(match)!);
  next.players[0].pieces[0] = 8;
  next.players[1].pieces[0] = 1;
  next.phase = 'MOVE';
  next.dice = 6;
  next.turn = ids[0];
  next.version++;
  next.last = { type: 'dice_rolled', actor: ids[0], dice: 6 };
  f.commit(next);
  await expect(piece).toHaveAccessibleName(/ô 8/);
  await piece.click();
  await expect(effect).toHaveAttribute('data-attacker-form', 'goku');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(effect).toHaveAttribute('data-attacker-form', 'piece');
  await expect(effect).toHaveAttribute('data-phase', 'done');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(effect).toHaveAttribute('data-attacker-form', 'piece');
  await expect(effect).toHaveAttribute('data-phase', 'done');
  await page.getByRole('button', { name: 'Tung xúc xắc', exact: true }).click();
  expect(f.games.get(match)!.players[0].skin).toBe('CAT');
  expect(f.requests.filter((r) => (r.body as { action: string }).action === 'move')).toHaveLength(
    2,
  );
  expect(f.musicCommands).toEqual([]);
  expect(errors).toEqual([]);
});
