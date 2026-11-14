import { chromium, expect } from '@playwright/test';

// Exercise the real form with unmodified hosted snapshots and run-owned credentials.
export async function verifyRoomSettings({ base, supabaseUrl, ownerSession, roomId }) {
  const browser = await chromium.launch({ headless: true });
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  try {
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(
        ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
        { key: storageKey, value: ownerSession },
      );
      const page = await context.newPage();
      await page.goto(`${base}/room/${roomId}`);
      const settingsTab = page
        .getByRole('button', { name: 'Cài đặt phòng', exact: true })
        .filter({ visible: true });
      await settingsTab.click();
      const mode = page.getByLabel('Thiết bị phát nhạc', { exact: true });
      for (const value of ['ALL_DEVICES', 'HOST_ONLY']) {
        await mode.selectOption(value);
        const saved = page.waitForResponse(
          (response) =>
            response.url().endsWith(`/rooms/${roomId}/commands`) &&
            response.request().postDataJSON()?.action === 'settings',
        );
        await page.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
        const response = await saved;
        expect(response.status()).toBe(200);
        const submitted = response.request().postDataJSON().settings;
        expect(submitted.playback_mode).toBe(value);
        expect(submitted).not.toHaveProperty('room_id');
        expect(submitted).not.toHaveProperty('updated_at');
        await page.reload();
        await settingsTab.click();
        await expect(mode).toHaveValue(value);
        const listen = page.getByRole('button', {
          name: 'Bật nghe trên thiết bị này',
          exact: true,
        });
        if (value === 'ALL_DEVICES') await expect(listen).toBeVisible();
        else await expect(listen).toHaveCount(0);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

// Optional live validation used by test-hosted.mjs --browser. Uses only run-owned accounts.
export async function verifyDeviceListening({
  base,
  supabaseUrl,
  ownerSession,
  memberSession,
  roomId,
  roomName,
  chatRoom,
  chat = false,
  hostRecovery = false,
  readSnapshot,
  verifyMemberCannotClaim,
}) {
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  try {
    const makePage = async (session, mobile = false) => {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      });
      await context.addInitScript(
        ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
        { key: storageKey, value: session },
      );
      const page = await context.newPage();
      await page.goto(`${base}/room/${roomId}`);
      await expect(page.getByRole('button', { name: 'Rời phòng', exact: true })).toBeVisible();
      return page;
    };
    let host = await makePage(ownerSession);
    const listener = await makePage(memberSession, true);
    await host
      .getByRole('button', { name: 'Máy phát nhạc', exact: true })
      .filter({ visible: true })
      .click();
    await host.getByRole('button', { name: 'Nhận quyền phát nhạc', exact: true }).click();
    await expect(host.getByText('Đang giữ quyền host', { exact: true })).toBeVisible();
    const hostPlay = host.getByRole('button', { name: 'Phát', exact: true });
    await expect(hostPlay).toBeEnabled({ timeout: 30000 });
    await hostPlay.click();
    await listener.getByRole('button', { name: 'Bật nghe trên thiết bị này', exact: true }).click();
    const video = (page) =>
      page.frameLocator('iframe[src*="youtube.com/embed"]').locator('video.html5-main-video');
    const sample = async (page) =>
      video(page).evaluate((element) => ({
        time: element.currentTime,
        paused: element.paused,
        ready: element.readyState,
      }));
    for (const page of [host, listener]) {
      await expect(video(page)).toBeAttached({ timeout: 30000 });
      const unblock = page.getByRole('button', {
        name: page === host ? 'Tiếp tục phát nhạc' : 'Tiếp tục nghe',
        exact: true,
      });
      if (await unblock.isVisible()) await unblock.click();
      await expect.poll(async () => (await sample(page)).paused, { timeout: 30000 }).toBe(false);
    }
    const first = await Promise.all([sample(host), sample(listener)]);
    await expect
      .poll(async () => (await sample(host)).time - first[0].time, { timeout: 12000 })
      .toBeGreaterThan(3);
    await expect
      .poll(async () => (await sample(listener)).time - first[1].time, { timeout: 12000 })
      .toBeGreaterThan(3);
    const playing = await Promise.all([sample(host), sample(listener)]);
    if (chat) {
      const frames = await Promise.all(
        [host, listener].map((page) => page.locator('.youtube-container iframe').elementHandle()),
      );
      const listenerChat = listener.getByRole('region', {
        name: 'Trò chuyện trong phòng',
        exact: true,
      });
      const hostChat = host.getByRole('region', { name: 'Trò chuyện trong phòng', exact: true });
      await host.getByRole('button', { name: /Trò chuyện/ }).click();
      await host.getByRole('button', { name: `Chat trong ${roomName}`, exact: true }).click();
      await hostChat.getByLabel('Tin nhắn của bạn').fill('Chào từ máy host 🎵');
      await hostChat.getByRole('button', { name: 'Gửi tin', exact: true }).click();
      await expect(listener.getByLabel('1 tin chưa đọc')).toBeVisible({ timeout: 10000 });
      await listener.getByRole('button', { name: /Trò chuyện/ }).click();
      await listener.getByRole('button', { name: `Chat trong ${roomName}`, exact: true }).click();
      await expect(listenerChat.getByText('Chào từ máy host 🎵', { exact: true })).toBeVisible();
      await listenerChat.getByLabel('Tin nhắn của bạn').fill('Điện thoại nhận được rồi!');
      await listenerChat.getByRole('button', { name: 'Gửi tin', exact: true }).click();
      await expect(hostChat.getByText('Điện thoại nhận được rồi!', { exact: true })).toBeVisible({
        timeout: 10000,
      });
      await expect(
        listenerChat.getByRole('button', { name: 'Xóa tin nhắn của bạn', exact: true }),
      ).toHaveCount(1);
      await hostChat
        .locator('article')
        .filter({ hasText: 'Điện thoại nhận được rồi!' })
        .getByRole('button', { name: /Xóa tin nhắn/ })
        .click();
      await expect(
        listenerChat.getByText('Điện thoại nhận được rồi!', { exact: true }),
      ).toHaveCount(0, { timeout: 10000 });
      if (chatRoom) {
        const requests = [];
        for (const page of [host, listener]) {
          page.on('request', (request) => {
            if (request.url().includes(`/rooms/${chatRoom.id}/`))
              requests.push(new URL(request.url()).pathname);
          });
          await page.getByRole('button', { name: 'Chọn phòng chat', exact: true }).click();
          await page
            .getByRole('button', { name: `Chat trong ${chatRoom.name}`, exact: true })
            .click();
        }
        await hostChat.getByLabel('Tin nhắn của bạn').fill('Chat phòng B, vẫn nghe phòng A');
        await hostChat.getByRole('button', { name: 'Gửi tin', exact: true }).click();
        await expect(
          listenerChat.getByText('Chat phòng B, vẫn nghe phòng A', { exact: true }),
        ).toBeVisible({ timeout: 10000 });
        await listenerChat.getByLabel('Tin nhắn của bạn').fill('Đã nhận trong phòng B');
        await listenerChat.getByRole('button', { name: 'Gửi tin', exact: true }).click();
        await expect(hostChat.getByText('Đã nhận trong phòng B', { exact: true })).toBeVisible({
          timeout: 10000,
        });
        expect(requests.length).toBeGreaterThan(0);
        expect(requests.every((path) => path.endsWith('/chat'))).toBe(true);
        for (const page of [host, listener]) expect(page.url()).toBe(`${base}/room/${roomId}`);
      }
      for (const [index, page] of [host, listener].entries()) {
        expect(await frames[index].evaluate((node) => node.isConnected)).toBe(true);
        await expect
          .poll(async () => (await sample(page)).time - playing[index].time, { timeout: 10000 })
          .toBeGreaterThan(2);
        expect((await sample(page)).paused).toBe(false);
        await page.getByRole('button', { name: 'Đóng trò chuyện' }).click();
      }
      console.log(
        'LIVE private room chat exchanged and moderated across desktop/mobile without replacing or pausing YouTube IFrames',
      );
    }
    console.log(
      `LIVE two YouTube players advancing: host=${playing[0].time.toFixed(1)}s listener=${playing[1].time.toFixed(1)}s`,
    );
    // Force the SDK expiry check on run-owned browser storage. The renewal itself
    // uses hosted Auth; no shared project policy or actual user session is changed.
    for (const page of [host, listener]) {
      const original = await page.locator('.youtube-container iframe').elementHandle();
      const before = await sample(page);
      await video(page).evaluate((element) => {
        element.dataset.renewalPauses = '0';
        element.addEventListener('pause', () => {
          element.dataset.renewalPauses = String(Number(element.dataset.renewalPauses) + 1);
        });
      });
      const renewed = page.waitForResponse(
        (response) => response.url().startsWith(`${supabaseUrl}/auth/v1/token`),
        { timeout: 20000 },
      );
      await page.evaluate((key) => {
        const session = JSON.parse(localStorage.getItem(key));
        session.expires_at = Math.floor(Date.now() / 1000) - 1;
        localStorage.setItem(key, JSON.stringify(session));
        window.dispatchEvent(new Event('online'));
      }, storageKey);
      expect((await renewed).status()).toBe(200);
      await expect
        .poll(async () => (await sample(page)).time - before.time, { timeout: 12000 })
        .toBeGreaterThan(2);
      expect(await original.evaluate((element) => element.isConnected)).toBe(true);
      expect(await video(page).evaluate((element) => Number(element.dataset.renewalPauses))).toBe(
        0,
      );
      expect(
        await page.evaluate(
          ({ key, actor }) => JSON.parse(localStorage.getItem(key)).user.id === actor,
          { key: storageKey, actor: page === host ? ownerSession.user.id : memberSession.user.id },
        ),
      ).toBe(true);
    }
    console.log(
      'LIVE host/listener renewed hosted Auth sessions with the same playing IFrames and zero pause events',
    );
    await host.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
    await expect.poll(async () => (await sample(listener)).paused, { timeout: 12000 }).toBe(true);
    await hostPlay.click();
    await expect.poll(async () => (await sample(listener)).paused, { timeout: 12000 }).toBe(false);
    const hostFrame = host.locator('.youtube-container iframe');
    const originalFrame = await hostFrame.elementHandle();
    for (const page of [host, listener]) {
      const bounds = await page.locator('.youtube-container iframe').boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(200);
      expect(bounds.width).toBeLessThanOrEqual(380);
      expect(bounds.height).toBeGreaterThanOrEqual(200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    const playerBounds = await host.locator('.host-player').boundingBox();
    const queueBounds = await host
      .getByRole('region', { name: 'Hàng chờ phát nhạc' })
      .boundingBox();
    expect(queueBounds.x).toBeGreaterThanOrEqual(playerBounds.x + playerBounds.width);
    await host
      .getByRole('button', { name: 'Cài đặt phòng', exact: true })
      .filter({ visible: true })
      .click();
    await host.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
    const savedNotice = host.locator('[data-sonner-toast][data-front="true"]');
    await expect(savedNotice).toContainText('Đã lưu cài đặt phòng.', { timeout: 20000 });
    await expect(savedNotice).toBeInViewport();
    const closeBounds = await savedNotice
      .getByRole('button', { name: 'Đóng thông báo' })
      .boundingBox();
    const noticeBounds = await savedNotice.boundingBox();
    expect(closeBounds.x).toBeGreaterThanOrEqual(noticeBounds.x);
    expect(closeBounds.y).toBeGreaterThanOrEqual(noticeBounds.y);
    expect(closeBounds.x + closeBounds.width).toBeLessThanOrEqual(
      noticeBounds.x + noticeBounds.width,
    );
    expect(closeBounds.y + closeBounds.height).toBeLessThanOrEqual(
      noticeBounds.y + noticeBounds.height,
    );
    await expect
      .poll(() =>
        savedNotice.evaluate((element) => {
          const n = element.getBoundingClientRect();
          const p = document.querySelector('.youtube-container iframe').getBoundingClientRect();
          return n.right <= p.left || n.left >= p.right || n.bottom <= p.top || n.top >= p.bottom;
        }),
      )
      .toBe(true);
    await host
      .getByRole('button', { name: 'Không gian nghe', exact: true })
      .filter({ visible: true })
      .click();
    expect(await originalFrame.evaluate((element) => element.isConnected)).toBe(true);
    console.log(
      'LIVE compact player/queue layout, visible settings toast and preserved IFrame passed',
    );
    await listener.evaluate(() => scrollTo(0, 0));
    await host.evaluate(() => scrollTo(0, 0));
    await listener.screenshot({ path: 'docs/listening-mobile-live.png', fullPage: true });
    await host.screenshot({ path: 'docs/listening-host-live.png', fullPage: true });
    if (hostRecovery) {
      // Close the entire host context without the app's graceful release action.
      // Capture only this run's renewed session to open its replacement device.
      const replacementSession = await host.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        storageKey,
      );
      const listenerFrame = await listener.locator('.youtube-container iframe').elementHandle();
      await host.context().close();
      const departed = (await readSnapshot()).playback;
      expect(departed.controller_id).toBeTruthy();
      expect(departed.position).toBeGreaterThan(0);
      await expect(
        listener.getByText('Phòng chưa có máy host đang kết nối', { exact: true }),
      ).toBeVisible({ timeout: 45000 });
      await expect.poll(async () => (await sample(listener)).paused).toBe(true);
      await expect(
        listener.getByRole('button', { name: 'Nhận quyền host trên máy này', exact: true }),
      ).toHaveCount(0);
      await verifyMemberCannotClaim();
      host = await makePage(replacementSession);
      const recoveryButton = host.getByRole('button', {
        name: 'Nhận quyền host trên máy này',
        exact: true,
      });
      await expect(recoveryButton).toBeVisible();
      // Opening the room alone neither claims nor replaces the previous controller.
      expect((await readSnapshot()).playback.controller_id).toBe(departed.controller_id);
      const claimed = host.waitForResponse(
        (response) =>
          response.url().endsWith(`/rooms/${roomId}/commands`) &&
          response.request().postDataJSON()?.action === 'claim',
      );
      await recoveryButton.click();
      const claimResponse = await claimed;
      expect(claimResponse.status()).toBe(200);
      const recovered = (await claimResponse.json()).playback;
      expect(recovered.controller_id).not.toBe(departed.controller_id);
      expect(recovered.fence).toBeGreaterThan(departed.fence);
      expect(recovered.entry_id).toBe(departed.entry_id);
      expect(recovered.run_id).toBe(departed.run_id);
      expect(recovered.position).toBeCloseTo(departed.position, 0);
      await expect(host.getByText('Đang giữ quyền host', { exact: true })).toBeVisible();
      for (const [page, buttonName] of [
        [host, 'Tiếp tục phát nhạc'],
        [listener, 'Tiếp tục nghe'],
      ]) {
        await expect(video(page)).toBeAttached({ timeout: 30000 });
        await expect
          .poll(
            async () => {
              const unblock = page.getByRole('button', { name: buttonName, exact: true });
              if (await unblock.isVisible()) await unblock.click();
              return (await sample(page)).paused;
            },
            { timeout: 30000 },
          )
          .toBe(false);
        const before = await sample(page);
        await expect
          .poll(async () => (await sample(page)).time - before.time, { timeout: 12000 })
          .toBeGreaterThan(2);
        expect((await sample(page)).time).toBeGreaterThanOrEqual(Math.floor(departed.position) - 2);
      }
      expect(await listenerFrame.evaluate((element) => element.isConnected)).toBe(true);
      await expect(
        listener.getByText('Phòng chưa có máy host đang kết nối', { exact: true }),
      ).toHaveCount(0);
      await host.screenshot({ path: 'docs/host-takeover-live.png', fullPage: true });
      console.log(
        'LIVE abrupt host close, natural lease expiry and explicit second-browser takeover preserved run/checkpoint; original listener IFrame resumed; member claim denied',
      );
    }
    await listener.getByRole('button', { name: 'Rời phòng', exact: true }).click();
    await listener.getByRole('button', { name: 'Rời phòng ngay', exact: true }).click();
    await expect(listener).toHaveURL(/\/rooms$/);
    await expect(listener.locator('iframe[src*="youtube.com/embed"]')).toHaveCount(0);
    await host.getByRole('button', { name: 'Rời phòng', exact: true }).click();
    await host.getByRole('button', { name: 'Rời phòng ngay', exact: true }).click();
    await expect(host).toHaveURL(/\/rooms$/);
  } finally {
    await browser.close();
  }
}
