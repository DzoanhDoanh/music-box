import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gameFixture, room, ids, fakeMusic } from '../game-e2e/fixture';
import { chooseRoomTab } from '../helpers/room-navigation';
import type {
  TarotCommand,
  TarotDrawnCard,
  TarotReading,
  TarotSnapshot,
} from '../../src/shared/tarot/contracts';

async function fixture(
  page: Page,
  options: { ai?: boolean; coins?: number; owner?: boolean } = {},
) {
  const music = gameFixture();
  // Member 0 owns the room; everyone else is a plain member.
  const viewer = options.owner ? 0 : 1;
  await music.attach(page.context(), viewer);
  await fakeMusic(page.context());
  const state: TarotSnapshot = {
    server_time: new Date().toISOString(),
    latest: null,
    recent: [],
    my_next_at: null,
    my_coins: options.coins ?? 10_000,
    paid: true,
    can_configure: options.owner ?? false,
  };
  const requests: { key: string; command: TarotCommand }[] = [];
  const receipts = new Map<string, TarotReading>();
  let next: TarotDrawnCard[] = [
      { card: 0, reversed: false },
      { card: 37, reversed: true },
      { card: 19, reversed: false },
    ],
    loseResponse = false;
  await page.route('**/api/v1/rooms/*/tarot', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: state });
    const command = route.request().postDataJSON() as TarotCommand;
    const key = route.request().headers()['idempotency-key'];
    requests.push({ key, command });
    const count = command.spread === 'ONE' ? 1 : 3;
    const now = Date.now();
    const result: TarotReading = receipts.get(key) ?? {
      id: crypto.randomUUID(),
      actor: ids[viewer],
      actor_name: 'An',
      spread: command.spread,
      topic: command.topic,
      question: command.question,
      cards: next.slice(0, count),
      created_at: new Date(now).toISOString(),
      reveal_at: new Date(now + 1500 + 900 * count).toISOString(),
      ...(options.ai && {
        ai: { status: 'pending' as const, at: new Date(now).toISOString(), attempts: 1 },
      }),
    };
    if (!receipts.has(key)) {
      receipts.set(key, result);
      state.latest = result;
      state.recent.unshift(result);
      state.my_next_at = new Date(now + 20_000).toISOString();
      if (state.paid) state.my_coins! -= { ONE: 200, THREE: 500, YES_NO: 300 }[command.spread];
    }
    if (loseResponse)
      return route.fulfill({ status: 503, json: { error: { code: 'BACKEND_UNAVAILABLE' } } });
    return route.fulfill({ json: result });
  });
  const settings: boolean[] = [];
  await page.route('**/api/v1/rooms/*/tarot/settings', async (route) => {
    const { paid } = route.request().postDataJSON() as { paid: boolean };
    settings.push(paid);
    state.paid = paid;
    return route.fulfill({ json: { paid } });
  });
  // The owner's own AI in the room settings: saved only after its test call answers ("good-model"),
  // switched on only once saved. The key is write-only.
  const aiCalls: { path: string; body: Record<string, unknown> }[] = [];
  let aiView = {
    enabled: false,
    base_url: '',
    model: '',
    has_key: false,
    key_hint: null as string | null,
    updated_at: null as string | null,
  };
  let apiUp = true;
  const answers = (model: string) => apiUp && model.startsWith('good-model');
  await page.route('**/api/v1/rooms/*/ai**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/ai')[1];
    if (route.request().method() === 'GET') return route.fulfill({ json: aiView });
    const body = route.request().postDataJSON() as Record<string, string | boolean>;
    aiCalls.push({ path, body });
    if (path === '') {
      if (!answers(String(body.model)))
        return route.fulfill({
          json: { ok: false, message: 'Chưa lưu: Sai Base URL hoặc model không tồn tại.' },
        });
      const key = typeof body.api_key === 'string' ? body.api_key : null;
      aiView = {
        ...aiView,
        base_url: String(body.base_url),
        model: String(body.model),
        has_key: key ? true : aiView.has_key,
        key_hint: key ? key.slice(-4) : aiView.key_hint,
      };
      return route.fulfill({
        json: {
          ok: true,
          message: 'Kết nối được và đã lưu. Model trả lời sau 1.2 giây.',
          view: aiView,
        },
      });
    }
    if (path === '/enabled') {
      if (body.enabled && !answers(aiView.model))
        return route.fulfill({
          json: { ok: false, message: 'Chưa bật được: Không kết nối được tới Base URL.' },
        });
      aiView = { ...aiView, enabled: Boolean(body.enabled) };
      return route.fulfill({ json: { ok: true, message: 'Đã đổi.', view: aiView } });
    }
    aiView = { ...aiView, enabled: false, has_key: false, key_hint: null };
    return route.fulfill({ json: { ok: true, message: 'Đã xóa API key.', view: aiView } });
  });
  const retries: string[] = [];
  await page.route('**/api/v1/rooms/*/tarot/*/ai', async (route) => {
    const id = route.request().url().split('/').at(-2)!;
    retries.push(id);
    const reading = state.recent.find((r) => r.id === id)!;
    reading.ai = {
      status: 'pending',
      at: new Date().toISOString(),
      attempts: (reading.ai?.attempts ?? 0) + 1,
    };
    return route.fulfill({ json: { started: true } });
  });
  await page.goto(`/room/${room}`);
  return {
    aiCalls,
    setApiUp(value: boolean) {
      apiUp = value;
    },
    settings,
    retries,
    finishAi(text: string | null) {
      const reading = state.latest!;
      reading.ai = {
        status: text ? 'done' : 'failed',
        at: new Date().toISOString(),
        attempts: reading.ai?.attempts ?? 1,
        ...(text && { text }),
      };
    },
    music,
    state,
    requests,
    setNext(cards: TarotDrawnCard[]) {
      next = cards;
    },
    cooldownOver() {
      state.my_next_at = null;
    },
    loseAcknowledgement(value: boolean) {
      loseResponse = value;
    },
  };
}

