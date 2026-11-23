import { test, expect } from '@playwright/test';
import { attach, setup, path, bridge } from './fixture';

test.beforeEach(setup);
test('owner persists room song policy and a member can create only an allowed song race', async ({
  page,
  context,
  browser,
}) => {
  await attach(context);
  await page.goto(path);
  await page.getByRole('button', { name: 'Cài đặt đua của phòng', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Cài đặt đua của phòng', exact: true });
  await dialog.getByLabel('Chỉ chủ phòng được mở đua bài hát').uncheck();
  await dialog.getByLabel('Số bài tối đa mỗi cuộc đua').fill('2');
  await dialog.getByLabel('Bài thắng mặc định').selectOption('APPROVAL');
  await dialog.getByRole('button', { name: 'Lưu cài đặt phòng' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Cài đặt đua của phòng', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Cài đặt đua của phòng', exact: true });
  await expect(dialog.getByLabel('Chỉ chủ phòng được mở đua bài hát')).not.toBeChecked();
  await expect(dialog.getByLabel('Số bài tối đa mỗi cuộc đua')).toHaveValue('2');
  await expect(dialog.getByLabel('Bài thắng mặc định')).toHaveValue('APPROVAL');
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  const member = await browser.newContext();
  try {
    const f = await attach(member, 1);
    const songs: {
      id: string;
      youtube_video_id: string;
      status: 'PLAYING' | 'QUEUED';
      position: number;
      priority: number;
    }[] = await (await fetch(bridge + '/songs', { method: 'POST' })).json();
    const prototype = f.music.queue[0];
    f.music.queue = songs.map((q, i) => ({
      ...prototype,
      ...q,
      song: { ...prototype.song, youtube_video_id: q.youtube_video_id, title: 'Bài hát ' + i },
    }));
    f.music.playback.entry_id = songs[0].id;
    const memberPage = await member.newPage();
    await memberPage.goto(path);
    await expect(
      memberPage.getByRole('button', { name: 'Cài đặt đua của phòng', exact: true }),
    ).toHaveCount(0);
    await memberPage.getByRole('button', { name: 'Tạo cuộc đua', exact: true }).click();
    const form = memberPage.getByRole('dialog', { name: 'Mở một cuộc đua', exact: true });
    await expect(form.getByRole('button', { name: 'Đua thành viên', exact: true })).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'Danh sách tùy chọn', exact: true })).toHaveCount(
      0,
    );
    await expect(form.getByLabel('Bài thắng', { exact: true })).toBeDisabled();
    await expect(form.getByLabel('Bài thắng', { exact: true })).toHaveValue('APPROVAL');
    await form.getByRole('button', { name: 'Chọn tối đa 2 bài' }).click();
    await form.getByRole('button', { name: 'Tạo cuộc đua', exact: true }).click();
    await expect(
      memberPage.getByRole('button', { name: 'Khóa đội hình & xuất phát' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cài đặt đua của phòng', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Cài đặt đua của phòng', exact: true });
    await dialog.getByLabel('Cho phép đua bài hát').uncheck();
    await dialog.getByRole('button', { name: 'Lưu cài đặt phòng' }).click();
    await expect(dialog).toHaveCount(0);
    await memberPage.getByRole('button', { name: 'Khóa đội hình & xuất phát' }).click();
    await expect(
      memberPage
        .getByText('Chủ phòng đã tắt đua bài hát. Cuộc đua đã xuất phát vẫn tiếp tục.')
        .first(),
    ).toBeVisible();
    await memberPage.goto(path);
    await expect(memberPage.getByRole('button', { name: 'Tạo cuộc đua', exact: true })).toHaveCount(
      0,
    );
  } finally {
    await member.close();
  }
});
