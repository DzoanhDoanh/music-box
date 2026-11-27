import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { coTuongFixture, roomId } from './fixture';

async function openLobby(page: Page) {
  await page.goto(`/room/${roomId}/games`);
  await page.getByRole('link', { name: /Cờ Tướng/ }).click();
  await expect(page.getByRole('heading', { name: 'Cờ Tướng', level: 1 })).toBeVisible();
}
const board = (page: Page) => page.getByRole('group', { name: 'Bàn Cờ Tướng' });
async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
const opacity = (locator: import('@playwright/test').Locator) =>
  locator.evaluate((el) => getComputedStyle(el).opacity);
/** Records every board sound the page plays. */
const listenForSounds = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { sounds: string[] };
    w.sounds = [];
    window.addEventListener('roomtune:board-sound', (e) => {
      const { sound, audible } = (e as CustomEvent<{ sound: string; audible: boolean }>).detail;
      w.sounds.push(audible ? sound : `${sound} (muted)`);
    });
  });
const sounds = (page: Page) =>
  page.evaluate(() => (window as unknown as { sounds: string[] }).sounds);
const refresh = (page: Page) =>
  page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

test('a player opens a table against the computer, moves, gets a reply and takes it back', async ({
  page,
  context,
}) => {
  await coTuongFixture(context);
  await openLobby(page);
  await page.getByRole('radio', { name: 'Dễ' }).check();
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  await expect(board(page).getByRole('button', { name: /Đỏ ở|Đen ở/ })).toHaveCount(32);
  await expect(page.getByRole('status').filter({ hasText: 'Lượt của bạn' })).toBeVisible();

  const cannon = board(page).getByRole('button', { name: 'Pháo Đỏ ở cột 8, hàng 8' });
  // Mark the element: after the move the same element must stand on the new square (it slides).
  await cannon.evaluate((el) => el.setAttribute('data-follow', 'cannon'));
  expect(await cannon.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain('left');
  await cannon.click();
  const target = board(page).getByRole('button', { name: 'Đi tới cột 5, hàng 8' });
  await expect(target).toBeVisible();
  await target.click();
  const record = page.getByRole('region', { name: 'Biên bản ván cờ' });
  await expect(record).toContainText('Pháo 2 bình 5');
  await expect(
    board(page).getByRole('button', { name: 'Pháo Đỏ ở cột 5, hàng 8' }),
  ).toHaveAttribute('data-follow', 'cannon');
  // The computer answered in the same request; it is our turn again.
  await expect(record.getByRole('listitem').first().locator('span').nth(1)).not.toBeEmpty();
  await expect(page.getByRole('status').filter({ hasText: 'Lượt của bạn' })).toBeVisible();
  await noHorizontalScroll(page);
  const axe = await new AxeBuilder({ page }).include('.xq-match').analyze();
  expect(axe.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual(
    [],
  );
  await page.screenshot({
    path: `test-results/cotuong/match-${test.info().project.name}.png`,
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Đi lại' }).click();
  await expect(record).toContainText('Chưa có nước nào');
  await expect(board(page).getByRole('button', { name: 'Pháo Đỏ ở cột 8, hàng 8' })).toBeVisible();
});

test('playing Black against the computer turns the board and the computer opens', async ({
  page,
  context,
}) => {
  await coTuongFixture(context);
  await openLobby(page);
  await page.getByRole('radio', { name: 'Đen' }).check();
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  const red = board(page).getByRole('button', { name: 'Tướng Đỏ ở cột 5, hàng 10' });
  const black = board(page).getByRole('button', { name: 'Tướng Đen ở cột 5, hàng 1' });
  // Black sits at the bottom, so its general is drawn below Red's.
  const [r, b] = [await red.boundingBox(), await black.boundingBox()];
  expect(b!.y).toBeGreaterThan(r!.y);
  await expect(
    page.getByRole('region', { name: 'Biên bản ván cờ' }).getByRole('listitem'),
  ).toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: 'Lượt của bạn' })).toBeVisible();
  await page.screenshot({
    path: `test-results/cotuong/black-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('two room members play, a check is shown and resigning ends the game', async ({
  page,
  context,
}) => {
  const fixture = await coTuongFixture(context);
  await openLobby(page);
  await page.getByRole('radio', { name: 'Người trong phòng' }).check();
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đang chờ đối thủ' })).toBeVisible();
  const id = [...fixture.tables.keys()][0];
  fixture.join(id);
  await refresh(page);
  await expect(page.getByRole('status').filter({ hasText: 'Lượt của bạn' })).toBeVisible();

  await board(page).getByRole('button', { name: 'Pháo Đỏ ở cột 8, hàng 8' }).click();
  await board(page).getByRole('button', { name: 'Đi tới cột 5, hàng 8' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Bình đang đi' })).toBeVisible();
  // Waiting for the opponent does not dim the board.
  await expect
    .poll(() => opacity(board(page).getByRole('button', { name: 'Xe Đỏ ở cột 1, hàng 10' })))
    .toBe('1');
  fixture.play(id, 3, 13); // Sĩ 4 tiến 5
  await refresh(page);
  await board(page).getByRole('button', { name: 'Pháo Đỏ ở cột 5, hàng 8' }).click();
  await board(page).getByRole('button', { name: 'Ăn Tốt Đen ở cột 5, hàng 4' }).click();
  // The captured soldier fades out under the cannon instead of vanishing.
  const taken = page.locator('.xq-taken');
  await expect(taken).toHaveCount(1);
  await expect.poll(() => opacity(taken)).toBe('0');
  await expect(page.getByRole('alert').filter({ hasText: 'Chiếu tướng!' })).toBeVisible();

  await page.getByRole('button', { name: 'Đầu hàng' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Bình thắng' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ván mới/ })).toBeVisible();
});

test('the host deletes a table after typing its name', async ({ page, context }) => {
  const fixture = await coTuongFixture(context);
  await openLobby(page);
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  await expect(board(page)).toBeVisible();
  const [id, table] = [...fixture.tables.entries()][0];
  await page.getByRole('button', { name: 'Xóa bàn', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Xóa bàn “/ });
  await dialog.getByRole('textbox').fill(table.name);
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/room/${roomId}/games/co-tuong$`));
  expect(fixture.deleted).toEqual([id]);
  await expect(page.getByText('Chưa có bàn nào.', { exact: false })).toBeVisible();
});

test('while the computer thinks the board stays clear and its seat says so', async ({
  page,
  context,
}) => {
  const fixture = await coTuongFixture(context);
  await openLobby(page);
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  fixture.timing.delay = 1500;
  await board(page).getByRole('button', { name: 'Pháo Đỏ ở cột 8, hàng 8' }).click();
  await board(page).getByRole('button', { name: 'Đi tới cột 5, hàng 8' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Máy đang nghĩ' })).toBeVisible();
  await expect(page.locator('.xq-seat.thinking')).toContainText('đang nghĩ…');
  // The move already shows where it went, and nothing on the board is faded.
  const moved = board(page).getByRole('button', { name: 'Pháo Đỏ ở cột 5, hàng 8' });
  await expect(moved).toBeDisabled();
  await expect.poll(() => opacity(moved)).toBe('1');
  await expect
    .poll(() => opacity(board(page).getByRole('button', { name: 'Xe Đen ở cột 1, hàng 1' })))
    .toBe('1');
  await page.screenshot({ path: `test-results/cotuong/thinking-${test.info().project.name}.png` });
  await expect(page.getByRole('status').filter({ hasText: 'Lượt của bạn' })).toBeVisible();
  await expect(page.locator('.xq-seat.thinking')).toHaveCount(0);
});

test('moves and captures make sounds, and the sound switch is remembered', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await listenForSounds(page);
  const fixture = await coTuongFixture(context);
  await openLobby(page);
  await page.getByRole('radio', { name: 'Người trong phòng' }).check();
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  const id = [...fixture.tables.keys()][0];
  fixture.join(id);
  await refresh(page);
  await expect(page.getByRole('status').filter({ hasText: 'Lượt của bạn' })).toBeVisible();
  // Opening the table is quiet.
  expect(await sounds(page)).toEqual([]);

  await board(page).getByRole('button', { name: 'Pháo Đỏ ở cột 8, hàng 8' }).click();
  await board(page).getByRole('button', { name: 'Đi tới cột 5, hàng 8' }).click();
  await expect.poll(() => sounds(page)).toEqual(['move']);
  // The opponent's move is heard too.
  fixture.play(id, 3, 13);
  await refresh(page);
  await expect.poll(() => sounds(page)).toEqual(['move', 'move']);
  // Capturing with check: a heavier knock, then the check chime.
  await board(page).getByRole('button', { name: 'Pháo Đỏ ở cột 5, hàng 8' }).click();
  await board(page).getByRole('button', { name: 'Ăn Tốt Đen ở cột 5, hàng 4' }).click();
  await expect.poll(() => sounds(page)).toEqual(['move', 'move', 'capture', 'check']);

  const toggle = page.getByRole('button', { name: /Âm thanh/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.getByRole('button', { name: /Âm thanh tắt/ })).toBeVisible();
  fixture.play(id, 13, 3); // Sĩ lui, thoát chiếu
  await refresh(page);
  await expect.poll(() => sounds(page)).toEqual(['move (muted)']);
  expect(errors).toEqual([]);
});
