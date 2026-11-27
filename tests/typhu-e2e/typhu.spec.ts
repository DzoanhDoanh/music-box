import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { botIds } from '../../src/shared/ty-phu/engine';
import { bot, me, roomId, tyPhuFixture } from './fixture';

async function openNewTable(page: Page) {
  await page.goto(`/room/${roomId}/games`);
  await page.getByRole('link', { name: /Tỷ Phú Phố Nhạc/ }).click();
  await expect(page.getByRole('heading', { name: 'Tỷ Phú Phố Nhạc', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /Mở bàn/ }).click();
  await expect(page.getByRole('group', { name: 'Bàn cờ Tỷ Phú Phố Nhạc' })).toBeVisible();
}
async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('the picker opens the lobby, a table starts and the first city can be bought', async ({
  page,
  context,
}) => {
  const fixture = await tyPhuFixture(context);
  await openNewTable(page);
  const players = page.getByRole('region', { name: 'Người chơi' });
  await expect(players).toContainText('An (bạn)');
  await expect(players).toContainText('Bình');
  await page.getByRole('button', { name: 'Bắt đầu ván' }).click();
  await expect(page.getByRole('heading', { name: 'Lượt của bạn' })).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Bàn cờ Tỷ Phú Phố Nhạc' }).getByRole('button'),
  ).toHaveCount(32);

  fixture.nextDice.push(2, 3); // 5 steps → Sa Pa (80)
  await page.getByRole('button', { name: 'Tung xúc xắc' }).click();
  await page.getByRole('button', { name: 'Mua Mốc · 70' }).click();
  await expect(page.getByRole('button', { name: /^Sa Pa · An · Mốc/ })).toBeVisible();
  expect(fixture.match!.tiles[5]).toMatchObject({ owner: me, level: 0 });
  // The opponent moves automatically and the turn comes back.
  await expect(page.getByRole('heading', { name: 'Lượt của bạn' })).toBeVisible();
  await expect(players).toContainText('1.930');
  await noHorizontalScroll(page);
  await page.screenshot({
    path: `test-results/typhu/match-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('a first-lap purchase offers up to Nhà 2 and builds in the same stop', async ({
  page,
  context,
}) => {
  const fixture = await tyPhuFixture(context);
  await openNewTable(page);
  await page.getByRole('button', { name: 'Bắt đầu ván' }).click();
  fixture.nextDice.push(1, 2); // 3 steps → Lạng Sơn (Mốc 60)
  await page.getByRole('button', { name: 'Tung xúc xắc' }).click();
  const buy = page.getByRole('dialog', { name: 'Mua Lạng Sơn?' });
  await expect(buy.getByRole('button', { name: /^Mua Nhà 2 · 205/ })).toBeVisible();
  await expect(buy.getByRole('button', { name: /Nhà 3|Khách sạn/ })).toHaveCount(0);
  await buy.getByRole('button', { name: /^Mua Nhà 2 · 205/ }).click();
  await expect.poll(() => fixture.match!.tiles[3]).toMatchObject({ owner: me, level: 2 });
});

test('attack cards highlight valid targets and lower the chosen city', async ({
  page,
  context,
}) => {
  const fixture = await tyPhuFixture(context);
  await openNewTable(page);
  await page.getByRole('button', { name: 'Bắt đầu ván' }).click();
  await expect(page.getByRole('heading', { name: 'Lượt của bạn' })).toBeVisible();
  fixture.edit((s) => {
    s.tiles[21] = { owner: bot, level: 2, blackout: 0 };
    s.players.find((p) => p.id === me)!.position = 7;
    s.deck = ['STORM', ...s.deck.filter((c) => c !== 'STORM')];
  });
  await page.reload();
  fixture.nextDice.push(2, 3); // 7 → 12 (Cơ hội)
  await page.getByRole('button', { name: 'Tung xúc xắc' }).click();
  // Everyone sees the card first; the drawer then plays it.
  const card = page.getByRole('dialog', { name: 'Phiếu Cơ hội' });
  await expect(card).toContainText('Bão quét qua sân khấu');
  await card.getByRole('button', { name: /Thực hiện phiếu/ }).click();
  await expect(card).toBeHidden();
  await expect(page.getByText('Bão quét qua sân khấu', { exact: true })).toBeVisible();
  const target = page.getByRole('button', { name: /^Nha Trang · Bình · Nhà 2 · có thể chọn/ });
  await expect(target).toBeVisible();
  await target.click();
  await expect.poll(() => fixture.match!.tiles[21]?.level).toBe(1);
});

test('a short player picks which city to sell and the rent is then paid', async ({
  page,
  context,
}) => {
  const fixture = await tyPhuFixture(context);
  await openNewTable(page);
  await page.getByRole('button', { name: 'Bắt đầu ván' }).click();
  await expect(page.getByRole('heading', { name: 'Lượt của bạn' })).toBeVisible();
  fixture.edit((s) => {
    s.tiles[5] = { owner: bot, level: 3, blackout: 0 }; // Sa Pa Nhà 3: rent 147
    s.tiles[1] = { owner: me, level: 0, blackout: 0 }; // bank pays 50
    s.tiles[22] = { owner: me, level: 2, blackout: 0 }; // bank pays 560
    const p = s.players.find((x) => x.id === me)!;
    s.bank += p.cash - 40;
    p.cash = 40;
  });
  await page.reload();
  fixture.nextDice.push(2, 3); // → Sa Pa
  await page.getByRole('button', { name: 'Tung xúc xắc' }).click();
  await expect(page.getByText('Còn thiếu 107')).toBeVisible();
  const sell = page.getByRole('dialog', { name: 'Bán ô để trả nợ' });
  await expect(sell.getByRole('button', { name: /^Bán Hà Giang · \+50/ })).toBeVisible();
  await sell.getByRole('button', { name: /^Bán Đà Lạt · \+560/ }).click();
  await expect.poll(() => fixture.match!.tiles[22]).toBeNull();
  expect(fixture.match!.tiles[1]).toMatchObject({ owner: me });
  expect(fixture.match!.players.find((p) => p.id === me)!.cash).toBe(40 + 560 - 147);
  expect(fixture.match!.players.find((p) => p.id === bot)!.cash).toBe(2147);
});

test('tile details explain rent per level and the board stays accessible', async ({
  page,
  context,
}, info) => {
  await tyPhuFixture(context);
  await openNewTable(page);
  await page.getByRole('button', { name: /^TP\. Hồ Chí Minh/ }).click();
  const detail = page.getByRole('dialog', { name: 'Thông tin TP. Hồ Chí Minh' });
  await expect(detail).toContainText('Khách sạn');
  await expect(detail).toContainText('1.520');
  await expect(detail).toContainText('Cấp nhà');
  await expect(detail).toContainText('Giá mua');
  await noHorizontalScroll(page);
  if (info.project.name !== 'desktop') return;
  const report = await new AxeBuilder({ page })
    .include('.typhu-party')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(report.violations.map((v) => v.id)).toEqual([]);
});

test('the host adds a computer seat that then plays its own turns', async ({ page, context }) => {
  const fixture = await tyPhuFixture(context);
  await openNewTable(page);
  await page.getByRole('button', { name: 'Thêm máy' }).click();
  const players = page.getByRole('region', { name: 'Người chơi' });
  await expect(players).toContainText('Máy · Đàn Bầu');
  await expect(players).toContainText('Máy · luôn sẵn sàng');
  await page.getByRole('button', { name: 'Bỏ Máy · Đàn Bầu' }).click();
  await expect(players).not.toContainText('Máy · Đàn Bầu');
  await page.getByRole('button', { name: 'Thêm máy' }).click();
  await page.getByRole('button', { name: 'Bắt đầu ván' }).click();
  await expect(page.getByRole('heading', { name: 'Lượt của bạn' })).toBeVisible();
  // Hand the turn to the computer: it rolls by itself once its short deadline passes.
  fixture.edit((s) => {
    s.turn = botIds[0];
    s.phase = 'ROLL';
    s.deadline = Date.now() + 500;
  });
  fixture.nextDice.push(1, 2);
  await page.reload();
  await expect(page.getByText(/đang nghĩ/)).toBeVisible();
  await expect
    .poll(() => fixture.match!.players.find((p) => p.id === botIds[0])!.position, {
      timeout: 10_000,
    })
    .toBe(3);
});

test('a player one step from winning is flagged for everyone', async ({ page, context }) => {
  const fixture = await tyPhuFixture(context);
  await openNewTable(page);
  await page.getByRole('button', { name: 'Bắt đầu ván' }).click();
  await expect(page.getByRole('heading', { name: 'Lượt của bạn' })).toBeVisible();
  fixture.edit((s) => {
    for (const i of [4, 13, 20]) s.tiles[i] = { owner: bot, level: 0, blackout: 0 };
  });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Người chơi' })).toContainText(
    'Sắp thắng: 1 bãi biển nữa',
  );
});

test('after a game the host opens a rematch that keeps the rules and computer seats', async ({
  page,
  context,
}) => {
  const fixture = await tyPhuFixture(context);
  await openNewTable(page);
  await page.getByRole('button', { name: 'Thêm máy' }).click();
  await page.getByRole('button', { name: 'Bắt đầu ván' }).click();
  await expect(page.getByRole('heading', { name: 'Lượt của bạn' })).toBeVisible();
  const first = fixture.match!.id;
  fixture.edit((s) => {
    s.status = 'FINISHED';
    s.winner = me;
    s.winReason = 'BEACHES';
    s.deadline = null;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ván đã kết thúc' })).toBeVisible();
  await page.getByRole('button', { name: 'Chơi lại' }).click();
  await expect(page).not.toHaveURL(new RegExp(first));
  await expect(page.getByRole('heading', { name: 'Chuẩn bị' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Người chơi' })).toContainText('Máy · Đàn Bầu');
  expect(fixture.older.get(first)!.rematch).toBe(fixture.match!.id);
  expect(fixture.match!.status).toBe('WAITING');
});

test('the 2.5D table seats players in the corners and pauses for everyone', async ({
  page,
  context,
}) => {
  const fixture = await tyPhuFixture(context);
  await openNewTable(page);
  await page.getByRole('button', { name: 'Bắt đầu ván' }).click();
  await expect(page.getByRole('heading', { name: 'Lượt của bạn' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bàn 2.5D' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.typhu-stage.view-25d')).toBeVisible();
  // One seat per player, in turn order, with the money underneath.
  const seats = page.locator('.typhu-seat');
  await expect(seats).toHaveCount(2);
  const mySeat = seats.filter({ hasText: 'An (bạn)' });
  await expect(mySeat).toContainText('2.000');
  // Tiles show rent, not the land price: Sa Pa (Mốc 70) rents for 4.
  await expect(page.getByRole('button', { name: /^Sa Pa · thuê 4$/ })).toBeVisible();
  // Keyboard: every tile is a button that opens its details.
  const table = page.getByRole('group', { name: 'Bàn cờ Tỷ Phú Phố Nhạc' });
  await expect(table.getByRole('button')).toHaveCount(32);
  await table.getByRole('button', { name: /^Sa Pa/ }).focus();
  await page.keyboard.press('Enter');
  const info = page.getByRole('dialog', { name: 'Thông tin Sa Pa' });
  await expect(info).toContainText('Cấp nhà');
  await expect(info).toContainText('Giá mua');
  await page.keyboard.press('Escape');
  await expect(info).toHaveCount(0);
  // Pausing stops the clock and blocks the roll until someone resumes.
  await page.getByRole('button', { name: 'Tạm dừng' }).click();
  await expect(page.getByRole('dialog', { name: 'Ván đang tạm dừng' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tung xúc xắc' })).toHaveCount(0);
  expect(fixture.match!.deadline).toBeNull();
  await page
    .getByRole('dialog', { name: 'Ván đang tạm dừng' })
    .getByRole('button', { name: 'Chơi tiếp' })
    .click();
  await expect(page.getByRole('button', { name: 'Tung xúc xắc' })).toBeVisible();
  // The buy dialog only opens once the dice have landed and the pawn has walked.
  fixture.nextDice.push(2, 3);
  await page.getByRole('button', { name: 'Tung xúc xắc' }).click();
  await expect(page.getByRole('dialog', { name: 'Mua Sa Pa?' })).toBeVisible();
  await page.getByRole('button', { name: 'Mua Mốc · 70' }).click();
  await expect(mySeat).toContainText('1.930');
  await noHorizontalScroll(page);
  await page.screenshot({
    path: `test-results/typhu/table-${test.info().project.name}.png`,
    fullPage: true,
  });
  // The header sits under the floating chat button once the page is scrolled down.
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole('button', { name: 'Bàn phẳng' }).click();
  await expect(page.locator('.typhu-stage.view-flat')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('roomtune:typhu:view'))).toBe('2d');
});

test('the host deletes a table after typing its name and returns to the lobby', async ({
  page,
  context,
}) => {
  const fixture = await tyPhuFixture(context);
  await openNewTable(page);
  const id = fixture.match!.id;
  await page.getByRole('button', { name: 'Xóa bàn', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Xóa bàn “/ });
  const confirm = dialog.getByRole('button', { name: 'Xác nhận', exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('textbox').fill('sai tên');
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('textbox').fill(fixture.match!.name);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/typhu/delete-${test.info().project.name}.png` });
  await confirm.click();
  await expect(page).toHaveURL(new RegExp(`/room/${roomId}/games/ty-phu$`));
  await expect(page.getByText('Chưa có bàn nào.', { exact: false })).toBeVisible();
  expect(fixture.deleted).toEqual([id]);
  // Someone still on the old link is told the table is gone.
  await page.goto(`/room/${roomId}/games/ty-phu/${id}`);
  await expect(page.getByRole('heading', { name: 'Bàn này không còn nữa' })).toBeVisible();
});
