import { test, expect, type Page } from '@playwright/test';
import {
  defaultSettings,
  settingsSchema,
  type Snapshot,
  type ChatMessage,
} from '../../src/shared/contracts';
import AxeBuilder from '@axe-core/playwright';
const roomId = '10000000-0000-4000-8000-000000000001',
  userId = '20000000-0000-4000-8000-000000000001',
  entryId = '30000000-0000-4000-8000-000000000001';
async function fixture(page: Page, role: 'member' | 'owner' = 'member') {
  const commands: Record<string, unknown>[] = [];
  const song = {
    youtube_video_id: 'dQw4w9WgXcQ',
    title: 'Bài hát kiểm thử',
    channel: 'Kênh fixture',
    thumbnail: '/favicon.svg',
    duration: 180,
    verified_at: new Date().toISOString(),
  };
  // The hosted snapshot returns the database row, including read-only metadata.
  const storedSettings = {
    ...defaultSettings,
    room_id: roomId,
    updated_at: new Date().toISOString(),
  };
  const state: Snapshot = {
    room: {
      id: roomId,
      code: 'FIXTURE1',
      name: 'Phòng kiểm thử',
      description: 'Dữ liệu fixture chỉ sử dụng trong kiểm thử.',
      owner_id: userId,
      version: 1,
      created_at: new Date().toISOString(),
    },
    settings: storedSettings,
    members: [{ user_id: userId, name: 'Người thử', role, joined_at: new Date().toISOString() }],
    queue: [
      {
        id: entryId,
        room_id: roomId,
        youtube_video_id: song.youtube_video_id,
        requested_by: userId,
        requested_at: new Date().toISOString(),
        status: 'QUEUED',
        position: 1,
        vote_count: 0,
        voted: false,
        song,
        requester: 'Người thử',
      },
    ],
    playback: {
      controller_id: null,
      fence: 0,
      lease_until: null,
      run_id: null,
      entry_id: null,
      state: 'IDLE',
      intent: 'PAUSED',
      position: 0,
      updated_at: new Date().toISOString(),
    },
    me: userId,
    role,
    version: 1,
  };
  const joinedRooms = [{ role, room: state.room }];
  await page.addInitScript(
    ({ uid, anonymous }) => {
      localStorage.setItem(
        'sb-roomtune-fixture-auth-token',
        JSON.stringify({
          access_token: 'fixture-access-token',
          refresh_token: 'fixture-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: uid,
            aud: 'authenticated',
            role: 'authenticated',
            is_anonymous: anonymous,
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        }),
      );
    },
    { uid: userId, anonymous: role === 'member' },
  );
  await page.context().routeWebSocket('**/realtime/**', (ws) => ws.close());
  await page.context().route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/rooms')
      return route.fulfill({
        json: { rooms: joinedRooms, canCreate: role === 'owner' },
      });
    if (path.endsWith('/snapshot')) return route.fulfill({ json: state });
    if (path.endsWith('/chat'))
      return route.fulfill({
        json: { messages: [], latest_sequence: 0, read_sequence: 0, unread_count: 0 },
      });
    if (path.endsWith('/presence'))
      return route.fulfill({ json: { online_count: state.reorder?.online_count ?? 1 } });
    if (path.endsWith('/commands')) {
      const cmd = route.request().postDataJSON();
      commands.push(cmd);
      expect(route.request().headers()['idempotency-key']).toMatch(/^[\w-]{36}$/);
      if (cmd.action === 'vote') {
        state.queue[0].voted = cmd.enabled;
        state.queue[0].vote_count = cmd.enabled ? 1 : 0;
      }
      if (cmd.action === 'remove') state.queue = [];
      if (cmd.action === 'reorder') {
        (cmd.ids as string[]).forEach((id, index) => {
          state.queue.find((entry) => entry.id === id)!.position = index + 1;
        });
      }
      if (cmd.action === 'settings') {
        expect(settingsSchema.safeParse(cmd.settings).success).toBe(true);
        state.settings = { ...state.settings, ...cmd.settings };
        if (!state.settings.reorder_approval && state.reorder?.proposal?.status === 'OPEN')
          state.reorder.proposal.status = 'CANCELLED';
      }
      if (cmd.action === 'reorder.propose') {
        const order = state.queue
          .filter((entry) => entry.status === 'QUEUED')
          .sort((a, b) => a.position - b.position);
        const entry = order.find((entry) => entry.id === cmd.entry_id)!;
        state.reorder = {
          online_count: 4,
          proposal: {
            id: crypto.randomUUID(),
            entry_id: entry.id,
            title: entry.song.title,
            requested_by: userId,
            requester: 'Người thử',
            from_position: order.indexOf(entry) + 1,
            target_position: cmd.position,
            electorate_count: 4,
            required_votes: 3,
            yes_votes: 1,
            no_votes: 0,
            my_vote: true,
            eligible: true,
            expires_at: new Date(Date.now() + 120000).toISOString(),
            status: 'OPEN',
          },
        };
      }
      if (cmd.action === 'reorder.cancel') state.reorder!.proposal!.status = 'CANCELLED';
      if (cmd.action === 'reorder.vote') {
        const p = state.reorder!.proposal!;
        if (p.my_vote === true) p.yes_votes--;
        if (p.my_vote === false) p.no_votes--;
        p.my_vote = cmd.approved;
        if (cmd.approved) p.yes_votes++;
        else p.no_votes++;
        if (p.yes_votes >= p.required_votes) {
          p.status = 'APPLIED';
          const ordered = state.queue
            .filter((e) => e.status === 'QUEUED')
            .sort((a, b) => a.position - b.position);
          const index = ordered.findIndex((e) => e.id === p.entry_id);
          const [entry] = ordered.splice(index, 1);
          ordered.splice(p.target_position - 1, 0, entry);
          ordered.forEach((entry, index) => {
            entry.position = index + 1;
          });
        } else if (p.no_votes > p.electorate_count - p.required_votes) p.status = 'REJECTED';
      }
      if (cmd.action === 'release')
        state.playback = {
          ...state.playback,
          fence: state.playback.fence + 1,
          lease_until: new Date().toISOString(),
          state: 'WAITING_FOR_HOST',
        };
      if (cmd.action === 'claim')
        state.playback = {
          ...state.playback,
          controller_id: cmd.controller_id,
          fence: 1,
          lease_until: new Date(Date.now() + 30000).toISOString(),
        };
      if (cmd.action === 'heartbeat')
        state.playback.lease_until = new Date(Date.now() + 30000).toISOString();
      if (cmd.action === 'report')
        state.playback = { ...state.playback, state: cmd.state, position: cmd.position };
      if (cmd.action === 'next') {
        state.queue = state.queue.filter((entry) => entry.id !== state.playback.entry_id);
        const next = state.queue[0];
        state.playback = {
          ...state.playback,
          entry_id: next?.id ?? null,
          run_id: next ? crypto.randomUUID() : null,
          state: next ? 'LOADING' : 'IDLE',
          intent: next ? 'PLAYING' : 'PAUSED',
          position: 0,
        };
      }
      if (cmd.action === 'enqueue')
        state.queue.push({
          ...state.queue[0],
          id: crypto.randomUUID(),
          song: { ...song, title: 'Bài mới kiểm thử' },
          youtube_video_id: cmd.video_id,
          position: 2,
        });
      state.version++;
      return route.fulfill({ json: { version: state.version, playback: state.playback } });
    }
    if (path.endsWith('/library'))
      return route.fulfill({
        json:
          route.request().method() === 'GET'
            ? { name: 'Người thử', favorites: [song], playlists: [] }
            : {},
      });
    if (path.endsWith('/history')) return route.fulfill({ json: { items: [] } });
    if (path.endsWith('/admin')) return route.fulfill({ json: { audit: [], bans: [] } });
    if (path.endsWith('/search'))
      return route.fulfill({
        json: {
          items: [{ ...song, youtube_video_id: '9bZkp7q19f0', title: 'Kết quả tìm kiếm fixture' }],
        },
      });
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });
  return { commands, state, joinedRooms };
}
async function tab(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
}
function prepareReorder(state: Snapshot) {
  state.settings = { ...state.settings, reorder_approval: true, queue_mode: 'MANUAL' };
  state.reorder = { online_count: 4, proposal: null };
  state.queue = Array.from({ length: 3 }, (_, index) => ({
    ...state.queue[0],
    id: `30000000-0000-4000-8000-00000000000${index + 1}`,
    position: index + 1,
    song: { ...state.queue[0].song, title: `Bài vị trí ${index + 1}` },
  }));
}
function seedReorderProposal(state: Snapshot, yes = 1, no = 0) {
  state.settings = { ...state.settings, reorder_approval: true, queue_mode: 'MANUAL' };
  const queued = state.queue.filter((entry) => entry.status === 'QUEUED');
  const entry = queued.at(-1)!;
  state.reorder = {
    online_count: 4,
    proposal: {
      id: crypto.randomUUID(),
      entry_id: entry.id,
      title: entry.song.title,
      requested_by: '20000000-0000-4000-8000-000000000002',
      requester: 'Thành viên khác',
      from_position: queued.length,
      target_position: 1,
      electorate_count: 4,
      required_votes: 3,
      yes_votes: yes,
      no_votes: no,
      my_vote: null,
      eligible: true,
      expires_at: new Date(Date.now() + 120000).toISOString(),
      status: 'OPEN',
    },
  };
}
async function refreshSnapshot(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

async function chatFixture(page: Page) {
  const control = {
    messages: [] as ChatMessage[],
    keys: [] as string[],
    dropReplies: false,
    denied: false,
  };
  const receipts = new Map<string, { id: string; sequence: number }>();
  const push = (body: string, sender = 'other') => {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sequence: (control.messages.at(-1)?.sequence ?? 0) + 1,
      sender_id: sender,
      sender: sender === userId ? 'Người thử' : 'Bạn cùng phòng',
      body,
      created_at: new Date().toISOString(),
      deleted: false,
    };
    control.messages.push(message);
    return message;
  };
  await page.route('**/api/v1/rooms/*/chat*', async (route) => {
    if (control.denied)
      return route.fulfill({ status: 403, json: { error: { code: 'PERMISSION_DENIED' } } });
    if (route.request().method() === 'POST') {
      const command = route.request().postDataJSON();
      const key = route.request().headers()['idempotency-key'];
      control.keys.push(key);
      if (!receipts.has(key)) {
        if (command.action === 'send') {
          const message = push(command.body, userId);
          receipts.set(key, { id: message.id, sequence: message.sequence });
        } else {
          const message = control.messages.find((item) => item.id === command.message_id)!;
          message.deleted = true;
          message.body = '';
          receipts.set(key, { id: message.id, sequence: message.sequence });
        }
      }
      if (control.dropReplies) return route.abort('failed');
      return route.fulfill({ json: receipts.get(key) });
    }
    const since = Number(new URL(route.request().url()).searchParams.get('since'));
    return route.fulfill({
      json: {
        messages: control.messages.slice(-100),
        latest_sequence: control.messages.at(-1)?.sequence ?? 0,
        read_sequence: since,
        unread_count: control.messages.filter(
          (m) => m.sequence > since && m.sender_id !== userId && !m.deleted,
        ).length,
      },
    });
  });
  return { control, push };
}