/** Shuffle, then pick `count` cards from the fan by intuition. */
async function pickCards(panel: Locator, count: number) {
  await panel.getByRole('button', { name: /^Xào bài/ }).click();
  await expect(panel.getByRole('group', { name: 'Bộ bài đã trải' })).toBeVisible();
  for (let i = 0; i < count; i++)
    await panel.getByRole('button', { name: `Lá úp thứ ${5 + i * 4}`, exact: true }).press('Enter');
}
const card = (panel: Locator, name: string) => panel.getByRole('button', { name, exact: true });

test('a three-card reading: shuffle, pick from the fan, flip for the room and survive reload', async ({
  page,
}, info) => {
  const f = await fixture(page);
  await chooseRoomTab(page, 'Bói Tarot');
  const panel = page.getByRole('region', { name: 'Bói Tarot', exact: true });
  await expect(panel.getByText('Bộ bài 78 lá đang chờ.')).toBeVisible();
  await panel.getByRole('button', { name: 'Tình cảm', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Câu hỏi' }).fill('  Sắp tới thế nào?  ');
  await panel.getByRole('button', { name: /^Xào bài/ }).click();
  await expect(panel.getByRole('status', { name: 'Đang xào bài' })).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Bộ bài đã trải' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Lá úp thứ/ })).toHaveCount(78);
  // Every card of the deck lies fully inside the table, none cut off at the edges.
  const fan = panel.getByRole('group', { name: 'Bộ bài đã trải' });
  await fan.evaluate((node) =>
    Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished)),
  );
  const clipped = await fan.evaluate((node) => {
    const table = node.closest('.tarot-stage')!.getBoundingClientRect();
    return [...node.querySelectorAll('button')].filter((card) => {
      const box = card.getBoundingClientRect();
      return (
        box.left < table.left ||
        box.right > table.right ||
        box.top < table.top ||
        box.bottom > table.bottom
      );
    }).length;
  });
  expect(clipped).toBe(0);
  await page.waitForTimeout(800);
  await panel.locator('.tarot-stage').screenshot({ path: info.outputPath('tarot-fan.png') });
  await panel.getByRole('button', { name: 'Lá úp thứ 3', exact: true }).press('Enter');
  await panel.getByRole('button', { name: 'Lá úp thứ 9', exact: true }).press('Enter');
  await expect(panel.getByText(/\(2\/3\)/)).toBeVisible();
  expect(f.requests).toHaveLength(0);
  await panel.getByRole('button', { name: 'Lá úp thứ 15', exact: true }).press('Enter');
  await expect.poll(() => f.requests.length).toBe(1);
  expect(f.requests[0].command).toEqual({
    action: 'draw',
    spread: 'THREE',
    topic: 'LOVE',
    question: 'Sắp tới thế nào?',
  });
  await expect(panel.getByRole('button', { name: 'Đang lật bài…' })).toBeDisabled();
  await expect(card(panel, 'Quá khứ: Kẻ Khờ')).toBeVisible();
  await expect(card(panel, 'Hiện tại: 2 Cốc (ngược)')).toBeVisible();
  await expect(card(panel, 'Tương lai: Mặt Trời')).toBeVisible();
  await expect(panel.getByText('Dòng chảy năng lượng')).toBeVisible();
  await expect(panel.locator('blockquote')).toHaveText('“Sắp tới thế nào?”');
  await expect(panel.getByRole('button', { name: /Rút tiếp sau \d+s/ })).toBeDisabled();
  // A revealed card opens large with both meanings.
  await card(panel, 'Hiện tại: 2 Cốc (ngược)').click();
  const zoom = page.getByRole('dialog', { name: '2 Cốc (ngược)' });
  await expect(zoom.getByText('Khi xuôi:')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(zoom).toHaveCount(0);
  expect(f.music.musicCommands).toEqual([]);
  await page.reload();
  await expect(card(panel, 'Tương lai: Mặt Trời')).toBeVisible();
  await expect(panel.getByText(/Những lượt rút gần đây/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('tarot-three.png'), fullPage: true });
});

test('a yes/no reading needs a question and answers from the centre card', async ({ page }) => {
  const f = await fixture(page);
  f.setNext([
    { card: 19, reversed: false },
    { card: 40, reversed: true },
    { card: 17, reversed: false },
  ]);
  await chooseRoomTab(page, 'Bói Tarot');
  const panel = page.getByRole('region', { name: 'Bói Tarot', exact: true });
  await panel.getByRole('button', { name: /Có \/ Không/ }).click();
  await expect(panel.getByRole('button', { name: /^Xào bài/ })).toBeDisabled();
  await panel.getByRole('textbox', { name: 'Câu hỏi' }).fill('Có nên đổi việc?');
  await pickCards(panel, 3);
  await expect(card(panel, 'Câu trả lời: 5 Cốc (ngược)')).toBeVisible();
  await expect(panel.getByText('Chưa phải lúc', { exact: true })).toBeVisible();
  // Picking an older reading from history, then a new reading takes the stage again.
  f.cooldownOver();
  f.setNext([
    { card: 19, reversed: false },
    { card: 64, reversed: false },
    { card: 17, reversed: false },
  ]);
  await page.reload();
  await pickCards(panel, 3);
  await expect(panel.getByText('Có, nhưng phải đánh đổi', { exact: true })).toBeVisible();
  await panel.getByText(/Những lượt rút gần đây/).click();
  await panel.getByRole('button', { name: /5 Cốc \(ngược\)/ }).click();
  await expect(panel.getByText('Chưa phải lúc', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Về lượt rút mới nhất' }).click();
  await expect(panel.getByText('Có, nhưng phải đánh đổi', { exact: true })).toBeVisible();
});

test('picking can be cancelled, and a lost acknowledgement retries the same draw once', async ({
  page,
}) => {
  const f = await fixture(page);
  await chooseRoomTab(page, 'Bói Tarot');
  const panel = page.getByRole('region', { name: 'Bói Tarot', exact: true });
  await panel.getByRole('button', { name: /^Xào bài/ }).click();
  await panel.getByRole('button', { name: 'Lá úp thứ 2', exact: true }).press('Enter');
  await panel.getByRole('button', { name: 'Thôi, không rút nữa' }).click();
  await expect(panel.getByText('Bộ bài 78 lá đang chờ.')).toBeVisible();
  expect(f.requests).toHaveLength(0);
  f.loseAcknowledgement(true);
  await pickCards(panel, 3);
  await expect(panel.getByRole('button', { name: 'Xác nhận lại lượt rút' })).toBeEnabled();
  await page.reload();
  f.loseAcknowledgement(false);
  await panel.getByRole('button', { name: 'Xác nhận lại lượt rút' }).click();
  await expect(panel.getByRole('button', { name: 'Xác nhận lại lượt rút' })).toHaveCount(0);
  expect(new Set(f.requests.map((r) => r.key)).size).toBe(1);
  expect(f.state.recent).toHaveLength(1);
});

test('the tarot panel passes accessibility checks in both themes and respects reduced motion', async ({
  page,
}, info) => {
  await fixture(page);
  await chooseRoomTab(page, 'Bói Tarot');
  const panel = page.getByRole('region', { name: 'Bói Tarot', exact: true });
  await pickCards(panel, 3);
  await expect(card(panel, 'Tương lai: Mặt Trời')).toBeVisible();
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    await page.locator('.tarot-panel').evaluate(async (node) => {
      await Promise.all(
        node
          .getAnimations({ subtree: true })
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished),
      );
    });
    const scan = await new AxeBuilder({ page })
      .include('.tarot-panel')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    await page.locator('.tarot-panel').screenshot({ path: info.outputPath(`tarot-${theme}.png`) });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The app-wide reduced-motion rule shortens every transition to a few microseconds.
  const flip = await page
    .locator('.tarot-card-inner')
    .first()
    .evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration));
  expect(flip).toBeLessThan(0.01);
});

