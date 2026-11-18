import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';

// Real hosted Auth/PostgreSQL/Realtime, only exact run-owned rooms and identities.
const env = parseEnv(await readFile('.dev.vars', 'utf8'));
const project = process.argv[process.argv.indexOf('--project-ref') + 1];
if (
  !process.argv.includes('--project-ref') ||
  new URL(env.SUPABASE_URL).hostname !== `${project}.supabase.co`
)
  throw new Error('Pass --project-ref matching the configured project.');
const base = new URL(
  process.argv.includes('--base-url')
    ? process.argv[process.argv.indexOf('--base-url') + 1]
    : 'http://127.0.0.1:5180',
).origin;
const publicCheck = !['localhost', '127.0.0.1'].includes(new URL(base).hostname);
if (
  publicCheck &&
  (new URL(base).protocol !== 'https:' || base !== new URL(env.APP_BASE_URL).origin)
)
  throw new Error('Public checks require --base-url matching the configured HTTPS APP_BASE_URL.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
const clients = Array.from({ length: 3 }, () =>
  createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options),
);
const [owner, member, outsider] = clients;
const users = [],
  rooms = [],
  checks = [];
let browser,
  failed = false;
const storageKey = `sb-${project}-auth-token`;
function checked(result, label) {
  if (result.error)
    throw new Error(`${label}: ${result.error.code ?? result.error.status ?? 'upstream'}`);
  return result.data;
}
function pass(label) {
  checks.push(label);
  console.log('PASS ' + label);
}
async function openGames(page, mobile = false) {
  await page
    .getByRole('button', { name: mobile ? 'Thêm mục trong phòng' : 'Giải trí', exact: true })
    .click();
  await page.getByRole('button', { name: 'Trò chơi', exact: true }).click();
  await expect(page.getByRole('button', { name: /Tạo bàn mới/ })).toBeVisible({ timeout: 20000 });
}
async function api(session, path, body, expected = 200, key = randomUUID(), origin = base) {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
      Origin: origin,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    expected,
    `${path}: ${response.status} (${data.error?.code ?? 'unexpected'})`,
  );
  return data;
}
function subscribe(channel, denied = false) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timeout')), 15000);
    channel.subscribe((status) => {
      if (!['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) return;
      clearTimeout(timer);
      if (status === (denied ? 'CHANNEL_ERROR' : 'SUBSCRIBED')) resolve();
      else reject(new Error('Unexpected channel status: ' + status));
    });
  });
}
async function fingerprint(dir) {
  const output = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(output, await fingerprint(path));
    else
      output[path] = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
  }
  return output;
}
const publicBefore = await fingerprint('dist');
const deployBefore = await readFile('.wrangler/deploy/config.json', 'utf8');
try {
  const email = `roomtune-ludo-${randomUUID()}@example.invalid`,
    password = `${randomUUID()}Aa9!`;
  const user = checked(
    await service.auth.admin.createUser({ email, password, email_confirm: true }),
    'create owner',
  ).user;
  users.push(user.id);
  checked(
    await service.from('system_admins').insert({ user_id: user.id }),
    'grant temporary owner',
  );
  const ownerSession = checked(
    await owner.auth.signInWithPassword({ email, password }),
    'owner login',
  ).session;
  const memberSession = checked(await member.auth.signInAnonymously(), 'member login').session;
  users.push(memberSession.user.id);
  const outsiderSession = checked(
    await outsider.auth.signInAnonymously(),
    'outsider login',
  ).session;
  users.push(outsiderSession.user.id);
  const room = await api(
    ownerSession,
    '/rooms',
    {
      name: `Ludo kiểm thử ${randomUUID().slice(0, 6)}`,
      description: 'Tự dọn sau kiểm thử.',
      pin: '8426',
    },
    201,
  );
  rooms.push(room.id);
  browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const memberContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await memberContext.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: storageKey, session: memberSession },
  );
  const hostPage = await hostContext.newPage(),
    memberPage = await memberContext.newPage();
  await hostPage.goto(`${base}/login?room=${room.id}`);
  await hostPage.getByLabel('Email', { exact: true }).fill(email);
  await hostPage.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await hostPage.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(hostPage.getByRole('button', { name: 'Giải trí', exact: true })).toBeVisible({
    timeout: 20000,
  });
  await memberPage.goto(`${base}/join?code=${room.code}`);
  await memberPage.getByLabel('Tên của bạn', { exact: true }).fill('Bạn chơi thử');
  await memberPage.getByLabel(/PIN/).fill('8426');
  await memberPage.getByRole('button', { name: 'Cùng nghe nhạc' }).click();
  await expect(
    memberPage.getByRole('button', { name: 'Thêm mục trong phòng', exact: true }),
  ).toBeVisible({ timeout: 20000 });
  pass('Real password login and anonymous member PIN join through desktop/mobile UI');
  const musicBefore = await api(ownerSession, `/rooms/${room.id}/snapshot`);
  await openGames(memberPage, true);
  await openGames(hostPage);
  await hostPage.getByRole('button', { name: /Tạo bàn mới/ }).click();
  const dialog = hostPage.getByRole('dialog');
  await dialog.getByLabel('Tên bàn', { exact: true }).fill('Bàn thử hosted');
  await dialog.getByLabel('Ra quân').selectOption('ONE_OR_SIX');
  await dialog.getByLabel('Thời gian mỗi lượt').selectOption('90');
  await dialog.getByRole('button', { name: 'Tạo bàn', exact: true }).click();
  await expect(hostPage.getByRole('group', { name: /Bàn cờ/ })).toBeVisible({ timeout: 15000 });
  const games = await api(ownerSession, `/rooms/${room.id}/games`);
  assert.equal(games.length, 1);
  const game = games[0].id,
    path = `/rooms/${room.id}/games/${game}`;
  const read = () => api(ownerSession, path);
  const created = (await read()).state;
  assert.equal(created.schema, 2);
  assert.equal(created.rules.variant, 'CANGUA_V2');
  assert.equal(created.rules.jumpOnOne, true);
  assert.equal(created.rules.movement, 'SPAWN_ONLY_AUTO_JUMP');
  await memberPage.goto(`${base}/room/${room.id}/games/${game}`);
  await expect(memberPage.getByRole('group', { name: /Bàn cờ/ })).toBeVisible({ timeout: 15000 });
  for (const page of [hostPage, memberPage]) {
    await expect(page.locator('[data-track]')).toHaveCount(56);
    await expect(page.locator('[data-home]')).toHaveCount(24);
    for (const color of [0, 1, 2, 3]) {
      await expect(page.locator(`[data-gate="${color}"]`)).toHaveAttribute(
        'data-track',
        String((color * 14 + 55) % 56),
      );
      await expect(page.locator(`[data-start="${color}"]`)).toHaveAttribute(
        'data-track',
        String(color * 14),
      );
      await expect(page.locator(`[data-home="${color}:6"] text`)).toHaveText('6');
    }
  }
  pass(
    'New hosted table uses schema 2 / CANGUA_V2; desktop/mobile show 56 squares, correct gates/starts and all six home ranks',
  );
  await memberPage.locator('.game-player').nth(1).getByRole('button', { name: 'Ngồi đây' }).click();
  await expect.poll(async () => (await read()).state.players.length, { timeout: 15000 }).toBe(2);
  await expect(hostPage.locator('.game-connection')).toHaveText('Đã kết nối', { timeout: 15000 });
  await expect(memberPage.locator('.game-connection')).toHaveText('Đã kết nối', { timeout: 15000 });
  // A connected channel/server read does not mean the other browser has rendered
  // the join yet. Wait for its committed snapshot before another versioned command.
  for (const page of [hostPage, memberPage])
    await expect(page.locator('.game-player').nth(1).locator('strong')).toContainText(
      'Bạn chơi thử',
      { timeout: 15000 },
    );
  pass('Desktop creates table; mobile joins; both real private game channels connect');

  for (const [page, label, skin, player] of [
    [hostPage, 'Siêu nhân', 'HERO', user.id],
    [memberPage, 'Ninja', 'NINJA', memberSession.user.id],
  ]) {
    await page.getByRole('button', { name: 'Tùy chọn bàn', exact: true }).click();
    await page.getByRole('button', { name: 'Quân của tôi', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Quân của tôi', exact: true });
    await expect(picker.getByRole('radio')).toHaveCount(16);
    await picker.getByRole('radio', { name: label, exact: true }).check();
    const skinReply = page.waitForResponse(
      (response) =>
        response.url().endsWith(path) &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON()?.action === 'skin',
      { timeout: 20000 },
    );
    await picker.getByRole('button', { name: 'Lưu hình quân', exact: true }).click();
    const skinResponse = await skinReply;
    const skinPayload = await skinResponse.json();
    assert.equal(
      skinResponse.status(),
      200,
      `Hosted ${skin} command: ${skinPayload.error?.code ?? 'unexpected response'}`,
    );
    await expect(picker).toHaveCount(0);
    await page
      .getByRole('dialog', { name: 'Tùy chọn bàn', exact: true })
      .getByRole('button', { name: 'Đóng', exact: true })
      .click();
    for (const viewer of [hostPage, memberPage])
      await expect(
        viewer.locator(`[data-piece^="${player}:"][data-skin="${skin}"] [data-hero="${skin}"]`),
      ).toHaveCount(4, { timeout: 15000 });
  }
  const beforeSkin = (await read()).state;
  const skinKey = randomUUID(),
    skinBody = { action: 'skin', skin: 'HERO', version: beforeSkin.version };
  const skinResult = await api(ownerSession, path, skinBody, 200, skinKey);
  assert.deepEqual(await api(ownerSession, path, skinBody, 200, skinKey), skinResult);
  assert.deepEqual(skinResult.state, {
    ...beforeSkin,
    version: beforeSkin.version + 1,
    last: { type: 'skin', actor: user.id },
  });
  pass(
    'Sixteen skins available; desktop superhero and mobile ninja synchronize through hosted persistence; duplicate skin receipt preserves gameplay state',
  );

  const versions = [];
  const channel = member
    .channel(`game:${game}`, { config: { private: true, broadcast: { ack: true } } })
    .on('broadcast', { event: 'game.state_updated' }, ({ payload }) =>
      versions.push(payload.version),
    );
  await subscribe(channel);
  const deniedChannel = outsider.channel(`game:${game}`, { config: { private: true } });
  await subscribe(deniedChannel, true);
  await outsider.removeChannel(deniedChannel);
  await api(outsiderSession, path, undefined, 403);
  assert.equal(
    checked(await outsider.from('game_matches').select('id').eq('id', game), 'outsider RLS').length,
    0,
  );
  assert.ok((await member.from('game_matches').update({ version: 999 }).eq('id', game)).error);
  assert.ok((await member.rpc('game_due')).error);
  const forged = await channel.send({
    type: 'broadcast',
    event: 'game.state_updated',
    payload: { version: 9999 },
  });
  assert.notEqual(forged, 'ok');
  pass('Hosted game API/RLS deny outsider, direct writes, service RPC and forged client Broadcast');

  for (const [i, page] of [hostPage, memberPage].entries()) {
    await page.getByRole('button', { name: 'Tôi đã sẵn sàng', exact: true }).click();
    // Let the committed version reach both players before their next mutation.
    await expect.poll(async () => (await read()).state.players[i].ready).toBe(true);
    for (const other of [hostPage, memberPage])
      await expect(other.locator('.game-player').nth(i).locator('small')).toContainText(
        'Đã sẵn sàng',
      );
  }
  await expect(hostPage.getByRole('button', { name: 'Bắt đầu ván', exact: true })).toBeEnabled({
    timeout: 15000,
  });
  await hostPage.getByRole('button', { name: 'Bắt đầu ván', exact: true }).click();
  await expect.poll(async () => (await read()).state.status).toBe('PLAYING');
  let moved = false;
  for (let i = 0; i < 24 && !moved; i++) {
    const state = (await read()).state;
    const page = state.turn === user.id ? hostPage : memberPage;
    if (state.phase === 'ROLL') {
      const rollReply = page.waitForResponse(
        (r) =>
          r.url().endsWith(path) &&
          r.request().method() === 'POST' &&
          r.request().postDataJSON()?.action === 'roll',
      );
      await page.getByRole('button', { name: 'Tung xúc xắc', exact: true }).click();
      const response = await rollReply;
      assert.equal(response.status(), 200);
      const body = response.request().postDataJSON(),
        receiptKey = response.request().headers()['idempotency-key'];
      const rolled = await response.json();
      const replay = await api(
        state.turn === user.id ? ownerSession : memberSession,
        path,
        body,
        200,
        receiptKey,
      );
      assert.deepEqual(replay, rolled);
      await expect.poll(async () => (await read()).state.version).toBeGreaterThan(state.version);
    } else {
      await page.locator('.game-move-choices button').first().click();
      await expect.poll(async () => (await read()).state.version).toBeGreaterThan(state.version);
      moved = true;
    }
  }
  assert.ok(moved, 'Expected a legal move within 24 real random rolls');
  await expect.poll(() => versions.length, { timeout: 10000 }).toBeGreaterThan(0);
  pass(
    'Real server dice and legal UI move; duplicate receipt preserves the exact outcome; committed Broadcast received',
  );
  // A fresh navigation also proves the board persisted before testing interrupted transport.
  await hostPage.reload();
  await expect(hostPage.getByRole('group', { name: /Bàn cờ/ })).toBeVisible();
  const firstPause = hostPage.waitForResponse(
    (r) =>
      r.url().endsWith(path) &&
      r.request().method() === 'POST' &&
      r.request().postDataJSON()?.action === 'pause',
  );
  await hostPage.getByRole('button', { name: 'Tùy chọn bàn', exact: true }).click();
  await hostPage.getByRole('button', { name: 'Tạm dừng ván', exact: true }).click();
  await hostPage.keyboard.press('Escape');
  assert.equal((await firstPause).status(), 200, 'Pause command response');
  await expect.poll(async () => (await read()).state.status).toBe('PAUSED');
  const paused = (await read()).state;
  await memberContext.setOffline(true);
  await hostPage.getByRole('button', { name: 'Tiếp tục ván', exact: true }).click();
  await expect.poll(async () => (await read()).state.status).toBe('PLAYING');
  await expect(hostPage.locator('.game-arena .game-eyebrow')).toContainText('Đang chơi');
  const secondPause = hostPage.waitForResponse(
    (r) =>
      r.url().endsWith(path) &&
      r.request().method() === 'POST' &&
      r.request().postDataJSON()?.action === 'pause',
  );
  await hostPage.getByRole('button', { name: 'Tùy chọn bàn', exact: true }).click();
  await hostPage.getByRole('button', { name: 'Tạm dừng ván', exact: true }).click();
  await hostPage.keyboard.press('Escape');
  assert.equal((await secondPause).status(), 200, 'Second pause command response');
  await expect.poll(async () => (await read()).state.version).toBeGreaterThan(paused.version);
  await memberContext.setOffline(false);
  await memberPage.reload();
  await expect(memberPage.getByRole('group', { name: /Bàn cờ/ })).toBeVisible({ timeout: 15000 });
  await expect(memberPage.locator('.game-connection')).toHaveText('Đã kết nối', { timeout: 20000 });
  await expect(memberPage.locator('.game-arena .game-eyebrow')).toContainText('Tạm dừng');
  const restored = await read();
  assert.equal(restored.state.status, 'PAUSED');
  assert.deepEqual(
    restored.state.players.map((p) => p.pieces),
    paused.players.map((p) => p.pieces),
  );
  await mkdir('.roomtune/game-check/screenshots', { recursive: true });
  await hostPage.screenshot({
    path: '.roomtune/game-check/screenshots/desktop.png',
    fullPage: true,
  });
  await memberPage.screenshot({
    path: '.roomtune/game-check/screenshots/mobile.png',
    fullPage: true,
  });
  pass('Offline mobile reconnect/reload restores saved board with hosted Auth and private channel');
  const musicAfter = await api(ownerSession, `/rooms/${room.id}/snapshot`);
  // Room revisions also include online membership changes (room_presence), so
  // the offline/reconnect exercise may advance it without touching music.
  assert.ok(musicAfter.version >= musicBefore.version, 'Room revision must not regress');
  assert.deepEqual(musicAfter.settings, musicBefore.settings);
  assert.deepEqual(musicAfter.playback, musicBefore.playback);
  assert.deepEqual(musicAfter.queue, musicBefore.queue);
  const musicPage = await hostContext.newPage();
  await musicPage.goto(`${base}/room/${room.id}`);
  await expect(
    musicPage.getByRole('button', { name: 'Rời phòng', exact: true }).first(),
  ).toBeVisible({ timeout: 15000 });
  await openGames(musicPage);
  await expect(musicPage).toHaveURL(`${base}/room/${room.id}/games`);
  await musicPage.reload();
  await expect(musicPage.getByRole('button', { name: /Tạo bàn mới/ })).toBeVisible({
    timeout: 15000,
  });
  pass(
    'Music queue/playback/settings unchanged; game navigation and direct lobby/match reload work on the target origin',
  );
  await browser.close();
  browser = null;
  await api(ownerSession, `/rooms/${room.id}/commands`, {
    action: 'kick',
    user_id: memberSession.user.id,
  });
  await api(memberSession, path, undefined, 403);
  await member.removeChannel(channel);
  const revoked = member.channel(`game:${game}`, { config: { private: true } });
  await subscribe(revoked, true);
  await member.removeChannel(revoked);
  pass('Revoked membership blocks game API and private channel reconnect');
} catch (error) {
  failed = true;
  console.error(
    'FAIL ' +
      String(error.message).replace(
        /sb_(?:secret|publishable)_[\w-]+|eyJ[\w.-]+|AIza[\w-]+/g,
        '[redacted]',
      ),
  );
} finally {
  let cleaned = true;
  if (browser) await browser.close();
  for (const client of clients) {
    await client.removeAllChannels();
    client.auth.stopAutoRefresh();
  }
  for (const id of rooms) {
    const result = await service.from('rooms').delete().eq('id', id);
    if (result.error) {
      failed = true;
      cleaned = false;
      console.error('Cleanup room failed: ' + result.error.code);
    }
  }
  for (const id of users) {
    const result = await service.auth.admin.deleteUser(id);
    if (result.error) {
      failed = true;
      cleaned = false;
      console.error('Cleanup identity failed: ' + result.error.code);
    }
  }
  assert.deepEqual(await fingerprint('dist'), publicBefore);
  assert.equal(await readFile('.wrangler/deploy/config.json', 'utf8'), deployBefore);
  if (cleaned)
    pass('Exact run-owned records cleaned; public dist and deployment pointer unchanged');
  await writeFile(
    publicCheck ? 'docs/GAME_PUBLIC_CHECK.md' : 'docs/GAME_HOSTED_CHECK.md',
    [
      publicCheck
        ? '# Kiểm thử game public qua HTTPS'
        : '# Kiểm thử bản game riêng với Supabase thật',
      '',
      `UTC: ${new Date().toISOString()}`,
      `URL: ${base}`,
      '',
      `Kết quả: ${failed ? 'CHƯA ĐẠT' : 'PASS'}`,
      '',
      ...checks.map((c) => '- ' + c),
      '',
      'Hai browser contexts desktop/mobile dùng Auth, PostgreSQL, Realtime thật; không giả API hoặc dice. Không phải hai thiết bị vật lý. Không xác minh cron production hoặc âm thanh YouTube. Chỉ tạo và dọn tài khoản/phòng riêng của lượt chạy.',
      '',
    ].join('\n'),
  );
  process.exitCode = failed ? 1 : 0;
}
