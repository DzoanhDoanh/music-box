import { chromium, expect } from '@playwright/test';

// Uses only the temporary membership managed and cleaned up by test-hosted.mjs.
export async function verifyRoomReturn({ base, supabaseUrl, memberSession, room }) {
  const browser = await chromium.launch({ headless: true });
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  try {
    for (const [device, viewport] of [
      ['desktop', { width: 1280, height: 900 }],
      ['mobile', { width: 390, height: 844 }],
    ]) {
      let context = await browser.newContext({ viewport });
      let page = await context.newPage();
      await page.addInitScript(
        ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
        { key: storageKey, value: memberSession },
      );
      await page.goto(`${base}/room/${room.id}`);
      await expect(page.getByRole('button', { name: 'Rời phòng', exact: true })).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            (uid) => localStorage.getItem(`roomtune:last-room:${uid}`),
            memberSession.user.id,
          ),
        )
        .toBe(room.id);
      await page.getByRole('button', { name: 'Rời phòng', exact: true }).click();
      await page.getByRole('button', { name: 'Rời phòng ngay', exact: true }).click();
      await expect(page).toHaveURL(/\/rooms$/);
      await page.getByRole('link', { name: `Vào lại phòng ${room.name}`, exact: true }).click();
      await expect(page.getByRole('button', { name: 'Rời phòng', exact: true })).toBeVisible();
      // Reopen with persisted browser storage only; no startup session injection.
      const stored = await context.storageState();
      await context.close();
      context = await browser.newContext({ viewport, storageState: stored });
      page = await context.newPage();
      let joinAttempts = 0;
      page.on('request', (request) => {
        if (request.url().includes('/rooms/join') || request.url().includes('/auth/v1/signup'))
          joinAttempts++;
      });
      await page.goto(base);
      const back = page.getByRole('link', { name: 'Vào lại phòng', exact: true });
      await expect(back).toBeInViewport();
      await page.screenshot({ path: `docs/return-${device}-live.png` });
      const snapshot = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/rooms/${room.id}/snapshot`) && response.status() === 200,
      );
      await back.click();
      expect((await (await snapshot).json()).me).toBe(memberSession.user.id);
      await page.goto(`${base}/join?code=${room.code}`);
      await expect(back).toBeVisible();
      await back.click();
      await expect(page.getByRole('button', { name: 'Rời phòng', exact: true })).toBeVisible();
      expect(joinAttempts).toBe(0);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