test('queue drag handle: pointer/touch drag changes order; the song row remains scrollable', async ({
  page,
}, info) => {
  const f = await fixture(page, 'owner');
  prepareReorder(f.state);
  f.state.settings.reorder_approval = false;
  await page.goto(`/room/${roomId}`);
  const source = page.getByRole('button', { name: 'Kéo đổi vị trí Bài vị trí 3', exact: true });
  await expect(source).toBeVisible();
  await page.locator('.queue-panel').evaluate((node) => node.scrollIntoView({ block: 'start' }));
  const from = (await source.boundingBox())!;
  const to = (await page.locator('.queue-row').first().boundingBox())!;
  expect(from.width).toBeGreaterThanOrEqual(44);
  expect(from.height).toBeGreaterThanOrEqual(44);
  expect(await source.evaluate((node) => getComputedStyle(node).touchAction)).toBe('none');
  expect(
    await page
      .locator('.queue-row')
      .first()
      .evaluate((node) => getComputedStyle(node).touchAction),
  ).not.toBe('none');
  expect(await page.locator('.queue-row[draggable="true"]').count()).toBe(0);
  const x = from.x + from.width / 2,
    y = from.y + from.height / 2,
    targetY = to.y + to.height / 2;
  if (info.project.name === 'mobile') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: targetY }],
    });
    await expect(page.locator('.queue-row').first()).toHaveAttribute('data-drop-target', 'true');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, targetY, { steps: 8 });
    await expect(page.locator('.queue-row').first()).toHaveAttribute('data-drop-target', 'true');
    await page.mouse.up();
  }
  await expect.poll(() => f.commands.filter((c) => c.action === 'reorder').length).toBe(1);
  await expect(page.locator('.queue-row').first()).toContainText('Bài vị trí 3');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `docs/queue-handle-${info.project.name}-fixture.png` });
});

test('queue drag handle: keyboard, cancellation, failed request and consent gate', async ({
  page,
}) => {
  const f = await fixture(page, 'owner');
  prepareReorder(f.state);
  f.state.settings.reorder_approval = false;
  await page.goto(`/room/${roomId}`);
  const source = page.getByRole('button', { name: 'Kéo đổi vị trí Bài vị trí 3', exact: true });
  await source.focus();
  await source.press('Enter');
  await source.press('Home');
  await expect(page.locator('.queue-row').first()).toHaveAttribute('data-drop-target', 'true');
  await source.press('Escape');
  expect(f.commands).toHaveLength(0);
  await expect(source).toHaveAttribute('aria-pressed', 'false');
  await page.route('**/commands', (route) =>
    route.fulfill({ status: 409, json: { error: { code: 'VERSION_CONFLICT' } } }),
  );
  await source.press('Enter');
  await source.press('Home');
  await source.press('Enter');
  await expect(page.locator('[data-sonner-toast][data-type="error"]').first()).toBeVisible();
  await expect(page.locator('.queue-row').first()).toContainText('Bài vị trí 1');
  await page.unroute('**/commands');
  await expect(source).toBeEnabled();
  await source.press('Enter');
  await source.press('Home');
  await source.press('Enter');
  await expect(page.locator('.queue-row').first()).toContainText('Bài vị trí 3');
  f.state.settings.reorder_approval = true;
  await refreshSnapshot(page);
  await expect(page.locator('.queue-drag-handle')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Đề xuất vị trí cho Bài vị trí 3' })).toBeVisible();
});

test('chat: compact composer and long bubbles fit light/dark and narrow screens', async ({
  page,
}, info) => {
  await fixture(page);
  const { push } = await chatFixture(page);
  push('Một giai điệu cho ngày mới 🎵');
  push('Tên bài hát dài không có dấu cách: ' + 'a'.repeat(90), userId);
  await page.goto(`/room/${roomId}`);
  await expect(page.getByRole('region', { name: 'Hàng chờ phát nhạc' })).toBeVisible();
  await page.getByRole('button', { name: 'Trò chuyện', exact: true }).click();
  await page.getByRole('button', { name: 'Chat trong Phòng kiểm thử', exact: true }).click();
  const compose = page.locator('.chat-compose');
  await expect(compose).toBeVisible();
  expect((await compose.boundingBox())!.height).toBeLessThan(115);
  const input = page.getByRole('textbox', { name: 'Tin nhắn của bạn', exact: true });
  await input.fill('Dòng 1\nDòng 2\nDòng 3\nDòng 4\nDòng 5\nDòng 6');
  const field = (await input.boundingBox())!;
  expect(field.height).toBeGreaterThan(44);
  expect(field.height).toBeLessThanOrEqual(96);
  await input.fill('');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.waitForTimeout(250);
    expect(
      (
        await new AxeBuilder({ page })
          .include('.chat-window')
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: `docs/chat-${theme}-${info.project.name}-fixture.png` });
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(compose).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page.locator('.chat-messages').evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
});

test('chat: send, retry, draft, moderation and responsive panel preserve the playing iframe', async ({
  page,
}, testInfo) => {
  const f = await playbackRecoveryFixture(page, 'member');
  const { control, push } = await chatFixture(page);
  const iframe = await page.locator('.youtube-container iframe').elementHandle();
  const original = structuredClone(f.state.playback);
  push('Chào mọi người, cùng nghe bài này nhé 🎵');
  await refreshSnapshot(page);
  await expect(page.getByLabel('1 tin chưa đọc')).toBeVisible();
  await page.getByRole('button', { name: /Trò chuyện/ }).click();
  await page.getByRole('button', { name: 'Chat trong Phòng kiểm thử', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Trò chuyện trong phòng', exact: true });
  await expect(panel.getByText('Chào mọi người, cùng nghe bài này nhé 🎵')).toBeVisible();
  await expect(page.getByLabel('1 tin chưa đọc')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /Xóa tin nhắn/ })).toHaveCount(0);
  await panel.getByLabel('Tin nhắn của bạn').fill('Bản nháp còn đây');
  await page.getByRole('button', { name: 'Đóng trò chuyện' }).click();
  await expect(page.getByRole('button', { name: /Trò chuyện/ })).toBeFocused();
  await page.getByRole('button', { name: /Trò chuyện/ }).click();
  await expect(panel.getByLabel('Tin nhắn của bạn')).toHaveValue('Bản nháp còn đây');
  control.dropReplies = true;
  await panel.getByRole('button', { name: 'Gửi tin', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Đang gửi…' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Gửi lại', exact: true })).toBeEnabled({
    timeout: 15000,
  });
  control.dropReplies = false;
  await panel.getByRole('button', { name: 'Gửi lại', exact: true }).click();
  await expect(panel.getByText('Bản nháp còn đây', { exact: true })).toBeVisible();
  expect(new Set(control.keys).size).toBe(1);
  expect(control.messages.filter((m) => m.body === 'Bản nháp còn đây')).toHaveLength(1);
  await panel.getByRole('button', { name: 'Xóa tin nhắn của bạn', exact: true }).click();
  await expect(panel.getByText('Tin nhắn đã được xóa')).toBeVisible();
  await panel.getByLabel('Tin nhắn của bạn').fill('Chia sẻ giai điệu, giữ nguyên nhạc đang nghe.');
  await panel.getByRole('button', { name: 'Gửi tin', exact: true }).click();
  await expect(panel.getByText('Chia sẻ giai điệu, giữ nguyên nhạc đang nghe.')).toBeVisible();
  expect(
    await iframe!.evaluate((node) => node === document.querySelector('.youtube-container iframe')),
  ).toBe(true);
  expect(f.state.playback).toEqual(original);
  expect(f.commands).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const frameBox = await page.locator('.youtube-container iframe').boundingBox();
  const chatBox = await panel.boundingBox();
  expect(frameBox!.width).toBeGreaterThanOrEqual(200);
  expect(frameBox!.height).toBeGreaterThanOrEqual(200);
  expect(
    chatBox!.x >= frameBox!.x + frameBox!.width ||
      chatBox!.y >= frameBox!.y + frameBox!.height ||
      chatBox!.x + chatBox!.width <= frameBox!.x ||
      chatBox!.y + chatBox!.height <= frameBox!.y,
  ).toBe(true);
  const audit = await new AxeBuilder({ page })
    .include('.chat-panel')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: `docs/chat-${testInfo.project.name}-fixture.png` });
  await page.getByRole('button', { name: 'Đóng trò chuyện' }).click();
  await expect(page.getByRole('region', { name: 'Hàng chờ phát nhạc' })).toBeVisible();
});

