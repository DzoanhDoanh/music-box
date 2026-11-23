import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('an application render failure still offers recovery inside router context', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key === 'roomtune:theme') throw new Error('Fixture render failure');
      return original.call(this, key);
    };
  });
  await page.goto('/');
  await expect(
    page.getByText('Màn hình gặp lỗi. Hãy tải lại trang để khôi phục phiên.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Thử lại/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Về trang chủ', exact: true })).toHaveAttribute(
    'href',
    '/',
  );
  expect(errors.some((error) => error.includes('basename'))).toBe(false);
});
test('landing and access forms have no WCAG A/AA violations', async ({ page }) => {
  test.setTimeout(60000);
  for (const path of ['/', '/join', '/login', '/privacy']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations,
      path,
    ).toEqual([]);
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'Chuyển giao diện sáng' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // Check the settled theme, not intermediate colors during its CSS transition.
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished),
    );
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test('landing, theme persistence, navigation and no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Chung một nhịp.');
  await page.screenshot({ path: `docs/landing-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Chuyển giao diện sáng' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: 'Tham gia phòng', exact: true }).click();
  await expect(page).toHaveURL(/\/join/);
  expect(errors).toEqual([]);
});
test('join validation, prefilled code, missing backend feedback', async ({ page }) => {
  await page.goto('/join?code=ROOM1234');
  await expect(page.getByLabel('Mã phòng', { exact: true })).toHaveValue('ROOM1234');
  await page.getByRole('button', { name: 'Cùng nghe nhạc' }).click();
  await expect(page.getByRole('alert')).toContainText('2 đến 40');
  await page.getByLabel('Tên của bạn').fill('Người thử');
  await page.getByRole('button', { name: 'Cùng nghe nhạc' }).click();
  await expect(page.getByRole('alert')).toContainText('chưa được cấu hình');
});
test('login reports missing configuration', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('operator@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-only-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('chưa được cấu hình');
});
test('404 and privacy routes are usable', async ({ page }) => {
  await page.goto('/does-not-exist');
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  await page.getByRole('link', { name: 'Về trang chủ', exact: true }).click();
  await page.getByRole('link', { name: 'Quyền riêng tư', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quyền riêng tư & dữ liệu' })).toBeVisible();
});
test('320px has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of ['/', '/join', '/login', '/privacy']) {
    await page.goto(path);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      path,
    ).toBe(true);
  }
});
