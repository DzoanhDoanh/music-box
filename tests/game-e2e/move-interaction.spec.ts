import { expect, test, type Page } from '@playwright/test';
import { caNguaRulesSchema, defaultRules } from '../../src/shared/game/contracts';
import { piecePoint } from '../../src/client/components/game/board-geometry';
import { gameFixture, ids, match, openGame } from './fixture';

// Real pointer coordinates, not locator.click(), which always aims at a bounding-box center.
async function tapBoard(page: Page, point: [number, number], touch: boolean) {
  const position = await page.locator('.ludo-board').evaluate((svg, [x, y]) => {
    const p = new DOMPoint(x, y).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
    return { x: p.x, y: p.y };
  }, point);
  if (touch) await page.touchscreen.tap(position.x, position.y);
  else await page.mouse.click(position.x, position.y);
}

test('protected neighbors never steal edge taps and their start costs no step in every direction', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const initial = f.seed(4, { ...defaultRules, turnSeconds: 90 });
  await f.attach(context, 0);
  for (const [i, from] of [13, 27, 41].entries()) {
    const s = structuredClone(initial);
    s.version += i * 3 + 1;
    s.players[0].pieces = [from, 5, -1, -1];
    for (const player of s.players.slice(1)) player.pieces[0] = 0;
    s.phase = 'MOVE';
    s.dice = 2;
    f.commit(s);
    if (i === 0) await openGame(page);
    else await page.reload();
    await expect(page.locator(`[data-piece="${ids[0]}:0"]`)).toHaveAttribute(
      'aria-disabled',
      'false',
    );
    const [x, y] = piecePoint(0, from, 0, 2);
    const [nx, ny] = piecePoint(0, from + 1, 0, 2);
    // 0.49 is still inside this cell; an old neighbor's radius .52 covered this point.
    await tapBoard(
      page,
      [x + (nx - x) * 0.49, y + (ny - y) * 0.49],
      info.project.name === 'mobile',
    );
    await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(from + 3);
    expect(f.games.get(match)!.last.captures).toEqual([]);
    expect(
      f.games
        .get(match)!
        .players.slice(1)
        .map((p) => p.pieces[0]),
    ).toEqual([0, 0, 0]);
  }
});

test('a destination under an enemy piece captures it with one tap, and double taps cannot move twice', async ({
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
  await expect(page.locator('[data-destination="16"]')).toHaveAttribute('aria-disabled', 'false');
  const destination = piecePoint(0, 16, 0, 2);
  await tapBoard(page, destination, info.project.name === 'mobile');
  await tapBoard(page, destination, info.project.name === 'mobile');
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(16);
  expect(f.games.get(match)!.players[1].pieces).toEqual([0, -1, -1, -1]);
  expect(f.games.get(match)!.version).toBe(s.version + 1);
  expect(f.requests.filter((r) => (r.body as { action: string }).action === 'move')).toHaveLength(
    1,
  );
  expect(f.musicCommands).toEqual([]);
});

test('ambiguous spawn destinations require choosing a numbered piece; four controls stay readable', async ({
  page,
  context,
}, info) => {
  const f = gameFixture();
  const s = f.seed(2, { ...defaultRules, turnSeconds: 90 });
  s.phase = 'MOVE';
  s.dice = 6;
  s.version++;
  f.commit(s);
  await f.attach(context, 0);
  await openGame(page);
  await expect(page.locator('[data-destination="0"]')).toHaveAttribute('aria-disabled', 'true');
  await tapBoard(page, piecePoint(0, 0, 0, 2), info.project.name === 'mobile');
  expect(f.games.get(match)!.version).toBe(s.version);
  const sizes =
    info.project.name === 'mobile'
      ? [
          [390, 844],
          [320, 568],
        ]
      : [
          [1440, 1000],
          [844, 390],
        ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const button of await page.locator('.game-move-choices button').all()) {
      const rect = (await button.boundingBox())!;
      expect(rect.width).toBeGreaterThanOrEqual(80);
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    }
    const board = (await page.locator('.game-board-frame').boundingBox())!;
    const controls = (await page.locator('.game-controls').boundingBox())!;
    expect(
      board.y + board.height <= controls.y + 1 || board.x + board.width <= controls.x + 1,
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`move-controls-${width}.png`) });
  }
  await page.getByRole('button', { name: 'Ngựa 3 Ra quân', exact: true }).click();
  await expect.poll(() => f.games.get(match)!.players[0].pieces).toEqual([-1, -1, 0, -1]);
});

test('legacy step/jump selection remains explicit and a chosen destination works with keyboard', async ({
  page,
  context,
}) => {
  const f = gameFixture();
  const s = f.seed(
    2,
    caNguaRulesSchema.parse({ variant: 'CANGUA_V2', safe: 'STARTS', turnSeconds: 90 }),
  );
  s.players[0].pieces = [2, 55, -1, -1];
  s.phase = 'MOVE';
  s.dice = 1;
  s.version++;
  f.commit(s);
  await f.attach(context, 0);
  await openGame(page);
  await page.locator(`[data-piece="${ids[0]}:0"]`).click();
  await expect(page.locator('.choosing-move')).toBeVisible();
  expect(f.games.get(match)!.version).toBe(s.version);
  const target = page.locator('[data-destination="13"]');
  await target.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => f.games.get(match)!.players[0].pieces[0]).toBe(13);
  expect(f.games.get(match)!.last.moveKind).toBe('JUMP');
});

for (const color of [0, 1, 2, 3]) {
  test(`cell corners select the intended movable piece at starts and home for color ${color}`, async ({
    page,
    context,
  }, info) => {
    const f = gameFixture();
    const initial = f.seed(4, { ...defaultRules, turnSeconds: 90 });
    await f.attach(context, color);
    // Each position has another movable horse as well as unmovable horses.
    const cases = [
      { pieces: [0, 8, 57, -1], dice: 6, piece: 0, to: 6 },
      { pieces: [13, 5, 57, -1], dice: 2, piece: 0, to: 16 },
      { pieces: [55, 0, 57, -1], dice: 1, piece: 0, to: 56 },
      { pieces: [56, 0, 58, -1], dice: 2, piece: 0, to: 57 },
    ];
    for (const [i, c] of cases.entries()) {
      const s = structuredClone(initial);
      s.version += i * 3 + 1;
      s.turn = ids[color];
      s.phase = 'MOVE';
      s.dice = c.dice;
      s.players[color].pieces = c.pieces;
      s.players[color].skin = i % 2 ? 'HERO' : 'HORSE';
      s.deadline = Date.now() + 90000;
      f.commit(s);
      if (i === 0) await openGame(page);
      else await page.reload();
      const piece = page.locator(`[data-piece="${ids[color]}:${c.piece}"]`);
      await expect(piece).toHaveAttribute('aria-disabled', 'false');
      expect(await page.locator('.ludo-piece.can-move').count()).toBeGreaterThan(1);
      const [x, y] = piecePoint(color, c.pieces[c.piece], c.piece, 2);
      await tapBoard(page, [x + 0.4, y - 0.4], info.project.name === 'mobile');
      await expect
        .poll(() => f.games.get(match)!.players[color].pieces[c.piece], { timeout: 1500 })
        .toBe(c.to);
      expect(f.games.get(match)!.last.piece).toBe(c.piece);
      expect(
        f.requests.filter((r) => (r.body as { action: string }).action === 'move'),
      ).toHaveLength(i + 1);
    }
    expect(f.musicCommands).toEqual([]);
  });
}