test('chat: older scroll position, unread jump, access loss and narrow keyboard viewport', async ({
  page,
}) => {
  await fixture(page);
  const { control, push } = await chatFixture(page);
  for (let i = 1; i <= 100; i++) push(`Tin trong phòng ${i}`);
  await page.goto(`/room/${roomId}`);
  await expect
    .poll(() =>
      page.evaluate(
        ({ roomId, userId }) => localStorage.getItem(`roomtune:chat-read:${userId}:${roomId}`),
        { roomId, userId },
      ),
    )
    .toBe('100');
  await page.getByRole('button', { name: /Trò chuyện/ }).click();
  await page.getByRole('button', { name: 'Chat trong Phòng kiểm thử', exact: true }).click();
  const messages = page.getByRole('region', { name: 'Tin nhắn trong phòng', exact: true });
  await messages.scrollIntoViewIfNeeded();
  await messages.evaluate((node) => {
    node.scrollTop = node.scrollHeight / 2;
    node.dispatchEvent(new Event('scroll'));
  });
  await expect(page.getByRole('button', { name: 'Đến tin mới nhất' })).toBeVisible();
  const reference = await messages.locator('[data-message]').evaluateAll((nodes) => {
    const top = nodes[0].parentElement!.getBoundingClientRect().top;
    const node = nodes.find((row) => row.getBoundingClientRect().top >= top)!;
    return { id: (node as HTMLElement).dataset.message!, top: node.getBoundingClientRect().top };
  });
  push('Tin mới khi đang đọc lịch sử');
  await refreshSnapshot(page);
  await expect(page.getByRole('button', { name: '1 tin mới' })).toBeVisible();
  const position = await messages
    .locator(`[data-message="${reference.id}"]`)
    .evaluate((node) => node.getBoundingClientRect().top);
  expect(Math.abs(position - reference.top)).toBeLessThan(3);
  await page.getByRole('button', { name: '1 tin mới' }).click();
  await expect(page.getByText('Tin mới khi đang đọc lịch sử', { exact: true })).toBeVisible();
  await expect(page.getByLabel('1 tin chưa đọc')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 480 });
  await page.getByLabel('Tin nhắn của bạn').fill('Tin ngắn');
  await page.getByRole('button', { name: 'Gửi tin', exact: true }).click();
  await expect(page.getByText('Tin ngắn', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  control.denied = true;
  await refreshSnapshot(page);
  await expect(messages).toHaveCount(0);
  await expect(page.getByLabel('Tin nhắn của bạn')).toHaveCount(0);
});

test('floating vote: arrives on search without moving content or focus; minimizes, refreshes and avoids chat/video', async ({
  page,
}, info) => {
  const f = await playbackRecoveryFixture(page, 'member');
  f.state.settings.reorder_approval = true;
  f.state.reorder = { online_count: 4, proposal: null };
  await refreshSnapshot(page);
  await expect(page.locator('.reorder-help')).toBeVisible();
  await tab(page, 'Tìm & thêm bài');
  const search = page.locator('.search-panel input').first();
  await search.fill('Đang gõ tên bài');
  const before = await page.locator('.search-panel').boundingBox();
  const frame = await page.locator('.youtube-container iframe').elementHandle();
  const original = structuredClone(f.state.playback);
  seedReorderProposal(f.state, 2);
  await refreshSnapshot(page);
  const panel = page.getByRole('region', { name: 'Biểu quyết đổi vị trí bài' });
  await expect(panel).toBeVisible();
  await expect(search).toBeFocused();
  const after = await page.locator('.search-panel').boundingBox();
  expect(after).toEqual(before);
  await page.getByRole('button', { name: 'Thu nhỏ biểu quyết' }).click();
  const reminder = page.getByRole('button', { name: /Biểu quyết đang chờ/ });
  await expect(reminder).toBeVisible();
  await refreshSnapshot(page);
  await expect(reminder).toBeVisible();
  await reminder.click();
  await expect(panel).toBeFocused();
  await page.getByRole('button', { name: 'Trò chuyện', exact: true }).click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const vote = document.querySelector('.floating-vote')!.getBoundingClientRect();
          const obstacles = ['.youtube-container iframe', '.chat-dock'].map((s) =>
            document.querySelector(s)!.getBoundingClientRect(),
          );
          return (
            vote.x >= 0 &&
            vote.right <= innerWidth &&
            vote.y >= 0 &&
            vote.bottom <= innerHeight &&
            obstacles.every(
              (r) =>
                vote.right <= r.left ||
                vote.left >= r.right ||
                vote.bottom <= r.top ||
                vote.top >= r.bottom,
            )
          );
        });
      })
      .toBe(true);
  }
  await page.setViewportSize({ width: info.project.name === 'mobile' ? 390 : 1440, height: 900 });
  await page.screenshot({ path: `docs/floating-vote-${info.project.name}-fixture.png` });
  await panel.getByRole('button', { name: 'Đồng ý', exact: true }).click();
  await expect(panel).toContainText('Đã thông qua và chuyển bài');
  await page.getByRole('button', { name: 'Đóng biểu quyết' }).click();
  await expect(panel).toHaveCount(0);
  seedReorderProposal(f.state);
  await refreshSnapshot(page);
  await expect(panel).toBeVisible();
  expect(
    await frame!.evaluate((node) => node === document.querySelector('.youtube-container iframe')),
  ).toBe(true);
  expect(f.state.playback).toEqual(original);
  expect(f.commands.map((c) => c.action)).toEqual(['reorder.vote']);
});

