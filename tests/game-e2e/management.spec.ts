import { test, expect } from '@playwright/test';
import { gameFixture, ids, names, match, room, openGame, nav, fakeMusic } from './fixture';
import { defaultRules } from '../../src/shared/game/contracts';

test('owner kicks a seat while the member keeps music and sees spectator feedback', async ({
  browser,
  page,
  context,
}) => {
  const f = gameFixture();
  f.seed(3, defaultRules);
  await f.attach(context, 0);
  const guestContext = await browser.newContext();
  try {
    await f.attach(guestContext, 1);
    await fakeMusic(guestContext);
    const guest = await guestContext.newPage();
    await openGame(page);
    await openGame(guest);
    await expect(guest.getByRole('button', { name: /Mời .*khỏi bàn/ })).toHaveCount(0);
    const before = structuredClone(f.music.playback);
    const roster = page.getByRole('button', { name: 'Người chơi trong bàn', exact: true });
    if (await roster.isVisible()) await roster.click();
    await page.getByRole('button', { name: `Mời ${names[1]} khỏi bàn`, exact: true }).click();
    await page
      .getByRole('dialog', { name: `Mời ${names[1]} khỏi bàn?` })
      .getByRole('button', { name: 'Xác nhận', exact: true })
      .click();
    await expect(guest.getByText(/Bạn đã được mời rời ghế/)).toBeVisible();
    expect(f.games.get(match)?.players.find((p) => p.id === ids[1])?.status).toBe('FORFEITED');
    await expect(guest.getByRole('button', { name: 'Tung xúc xắc', exact: true })).toHaveCount(0);
    await expect(guest.getByRole('group', { name: /Bàn cờ/ })).toBeVisible();
    expect(f.music.playback).toEqual(before);
    expect(f.musicCommands).toEqual([]);
  } finally {
    await guestContext.close();
  }
});

test('deleting a table requires its exact name and returns every viewer to the lobby', async ({
  browser,
  page,
  context,
}, info) => {
  const f = gameFixture();
  f.seed(3, defaultRules);
  await f.attach(context, 0);
  const guestContext = await browser.newContext();
  try {
    await f.attach(guestContext, 1);
    const guest = await guestContext.newPage();
    await openGame(page);
    await openGame(guest);
    await page.getByRole('button', { name: 'Tùy chọn bàn', exact: true }).click();
    await page.getByRole('button', { name: 'Xóa bàn', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Xóa bàn “/ });
    await expect(dialog.getByRole('button', { name: 'Xác nhận', exact: true })).toBeDisabled();
    await dialog.getByRole('textbox').fill('sai tên');
    await expect(dialog.getByRole('button', { name: 'Xác nhận', exact: true })).toBeDisabled();
    await dialog.getByRole('textbox').fill(f.games.get(match)!.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/management-${info.project.name}.png` });
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/room/${room}/games$`));
    await expect(guest).toHaveURL(new RegExp(`/room/${room}/games$`), { timeout: 12000 });
    await expect(page.getByRole('group', { name: /Bàn cờ/ })).toHaveCount(0);
    expect(f.musicCommands).toEqual([]);
  } finally {
    await guestContext.close();
  }
});

test('member list leads to owner moderation and revoked users leave the room', async ({
  browser,
  page,
  context,
}) => {
  const f = gameFixture();
  await f.attach(context, 0);
  const guestContext = await browser.newContext();
  try {
    await f.attach(guestContext, 1);
    const guest = await guestContext.newPage();
    await page.goto(`/room/${room}`);
    await guest.goto(`/room/${room}`);
    await page.getByRole('button', { name: /Xem thành viên/ }).click();
    await page.getByRole('button', { name: 'Quản lý / mời thành viên ra', exact: true }).click();
    await expect(page.locator('.member-row').filter({ hasText: names[1] })).toBeVisible();
    await page
      .locator('.member-row')
      .filter({ hasText: names[1] })
      .getByRole('button', { name: 'Mời khỏi phòng', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: `Mời ${names[1]} ra khỏi phòng?` })
      .getByRole('button', { name: 'Xác nhận', exact: true })
      .click();
    await expect(guest).toHaveURL(/\/rooms$/, { timeout: 12000 });
    expect(f.revoked.has(ids[1])).toBe(true);
  } finally {
    await guestContext.close();
  }
});

test('owner deletes music room with confirmation and all members return to their rooms', async ({
  browser,
  page,
  context,
}) => {
  const f = gameFixture();
  await f.attach(context, 0);
  const guestContext = await browser.newContext();
  try {
    await f.attach(guestContext, 1);
    const guest = await guestContext.newPage();
    await page.goto(`/room/${room}`);
    await guest.goto(`/room/${room}`);
    await nav(page, 'Cài đặt phòng');
    await page.getByRole('button', { name: 'Xóa phòng', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Xóa phòng “/ });
    await expect(dialog.getByRole('button', { name: 'Xác nhận', exact: true })).toBeDisabled();
    await dialog.getByRole('textbox').fill(f.music.room.name);
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(page).toHaveURL(/\/rooms$/);
    await expect(guest).toHaveURL(/\/rooms$/, { timeout: 12000 });
  } finally {
    await guestContext.close();
  }
});