const aiText = [
  '## Mở đầu',
  'Câu hỏi của bạn mở ra một chặng mới. **Năng lượng chung** đang đi lên.',
  '',
  '## Kẻ Khờ ở vị trí Quá khứ',
  'Bạn đã từng dám bắt đầu mà không cần biết trước mọi thứ.',
  '<script>window.injected = true</script>',
].join('\n');

test('the long AI reading appears after the flip, and a failed one can be retried', async ({
  page,
}) => {
  const f = await fixture(page, { ai: true });
  await chooseRoomTab(page, 'Bói Tarot');
  const panel = page.getByRole('region', { name: 'Bói Tarot', exact: true });
  await pickCards(panel, 3);
  await expect(card(panel, 'Tương lai: Mặt Trời')).toBeVisible();
  await expect(panel.getByRole('status', { name: 'Đang luận giải chi tiết' })).toBeVisible();
  f.finishAi(null);
  await expect(
    panel.getByText('Chưa viết được phần luận giải chi tiết.', { exact: false }),
  ).toBeVisible({
    timeout: 10_000,
  });
  await panel.getByRole('button', { name: 'Luận giải lại' }).click();
  await expect(panel.getByRole('status', { name: 'Đang luận giải chi tiết' })).toBeVisible();
  expect(f.retries).toEqual([f.state.latest!.id]);
  f.finishAi(aiText);
  const section = panel.getByRole('region', { name: 'Luận giải chi tiết' });
  await expect(section).toBeVisible({ timeout: 10_000 });
  await expect(section.getByRole('heading', { name: 'Kẻ Khờ ở vị trí Quá khứ' })).toBeVisible();
  await expect(section.locator('strong')).toHaveText('Năng lượng chung');
  // Model output is text, never markup.
  await expect(section.getByText('<script>window.injected = true</script>')).toBeVisible();
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);
  // The per-card meanings are still there below the long reading.
  await expect(panel.getByText('Dòng chảy năng lượng')).toBeVisible();
  const scan = await new AxeBuilder({ page })
    .include('.tarot-ai')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
});

