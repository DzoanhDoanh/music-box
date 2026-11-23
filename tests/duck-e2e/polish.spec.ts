import { test, expect, type Page } from '@playwright/test';
import { defaultRaceConfig, duckSkins } from '../../src/shared/duck-race/contracts';
import { skins } from '../../src/client/components/duck-race/design';
import { attach, command, setup, advance, path } from './fixture';

test.beforeEach(setup);
async function graphics(page: Page) {
  await page.getByRole('button', { name: 'Hình ảnh và âm thanh' }).click();
  return page.getByRole('dialog', { name: 'Hình ảnh & âm thanh' });
}
type Metrics = {
  fps: number;
  calls: number;
  triangles: number;
  frameMsP95: number;
  geometries: number;
  textures: number;
  quality: string;
  dpr: number;
  camera: number[];
};
async function metrics(page: Page) {
  return JSON.parse(
    (await page.locator('.duck-stage canvas').getAttribute('data-performance')) ?? '{}',
  ) as Metrics;
}
async function settledMetrics(page: Page, quality: string) {
  await expect.poll(async () => (await metrics(page)).quality, { timeout: 15000 }).toBe(quality);
  await page.waitForTimeout(2800);
  const result = await metrics(page);
  expect(result.calls).toBeGreaterThan(0);
  expect(result.calls).toBeLessThan(120);
  expect(result.triangles).toBeGreaterThan(1000);
  return result;
}

