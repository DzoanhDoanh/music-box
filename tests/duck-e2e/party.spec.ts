import { test, expect, type BrowserContext } from '@playwright/test';
import { gameFixture, fakeMusic, ids, room } from '../game-e2e/fixture';
import { defaultRaceConfig, type DuckSnapshot } from '../../src/shared/duck-race/contracts';
const bridge = 'http://127.0.0.1:55443';
const path = `/room/${room}/games/duck-race`;
async function command(body: unknown, race = '', actor = ids[0]): Promise<DuckSnapshot> {
  const response = await fetch(bridge + '/duck-race' + (race ? '/' + race : ''), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fixture-actor': actor,
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}
async function attach(context: BrowserContext, index = 0) {
  const fixture = gameFixture();
  await fixture.attach(context, index);
  await fakeMusic(context);
  await context.route('**/api/v1/rooms/*/duck-race**', async (route) => {
    const request = route.request(),
      part = new URL(request.url()).pathname.split('/duck-race')[1];
    const response = await fetch(bridge + '/duck-race' + part, {
      method: request.method(),
      headers: {
        'content-type': 'application/json',
        'x-fixture-actor': ids[index],
        'idempotency-key': request.headers()['idempotency-key'] ?? crypto.randomUUID(),
      },
      body: request.postData() ?? undefined,
    });
    await route.fulfill({
      status: response.status,
      body: await response.text(),
      contentType: 'application/json',
    });
  });
  return fixture;
}
test.beforeEach(async () => {
  expect((await fetch(bridge + '/setup', { method: 'POST' })).ok).toBe(true);
});
test('create custom race, import preview, race, finish, verify and seek replay', async ({
  page,
  context,
}, info) => {
  await attach(context);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(path);
  await page.getByRole('button', { name: 'Tạo cuộc đua', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Mở một cuộc đua' });
  await dialog.getByLabel('Tên cuộc đua', { exact: true }).fill('Dòng sông của chúng mình');
  await dialog.getByRole('button', { name: 'Danh sách tùy chọn' }).click();
  await dialog
    .getByLabel('Dán tên, mỗi dòng một mục')
    .fill('An\nBình\nChi\nDũng\nLan\nMinh\nMai\nHà\nNam\nQuỳnh\nTú\nLinh');
  await dialog.getByRole('button', { name: 'Xem trước danh sách' }).click();
  await dialog.getByLabel('Kiểu vịt 1', { exact: true }).selectOption('CONICAL');
  await dialog.getByLabel('Kiểu vịt 2', { exact: true }).selectOption('KING');
  await dialog.getByRole('button', { name: 'Tạo cuộc đua', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dòng sông của chúng mình' })).toBeVisible();
  await page.screenshot({
    path: `test-results/duck/lobby-${info.project.name}.png`,
    fullPage: true,
  });
  const race = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: 'Khóa đội hình & xuất phát' }).click();
  await expect(page.locator('.duck-stage')).toBeVisible();
  if (info.project.name === 'desktop')
    await expect(page.locator('.duck-stage canvas')).toBeVisible({ timeout: 30000 });
  await fetch(bridge + '/time', { method: 'POST', body: JSON.stringify({ race, elapsed: 26000 }) });
  await expect
    .poll(async () =>
      Number(
        await page
          .locator('.duck-stage .duck-pill small')
          .innerText()
          .then((t) => t.split(' /')[0]),
      ),
    )
    .toBeGreaterThan(20);
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: `test-results/duck/race-${info.project.name}.png`,
    fullPage: true,
  });
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport + 1);
  await fetch(bridge + '/time', { method: 'POST', body: JSON.stringify({ race, elapsed: 67000 }) });
  await expect(page.getByRole('heading', { name: 'Bảng về đích' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Kiểm chứng cuộc đua' }).click();
  await expect(
    page.getByText('Cam kết, đội hình và thứ hạng đều khớp.', { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/duck/results-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: /Photo finish/ }).click();
  await expect(page.getByLabel('Tốc độ phát lại')).toHaveValue('0.25');
  await page.getByRole('button', { name: 'Tạm dừng phát lại' }).click();
  await page.getByLabel('Vị trí phát lại').fill('30000');
  await expect(page.getByLabel('Vị trí phát lại')).toHaveValue('30000');
  await page.getByRole('button', { name: 'Về kết quả' }).click();
  expect(errors).toEqual([]);
});
test('two members ready, host disconnect, snapshot recovery and spectator permissions', async ({
  browser,
  page,
  context,
}, info) => {
  await attach(context);
  const other = await browser.newContext(info.project.use);
  await attach(other, 1);
  const guest = await other.newPage();
  try {
    const created = await command({
      action: 'create',
      name: 'Cùng về đích',
      config: { ...defaultRaceConfig, duration: 30 },
      entries: [],
      songs: [],
    });
    const race = created.race!.id;
    await page.goto(path + '/' + race);
    await guest.goto(path + '/' + race);
    await page.getByRole('button', { name: 'Tham gia cuộc đua', exact: true }).click();
    await guest.getByRole('button', { name: 'Tham gia cuộc đua', exact: true }).click();
    await guest.getByRole('button', { name: 'Đổi phong cách vịt' }).click();
    await guest.getByRole('button', { name: 'Phi hành gia' }).click();
    await guest.getByRole('button', { name: 'Chọn phong cách này' }).click();
    await page.getByRole('button', { name: 'Tôi đã sẵn sàng' }).click();
    await guest.getByRole('button', { name: 'Tôi đã sẵn sàng' }).click();
    await expect(page.getByRole('button', { name: 'Khóa đội hình & xuất phát' })).toBeEnabled({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Khóa đội hình & xuất phát' }).click();
    await expect(guest.getByRole('button', { name: 'Cài đặt cuộc đua', exact: true })).toHaveCount(
      0,
    );
    await page.close();
    await fetch(bridge + '/time', {
      method: 'POST',
      body: JSON.stringify({ race, elapsed: 15000 }),
    });
    await guest.reload();
    await expect(guest.locator('.duck-stage')).toBeVisible();
    await other.setOffline(true);
    await guest.waitForTimeout(1600);
    await other.setOffline(false);
    await fetch(bridge + '/time', {
      method: 'POST',
      body: JSON.stringify({ race, elapsed: 37000 }),
    });
    await expect(guest.getByRole('heading', { name: 'Bảng về đích' })).toBeVisible({
      timeout: 20000,
    });
    await guest.getByRole('button', { name: 'Kiểm chứng cuộc đua' }).click();
    await expect(
      guest.getByText('Cam kết, đội hình và thứ hạng đều khớp.', { exact: false }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});
for (const track of ['SUNNY', 'TROPICAL', 'FESTIVAL'])
  test(`${track}: thirty ducks, camera controls and performance samples`, async ({
    page,
    context,
  }, info) => {
    test.skip(info.project.name !== 'desktop', '3D desktop visual/performance inspection');
    await attach(context);
    const all = [
      'YELLOW',
      'WHITE',
      'BLACK',
      'NINJA',
      'PIRATE',
      'KING',
      'ASTRONAUT',
      'COWBOY',
      'CONICAL',
      'PARTY',
      'ROBOT',
      'RAINBOW',
    ];
    const samples = [];
    const created = await command({
      action: 'create',
      name: track + ' · River Club',
      config: { ...defaultRaceConfig, mode: 'CUSTOM', track, duration: 120 },
      songs: [],
      entries: Array.from({ length: 30 }, (_, i) => ({
        name: 'Vịt ' + (i + 1),
        skin: all[i % all.length],
        team: '',
      })),
    });
    const race = created.race!.id;
    await command({ action: 'start' }, race);
    await fetch(bridge + '/time', {
      method: 'POST',
      body: JSON.stringify({ race, elapsed: 50000 }),
    });
    await page.goto(path + '/' + race);
    await page.getByRole('button', { name: 'Hình ảnh và âm thanh' }).click();
    await page.getByLabel('Hiện hiệu năng').check();
    await page.getByLabel('Chất lượng', { exact: true }).selectOption('MEDIUM');
    await page.getByLabel('Tự giảm chất lượng khi máy chậm').uncheck();
    await page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(page.locator('.duck-stage canvas')).toBeVisible();
    await page.getByLabel('Góc máy', { exact: true }).selectOption('LEADER');
    await page.waitForTimeout(8000);
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(2700);
      samples.push({
        track,
        renderer: await page.locator('.duck-stage canvas').getAttribute('data-renderer'),
        metrics: JSON.parse(
          (await page.locator('.duck-stage canvas').getAttribute('data-performance')) ?? '{}',
        ),
      });
    }
    await page.locator('.duck-stage').screenshot({ path: `test-results/duck/world-${track}.png` });
    await page.getByLabel('Góc máy', { exact: true }).selectOption('FREE');
    const box = (await page.locator('.duck-stage canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 + 25, { steps: 12 });
    await page.mouse.up();
    await info.attach('performance-browser-measured', {
      body: JSON.stringify(samples, null, 2),
      contentType: 'application/json',
    });
    console.log('Duck performance measurements', JSON.stringify(samples));
  });
