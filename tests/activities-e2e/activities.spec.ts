import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gameFixture, room, ids, fakeMusic } from '../game-e2e/fixture';
import { chooseRoomTab } from '../helpers/room-navigation';
import type { WheelCommand, WheelResult, WheelSnapshot } from '../../src/shared/wheel';

async function fixture(page: Page) {
  const music = gameFixture();
  await music.attach(page.context(), 1);
  await fakeMusic(page.context());
  const state: WheelSnapshot = {
    server_time: new Date().toISOString(),
    online: [
      { id: ids[0], label: 'An', queued: 3 },
      { id: ids[1], label: 'Bình', queued: 2 },
    ],
    latest: null,
    recent: [],
  };
  const requests: { key: string; command: WheelCommand }[] = [];
  const receipts = new Map<string, WheelResult>();
  let finish: (() => void) | null = null,
    delay = false,
    fail = false,
    loseResponse = false;
  await page.route('**/api/v1/rooms/*/wheel', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: state });
    const command = route.request().postDataJSON() as WheelCommand;
    const key = route.request().headers()['idempotency-key'];
    requests.push({ key, command });
    if (fail) return route.fulfill({ status: 409, json: { error: { code: 'WHEEL_STALE' } } });
    if (delay)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    const choices =
      command.mode === 'CUSTOM'
        ? command.labels.map((label, i) => ({ id: String(i), label }))
        : state.online;
    const result: WheelResult = receipts.get(key) ?? {
      id: crypto.randomUUID(),
      mode: command.mode,
      reward: command.reward,
      choices,
      winner_index: 1,
      winner: choices[1],
      actor: ids[1],
      created_at: new Date().toISOString(),
      reveal_at: new Date(Date.now() + 1000).toISOString(),
      next_spin_at: new Date(Date.now() + 1800).toISOString(),
      rewarded:
        command.reward === 'NONE'
          ? []
          : [{ id: crypto.randomUUID(), title: 'Bài của người may mắn' }],
    };
    if (!receipts.has(key)) {
      receipts.set(key, result);
      state.latest = result;
      state.recent.unshift(result);
    }
    if (loseResponse)
      return route.fulfill({ status: 503, json: { error: { code: 'BACKEND_UNAVAILABLE' } } });
    return route.fulfill({ json: result });
  });
  await page.goto(`/room/${room}`);
  return {
    music,
    state,
    requests,
    loseAcknowledgement(value: boolean) {
      loseResponse = value;
    },
    hold() {
      delay = true;
    },
    release() {
      finish?.();
    },
    fail() {
      fail = true;
    },
  };
}
test('compact navigation, custom choices and a persisted common result leave the player intact', async ({
  page,
}, info) => {
  const f = await fixture(page);
  await page.getByRole('button', { name: 'Bật nghe trên thiết bị này', exact: true }).click();
  const player = await page.locator('.youtube-container iframe').elementHandle();
  await chooseRoomTab(page, 'Vòng quay may mắn');
  const panel = page.getByRole('region', { name: 'Vòng quay may mắn', exact: true });
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: 'Tự nhập', exact: true }).click();
  await page.getByRole('textbox', { name: 'Danh sách lựa chọn' }).fill('Phở\nBún bò\nCơm tấm');
  f.hold();
  await page.getByRole('button', { name: 'Quay may mắn', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Đang xác nhận lượt quay…', exact: true }),
  ).toBeDisabled();
  expect(f.requests).toHaveLength(1);
  f.release();
  await expect(panel.getByRole('heading', { name: 'Bún bò', exact: true })).toBeVisible();
  expect(f.requests[0].command.reward).toBe('NONE');
  expect(f.music.musicCommands).toEqual([]);
  expect(await player!.evaluate((node) => node.isConnected)).toBe(true);
  await chooseRoomTab(page, 'Tìm & thêm bài');
  await chooseRoomTab(page, 'Vòng quay may mắn');
  await expect(panel.getByRole('heading', { name: 'Bún bò', exact: true })).toBeVisible();
  await page.reload();
  await expect(panel.getByRole('heading', { name: 'Bún bò', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Danh sách lựa chọn' })).toHaveValue(
    'Phở\nBún bò\nCơm tấm',
  );
  await page.getByRole('textbox', { name: 'Danh sách lựa chọn' }).fill('Đi biển\nLeo núi');
  await expect(page.locator('.lucky-disc')).toHaveText(/Đi biển/);
  await expect(page.locator('.lucky-disc')).not.toHaveText(/Bún bò/);
  expect(f.requests).toHaveLength(1);
  await page.setViewportSize({ width: 320, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('wheel-custom.png'), fullPage: true });
});

test('a lost acknowledgement survives reload and retries the same spin without another reward', async ({
  page,
}) => {
  const f = await fixture(page);
  await chooseRoomTab(page, 'Vòng quay may mắn');
  await page.getByRole('checkbox', { name: 'Có phần thưởng nhạc' }).check();
  f.loseAcknowledgement(true);
  await page.getByRole('button', { name: 'Quay may mắn', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Xác nhận lại lượt quay', exact: true }),
  ).toBeEnabled();
  expect(f.state.recent).toHaveLength(1);
  await page.reload();
  f.loseAcknowledgement(false);
  await page.getByRole('button', { name: 'Xác nhận lại lượt quay', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Xác nhận lại lượt quay', exact: true }),
  ).toHaveCount(0);
  expect(new Set(f.requests.map((request) => request.key)).size).toBe(1);
  expect(f.state.recent).toHaveLength(1);
  expect(f.state.latest?.rewarded).toHaveLength(1);
});

test('unsupported voice leaves keyboard search available', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { SpeechRecognition: undefined, webkitSpeechRecognition: undefined });
  });
  await fixture(page);
  let query = '';
  await page.route('**/youtube/search?*', (route) => {
    query = new URL(route.request().url()).searchParams.get('q') ?? '';
    return route.fulfill({ json: { items: [] } });
  });
  await chooseRoomTab(page, 'Tìm & thêm bài');
  await expect(page.getByRole('button', { name: 'Tìm bằng giọng nói' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Tìm bài hát trên YouTube' }).fill('bad');
  await expect.poll(() => query).toBe('bad');
});
test('voice is opt-in, final text uses debounce, denied voice preserves typing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    class Recognition {
      lang = '';
      continuous = false;
      interimResults = true;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onresult: ((e: unknown) => void) | null = null;
      start() {
        Object.assign(window, { testVoice: this });
        this.onstart?.();
      }
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: Recognition });
  });
  await fixture(page);
  let searches = 0;
  await page.route('**/youtube/search?*', (route) => {
    searches++;
    return route.fulfill({ json: { items: [] } });
  });
  await chooseRoomTab(page, 'Tìm & thêm bài');
  expect(
    await page.evaluate(() => Boolean((window as unknown as { testVoice: unknown }).testVoice)),
  ).toBe(false);
  await page.getByRole('button', { name: 'Tìm bằng giọng nói' }).click();
  await expect(page.getByText('Đang nghe… hãy nói tên bài hát.', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { testVoice: { onresult: (e: unknown) => void } }).testVoice.onresult({
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: 'em' } }],
    });
  });
  expect(searches).toBe(0);
  await page.evaluate(() => {
    (window as unknown as { testVoice: { onresult: (e: unknown) => void } }).testVoice.onresult({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: 'Em về đi' } }],
    });
  });
  await expect(page.getByRole('textbox', { name: 'Tìm bài hát trên YouTube' })).toHaveValue(
    'Em về đi',
  );
  await expect.poll(() => searches).toBe(1);
  await page.getByRole('button', { name: 'Tìm bằng giọng nói' }).click();
  await page.evaluate(() => {
    (window as unknown as { testVoice: { onerror: (e: unknown) => void } }).testVoice.onerror({
      error: 'not-allowed',
    });
  });
  await expect(page.getByText(/Chưa được phép dùng micro/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Tìm bài hát trên YouTube' }).fill('bad');
  await expect.poll(() => searches).toBe(2);
  await page.setViewportSize({ width: 320, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('member can select a reward, custom mode disables prizes, errors and accessible themes remain usable', async ({
  page,
}, info) => {
  const f = await fixture(page);
  await chooseRoomTab(page, 'Vòng quay may mắn');
  await page.getByRole('checkbox', { name: 'Có phần thưởng nhạc' }).check();
  await page.getByRole('combobox', { name: 'Chọn phần thưởng' }).selectOption('TWO_FIRST');
  await page.getByRole('button', { name: 'Quay may mắn', exact: true }).click();
  await expect(
    page.getByText('Đã ưu tiên trực tiếp. Bài đang phát vẫn tiếp tục.', { exact: true }),
  ).toBeVisible();
  expect(f.requests[0].command.reward).toBe('TWO_FIRST');
  await page.getByRole('button', { name: 'Tự nhập', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Chọn phần thưởng' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Danh sách lựa chọn' }).fill('A\na');
  await expect(page.getByRole('button', { name: 'Quay may mắn', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Danh sách lựa chọn' }).fill('A\nB');
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    await page.locator('.lucky-panel').evaluate(async (node) => {
      await Promise.all(
        node.getAnimations({ subtree: true }).map((animation) => animation.finished),
      );
    });
    const scan = await new AxeBuilder({ page })
      .include('.lucky-panel')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    await page.locator('.lucky-panel').screenshot({ path: info.outputPath(`wheel-${theme}.png`) });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.locator('.lucky-disc').evaluate((node) => getComputedStyle(node).transitionDuration),
  ).toBe('0s');
  f.fail();
  await page.getByRole('button', { name: 'Quay may mắn', exact: true }).click();
  await expect(page.getByText(/Có người vừa quay trước bạn/)).toBeVisible();
  expect(f.requests.at(-1)?.command.reward).toBe('NONE');
});
