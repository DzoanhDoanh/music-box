import { test, expect } from '@playwright/test';
import { gameFixture, ids, match, openGame } from './fixture';
import { defaultRules } from '../../src/shared/game/contracts';
import { pauseAnimationClock } from './animation-clock';

function captureFixture() {
  const fixture = gameFixture();
  const state = fixture.seed(2, { ...defaultRules, turnSeconds: 90 });
  state.players[0].pieces = [8, -1, -1, -1];
  state.players[1].pieces = [1, -1, -1, -1];
  state.dice = 6;
  state.phase = 'MOVE';
  state.version++;
  fixture.commit(state);
  return fixture;
}

test('capture bursts at impact, accepts the next action, and never replays on reload', async ({
  page,
  context,
}, info) => {
  const f = captureFixture();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await f.attach(context, 0);
  await page.clock.install();
  await openGame(page);
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  await expect(page.locator('.ludo-scene canvas')).toBeVisible();
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Đồ họa: Rõ nét', exact: true }).click();
  await expect(page.locator('.ludo-scene')).toHaveAttribute('data-motion', 'on');
  const effect = page.locator('.ludo-finisher');
  await expect(effect).toBeHidden();
  await page.locator(`[data-piece="${ids[0]}:0"]`).click();
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(15);
  expect(f.games.get(match)!.players[1].pieces[0]).toBe(-1);
  await expect(effect).toHaveAttribute('data-phase', 'impact');
  // Freeze a real rendered impact frame for visual inspection; timing/expiry are
  // exercised separately below with the normal clock.
  await pauseAnimationClock(page);
  await page.clock.runFor(200);
  await expect(effect).toBeVisible();
  await expect(effect).toContainText('K/O');
  expect(await effect.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await page.screenshot({ path: info.outputPath('capture-impact.png') });
  await page.clock.resume();
  // Six still gives the next turn immediately. FX never gate the authoritative controls.
  await page.getByRole('button', { name: 'Tung xúc xắc', exact: true }).click();
  await expect
    .poll(() => f.requests.filter((r) => (r.body as { action: string }).action === 'roll').length)
    .toBe(1);
  await expect(effect).toBeHidden();
  await page.reload();
  await expect(page.locator('.ludo-scene canvas')).toBeVisible();
  await expect(effect).toBeHidden();
  expect(f.requests.filter((r) => (r.body as { action: string }).action === 'move')).toHaveLength(
    1,
  );
  expect(f.musicCommands).toEqual([]);
  expect(errors).toEqual([]);
});

test('capture FX expire once, ignore duplicate snapshots and stay off after reduced motion', async ({
  page,
  context,
}) => {
  const f = captureFixture();
  await f.attach(context, 0);
  await openGame(page);
  await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
  await expect(page.locator('.ludo-scene')).toHaveAttribute('data-motion', 'on');
  await page.locator(`[data-piece="${ids[0]}:0"]`).click();
  const effect = page.locator('.ludo-finisher');
  await expect(effect).toHaveAttribute('data-phase', 'impact');
  await expect(effect).toHaveAttribute('data-phase', 'done', { timeout: 10000 });
  await expect(effect).toBeHidden();
  f.commit(structuredClone(f.games.get(match)!));
  await expect(effect).toHaveAttribute('data-phase', 'done');

  // Reset to another fixture event, then capture with OS reduced-motion enabled.
  const next = structuredClone(f.games.get(match)!);
  next.players[0].pieces[0] = 8;
  next.players[1].pieces[0] = 1;
  next.dice = 6;
  next.phase = 'MOVE';
  next.turn = ids[0];
  next.version++;
  next.last = { type: 'dice_rolled', actor: ids[0], dice: 6 };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  f.commit(next);
  await expect(page.locator('.ludo-scene')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator(`[data-piece="${ids[0]}:0"]`)).toHaveAccessibleName(/ô 8/);
  await page.locator(`[data-piece="${ids[0]}:0"]`).click();
  await expect.poll(() => f.games.get(match)!.players[1].pieces[0]).toBe(-1);
  await expect(effect).toHaveAttribute('data-phase', 'done');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.ludo-scene')).toHaveAttribute('data-motion', 'on');
  await expect(effect).toHaveAttribute('data-phase', 'done');
  await expect(effect).toBeHidden();
  expect(f.musicCommands).toEqual([]);
});
