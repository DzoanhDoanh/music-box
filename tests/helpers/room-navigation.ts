import type { Page } from '@playwright/test';
export async function chooseRoomTab(page: Page, name: string) {
  // Wait for the room shell before inspecting responsive navigation visibility.
  await page
    .getByRole('button', { name: 'Tìm & thêm bài', exact: true })
    .filter({ visible: true })
    .waitFor();
  const target = () => page.getByRole('button', { name, exact: true }).filter({ visible: true });
  if (!(await target().count())) {
    const more = page.getByRole('button', { name: 'Thêm mục trong phòng', exact: true });
    if (await more.isVisible()) await more.click();
    else {
      const group = ['Thư viện của tôi', 'Lịch sử phát'].includes(name)
        ? 'Cá nhân'
        : ['Trò chơi', 'Vòng quay may mắn'].includes(name)
          ? 'Giải trí'
          : 'Quản lý';
      await page.getByRole('button', { name: group, exact: true }).click();
    }
  }
  await target().click();
}
