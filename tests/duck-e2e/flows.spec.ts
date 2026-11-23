import { test, expect, type BrowserContext } from '@playwright/test';
import { gameFixture, fakeMusic, ids, room } from '../game-e2e/fixture';
import { chooseRoomTab } from '../helpers/room-navigation';
import { defaultRaceConfig, type DuckSnapshot } from '../../src/shared/duck-race/contracts';
const bridge = 'http://127.0.0.1:55443',
  path = `/room/${room}/games/duck-race`;
async function command(body: unknown, race = ''): Promise<DuckSnapshot> {
  const response = await fetch(bridge + '/duck-race' + (race ? '/' + race : ''), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fixture-actor': ids[0],
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  expect(response.ok, JSON.stringify(result)).toBe(true);
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
async function finish(race: string) {
  expect(
    (
      await fetch(bridge + '/time', {
        method: 'POST',
        body: JSON.stringify({ race, elapsed: 68000 }),
      })
    ).ok,
  ).toBe(true);
}
test.beforeEach(async () => {
  expect((await fetch(bridge + '/setup', { method: 'POST' })).ok).toBe(true);
});

test('custom elimination tournament advances only winners and locks later-round settings', async ({
  page,
  context,
}) => {
  await attach(context);
  const created = await command({
    action: 'create',
    name: 'Vượt vòng',
    config: {
      ...defaultRaceConfig,
      mode: 'CUSTOM',
      tournament: { kind: 'ELIMINATION', advance: 2, rounds: 2 },
    },
    songs: [],
    entries: ['An', 'Bình', 'Chi', 'Dũng'].map((name) => ({ name, skin: 'YELLOW', team: '' })),
  });
  await page.goto(path + '/' + created.race!.id);
  await page.getByRole('button', { name: 'Khóa đội hình & xuất phát' }).click();
  await expect(page.locator('.duck-stage')).toBeVisible();
  await finish(created.race!.id);
  await expect(page.getByRole('heading', { name: 'Bảng về đích' })).toBeVisible({ timeout: 15000 });
  const winners = await page
    .locator('.duck-result-card .duck-score-row > span:nth-child(3)')
    .allTextContents();
  await page.getByRole('button', { name: 'Vòng kế tiếp', exact: false }).click();
  await expect(page.locator('.duck-member-list > div')).toHaveCount(2);
  for (const winner of winners.slice(0, 2))
    await expect(page.locator('.duck-member-list')).toContainText(
      winner.replace('Vàng cổ điển', ''),
    );
  await expect(page.getByRole('button', { name: 'Cài đặt cuộc đua', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Khóa đội hình & xuất phát' }).click();
  await expect(page.locator('.duck-stage')).toBeVisible();
  await finish(page.url().split('/').at(-1)!);
  await expect(page.getByRole('heading', { name: 'Bảng về đích' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Vòng kế tiếp', exact: false })).toHaveCount(0);
  await expect(page.locator('.duck-tournament .duck-score-row')).toHaveCount(4);
});

test('song race approval preserves playing music and every queued entry', async ({
  page,
  context,
}) => {
  const fixture = await attach(context);
  type Queue = {
    id: string;
    youtube_video_id: string;
    status: 'PLAYING' | 'QUEUED';
    position: number;
    priority: number;
  };
  const queue: Queue[] = await (await fetch(bridge + '/songs', { method: 'POST' })).json();
  const prototype = fixture.music.queue[0];
  fixture.music.queue = queue.map((q, i) => ({
    ...prototype,
    ...q,
    song: { ...prototype.song, youtube_video_id: q.youtube_video_id, title: 'Bài hát ' + i },
  }));
  fixture.music.playback.entry_id = queue[0].id;
  await page.goto(path);
  await page.getByRole('button', { name: 'Tạo cuộc đua', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Mở một cuộc đua' });
  await dialog.getByRole('button', { name: 'Đua bài hát' }).click();
  await expect(dialog.getByText('Bài hát 0', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: /Chọn tối đa/ }).click();
  await dialog.getByLabel('Bài thắng', { exact: true }).selectOption('APPROVAL');
  await dialog.getByRole('button', { name: 'Tạo cuộc đua', exact: true }).click();
  await expect(
    page.locator('.duck-member-list').getByText('Đề cử bởi An', { exact: true }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Khóa đội hình & xuất phát' }).click();
  await expect(page.locator('.duck-stage')).toBeVisible();
  await finish(page.url().split('/').at(-1)!);
  const approval = page.getByRole('button', { name: 'Đưa bài thắng lên đầu', exact: true });
  await expect(approval).toBeVisible({ timeout: 15000 });
  await approval.click();
  await expect(page.getByText('♫ Bài thắng đã được ưu tiên đầu hàng chờ.')).toBeVisible();
  const after: Queue[] = await (await fetch(bridge + '/songs')).json();
  expect(after.map((q) => q.id).sort()).toEqual(queue.map((q) => q.id).sort());
  expect(after.find((q) => q.id === queue[0].id)!.status).toBe('PLAYING');
  expect(after.filter((q) => q.status === 'QUEUED')).toHaveLength(2);
  expect(after.filter((q) => q.status === 'QUEUED').some((q) => q.priority > 0)).toBe(true);
  const beforeReplay = structuredClone(after);
  await page.getByRole('button', { name: 'Xem lại', exact: true }).click();
  await page.getByRole('button', { name: 'Về kết quả', exact: true }).click();
  expect(await (await fetch(bridge + '/songs')).json()).toEqual(beforeReplay);
});

for (const role of ['host', 'listener'])
  test(`Duck navigation and graphics fallback preserve the same ${role} music player`, async ({
    page,
    context,
  }, info) => {
    const fixture = await attach(context, role === 'host' ? 0 : 1);
    if (role === 'listener')
      fixture.music.playback.controller_id = '60000000-0000-4000-8000-000000000001';
    const created = await command({
      action: 'create',
      name: 'Nhạc luôn tiếp tục',
      config: { ...defaultRaceConfig, mode: 'CUSTOM' },
      songs: [],
      entries: ['A', 'B'].map((name) => ({ name, skin: 'YELLOW', team: '' })),
    });
    await command({ action: 'start' }, created.race!.id);
    await page.goto(`/room/${room}`);
    if (role === 'host') {
      await chooseRoomTab(page, 'Máy phát nhạc');
      await page.getByRole('button', { name: 'Nhận quyền phát nhạc', exact: true }).click();
    } else
      await page.getByRole('button', { name: 'Bật nghe trên thiết bị này', exact: true }).click();
    const frame = page.locator('.youtube-container iframe');
    await expect(frame).toHaveCount(1);
    const handle = await frame.elementHandle();
    const before = fixture.musicCommands.filter(
      (c) => !['claim', 'report', 'heartbeat'].includes(String(c.action)),
    );
    await chooseRoomTab(page, 'Trò chơi');
    await page.getByRole('link', { name: /Duck Race Party/ }).click();
    await page.getByRole('button', { name: /Nhạc luôn tiếp tục/ }).click();
    await expect(page.locator('.duck-stage')).toBeVisible();
    if (info.project.name === 'desktop') {
      await expect(page.locator('.duck-stage canvas')).toBeVisible();
      await page.locator('.duck-stage canvas').evaluate((canvas: HTMLCanvasElement) => {
        const gl = canvas.getContext('webgl2');
        gl!.getExtension('WEBGL_lose_context')!.loseContext();
      });
    }
    await expect(page.locator('.duck-flat-track')).toBeVisible();
    await page.getByRole('button', { name: 'Về phòng nhạc', exact: true }).click();
    expect(
      await handle!.evaluate(
        (node) => node === document.querySelector('.youtube-container iframe'),
      ),
    ).toBe(true);
    expect(
      fixture.musicCommands.filter(
        (c) => !['claim', 'report', 'heartbeat'].includes(String(c.action)),
      ),
    ).toEqual(before);
  });