test('drawing costs coins from the shared wallet and is blocked when the wallet is short', async ({
  page,
}) => {
  const f = await fixture(page, { coins: 700 });
  await chooseRoomTab(page, 'Bói Tarot');
  const panel = page.getByRole('region', { name: 'Bói Tarot', exact: true });
  await expect(panel.getByText('Ví của bạn: 700 xu')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Xào bài · 500 xu' })).toBeEnabled();
  await pickCards(panel, 3);
  await expect(card(panel, 'Tương lai: Mặt Trời')).toBeVisible();
  await expect(panel.getByText('Ví của bạn: 200 xu')).toBeVisible({ timeout: 8_000 });
  f.cooldownOver();
  // 200 coins left: the three-card spread is out of reach, a single card is not.
  await expect(panel.getByRole('button', { name: 'Chưa đủ xu' })).toBeDisabled();
  await expect(panel.getByText(/cần 500 xu/)).toBeVisible();
  await panel.getByRole('button', { name: /^1 lá/ }).click();
  await expect(panel.getByRole('button', { name: 'Xào bài · 200 xu' })).toBeEnabled();
  expect(f.requests).toHaveLength(1);
});

test('the room owner makes Tarot free in the room settings', async ({ page }) => {
  const f = await fixture(page, { owner: true, coins: 0 });
  await chooseRoomTab(page, 'Bói Tarot');
  const panel = page.getByRole('region', { name: 'Bói Tarot', exact: true });
  await expect(panel.getByRole('button', { name: 'Chưa đủ xu' })).toBeDisabled();
  await expect(panel.getByRole('switch', { name: /Tính xu/ })).toHaveCount(0);
  await chooseRoomTab(page, 'Cài đặt phòng');
  const toggle = page.getByRole('switch', { name: 'Tính xu khi rút bài' });
  await expect(toggle).toBeChecked();
  await expect(page.getByText(/3 lá 500 xu/)).toBeVisible();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  expect(f.settings).toEqual([false]);
  await expect(page.getByText(/rút bài miễn phí/)).toBeVisible();
  await chooseRoomTab(page, 'Bói Tarot');
  await expect(panel.getByRole('button', { name: 'Xào bài · Miễn phí' })).toBeEnabled();
  await expect(panel.getByText('Ví của bạn:')).toHaveCount(0);
  await pickCards(panel, 3);
  await expect(card(panel, 'Tương lai: Mặt Trời')).toBeVisible();
  expect(f.state.my_coins).toBe(0);
});

test("the room's own AI is saved only after it answers, and only then can be switched on", async ({
  page,
}, info) => {
  const f = await fixture(page, { owner: true });
  await chooseRoomTab(page, 'Cài đặt phòng');
  const section = page.getByRole('group', { name: 'AI của phòng' });
  const toggle = section.getByRole('switch', { name: 'Dùng API riêng' });
  const save = section.getByRole('button', { name: 'Kiểm tra & lưu' });
  // Nothing saved: the switch is locked and says why.
  await expect(toggle).toBeDisabled();
  await expect(
    section.getByText(/Chưa bật được: cần kiểm tra & lưu API thành công trước/),
  ).toBeVisible();
  await expect(save).toBeDisabled();
  await section.getByLabel('Base URL').fill('https://rqjec9w.abc-tunnel.example/v1');
  await section.getByLabel('API key').fill('sk-my-own-key-9876');
  await section.getByLabel('Model').fill('bad-model');
  await save.click();
  await expect(section.getByRole('status')).toHaveText(/Chưa lưu: .*model không tồn tại/);
  await expect(toggle).toBeDisabled();
  await section.getByLabel('Model').fill('good-model');
  await save.click();
  await expect(section.getByRole('status')).toHaveText(/Kết nối được và đã lưu/);
  await expect(section.getByLabel('API key')).toHaveValue('');
  await expect(section.getByLabel('API key')).toHaveAttribute('placeholder', /Đã lưu ••••9876/);
  expect(f.aiCalls.map((c) => c.path)).toEqual(['', '']);
  expect(f.aiCalls[1].body).toEqual({
    base_url: 'https://rqjec9w.abc-tunnel.example/v1',
    model: 'good-model',
    api_key: 'sk-my-own-key-9876',
  });
  // Saved: the switch unlocks. If the API went down meanwhile, it will not switch on.
  await expect(toggle).toBeEnabled();
  f.setApiUp(false);
  await toggle.click();
  await expect(section.getByRole('status')).toHaveText(/Chưa bật được/);
  await expect(toggle).not.toBeChecked();
  f.setApiUp(true);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(
    section.getByText(/Đang dùng good-model \(key ••••9876\) cho mọi tính năng AI trong phòng/),
  ).toBeVisible();
  await section.screenshot({ path: info.outputPath('tarot-ai-settings.png') });
  // Editing without saving is flagged; a new save keeps the stored key.
  await section.getByLabel('Model').fill('good-model-2');
  await expect(section.getByText(/chưa được lưu/)).toBeVisible();
  await save.click();
  await expect(section.getByRole('status')).toHaveText(/đã lưu/);
  expect(f.aiCalls.at(-1)!.body).not.toHaveProperty('api_key');
  await section.getByRole('button', { name: 'Xóa key' }).click();
  await expect(toggle).toBeDisabled();
  await expect(toggle).not.toBeChecked();
  const scan = await new AxeBuilder({ page })
    .include('.room-ai-setting')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(scan.violations).toEqual([]);
});
