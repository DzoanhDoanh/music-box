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

async function fixture(page: Page) {
  const music = gameFixture();
  await music.attach(page.context(), 1);
  await fakeMusic(page.context());
  const state: TarotSnapshot = {
    server_time: new Date().toISOString(),
    latest: null,
    recent: [],
    my_next_at: null,
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
      actor: ids[0],
      actor_name: 'An',
      spread: command.spread,
      topic: command.topic,
      question: command.question,
      cards: next.slice(0, count),
      created_at: new Date(now).toISOString(),
      reveal_at: new Date(now + 1500 + 900 * count).toISOString(),
    };
    if (!receipts.has(key)) {
      receipts.set(key, result);
      state.latest = result;
      state.recent.unshift(result);
      state.my_next_at = new Date(now + 20_000).toISOString();
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
  await panel.getByRole('button', { name: 'Xào bài', exact: true }).click();
  await expect(panel.getByRole('group', { name: 'Bộ bài đã xòe' })).toBeVisible();
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
  await panel.getByRole('button', { name: 'Xào bài', exact: true }).click();
  await expect(panel.getByRole('status', { name: 'Đang xào bài' })).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Bộ bài đã xòe' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Lá úp thứ/ })).toHaveCount(22);
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
  await expect(panel.getByRole('button', { name: 'Xào bài', exact: true })).toBeDisabled();
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
  await panel.getByRole('button', { name: 'Xào bài', exact: true }).click();
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