test('floating chat: chooses another joined room without navigation, listening presence or playlist movement', async ({
  page,
}) => {
  const f = await playbackRecoveryFixture(page, 'member');
  const second = '10000000-0000-4000-8000-000000000002';
  f.joinedRooms.push({
    role: 'member',
    room: { ...f.state.room, id: second, name: 'Phòng bạn bè' },
  });
  await refreshSnapshot(page);
  const otherRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(`/rooms/${second}/`))
      otherRequests.push(new URL(request.url()).pathname);
  });
  const queue = page.getByRole('region', { name: 'Hàng chờ phát nhạc' });
  const box = await queue.boundingBox();
  const original = structuredClone(f.state.playback);
  const frame = await page.locator('.youtube-container iframe').elementHandle();
  await page.getByRole('button', { name: 'Trò chuyện', exact: true }).click();
  await page.getByRole('button', { name: 'Chat trong Phòng kiểm thử', exact: true }).click();
  await page.getByLabel('Tin nhắn của bạn').fill('Bản nháp phòng nhạc');
  await page.getByRole('button', { name: 'Chọn phòng chat' }).click();
  await page.getByRole('button', { name: 'Chat trong Phòng bạn bè', exact: true }).click();
  await expect(page.getByLabel('Tin nhắn của bạn')).toHaveValue('');
  await page.getByLabel('Tin nhắn của bạn').fill('Bản nháp bạn bè');
  await page.getByRole('button', { name: 'Thu nhỏ trò chuyện' }).click();
  await expect(queue).toHaveJSProperty('isConnected', true);
  await page.getByRole('button', { name: 'Trò chuyện', exact: true }).click();
  await expect(page.getByLabel('Tin nhắn của bạn')).toHaveValue('Bản nháp bạn bè');
  await page.getByRole('button', { name: 'Chọn phòng chat' }).click();
  await page.getByRole('button', { name: 'Chat trong Phòng kiểm thử', exact: true }).click();
  await expect(page.getByLabel('Tin nhắn của bạn')).toHaveValue('Bản nháp phòng nhạc');
  await page.getByRole('button', { name: 'Chọn phòng chat' }).click();
  await page.getByRole('button', { name: 'Chat trong Phòng bạn bè', exact: true }).click();
  await page.getByRole('button', { name: 'Gửi tin', exact: true }).click();
  await expect(page.getByLabel('Tin nhắn của bạn')).toHaveValue('');
  expect(otherRequests.length).toBeGreaterThan(0);
  expect(otherRequests.every((path) => path.endsWith('/chat'))).toBe(true);
  expect(page.url()).toContain(`/room/${roomId}`);
  expect(await queue.boundingBox()).toEqual(box);
  expect(f.state.playback).toEqual(original);
  expect(f.commands).toHaveLength(0);
  expect(
    await frame!.evaluate((node) => node === document.querySelector('.youtube-container iframe')),
  ).toBe(true);
  f.joinedRooms.splice(1, 1);
  await refreshSnapshot(page);
  await expect(page.getByLabel('Tin nhắn của bạn')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Chat trong Phòng bạn bè', exact: true }),
  ).toHaveCount(0);
});

