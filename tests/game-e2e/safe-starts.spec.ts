import { test, expect } from '@playwright/test';
import { defaultRules, caNguaRulesSchema } from '../../src/shared/game/contracts';
import { gameFixture, ids, match, openGame } from './fixture';

test('saved safe-start rules disable foreign landing and duplicate spawn but permit passing the protected horse', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const s = f.seed(
    2,
    caNguaRulesSchema.parse({
      variant: 'CANGUA_V2',
      safe: 'STARTS',
      jumpOnOne: false,
      turnSeconds: 90,
    }),
  );
  s.players[0].pieces[0] = 13;
  s.phase = 'MOVE';
  s.dice = 1;
  s.version++;
  f.commit(s);
  await f.attach(context, 0);
  await openGame(page);
  const board = page.getByRole('group', { name: /Bàn cờ/ });
  const horse = board.getByRole('button', { name: /Ngựa 1 · Đỏ/ });
  await expect(page.locator('.ludo-safe')).toHaveCount(4);
  await expect(horse).toHaveAttribute('aria-disabled', 'true');
  s.players[1].pieces[0] = 0;
  s.version++;
  f.commit(s);
  await expect(horse).toHaveAttribute('aria-disabled', 'true');
  s.dice = 2;
  s.version++;
  f.commit(s);
  await expect(horse).toHaveAttribute('aria-disabled', 'false');
  await horse.click();
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(15);
  expect(f.games.get(match)!.players[1].pieces[0]).toBe(0);
  expect(f.games.get(match)!.last.captures).toEqual([]);
  const next = structuredClone(f.games.get(match)!);
  next.players[0].pieces = [0, -1, -1, -1];
  next.turn = ids[0];
  next.phase = 'MOVE';
  next.dice = 6;
  next.version++;
  f.commit(next);
  await expect(board.getByRole('button', { name: /Ngựa 2 · Đỏ/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(horse).toHaveAttribute('aria-disabled', 'false');
  await page.screenshot({ path: info.outputPath('safe-starts.png'), fullPage: true });
  expect(f.musicCommands).toEqual([]);
});

test('board defaults to flat and remembers an explicitly chosen raised view', async ({
  page,
  context,
}) => {
  const f = gameFixture();
  f.seed(2, defaultRules);
  await f.attach(context, 0);
  await openGame(page);
  await expect(page.locator('.game-hub')).not.toHaveClass(/game-depth/);
  await page.getByRole('button', { name: 'Tùy chọn bàn', exact: true }).click();
  await page.getByRole('button', { name: 'Góc nhìn nổi', exact: true }).click();
  await expect(page.locator('.game-hub')).toHaveClass(/game-depth/);
  await page.reload();
  await expect(page.locator('.game-hub')).toHaveClass(/game-depth/);
  await page.getByRole('button', { name: 'Tùy chọn bàn', exact: true }).click();
  await page.getByRole('button', { name: 'Góc nhìn thẳng', exact: true }).click();
  await page.reload();
  await expect(page.locator('.game-hub')).not.toHaveClass(/game-depth/);
});
