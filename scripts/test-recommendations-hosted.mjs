import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';

// Default to the isolated trial; public checks require the exact configured HTTPS origin.
const env = parseEnv(await readFile('.dev.vars', 'utf8'));
const project = process.argv[process.argv.indexOf('--project-ref') + 1];
assert.ok(process.argv.includes('--project-ref'));
assert.equal(new URL(env.SUPABASE_URL).hostname, `${project}.supabase.co`);
const base = process.argv.includes('--base-url')
  ? new URL(process.argv[process.argv.indexOf('--base-url') + 1]).origin
  : 'http://127.0.0.1:5180';
const publicCheck = base !== 'http://127.0.0.1:5180';
if (publicCheck) {
  assert.equal(new URL(base).protocol, 'https:');
  assert.equal(base, new URL(env.APP_BASE_URL).origin);
}
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
};
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
const clients = [];
const users = [],
  rooms = [],
  checks = [];
const run = randomUUID();
const directory = `.roomtune/recommendation-check/${run}`;
await mkdir(directory, { recursive: true });
let browser,
  failed = false;
function checked(result, label) {
  if (result.error)
    throw new Error(`${label}: ${result.error.code ?? result.error.status ?? 'upstream'}`);
  return result.data;
}
function pass(label) {
  checks.push(label);
  console.log('PASS ' + label);
}
async function record() {
  await writeFile(`${directory}/owned.json`, JSON.stringify({ users, rooms }));
}
async function identity(label, administrator = false) {
  const email = `roomtune-recommend-${label}-${run}@example.invalid`;
  const password = `${randomUUID()}Aa9!`;
  const user = checked(
    await service.auth.admin.createUser({ email, password, email_confirm: true }),
    'create test identity',
  ).user;
  users.push(user.id);
  await record();
  if (administrator)
    checked(await service.from('system_admins').insert({ user_id: user.id }), 'grant test owner');
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
  clients.push(client);
  return checked(await client.auth.signInWithPassword({ email, password }), 'test login').session;
}
async function api(session, path, body, expected = 200) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
      Origin: base,
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
async function fingerprint(dir) {
  const result = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(result, await fingerprint(path));
    else
      result[path] = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
  }
  return result;
}
const publicBefore = await fingerprint('dist');
const deployBefore = await readFile('.wrangler/deploy/config.json', 'utf8');
try {
  assert.equal((await api(null, '/system/health')).status, 'configured');
  const owner = await identity('owner', true);
  const member = await identity('member');
  const outsider = await identity('outsider');
  const room = await api(
    owner,
    '/rooms',
    {
      name: `Kiểm thử gợi ý ${run.slice(0, 6)}`,
      description: 'Phòng tạm, tự dọn sau kiểm thử.',
      pin: '8426',
    },
    201,
  );
  rooms.push(room.id);
  await record();
  await api(member, '/rooms/join', { code: room.code, name: 'Bạn nghe thử', pin: '8426' });
  const path = `/rooms/${room.id}`;
  await api(null, `${path}/recommendations`, undefined, 401);
  await api(outsider, `${path}/recommendations`, undefined, 403);
  pass('Real hosted authentication and membership deny anonymous requests and outsiders');

  const started = performance.now();
  const fresh = await api(owner, `${path}/recommendations`);
  assert.equal(fresh.discoveryUnavailable, false);
  assert.equal(fresh.familiar.length, 0);
  assert.equal(fresh.seed, null);
  assert.ok(fresh.discover.length > 24, 'Expanded discovery must exceed the previous 24-song cap');
  const sourceCounts = Object.fromEntries(
    ['VN', 'US', 'KR', 'JP'].map((region) => [
      region,
      fresh.discover.filter((item) => item.regions?.includes(region)).length,
    ]),
  );
  assert.ok(Object.values(sourceCounts).every((count) => count > 0));
  assert.ok(fresh.discover.every(({ song }) => song.duration > 1 && song.duration <= 900));
  pass(
    `New room receives ${fresh.discover.length} eligible discoveries from real YouTube/cache (${Math.round(performance.now() - started)} ms)`,
  );
  pass('Available discoveries by source: ' + JSON.stringify(sourceCounts));
  const cache = checked(
    await service
      .from('youtube_search_cache')
      .select('payload')
      .eq('query', 'discovery:popular-music:VN:v2')
      .single(),
    'shared provider cache',
  );
  assert.ok(cache.payload.items.length > 0);
  assert.equal(cache.payload.familiar, undefined);

  // Seed playback outcomes ONLY on entries created in this run-owned room.
  // Metadata comes from the real YouTube provider; these are not actual completed listens.
  const selected = fresh.discover.slice(0, 3).map(({ song }) => song);
  for (const [index, song] of selected.entries()) {
    await api(owner, `${path}/commands`, { action: 'enqueue', video_id: song.youtube_video_id });
    const snapshot = await api(owner, `${path}/snapshot`);
    const entry = snapshot.queue.find((item) => item.youtube_video_id === song.youtube_video_id);
    assert.ok(entry);
    const status = index === 2 ? 'FAILED' : 'PLAYED';
    checked(
      await service
        .from('queue_entries')
        .update({ status })
        .eq('id', entry.id)
        .eq('room_id', room.id),
      'seed owned entry outcome',
    );
    checked(
      await service
        .from('playback_history')
        .insert({ room_id: room.id, entry_id: entry.id, run_id: randomUUID(), status }),
      'seed owned history',
    );
  }
  const personalized = await api(member, `${path}/recommendations`);
  assert.equal(personalized.familiar.length, 2);
  assert.deepEqual(
    new Set(personalized.familiar.map(({ song }) => song.youtube_video_id)),
    new Set(selected.slice(0, 2).map((song) => song.youtube_video_id)),
  );
  assert.ok(
    ![...personalized.familiar, ...personalized.discover].some(
      ({ song }) => song.youtube_video_id === selected[2].youtube_video_id,
    ),
  );
  pass(
    'Real database joins return owned history; completed songs are familiar and failed songs are excluded',
  );

  browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const pages = [];
  for (const [index, session] of [owner, member].entries()) {
    const context = await browser.newContext(
      index === 0
        ? { viewport: { width: 1440, height: 960 } }
        : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    );
    await context.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      {
        key: `sb-${project}-auth-token`,
        value: session,
      },
    );
    const page = await context.newPage();
    let feedRequests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/recommendations')) feedRequests++;
    });
    await page.goto(`${base}/room/${room.id}`);
    await page.getByRole('button', { name: 'Tìm & thêm bài', exact: true }).first().click();
    await expect(page.getByRole('region', { name: 'Nghe lại cùng phòng' })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator('.recommendation-card')).not.toHaveCount(0);
    const discovery = page.getByRole('region', { name: 'Khám phá nhạc mới', exact: true });
    await expect(discovery.locator('.recommendation-card')).toHaveCount(12);
    await page.getByRole('button', { name: 'Xem thêm bài khám phá', exact: true }).click();
    await expect(discovery.locator('.recommendation-card')).toHaveCount(24);
    await page.getByRole('button', { name: /^Việt Nam/ }).click();
    const vietnamese = personalized.discover.filter((item) => item.regions?.includes('VN')).length;
    await expect(discovery.locator('.recommendation-card')).toHaveCount(Math.min(12, vietnamese));
    await page.getByRole('button', { name: /^Tổng hợp/ }).click();
    await expect(discovery.locator('.recommendation-card')).toHaveCount(12);
    assert.equal(feedRequests, 1, 'Expanding and filtering must not request another feed');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.recommendation-card').last().scrollIntoViewIfNeeded();
    await expect
      .poll(
        () =>
          page
            .locator('.recommendation-cover img')
            .evaluateAll((images) => images.every((img) => img.complete && img.naturalWidth > 0)),
        { timeout: 15000 },
      )
      .toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `${directory}/${index === 0 ? 'desktop' : 'mobile'}.png`,
      fullPage: true,
    });
    pages.push(page);
  }
  pass(
    'Built application displays real recommendation cards on desktop/mobile without horizontal overflow',
  );
  pass(
    'Desktop/mobile show 12 initial discoveries, expand to 24, filter sources and reset locally without another API request',
  );
  const chosen = personalized.familiar[0].song;
  const add = pages[1].getByRole('button', { name: `Thêm ${chosen.title}`, exact: true });
  await add.click();
  await expect(
    pages[1].getByRole('button', { name: `${chosen.title} đã có trong hàng chờ`, exact: true }),
  ).toBeDisabled({ timeout: 20000 });
  await expect(
    pages[0].getByRole('button', { name: `${chosen.title} đã có trong hàng chờ`, exact: true }),
  ).toBeDisabled({ timeout: 20000 });
  const queued = await api(owner, `${path}/snapshot`);
  assert.equal(
    queued.queue.filter((item) => item.youtube_video_id === chosen.youtube_video_id).length,
    1,
  );
  const after = await api(member, `${path}/recommendations`);
  assert.ok(
    ![...after.familiar, ...after.discover].some(
      ({ song }) => song.youtube_video_id === chosen.youtube_video_id,
    ),
  );
  pass(
    'Mobile enqueues a recommended song once; desktop receives queue update; next feed excludes queued song',
  );
  await browser.close();
  browser = null;
  await api(owner, `${path}/commands`, { action: 'kick', user_id: member.user.id });
  await api(member, `${path}/recommendations`, undefined, 403);
  pass('Revoked membership immediately blocks recommendation API');
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
  if (browser) await browser.close();
  for (const client of clients) {
    await client.removeAllChannels();
    client.auth.stopAutoRefresh();
  }
  let cleaned = true;
  for (const id of rooms) {
    const result = await service.from('rooms').delete().eq('id', id);
    if (result.error) {
      cleaned = false;
      console.error('Cleanup room failed: ' + result.error.code);
    }
  }
  for (const id of users) {
    const result = await service.auth.admin.deleteUser(id);
    if (result.error) {
      cleaned = false;
      console.error('Cleanup identity failed: ' + result.error.code);
    }
  }
  if (cleaned) {
    await rm(`${directory}/owned.json`, { force: true });
    pass(
      'Exact run-owned rooms and identities cleaned; shared public YouTube metadata cache retained',
    );
  } else failed = true;
  assert.deepEqual(await fingerprint('dist'), publicBefore);
  assert.equal(await readFile('.wrangler/deploy/config.json', 'utf8'), deployBefore);
  pass('Public build and deployment pointer remain unchanged');
  await writeFile(
    publicCheck ? 'docs/RECOMMENDATIONS_PUBLIC_CHECK.md' : 'docs/RECOMMENDATIONS_HOSTED_CHECK.md',
    [
      publicCheck
        ? '# Kiểm thử gợi ý nhạc public qua HTTPS'
        : '# Kiểm thử gợi ý nhạc với dịch vụ thật',
      '',
      `UTC: ${new Date().toISOString()}`,
      `URL: ${base}`,
      '',
      `Kết quả: ${failed ? 'CHƯA ĐẠT' : 'PASS'}`,
      '',
      ...checks.map((label) => '- ' + label),
      '',
      'Auth, Supabase, YouTube/cache và API thật, không chặn hoặc giả HTTP. Lịch sử PLAYED/FAILED được gieo có chủ đích trong phòng tạm để kiểm tra xếp hạng; không phải bằng chứng đã nghe hết các bài đó. Browser desktop/mobile là hai context Chromium, không phải hai thiết bị vật lý. Không xác minh âm thanh ở lượt này.',
      publicCheck
        ? 'Các yêu cầu và browser đi qua HTTPS/domain public thật.'
        : 'Lượt kiểm tra này chỉ qua runtime local, không xác minh public HTTPS.',
      '',
      'Chỉ tạo/dọn ID của lượt kiểm thử; không thay đổi phòng thật của người dùng. Metadata công khai của YouTube và cache chung được giữ theo cơ chế bình thường của ứng dụng.',
      '',
    ].join('\n'),
  );
  process.exitCode = failed ? 1 : 0;
}