test('reorder approval: member proposes an exact position with pending feedback and accessible layout', async ({
  page,
}) => {
  const f = await fixture(page);
  prepareReorder(f.state);
  await page.route('**/commands', async (route) => {
    if (route.request().postDataJSON().action === 'reorder.propose')
      await new Promise((resolve) => setTimeout(resolve, 850));
    await route.fallback();
  });
  await page.goto(`/room/${roomId}`);
  await expect(page.getByRole('button', { name: 'Đưa bài lên', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Đề xuất vị trí cho Bài vị trí 3', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Vị trí đề xuất', { exact: true }).selectOption('2');
  await expect(dialog.getByLabel('Vị trí đề xuất')).toHaveValue('2');
  expect(
    (
      await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await dialog.getByRole('button', { name: 'Gửi đề xuất' }).click();
  await expect(dialog.getByRole('button', { name: 'Đang gửi…' })).toBeDisabled();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.reorder-help')).toBeFocused();
  expect(f.commands.filter((cmd) => cmd.action === 'reorder.propose')).toEqual([
    {
      action: 'reorder.propose',
      entry_id: f.state.queue[2].id,
      position: 2,
      queue_ids: f.state.queue.map((e) => e.id),
    },
  ]);
  await expectVisibleToast(page, 'Đã mở biểu quyết. Phiếu đồng ý của bạn đã được tính.');
  const panel = page.getByRole('region', { name: 'Biểu quyết đổi vị trí bài' });
  await expect(panel).toContainText('1/3 phiếu đồng ý');
  await expect(panel).toContainText('vị trí 2');
  await expect(panel.getByRole('button', { name: 'Bạn đã đồng ý' })).toBeDisabled();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    for (const button of await panel.getByRole('button').all()) {
      await expect
        .poll(async () => {
          const box = await button.boundingBox();
          return box ? box.x + box.width : Infinity;
        })
        .toBeLessThanOrEqual(width);
      const bounds = await button.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({
    width: test.info().project.name === 'mobile' ? 390 : 1440,
    height: 900,
  });
  await expect(page.locator('.reorder-help')).toBeFocused();
  await expect(page.locator('.skip-link')).not.toBeInViewport();
  // Full-page mobile captures otherwise include fixed elements clipped above a scrolled viewport.
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `docs/reorder-${test.info().project.name}-fixture.png`,
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .include('.reorder-voting')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await panel.getByRole('button', { name: 'Hủy đề xuất' }).click();
  await expect(panel).toContainText('Đề xuất đã hủy');
  await expect(page.getByRole('button', { name: 'Đề xuất vị trí cho Bài vị trí 3' })).toBeEnabled();
});

test('reorder approval: owner can switch consent on and off without a manual bypass', async ({
  page,
}) => {
  const f = await fixture(page, 'owner');
  prepareReorder(f.state);
  f.state.settings.reorder_approval = false;
  f.state.settings.queue_mode = 'VOTING';
  await page.goto(`/room/${roomId}`);
  await tab(page, 'Cài đặt phòng');
  await page.getByRole('switch', { name: 'Biểu quyết khi đổi vị trí bài' }).check();
  await expect(page.getByLabel('Chế độ hàng chờ')).toHaveValue('MANUAL');
  await expect(page.getByLabel('Chế độ hàng chờ')).toBeDisabled();
  await page.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await expect.poll(() => f.state.settings.reorder_approval).toBe(true);
  await tab(page, 'Không gian nghe');
  await expect(page.getByRole('button', { name: 'Đưa bài lên', exact: true })).toHaveCount(0);
  await expect(page.locator('.queue-row[draggable="true"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Đề xuất vị trí cho/ })).toHaveCount(3);
  await tab(page, 'Cài đặt phòng');
  await page.getByRole('switch', { name: 'Biểu quyết khi đổi vị trí bài' }).uncheck();
  await page.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await expect.poll(() => f.state.settings.reorder_approval).toBe(false);
  await tab(page, 'Không gian nghe');
  await expect(page.getByRole('button', { name: 'Đưa bài lên', exact: true })).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Biểu quyết đổi vị trí bài' })).toHaveCount(0);
});

test('reorder approval: rejection, expiry, late arrivals and one-person rooms stay actionable', async ({
  page,
}) => {
  const f = await fixture(page);
  prepareReorder(f.state);
  seedReorderProposal(f.state, 1, 1);
  await page.goto(`/room/${roomId}`);
  const panel = page.getByRole('region', { name: 'Biểu quyết đổi vị trí bài' });
  await panel.getByRole('button', { name: 'Không đồng ý', exact: true }).click();
  await expect(panel).toContainText('Đề xuất không được thông qua');
  await expect(page.locator('.queue-row .song-info a')).toHaveText([
    'Bài vị trí 1',
    'Bài vị trí 2',
    'Bài vị trí 3',
  ]);
  seedReorderProposal(f.state);
  f.state.reorder!.proposal!.expires_at = new Date(Date.now() + 1200).toISOString();
  await refreshSnapshot(page);
  await expect(panel).toContainText('Đã hết thời gian biểu quyết');
  await expect(panel.getByRole('button', { name: 'Đồng ý', exact: true })).toHaveCount(0);
  seedReorderProposal(f.state);
  f.state.reorder!.proposal!.eligible = false;
  await refreshSnapshot(page);
  await expect(panel).toContainText('Bạn vào sau');
  await expect(panel.getByRole('button', { name: 'Đồng ý', exact: true })).toHaveCount(0);
  f.state.reorder = { online_count: 1, proposal: null };
  await refreshSnapshot(page);
  await expect(page.locator('.reorder-help')).toContainText('Chưa đủ 2 người online');
  for (const button of await page.getByRole('button', { name: /Đề xuất vị trí cho/ }).all())
    await expect(button).toBeDisabled();
});

test('reorder approval: applying majority preserves the listening iframe and current song', async ({
  page,
}) => {
  const f = await playbackRecoveryFixture(page, 'member');
  seedReorderProposal(f.state, 2);
  await refreshSnapshot(page);
  const iframe = await page.locator('.youtube-container iframe').elementHandle();
  const before = { ...f.state.playback };
  const target = f.state.reorder!.proposal!.title;
  const panel = page.getByRole('region', { name: 'Biểu quyết đổi vị trí bài' });
  await panel.getByRole('button', { name: 'Đồng ý', exact: true }).click();
  await expect(panel).toContainText('Đã thông qua và chuyển bài');
  await expect(page.locator('.queue-row .song-info a').first()).toHaveText(target);
  expect(f.state.playback).toEqual(before);
  expect(f.commands.map((c) => c.action)).toEqual(['reorder.vote']);
  expect(
    await iframe!.evaluate((node) => node === document.querySelector('.youtube-container iframe')),
  ).toBe(true);
  await tab(page, 'Tìm & thêm bài');
  await expect(panel).toContainText('Đã thông qua và chuyển bài');
  expect(await iframe!.evaluate((node) => node.isConnected)).toBe(true);
});
async function playbackRecoveryFixture(page: Page, role: 'owner' | 'member', missingHost = false) {
  const f = await fixture(page, role);
  f.state.settings.playback_mode = 'ALL_DEVICES';
  f.state.queue = Array.from({ length: 5 }, (_, index) => ({
    ...f.state.queue[0],
    id: index === 0 ? entryId : `30000000-0000-4000-8000-00000000000${index + 1}`,
    position: index + 1,
    status: index === 0 ? ('PLAYING' as const) : ('QUEUED' as const),
    song: { ...f.state.queue[0].song, title: `Bài hát số ${index + 1}` },
  }));
  f.state.playback = {
    ...f.state.playback,
    controller_id: role === 'member' ? 'host' : null,
    run_id: '40000000-0000-4000-8000-000000000001',
    entry_id: entryId,
    state: 'PLAYING',
    intent: 'PLAYING',
    position: 12,
    lease_until: new Date(Date.now() + 60000).toISOString(),
  };
  if (missingHost) f.state.playback.lease_until = new Date(Date.now() - 10000).toISOString();
  await page.addInitScript(() => {
    const players: RecoveryPlayer[] = [];
    class RecoveryPlayer {
      frame: HTMLIFrameElement;
      state = 5;
      constructor(
        node: HTMLElement,
        readonly options: YT.PlayerOptions,
      ) {
        this.frame = document.createElement('iframe');
        this.frame.title = 'YouTube player fixture';
        this.frame.srcdoc =
          '<body style="background:#17151f;color:#fff;font:16px sans-serif;display:grid;place-items:center;height:90vh">YouTube · Kiểm thử phát nhạc</body>';
        node.replaceWith(this.frame);
        players.push(this);
        setTimeout(() => options.events?.onReady?.({ target: this as unknown as YT.Player }), 10);
      }
      setVolume() {}
      getCurrentTime() {
        return 12;
      }
      getPlayerState() {
        return this.state;
      }
      seekTo() {}
      playVideo() {
        this.state = 1;
        this.options.events?.onStateChange?.({ target: this as unknown as YT.Player, data: 1 });
      }
      pauseVideo() {
        this.state = 2;
        this.options.events?.onStateChange?.({ target: this as unknown as YT.Player, data: 2 });
      }
      error(code: number) {
        this.options.events?.onError?.({ target: this as unknown as YT.Player, data: code });
      }
      destroy() {
        this.frame.remove();
      }
    }
    Object.assign(window, {
      recoveryPlayers: players,
      YT: {
        Player: RecoveryPlayer,
        PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
      },
    });
  });
  await page.goto(`/room/${roomId}`);
  if (role === 'owner' && !missingHost) {
    await tab(page, 'Máy phát nhạc');
    await page.getByRole('button', { name: 'Nhận quyền phát nhạc', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Bật nghe trên thiết bị này', exact: true }).click();
  }
  await expect(page.locator('.youtube-container iframe')).toHaveCount(1);
  return f;
}

test('missing host: owner recovers directly from the listening panel and preserves the current song', async ({
  page,
}, info) => {
  const f = await playbackRecoveryFixture(page, 'owner', true);
  const run = f.state.playback.run_id,
    entry = f.state.playback.entry_id;
  await expect(
    page.getByText('Phòng chưa có máy host đang kết nối', { exact: true }),
  ).toBeVisible();
  const button = page.getByRole('button', { name: 'Nhận quyền host trên máy này', exact: true });
  await expect(button).toBeVisible();
  expect(f.commands).toHaveLength(0);
  await page.screenshot({ path: `docs/missing-host-${info.project.name}-fixture.png` });
  await button.click();
  await expect(page.getByText('Đang giữ quyền host', { exact: true })).toBeVisible();
  await expect.poll(() => f.state.playback.state).toBe('PLAYING');
  expect(f.commands.filter((command) => command.action === 'claim')).toHaveLength(1);
  expect(f.state.playback.run_id).toBe(run);
  expect(f.state.playback.entry_id).toBe(entry);
  await expect(page.locator('.youtube-container iframe')).toHaveCount(1);
  await expect(page.locator('.listener-player')).toHaveCount(0);
});

test('missing host: member sees recovery guidance, checks server and resumes when a host returns', async ({
  page,
}) => {
  const f = await playbackRecoveryFixture(page, 'member', true);
  const original = await page.locator('.youtube-container iframe').elementHandle();
  await expect(
    page.getByText('Phòng chưa có máy host đang kết nối', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Nhận quyền host trên máy này', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Kiểm tra lại host', exact: true }).click();
  await expectVisibleToast(
    page,
    'Phòng vẫn đang chờ host. Chủ phòng hoặc quản trị viên cần nhận quyền phát nhạc.',
  );
  expect(f.commands).toHaveLength(0);
  f.state.playback = {
    ...f.state.playback,
    controller_id: 'replacement-host',
    fence: 2,
    lease_until: new Date(Date.now() + 30000).toISOString(),
  };
  await page.getByRole('button', { name: 'Kiểm tra lại host', exact: true }).click();
  await expect(page.getByText('Phòng chưa có máy host đang kết nối', { exact: true })).toHaveCount(
    0,
  );
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
  expect(f.commands).toHaveLength(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { recoveryPlayers: { state: number }[] }).recoveryPlayers.at(-1)!
          .state,
    ),
  ).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
async function emitPlaybackError(page: Page, code = 150) {
  await page.evaluate((code) => {
    (window as unknown as { recoveryPlayers: { error: (code: number) => void }[] }).recoveryPlayers
      .at(-1)!
      .error(code);
  }, code);
}

test('video errors auto-skip with visible feedback and stop after three consecutive failures', async ({
  page,
}) => {
  const f = await playbackRecoveryFixture(page, 'owner');
  for (let index = 0; index < 2; index++) {
    await emitPlaybackError(page);
    await expect.poll(() => f.commands.filter((c) => c.action === 'next').length).toBe(index + 1);
    await expect(
      page.getByRole('heading', { name: `Bài hát số ${index + 2}`, exact: true }),
    ).toBeVisible();
    await expectVisibleToast(page, `Đã bỏ qua “Bài hát số ${index + 1}” vì lỗi phát nhạc.`);
  }
  await emitPlaybackError(page);
  const recovery = page.locator('.host-player .playback-recovery');
  await expect(recovery).toContainText('3 bài liên tiếp không phát được');
  expect(f.commands.filter((c) => c.action === 'next')).toHaveLength(2);
  expect(f.state.queue).toHaveLength(3);
  await expect(page.getByRole('heading', { name: 'Bài hát số 3', exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    const box = await recovery.boundingBox();
    const frame = await page.locator('.youtube-container iframe').boundingBox();
    expect(frame!.width).toBeGreaterThanOrEqual(200);
    expect(frame!.height).toBeGreaterThanOrEqual(200);
    expect(box!.x >= frame!.x + frame!.width || box!.y >= frame!.y + frame!.height).toBe(true);
    for (const button of await recovery.locator('.button').all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize(
    test.info().project.name === 'mobile'
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `docs/playback-error-${test.info().project.name}.png`,
    fullPage: true,
  });
  const accessibility = await new AxeBuilder({ page })
    .include('.playback-recovery')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'Bỏ qua bài này', exact: true }).click();
  await expect.poll(() => f.commands.filter((c) => c.action === 'next').length).toBe(3);
  await expect(page.getByRole('heading', { name: 'Bài hát số 4', exact: true })).toBeVisible();
});

test('listener video recovery stays local and opens the original YouTube song', async ({
  page,
}) => {
  const f = await playbackRecoveryFixture(page, 'member');
  await emitPlaybackError(page);
  const recovery = page.locator('.listener-player .playback-recovery');
  await expect(recovery).toContainText('Mã 150');
  const link = recovery.getByRole('link', { name: 'Mở trên YouTube', exact: true });
  await expect(link).toHaveAttribute('href', /youtube\.com\/watch\?v=dQw4w9WgXcQ&t=\d+s/);
  await page.context().route('https://www.youtube.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>YouTube navigation fixture</title>',
    }),
  );
  const opened = page.waitForEvent('popup');
  await link.click();
  const popup = await opened;
  await expect(popup).toHaveURL(/https:\/\/www.youtube.com\/watch\?v=dQw4w9WgXcQ/);
  await popup.close();
  await page.getByRole('button', { name: 'Thử lại trong phòng', exact: true }).click();
  await expect(recovery).toHaveCount(0);
  expect(f.commands).toHaveLength(0);
  expect(f.state.playback.entry_id).toBe(entryId);
});

async function expectVisibleToast(page: Page, text: string) {
  const notice = page.locator('[data-sonner-toast][data-front="true"]').filter({ hasText: text });
  await expect(notice).toBeInViewport();
  await expect
    .poll(async () =>
      notice.evaluate((element) => {
        const n = element.getBoundingClientRect();
        return (
          n.left >= 0 &&
          n.right <= innerWidth &&
          n.top >= 0 &&
          n.bottom <= innerHeight &&
          [...document.querySelectorAll('.youtube-container iframe')].every((frame) => {
            const p = frame.getBoundingClientRect();
            return n.right <= p.left || n.left >= p.right || n.bottom <= p.top || n.top >= p.bottom;
          })
        );
      }),
    )
    .toBe(true);
  return notice;
}

test('slow song actions show pending, prevent duplicate sends and recover after failure', async ({
  page,
}) => {
  const f = await fixture(page);
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  let attempts = 0;
  await page.route('**/commands', async (route) => {
    if (route.request().postDataJSON().action !== 'enqueue') return route.fallback();
    attempts++;
    if (attempts === 1) {
      await gate;
      return route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN' } } });
    }
    return route.fallback();
  });
  await page.goto(`/room/${roomId}`);
  await tab(page, 'Tìm & thêm bài');
  await page.getByLabel('Tìm bài hát trên YouTube').fill('nhạc');
  const add = page.getByRole('button', { name: 'Thêm Kết quả tìm kiếm fixture' });
  await add.click();
  await expect(add).toHaveAttribute('aria-busy', 'true');
  await expect(add).toBeDisabled();
  await add.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expectVisibleToast(page, 'Đang thêm bài…');
  expect(attempts).toBe(1);
  unblock();
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeInViewport();
  await expect(add).toBeEnabled();
  await expect(page.locator('[data-sonner-toast][data-type="loading"]')).toHaveCount(0);
  await add.click();
  await expectVisibleToast(page, 'Đã thêm bài vào hàng chờ.');
  expect(attempts).toBe(2);
  expect(f.commands.filter((c) => c.action === 'enqueue')).toHaveLength(1);
});

test('library add keeps feedback after changing tabs and failed confirmation can be retried', async ({
  page,
}) => {
  const f = await fixture(page, 'owner');
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  let clears = 0;
  await page.route('**/commands', async (route) => {
    const action = route.request().postDataJSON().action;
    if (action === 'enqueue') await gate;
    if (action === 'clear' && ++clears === 1)
      return route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN' } } });
    return route.fallback();
  });
  await page.goto(`/room/${roomId}`);
  await tab(page, 'Thư viện của tôi');
  const add = page.getByRole('button', { name: 'Thêm Bài hát kiểm thử' });
  await add.click();
  await expect(add).toHaveAttribute('aria-busy', 'true');
  await expectVisibleToast(page, 'Đang thêm bài…');
  await tab(page, 'Không gian nghe');
  unblock();
  await expectVisibleToast(page, 'Đã thêm bài vào hàng chờ.');
  await page.getByRole('button', { name: 'Dọn hàng chờ' }).click();
  await page.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeInViewport();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectVisibleToast(page, 'Đã dọn hàng chờ.');
  expect(f.commands.filter((c) => c.action === 'clear')).toHaveLength(1);
});
test('playlist batch reports partial failure without claiming every song succeeded', async ({
  page,
}) => {
  const f = await fixture(page);
  const playlist = {
    id: crypto.randomUUID(),
    name: 'Nhạc buổi sáng',
    items: Array.from({ length: 3 }, () => ({
      id: crypto.randomUUID(),
      song: f.state.queue[0].song,
    })),
  };
  await page.route('**/api/v1/library', (route) =>
    route.fulfill({ json: { name: 'Người thử', favorites: [], playlists: [playlist] } }),
  );
  let attempts = 0;
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  await page.route('**/commands', async (route) => {
    if (route.request().postDataJSON().action !== 'enqueue') return route.fallback();
    if (++attempts === 2) {
      await gate;
      return route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN' } } });
    }
    return route.fallback();
  });
  await page.goto(`/room/${roomId}`);
  await tab(page, 'Thư viện của tôi');
  await page
    .getByRole('button', { name: 'Thêm vào hàng chờ', exact: true })
    .filter({ hasText: 'Thêm vào hàng chờ' })
    .click();
  await expect(page.getByRole('button', { name: 'Đang thêm 1/3…', exact: true })).toBeDisabled();
  await expectVisibleToast(page, 'Đang thêm playlist vào phòng…');
  await expect(page.locator('[data-sonner-toast][data-type="success"]')).toHaveCount(0);
  unblock();
  await expectVisibleToast(page, 'Đã gửi 1/3 bài.');
  await expect(page.locator('[data-sonner-toast][data-type="loading"]')).toHaveCount(0);
  expect(attempts).toBe(2);
  expect(f.commands.filter((c) => c.action === 'enqueue')).toHaveLength(1);
});

test('member vote, remove, history, library and QR', async ({ page }) => {
  const f = await fixture(page);
  await page.goto(`/room/${roomId}`);
  await expect(page.getByRole('heading', { name: 'Phòng kiểm thử.' })).toBeVisible();
  await page.getByRole('button', { name: 'Bình chọn Bài hát kiểm thử' }).click();
  await expect(page.getByRole('button', { name: 'Bỏ bình chọn Bài hát kiểm thử' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Máy phát nhạc', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mời bạn bè', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('FIXTURE1');
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await tab(page, 'Thư viện của tôi');
  await expect(page.getByRole('heading', { name: 'Bài yêu thích' })).toBeVisible();
  await tab(page, 'Lịch sử phát');
  await expect(page.getByRole('heading', { name: 'Chưa có bài hát đã phát' })).toBeVisible();
  await tab(page, 'Không gian nghe');
  await page.getByRole('button', { name: 'Xóa bài', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Hàng chờ đang chờ gu nhạc của bạn' }),
  ).toBeVisible();
  expect(f.commands.map((c) => c.action)).toEqual(['vote', 'remove']);
});
test('search and add by URL go through API', async ({ page }) => {
  const f = await fixture(page);
  await page.goto(`/room/${roomId}`);
  await tab(page, 'Tìm & thêm bài');
  await page.getByLabel('Tìm bài hát trên YouTube').fill('nhạc');
  await expect(page.getByText('Kết quả tìm kiếm fixture')).toBeVisible();
  await page.getByRole('button', { name: 'Thêm Kết quả tìm kiếm fixture' }).click();
  await expect.poll(() => f.commands.length).toBe(1);
  await page.getByLabel('Liên kết YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Thêm bài', exact: true }).click();
  await expect.poll(() => f.commands.length).toBe(2);
  expect(f.commands[1].video_id).toBe('dQw4w9WgXcQ');
});
test('owner settings and host claim survive snapshot reconciliation', async ({ page }) => {
  const f = await fixture(page, 'owner');
  await page.addInitScript(() => {
    class FixturePlayer {
      constructor(_node: unknown, options: { events: { onReady: () => void } }) {
        setTimeout(() => options.events.onReady(), 20);
      }
      setVolume() {}
      loadVideoById() {}
      playVideo() {}
      pauseVideo() {}
      getCurrentTime() {
        return 0;
      }
      destroy() {}
      seekTo() {}
    }
    Object.assign(window, {
      YT: { Player: FixturePlayer, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 } },
    });
  });
  await page.goto(`/room/${roomId}`);
  await tab(page, 'Cài đặt phòng');
  await page.getByLabel('Số thành viên tối đa').fill('40');
  await page.getByLabel('Thiết bị phát nhạc', { exact: true }).selectOption('ALL_DEVICES');
  await page.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await expect.poll(() => f.state.settings.capacity).toBe(40);
  await expect.poll(() => f.state.settings.playback_mode).toBe('ALL_DEVICES');
  const saved = f.commands.find((c) => c.action === 'settings')!;
  expect(saved.settings).not.toHaveProperty('room_id');
  expect(saved.settings).not.toHaveProperty('updated_at');
  await expect(
    page.getByRole('button', { name: 'Bật nghe trên thiết bị này', exact: true }),
  ).toBeVisible();
  await tab(page, 'Máy phát nhạc');
  await page.getByRole('button', { name: 'Nhận quyền phát nhạc', exact: true }).click();
  await expect(page.getByText('Đang giữ quyền host', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Bật nghe trên thiết bị này', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Phát', exact: true })).toBeVisible();
  const notices = page.locator('[data-sonner-toaster]');
  await expect(notices.getByText('Thiết bị đã nhận quyền phát nhạc.')).toBeVisible();
  await expectVisibleToast(page, 'Thiết bị đã nhận quyền phát nhạc.');
  const playerBounds = await page.locator('.youtube-container').boundingBox();
  const themeBounds = await page.locator('.theme-switch').boundingBox();
  expect(themeBounds!.y).toBeGreaterThanOrEqual(playerBounds!.y + playerBounds!.height);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `docs/host-${test.info().project.name}-fixture.png`,
    fullPage: true,
  });
  await expect(notices.getByText('Thiết bị đã nhận quyền phát nhạc.')).toHaveCount(0, {
    timeout: 10000,
  });
  expect(f.commands.map((c) => c.action)).toContain('claim');
  await tab(page, 'Cài đặt phòng');
  await expect(page.getByText('Đang giữ quyền host', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Phát', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dừng máy phát', exact: true }).click();
  await expect(page.getByText('Chưa nhận quyền host', { exact: true })).toBeVisible();
  expect(f.commands.map((c) => c.action)).toContain('release');
  await page.getByLabel('Thiết bị phát nhạc', { exact: true }).selectOption('HOST_ONLY');
  await page.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await expect.poll(() => f.state.settings.playback_mode).toBe('HOST_ONLY');
  await page.reload();
  await tab(page, 'Cài đặt phòng');
  await expect(page.getByLabel('Thiết bị phát nhạc', { exact: true })).toHaveValue('HOST_ONLY');
  await expect(page.getByLabel('Số thành viên tối đa')).toHaveValue('40');
});

for (const role of ['owner', 'member'] as const) {
  test(`${role} playback stays compact beside the queue and survives responsive layout changes`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'This case covers all viewport sizes itself.');
    const f = await fixture(page, role);
    f.state.settings.playback_mode = role === 'member' ? 'ALL_DEVICES' : 'HOST_ONLY';
    f.state.queue = Array.from({ length: 9 }, (_, index) => ({
      ...f.state.queue[0],
      id: index === 0 ? entryId : crypto.randomUUID(),
      status: index === 0 ? 'PLAYING' : 'QUEUED',
      position: index + 1,
      song: {
        ...f.state.queue[0].song,
        title: `Bài hát ${index + 1} — Một giai điệu dài để kiểm tra bố cục trên mọi màn hình`,
      },
    }));
    f.state.playback = {
      ...f.state.playback,
      controller_id: crypto.randomUUID(),
      fence: 1,
      run_id: crypto.randomUUID(),
      entry_id: entryId,
      lease_until: new Date(Date.now() + 120000).toISOString(),
      state: 'PLAYING',
      intent: 'PLAYING',
      position: 25,
    };
    await page.addInitScript(() => {
      class LayoutPlayer {
        frame = document.createElement('iframe');
        constructor(node: HTMLElement, options: YT.PlayerOptions) {
          this.frame.title = 'Trình phát kiểm thử bố cục';
          this.frame.srcdoc =
            '<body style="margin:0;background:#141217;color:#bba2fa;display:grid;place-items:center;height:100vh;font:16px sans-serif">ROOMTUNE · PLAYER FIXTURE</body>';
          node.replaceWith(this.frame);
          document.documentElement.dataset.playerCreates = String(
            Number(document.documentElement.dataset.playerCreates ?? 0) + 1,
          );
          setTimeout(() => options.events?.onReady?.({ target: this as unknown as YT.Player }), 10);
        }
        setVolume() {}
        playVideo() {}
        pauseVideo() {}
        getCurrentTime() {
          return 25;
        }
        getPlayerState() {
          return 1;
        }
        seekTo() {}
        destroy() {
          this.frame.remove();
        }
      }
      Object.assign(window, {
        YT: {
          Player: LayoutPlayer,
          PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
        },
      });
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/room/${roomId}`);
    if (role === 'owner') {
      await tab(page, 'Máy phát nhạc');
      await page.getByRole('button', { name: 'Nhận quyền phát nhạc', exact: true }).click();
    } else
      await page.getByRole('button', { name: 'Bật nghe trên thiết bị này', exact: true }).click();
    const frame = page.locator('.youtube-container iframe');
    await expect(frame).toBeVisible();
    const originalFrame = await frame.elementHandle();
    const player = page.locator(role === 'owner' ? '.host-player' : '.listener-player');
    const queue = page.getByRole('region', { name: 'Hàng chờ phát nhạc' });
    for (const width of [1100, 1280, 1366, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: width >= 1920 ? 1080 : 768 });
      await page.evaluate(() => scrollTo(0, 0));
      const p = (await player.boundingBox())!;
      const q = (await queue.boundingBox())!;
      const video = (await frame.boundingBox())!;
      expect(q.x).toBeGreaterThanOrEqual(p.x + p.width);
      expect(q.width).toBeGreaterThan(p.width);
      expect(Math.abs(q.y - p.y)).toBeLessThan(2);
      expect(video.width).toBeGreaterThanOrEqual(200);
      expect(video.width).toBeLessThanOrEqual(380);
      expect(video.height).toBeGreaterThanOrEqual(200);
      await page.getByRole('button', { name: 'Lưu yêu thích', exact: true }).first().click();
      await expectVisibleToast(page, 'Đã lưu vào yêu thích.');
      await expect(page.locator('.queue-row').first()).toBeInViewport();
      await expect(page.locator('.queue-row').nth(2)).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (width === 1920 || width === 1366)
        await page.screenshot({ path: `docs/layout-${role}-${width}-fixture.png` });
    }
    await tab(page, 'Tìm & thêm bài');
    await expect(frame).toBeVisible();
    await expect(page.getByRole('region', { name: 'Thông tin bài hát trong phòng' })).toBeVisible();
    const contentBounds = (await page.locator('.room-content').boundingBox())!;
    const searchBounds = (await page.locator('.search-panel').boundingBox())!;
    expect(Math.abs(contentBounds.width - searchBounds.width)).toBeLessThan(2);
    await tab(page, 'Không gian nghe');
    for (const width of [1024, 768, 640, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => scrollTo(0, 0));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const video = (await frame.boundingBox())!;
      expect(video.width).toBeGreaterThanOrEqual(200);
      expect(video.height).toBeGreaterThanOrEqual(200);
      await page.getByRole('button', { name: 'Lưu yêu thích', exact: true }).first().click();
      await expectVisibleToast(page, 'Đã lưu vào yêu thích.');
      await page.evaluate(() => scrollTo(0, 0));
      await expectVisibleToast(page, 'Đã lưu vào yêu thích.');
      if (width === 390 || width === 1024)
        await page.screenshot({ path: `docs/layout-${role}-${width}-fixture.png`, fullPage: true });
    }
    expect(await originalFrame!.evaluate((element) => element.isConnected)).toBe(true);
    if (role === 'owner') {
      await tab(page, 'Cài đặt phòng');
      await page.getByRole('button', { name: 'Lưu cài đặt' }).click();
      await expectVisibleToast(page, 'Đã lưu cài đặt phòng.');
      await tab(page, 'Không gian nghe');
    }
    await expect(page.locator('html')).toHaveAttribute('data-player-creates', '1');
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(() => scrollTo(0, 0));
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}

test('room queue and settings have no WCAG A/AA violations', async ({ page }) => {
  await fixture(page, 'owner');
  await page.goto(`/room/${roomId}`);
  await expect(page.getByRole('heading', { name: 'Phòng kiểm thử.' })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await tab(page, 'Cài đặt phòng');
  await expect(page.getByLabel('Số thành viên tối đa')).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test('member without a local player keeps room context and uses available space across tabs', async ({
  page,
}) => {
  const f = await fixture(page);
  f.state.playback.entry_id = entryId;
  f.state.playback.state = 'PLAYING';
  f.state.playback.intent = 'PLAYING';
  f.state.queue[0].status = 'PLAYING';
  await page.goto(`/room/${roomId}`);
  const context = page.getByRole('region', { name: 'Thông tin bài hát trong phòng' });
  for (const width of [1920, 2560, 1366, 1100, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 1100 ? 900 : 844 });
    for (const name of ['Không gian nghe', 'Tìm & thêm bài', 'Thư viện của tôi', 'Lịch sử phát']) {
      await tab(page, name);
      await expect(context).toBeVisible();
      await expect(context).toContainText('Bài hát kiểm thử');
      await expect(context).toContainText('Âm thanh phát ở máy host');
      await expect(page.locator('.youtube-container iframe')).toHaveCount(0);
      const contentBounds = (await page.locator('.room-content').boundingBox())!;
      const contextBounds = (await context.boundingBox())!;
      if (width >= 1100) {
        expect(contentBounds.x).toBeGreaterThanOrEqual(contextBounds.x + contextBounds.width);
        expect(Math.abs(contentBounds.y - contextBounds.y)).toBeLessThan(2);
        const workspace = (await page.locator('.room-workspace').boundingBox())!;
        expect(
          Math.abs(contentBounds.x + contentBounds.width - workspace.x - workspace.width),
        ).toBeLessThan(2);
      } else expect(contentBounds.y).toBeGreaterThanOrEqual(contextBounds.y + contextBounds.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (name === 'Tìm & thêm bài') {
        const searchBounds = (await page.locator('.search-panel').boundingBox())!;
        expect(Math.abs(searchBounds.width - contentBounds.width)).toBeLessThan(2);
        if (width === 1920 || width === 390)
          await page.screenshot({
            path: `docs/member-search-${width}-fixture.png`,
            fullPage: true,
          });
      }
    }
  }
  await expect(page.getByRole('button', { name: 'Cài đặt phòng', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nhận quyền phát nhạc', exact: true })).toHaveCount(
    0,
  );
});
test('optimistic vote rolls back when the server rejects it', async ({ page }) => {
  await fixture(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/commands', async (route) => {
    await gate;
    await route.fulfill({ status: 403, json: { error: { code: 'PERMISSION_DENIED' } } });
  });
  await page.goto(`/room/${roomId}`);
  await page.getByRole('button', { name: 'Bình chọn Bài hát kiểm thử' }).click();
  try {
    await expect(page.getByRole('button', { name: 'Bỏ bình chọn Bài hát kiểm thử' })).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByRole('button', { name: 'Bình chọn Bài hát kiểm thử' })).toBeVisible();
  await expect(
    page.getByText('Bạn không có quyền thực hiện thao tác này.', { exact: true }),
  ).toBeVisible();
});

test('leave is visible on first screen, works by keyboard and keeps the room', async ({ page }) => {
  const f = await fixture(page);
  await page.goto(`/room/${roomId}`);
  const leave = page.getByRole('button', { name: 'Rời phòng', exact: true });
  await expect(leave).toBeInViewport();
  const bounds = await leave.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await leave.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('Âm thanh trên thiết bị này sẽ dừng');
  await page.getByRole('button', { name: 'Ở lại', exact: true }).click();
  await expect(leave).toBeFocused();
  await leave.click();
  await page.getByRole('button', { name: 'Rời phòng ngay', exact: true }).click();
  await expect(page).toHaveURL(/\/rooms$/);
  await expect(page.locator('.room-card').first()).toContainText('VỪA NGHE');
  await page.getByRole('link', { name: 'Vào lại phòng Phòng kiểm thử', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Phòng kiểm thử.' })).toBeVisible();
  expect(f.commands).toHaveLength(0);
});

test('returning guest reopens a tab and follows an invitation without entering the code again', async ({
  page,
  context,
}) => {
  await fixture(page);
  await page.goto(`/room/${roomId}`);
  await expect
    .poll(() => page.evaluate((uid) => localStorage.getItem(`roomtune:last-room:${uid}`), userId))
    .toBe(roomId);
  await page.close();
  // This page has no session injection: it must restore the existing browser storage.
  const reopened = await context.newPage();
  const joins: string[] = [];
  reopened.on('request', (request) => {
    if (request.url().includes('/rooms/join') || request.url().includes('/auth/v1/signup'))
      joins.push(request.url());
  });
  await reopened.goto('/');
  const back = reopened.getByRole('link', { name: 'Vào lại phòng', exact: true });
  await expect(back).toBeInViewport();
  expect(
    (
      await new AxeBuilder({ page: reopened })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await reopened.screenshot({ path: `docs/return-${test.info().project.name}-fixture.png` });
  await reopened.getByRole('button', { name: 'Chuyển giao diện sáng' }).click();
  await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'light');
  await reopened.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished),
    );
  });
  expect(
    (
      await new AxeBuilder({ page: reopened })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await back.click();
  await expect(reopened.getByRole('heading', { name: 'Phòng kiểm thử.' })).toBeVisible();
  await tab(reopened, 'Thư viện của tôi');
  await expect(reopened.getByRole('button', { name: 'Đăng xuất', exact: true })).toHaveCount(0);
  await reopened.getByRole('button', { name: 'Quên phiên trên thiết bị này', exact: true }).click();
  await expect(reopened.getByRole('dialog')).toContainText(
    'Nếu chỉ muốn nghỉ nghe, hãy dùng Rời phòng',
  );
  await reopened.getByRole('button', { name: 'Hủy', exact: true }).click();
  await reopened.goto('/join?code=fixture1');
  await expect(back).toBeVisible();
  await back.click();
  await expect(reopened.getByRole('heading', { name: 'Phòng kiểm thử.' })).toBeVisible();
  expect(joins).toEqual([]);
});

test('recent room order respects current membership and an invitation to a different room', async ({
  page,
}) => {
  const f = await fixture(page);
  f.joinedRooms.unshift({
    role: 'member',
    room: {
      ...f.state.room,
      id: '10000000-0000-4000-8000-000000000002',
      name: 'Phòng khác',
      code: 'SECOND01',
    },
  });
  await page.goto(`/room/${roomId}`);
  await expect(page.getByRole('heading', { name: 'Phòng kiểm thử.' })).toBeVisible();
  await page.goto('/rooms');
  await expect(page.locator('.room-card').first()).toContainText('Phòng kiểm thử');
  await page.goto('/join?code=NEWROOM1');
  await expect(page.getByLabel('Mã phòng', { exact: true })).toHaveValue('NEWROOM1');
  await expect(page.getByRole('link', { name: 'Vào lại phòng', exact: true })).toHaveCount(0);
  f.joinedRooms.splice(1, 1);
  await page.goto('/');
  await expect(page.locator('.return-room')).toContainText('Phòng khác');
  await expect(page.locator(`.return-room a[href="/room/${roomId}"]`)).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of ['/', '/join', '/rooms']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: /Vào lại phòng/ }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
});

test('new visitors can browse entry pages without creating an anonymous account', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/auth/v1/**', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.route('**/api/v1/**', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  for (const path of ['/', '/join', '/rooms']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vào lại phòng', exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: 'Một căn phòng đang chờ bạn' })).toBeVisible();
  expect(requests).toEqual([]);
});

test('signing out an account removes its return shortcut without creating a guest', async ({
  page,
}) => {
  await fixture(page, 'owner');
  await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204 }));
  const signups: string[] = [];
  await page.route('**/auth/v1/signup*', (route) => {
    signups.push(route.request().url());
    return route.abort();
  });
  await page.goto(`/room/${roomId}`);
  await tab(page, 'Thư viện của tôi');
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.return-room')).toHaveCount(0);
  await page.getByRole('link', { name: 'Phòng của bạn', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Một căn phòng đang chờ bạn' })).toBeVisible();
  expect(signups).toEqual([]);
});

test('leaving as host releases only this device and returns to rooms', async ({ page }) => {
  const f = await fixture(page, 'owner');
  await page.goto(`/room/${roomId}`);
  await tab(page, 'Máy phát nhạc');
  await page.getByRole('button', { name: 'Nhận quyền phát nhạc', exact: true }).click();
  await expect(page.getByText('Đang giữ quyền host', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rời phòng', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Máy này đang giữ quyền host');
  await page.getByRole('button', { name: 'Rời phòng ngay', exact: true }).click();
  await expect(page).toHaveURL(/\/rooms$/);
  expect(f.commands.map((command) => command.action)).toEqual(['claim', 'release']);
  expect(f.commands[1].controller_id).toBe(f.commands[0].controller_id);
  expect(f.state.playback.state).toBe('WAITING_FOR_HOST');
});

test('members opt in to listening; mode changes and leave destroy their player', async ({
  page,
}) => {
  const f = await fixture(page);
  f.state.settings.playback_mode = 'ALL_DEVICES';
  f.state.playback = {
    ...f.state.playback,
    controller_id: 'host',
    run_id: 'run1',
    entry_id: entryId,
    lease_until: new Date(Date.now() + 60000).toISOString(),
    state: 'PLAYING',
    intent: 'PLAYING',
    position: 30,
  };
  await page.addInitScript(() => {
    class FixturePlayer {
      constructor(
        private node: HTMLElement,
        options: YT.PlayerOptions,
      ) {
        node.dataset.testPlayer = 'true';
        setTimeout(() => options.events?.onReady?.({ target: this as unknown as YT.Player }), 20);
      }
      setVolume() {}
      playVideo() {
        this.node.dataset.playing = 'true';
      }
      pauseVideo() {
        this.node.dataset.playing = 'false';
      }
      getCurrentTime() {
        return 30;
      }
      getPlayerState() {
        return 5;
      }
      seekTo() {}
      destroy() {
        this.node.remove();
      }
    }
    Object.assign(window, {
      YT: {
        Player: FixturePlayer,
        PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
      },
    });
  });
  await page.goto(`/room/${roomId}`);
  await expect(page.locator('[data-test-player]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Bật nghe trên thiết bị này', exact: true }).click();
  await expect(page.locator('[data-test-player]')).toHaveAttribute('data-playing', 'true');
  await tab(page, 'Thư viện của tôi');
  await expect(page.getByRole('heading', { name: 'Bài yêu thích' })).toBeVisible();
  await expect(page.locator('[data-test-player]')).toHaveCount(1);
  await page.screenshot({
    path: `docs/listening-${test.info().project.name}-fixture.png`,
    fullPage: true,
  });
  f.state.settings.playback_mode = 'HOST_ONLY';
  f.state.version++;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('[data-test-player]')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Bật nghe trên thiết bị này', exact: true }),
  ).toHaveCount(0);
  f.state.settings.playback_mode = 'ALL_DEVICES';
  f.state.version++;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByRole('button', { name: 'Bật nghe trên thiết bị này', exact: true }).click();
  await expect(page.locator('[data-test-player]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Rời phòng', exact: true }).click();
  await page.getByRole('button', { name: 'Rời phòng ngay', exact: true }).click();
  await expect(page).toHaveURL(/\/rooms$/);
  await expect(page.locator('[data-test-player]')).toHaveCount(0);
  expect(f.commands).toHaveLength(0);
});
