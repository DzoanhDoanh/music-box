import { test, expect, type Page } from '@playwright/test';
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
    const count = command.spread === 'THREE' ? 3 : 1;
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

test('a three-card reading flips for the room, explains each card and survives reload', async ({
  page,
}, info) => {
  const f = await fixture(page);
  await chooseRoomTab(page, 'Bói Tarot');
  const panel = page.getByRole('region', { name: 'Bói Tarot', exact: true });
  await expect(panel.getByText('Bộ bài 78 lá đang chờ.')).toBeVisible();
  await panel.getByRole('button', { name: 'Tình cảm', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Câu hỏi' }).fill('  Sắp tới thế nào?  ');
  await panel.getByRole('button', { name: 'Rút bài', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Đang lật bài…' })).toBeDisabled();
  expect(f.requests).toHaveLength(1);
  expect(f.requests[0].command).toEqual({
    action: 'draw',
    spread: 'THREE',
    topic: 'LOVE',
    question: 'Sắp tới thế nào?',
  });
  await expect(panel.getByRole('img', { name: 'Lá bài úp' })).toHaveCount(3);
  await expect(panel.getByRole('img', { name: 'Quá khứ: Kẻ Khờ' })).toBeVisible();
  await expect(panel.getByRole('img', { name: 'Hiện tại: 2 Cốc (ngược)' })).toBeVisible();
  await expect(panel.getByRole('img', { name: 'Tương lai: Mặt Trời' })).toBeVisible();
  await expect(panel.getByText(/Phần lớn các lá xuôi/)).toBeVisible();
  await expect(panel.locator('blockquote')).toHaveText('“Sắp tới thế nào?”');
  await expect(panel.getByRole('button', { name: /Rút tiếp sau \d+s/ })).toBeDisabled();
  expect(f.music.musicCommands).toEqual([]);
  await page.reload();
  await expect(panel.getByRole('img', { name: 'Tương lai: Mặt Trời' })).toBeVisible();
  await expect(panel.getByText(/Những lượt rút gần đây/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('tarot-three.png'), fullPage: true });
});

test('a yes/no reading needs a question and answers from the card orientation', async ({
  page,
}) => {
  const f = await fixture(page);
  f.setNext([{ card: 40, reversed: true }]);
  await chooseRoomTab(page, 'Bói Tarot');
  const panel = page.getByRole('region', { name: 'Bói Tarot', exact: true });
  await panel.getByRole('button', { name: /Có \/ Không/ }).click();
  await expect(panel.getByRole('button', { name: 'Rút bài', exact: true })).toBeDisabled();
  await panel.getByRole('textbox', { name: 'Câu hỏi' }).fill('Có nên đổi việc?');
  await panel.getByRole('button', { name: 'Rút bài', exact: true }).click();
  await expect(panel.getByRole('img', { name: /Câu trả lời: 5 Cốc \(ngược\)/ })).toBeVisible();
  await expect(panel.getByText('Chưa phải lúc', { exact: true })).toBeVisible();
  // Picking an older reading from history, then a new reading takes the stage again.
  f.cooldownOver();
  f.setNext([{ card: 19, reversed: false }]);
  await page.reload();
  await panel.getByRole('button', { name: 'Rút bài', exact: true }).click();
  await expect(panel.getByText('Có, rất rõ', { exact: true })).toBeVisible();
  await panel.getByText(/Những lượt rút gần đây/).click();
  await panel.getByRole('button', { name: /5 Cốc \(ngược\)/ }).click();
  await expect(panel.getByText('Chưa phải lúc', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Về lượt rút mới nhất' }).click();
  await expect(panel.getByText('Có, rất rõ', { exact: true })).toBeVisible();
});

test('a lost acknowledgement is retried with the same key and draws only once', async ({
  page,
}) => {
  const f = await fixture(page);
  await chooseRoomTab(page, 'Bói Tarot');
  const panel = page.getByRole('region', { name: 'Bói Tarot', exact: true });
  f.loseAcknowledgement(true);
  await panel.getByRole('button', { name: 'Rút bài', exact: true }).click();
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
  await panel.getByRole('button', { name: 'Rút bài', exact: true }).click();
  await expect(panel.getByRole('img', { name: 'Tương lai: Mặt Trời' })).toBeVisible();
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    await page.locator('.tarot-panel').evaluate(async (node) => {
      await Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished));
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
