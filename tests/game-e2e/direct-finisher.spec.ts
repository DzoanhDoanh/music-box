import { expect, test } from '@playwright/test';
import { defaultRules } from '../../src/shared/game/contracts';
import { gameFixture, ids, match, openGame } from './fixture';
import { pauseAnimationClock } from './animation-clock';

for (const effectName of ['K/O', 'Long quyền']) {
  test(`${effectName} attacks across the board on a long capture without a preliminary walk`, async ({
    page,
    context,
  }, info) => {
    const f = gameFixture();
    const state = f.seed(2, { ...defaultRules, turnSeconds: 90 });
    state.players[0].pieces = [13, -1, -1, -1];
    state.players[1].pieces = [13, -1, -1, -1];
    state.dice = 1;
    state.phase = 'MOVE';
    state.version++;
    f.commit(state);
    await f.attach(context, 0);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install();
    await openGame(page);
    await page.getByRole('button', { name: 'Bàn 3D', exact: true }).click();
    await expect(page.locator('.ludo-scene canvas')).toBeVisible();
    await expect(page.locator('.ludo-scene')).toHaveAttribute('data-motion', 'on');
    if (info.project.name === 'mobile')
      await page.getByRole('button', { name: 'Đồ họa: Rõ nét', exact: true }).click();
    if (effectName === 'Long quyền') {
      await page.getByRole('button', { name: 'Thử hiệu ứng', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Thử hiệu ứng', exact: true });
      await dialog
        .getByRole('combobox', { name: 'Hiệu ứng', exact: true })
        .selectOption('dragon-strike');
      await dialog.getByRole('button', { name: 'Dùng Long quyền', exact: true }).click();
      await page.keyboard.press('Escape');
    }
    const attacker = page.locator(`[data-piece="${ids[0]}:0"]`);
    await expect(attacker).toBeEnabled();
    await attacker.scrollIntoViewIfNeeded();
    const bounds = (await attacker.boundingBox())!;
    // Freeze before pointer input: pausing after the response can miss most of
    // the short attack on a slow WebGL renderer. Mouse input still uses the real
    // hit target, without locator.click waiting for animation frames while paused.
    await pauseAnimationClock(page);
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    const effect = page.locator('.ludo-viewport .ludo-finisher');
    await expect(effect).toHaveAttribute('data-phase', 'charging');
    await page.clock.runFor(400);
    await expect(effect).toHaveAttribute('data-phase', 'charging');
    await page.screenshot({ path: info.outputPath('direct-attack.png') });
    await page.clock.runFor(effectName === 'K/O' ? 350 : 600);
    await expect(effect).toHaveAttribute('data-phase', 'impact');
    await page.screenshot({ path: info.outputPath('direct-impact.png') });
    await page.clock.resume();
    await expect(effect).toHaveAttribute('data-phase', 'done', { timeout: 10000 });
    expect(f.games.get(match)!.players[0].pieces[0]).toBe(27);
    expect(f.games.get(match)!.players[1].pieces[0]).toBe(-1);
    expect(f.requests.filter((r) => (r.body as { action: string }).action === 'move')).toHaveLength(
      1,
    );
    expect(f.musicCommands).toEqual([]);
    expect(errors).toEqual([]);
  });
}