test('twelve skins have working selection, rendered previews and mobile alternatives', async ({
  page,
  context,
}, info) => {
  await attach(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const data = await command({
    action: 'create',
    name: 'Bộ sưu tập vịt',
    config: defaultRaceConfig,
  });
  await page.goto(path + '/' + data.race!.id);
  await page.getByRole('button', { name: 'Tham gia cuộc đua', exact: true }).click();
  for (const skin of duckSkins) {
    await page.getByRole('button', { name: 'Đổi phong cách vịt' }).click();
    const dialog = page.getByRole('dialog', { name: 'Phong cách của bạn' });
    await dialog.getByRole('button', { name: skins[skin].name, exact: true }).click();
    await dialog.getByRole('button', { name: 'Chọn phong cách này' }).click();
    await expect(page.locator('.duck-lobby-showcase h2')).toHaveText(skins[skin].name);
    await expect(page.locator('.duck-member-list')).toContainText(skins[skin].name);
    if (info.project.name === 'desktop') {
      await expect(page.locator('.duck-preview canvas')).toBeVisible();
      await page.waitForTimeout(180);
      await page
        .locator('.duck-preview')
        .screenshot({ path: `test-results/duck/skins/${skin}.png` });
    } else await expect(page.getByRole('img', { name: skins[skin].name })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('custom presets survive reopening and require explicit deletion', async ({
  page,
  context,
}) => {
  await attach(context);
  await page.goto(path);
  await page.getByRole('button', { name: 'Tạo cuộc đua', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Mở một cuộc đua' });
  await dialog.getByRole('button', { name: 'Danh sách tùy chọn' }).click();
  await dialog.getByLabel('Dán tên, mỗi dòng một mục').fill('Phở\nBún bò\nCơm tấm');
  await dialog.getByRole('button', { name: 'Xem trước danh sách' }).click();
  await dialog.getByLabel('Tên danh sách lưu').fill('Bữa trưa');
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dialog.getByLabel('Dùng danh sách đã lưu').locator('option')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo cuộc đua', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Mở một cuộc đua' });
  await dialog.getByRole('button', { name: 'Danh sách tùy chọn' }).click();
  await dialog.getByLabel('Dùng danh sách đã lưu').selectOption({ label: 'Bữa trưa' });
  await expect(dialog.getByLabel('Tên mục 2', { exact: true })).toHaveValue('Bún bò');
  await dialog.getByRole('button', { name: 'Xóa danh sách đã lưu', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Xóa danh sách đã lưu?' });
  await confirm.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(dialog.getByLabel('Dùng danh sách đã lưu').locator('option')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Xóa danh sách đã lưu', exact: true }).click();
  await confirm.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(dialog.getByLabel('Dùng danh sách đã lưu')).toHaveCount(0);
  await expect(dialog.getByLabel('Tên mục 2', { exact: true })).toHaveValue('Bún bò');
});

test('reduced motion and gesture-unlocked game audio stay independent of music', async ({
  page,
  context,
}) => {
  const fixture = await attach(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [];
    Object.assign(window, { __duckAudioContexts: contexts });
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor() {
        super();
        contexts.push(this);
      }
    };
  });
  const data = await command({
    action: 'create',
    name: 'Âm thanh riêng',
    config: { ...defaultRaceConfig, mode: 'CUSTOM' },
    entries: [
      { name: 'A', skin: 'YELLOW', team: '' },
      { name: 'B', skin: 'WHITE', team: '' },
    ],
  });
  await command({ action: 'start' }, data.race!.id);
  await advance(data.race!.id, 15000);
  await page.goto(path + '/' + data.race!.id);
  await expect(page.locator('.duck-stage')).toBeVisible();
  const states = () =>
    page.evaluate(() =>
      (window as unknown as { __duckAudioContexts: AudioContext[] }).__duckAudioContexts.map(
        (c) => c.state,
      ),
    );
  expect(await states()).toEqual([]);
  const dialog = await graphics(page);
  await expect(dialog.getByLabel('Giảm chuyển động')).toBeChecked();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(page.locator('.duck-stage')).toHaveClass(/duck-reduced-motion/);
  const musicBefore = structuredClone(fixture.musicCommands);
  await page.getByRole('button', { name: 'Bật âm thanh game', exact: true }).click();
  await expect.poll(states).toEqual(['running']);
  await page.getByRole('button', { name: 'Cổ vũ 🦆', exact: true }).click();
  await page.getByRole('button', { name: 'Tắt âm thanh game', exact: true }).click();
  expect(fixture.musicCommands).toEqual(musicBefore);
  await page.getByRole('link', { name: 'Các cuộc đua', exact: true }).click();
  await expect.poll(states).toEqual(['closed']);
});

test('quality presets, cameras, photo finish, Festival fireworks and bounded GPU resources', async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'GPU profiling uses desktop; mobile fallback is covered separately',
  );
  test.setTimeout(180000);
  await attach(context);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /THREE|WebGL|shader/i.test(m.text())) errors.push(m.text());
  });
  const data = await command({
    action: 'create',
    name: 'Đêm hội 30 vịt',
    config: { ...defaultRaceConfig, mode: 'CUSTOM', track: 'FESTIVAL', duration: 120 },
    entries: Array.from({ length: 30 }, (_, i) => ({
      name: 'Vịt ' + (i + 1),
      skin: duckSkins[i % 12],
      team: '',
    })),
  });
  const race = data.race!.id;
  await command({ action: 'start' }, race);
  await advance(race, 125000);
  await page.goto(path + '/' + race);
  await expect(page.getByRole('heading', { name: 'Bảng về đích' })).toBeVisible();
  await expect(page.locator('.duck-stage canvas')).toBeVisible();
  // Desktop starts above CSS resolution; the explicit setting must survive LOW effects.
  await expect.poll(async () => (await metrics(page)).dpr).toBe(1.5);
  await page.waitForTimeout(2200);
  await page.locator('.duck-stage').screenshot({ path: 'test-results/duck/festival-podium.png' });
  await page.getByRole('button', { name: /Photo finish/ }).click();
  await page.getByRole('button', { name: 'Tạm dừng phát lại' }).click();
  await expect(page.locator('.duck-photo-finish')).toContainText('ms');
  await expect(page.getByLabel('Tốc độ phát lại')).toHaveValue('0.25');
  await page.waitForTimeout(800);
  await page.locator('.duck-stage').screenshot({ path: 'test-results/duck/photo-finish.png' });
  await page.getByLabel('Vị trí phát lại').fill('45000');
  await page.getByLabel('Góc máy', { exact: true }).selectOption('LEADER');
  await page.getByRole('button', { name: 'Ẩn bảng xếp hạng' }).click();
  await expect(page.getByRole('button', { name: /^Theo dõi / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hiện bảng xếp hạng' }).click();
  await expect(page.getByRole('button', { name: /^Theo dõi / })).toHaveCount(4);
  const measured: Metrics[] = [];
  for (const quality of ['HIGH', 'MEDIUM', 'LOW']) {
    const dialog = await graphics(page);
    await dialog.getByLabel('Tự giảm chất lượng khi máy chậm').uncheck();
    await dialog.getByLabel('Hiện hiệu năng').check();
    await dialog.getByLabel('Chất lượng', { exact: true }).selectOption(quality);
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    measured.push(await settledMetrics(page, quality));
    await page
      .locator('.duck-stage')
      .screenshot({ path: `test-results/duck/quality-${quality}.png` });
  }
  expect(measured[0].triangles).toBeGreaterThan(measured[1].triangles);
  expect(measured[1].triangles).toBeGreaterThan(measured[2].triangles);
  const resolutionDialog = await graphics(page);
  await resolutionDialog.getByLabel('Độ phân giải', { exact: true }).selectOption('2');
  await resolutionDialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect.poll(async () => (await metrics(page)).dpr).toBe(2);
  const resetResolution = await graphics(page);
  await resetResolution.getByLabel('Độ phân giải', { exact: true }).selectOption('1.5');
  await resetResolution.getByRole('button', { name: 'Đóng', exact: true }).click();
  for (const camera of ['OVERVIEW', 'SIDE', 'WATER', 'AERIAL', 'FINISH']) {
    await page.getByLabel('Góc máy', { exact: true }).selectOption(camera);
    await expect(page.locator('.duck-stage canvas')).toHaveAttribute('data-camera', camera);
    await page.waitForTimeout(1800);
    await page
      .locator('.duck-stage')
      .screenshot({ path: `test-results/duck/camera-${camera}.png` });
  }
  await page.getByLabel('Góc máy', { exact: true }).selectOption('FREE');
  await page.waitForTimeout(2800);
  const before = (await metrics(page)).camera;
  const box = (await page.locator('.duck-stage canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 + 30, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(2800);
  const after = (await metrics(page)).camera;
  expect(Math.hypot(...after.map((n, i) => n - before[i]))).toBeGreaterThan(1);
  await page.getByLabel('Góc máy', { exact: true }).selectOption('LEADER');
  const remounts: Metrics[] = [];
  for (let i = 0; i < 3; i++) {
    let dialog = await graphics(page);
    await dialog.getByLabel('Xem cuộc đua 2D').check();
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(page.locator('.duck-stage canvas')).toHaveCount(0);
    dialog = await graphics(page);
    await dialog.getByLabel('Chất lượng', { exact: true }).selectOption('MEDIUM');
    await dialog.getByLabel('Xem cuộc đua 2D').uncheck();
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    remounts.push(await settledMetrics(page, 'MEDIUM'));
  }
  expect(remounts[2].geometries).toBeLessThanOrEqual(remounts[0].geometries + 2);
  expect(remounts[2].textures).toBeLessThanOrEqual(remounts[0].textures + 1);
  await info.attach('quality-and-resource-measurements', {
    body: JSON.stringify(
      {
        renderer: await page.locator('.duck-stage canvas').getAttribute('data-renderer'),
        measured,
        remounts,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  console.log('Duck quality/remount measurements', JSON.stringify({ measured, remounts }));
  expect(errors).toEqual([]);
});
