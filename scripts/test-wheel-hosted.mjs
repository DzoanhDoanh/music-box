import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';

const env = parseEnv(await readFile('.dev.vars', 'utf8'));
assert.ok(process.argv.includes('--project-ref'), 'Explicit project reference required');
const project = process.argv[process.argv.indexOf('--project-ref') + 1];
assert.equal(new URL(env.SUPABASE_URL).hostname, `${project}.supabase.co`);
const base = process.argv.includes('--base-url')
  ? new URL(process.argv[process.argv.indexOf('--base-url') + 1]).origin
  : 'http://127.0.0.1:5180';
if (base !== 'http://127.0.0.1:5180') {
  assert.equal(new URL(base).protocol, 'https:');
  assert.equal(
    base,
    new URL(env.APP_BASE_URL).origin,
    'Only the configured public origin is allowed',
  );
}
const run = randomUUID(),
  directory = `.roomtune/wheel-check/${run}`;
await mkdir(directory, { recursive: true });
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
};
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
const users = [],
  rooms = [],
  clients = [],
  checks = [];
let browser,
  failed = false;
const checked = (result, label) => {
  if (result.error)
    throw new Error(`${label}: ${result.error.code ?? result.error.status ?? 'upstream'}`);
  return result.data;
};
const record = () => writeFile(`${directory}/owned.json`, JSON.stringify({ users, rooms }));
const pass = (label) => {
  checks.push(label);
  console.log('PASS ' + label);
};
async function identity(label, admin = false) {
  const email = `roomtune-wheel-${label}-${run}@example.invalid`,
    password = `${randomUUID()}Aa9!`;
  const { user } = checked(
    await service.auth.admin.createUser({ email, password, email_confirm: true }),
    'create test user',
  );
  users.push(user.id);
  await record();
  if (admin)
    checked(await service.from('system_admins').insert({ user_id: user.id }), 'grant test owner');
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
  clients.push(client);
  return checked(await client.auth.signInWithPassword({ email, password }), 'sign in').session;
}
async function api(session, path, body, status = 200, key = randomUUID()) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      Origin: base,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    status,
    `${path}: ${response.status} (${data.error?.code ?? 'unexpected'})`,
  );
  return data;
}
async function fingerprint(dir) {
  const out = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(out, await fingerprint(path));
    else
      out[path] = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
  }
  return out;
}
const publicBefore = await fingerprint('dist');
const deploymentBefore = await readFile('.wrangler/deploy/config.json', 'utf8');
try {
  assert.equal((await api(null, '/system/health')).status, 'configured');
  const homepage = await fetch(base, { signal: AbortSignal.timeout(20000) });
  assert.equal(homepage.status, 200);
  assert.match(homepage.headers.get('permissions-policy') ?? '', /microphone=\(self\)/);
  const owner = await identity('owner', true),
    member = await identity('member');
  const room = await api(
    owner,
    '/rooms',
    {
      name: `Thử vòng quay ${run.slice(0, 6)}`,
      description: 'Phòng kiểm thử tạm, tự dọn.',
      pin: '8426',
    },
    201,
  );
  rooms.push(room.id);
  await record();
  const path = `/rooms/${room.id}`;
  await api(null, `${path}/wheel`, undefined, 401);
  await api(member, `${path}/wheel`, undefined, 403);
  await api(member, '/rooms/join', { code: room.code, name: 'Bạn thử vòng quay', pin: '8426' });
  const initial = await api(owner, `${path}/snapshot`);
  const { room_id: settingsRoom, updated_at: settingsUpdatedAt, ...settings } = initial.settings;
  assert.equal(settingsRoom, room.id);
  assert.ok(settingsUpdatedAt);
  await api(owner, `${path}/commands`, {
    action: 'settings',
    name: initial.room.name,
    description: initial.room.description,
    settings: {
      ...settings,
      queue_mode: 'MANUAL',
      reorder_approval: true,
      allow_duplicates: true,
      max_per_member: 8,
    },
  });
  const songs = checked(
    await service
      .from('songs')
      .select('youtube_video_id')
      .gt('verified_at', new Date(Date.now() - 20 * 3600000).toISOString())
      .gt('duration', 1)
      .lt('duration', initial.settings.max_duration)
      .limit(2),
    'read verified music',
  );
  assert.ok(songs.length >= 1, 'Need one recently verified YouTube video for the temporary queue');
  for (const session of [owner, member])
    for (let i = 0; i < 3; i++)
      await api(session, `${path}/commands`, {
        action: 'enqueue',
        video_id: songs[i % songs.length].youtube_video_id,
      });
  pass('Real Auth, membership and existing verified music used only in a temporary room');
  browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  async function pageFor(session, mobile = false) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      { key: `sb-${project}-auth-token`, value: session },
    );
    const page = await context.newPage();
    await page.goto(`${base}/room/${room.id}?tool=wheel`);
    await expect(page.getByRole('region', { name: 'Vòng quay may mắn', exact: true })).toBeVisible({
      timeout: 20000,
    });
    return page;
  }
  const desktop = await pageFor(owner),
    mobile = await pageFor(member, true);
  const hubRatio = await desktop
    .locator('.lucky-hub')
    .evaluate(
      (node) =>
        node.getBoundingClientRect().width / node.parentElement.getBoundingClientRect().width,
    );
  assert.ok(hubRatio < 0.13, 'Published wheel should have the reduced center');
  await expect
    .poll(async () => (await api(owner, `${path}/wheel`)).online.length, { timeout: 20000 })
    .toBe(2);
  await mobile.getByRole('button', { name: 'Tự nhập', exact: true }).click();
  await mobile
    .getByRole('textbox', { name: 'Danh sách lựa chọn' })
    .fill('Đi biển\nLeo núi\nDã ngoại');
  const beforeCustom = await api(owner, `${path}/snapshot`);
  await mobile.getByRole('button', { name: 'Quay may mắn', exact: true }).click();
  await expect
    .poll(async () => (await api(owner, `${path}/wheel`)).recent.length, { timeout: 15000 })
    .toBe(1);
  let wheel = await api(owner, `${path}/wheel`);
  for (const page of [desktop, mobile])
    await expect(page.locator('.lucky-result h3')).toHaveText(wheel.latest.winner.label, {
      timeout: 15000,
    });
  const afterCustom = await api(owner, `${path}/snapshot`);
  assert.deepEqual(afterCustom.queue, beforeCustom.queue);
  assert.deepEqual(afterCustom.playback, beforeCustom.playback);
  for (const [name, page] of [
    ['desktop', desktop],
    ['mobile', mobile],
  ]) {
    // Full-page screenshots of a scrolled page can misplace off-screen fixed elements.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect
      .poll(() =>
        page.locator('.skip-link').evaluate((node) => node.getBoundingClientRect().bottom),
      )
      .toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
  }
  pass(
    'Any online member spins arbitrary choices; two real sessions see the same result and queue remains intact',
  );
  const controller = randomUUID();
  await api(owner, `${path}/commands`, { action: 'claim', controller_id: controller });
  const claimed = await api(owner, `${path}/snapshot`);
  await api(owner, `${path}/commands`, {
    action: 'play',
    controller_id: controller,
    fence: claimed.playback.fence,
    run_id: claimed.playback.run_id,
  });
  const beforeReward = await api(owner, `${path}/snapshot`);
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, Date.parse(wheel.latest.next_spin_at) - Date.now() + 200)),
  );
  const command = {
      action: 'spin',
      mode: 'MEMBERS',
      reward: 'TWO_FIRST',
      labels: [],
      previous_id: wheel.latest.id,
    },
    key = randomUUID();
  const result = await api(member, `${path}/wheel`, command, 200, key);
  const replay = await api(member, `${path}/wheel`, command, 200, key);
  assert.deepEqual(replay, result);
  const afterReward = await api(owner, `${path}/snapshot`);
  assert.deepEqual(afterReward.playback, beforeReward.playback);
  const identities = (snapshot) =>
    snapshot.queue
      .map(({ id, status, position }) => ({ id, status, position }))
      .sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(identities(afterReward), identities(beforeReward));
  assert.equal(afterReward.settings.reorder_approval, true);
  assert.equal(result.rewarded.length, 2);
  assert.ok(
    result.rewarded.every(
      (entry) =>
        afterReward.queue.find((song) => song.id === entry.id)?.requested_by === result.winner.id,
    ),
  );
  assert.equal((await api(owner, `${path}/wheel`)).recent.length, 2);
  await api(owner, `${path}/commands`, {
    action: 'next',
    controller_id: controller,
    fence: afterReward.playback.fence,
    run_id: afterReward.playback.run_id,
  });
  assert.equal((await api(owner, `${path}/snapshot`)).playback.entry_id, result.rewarded[0].id);
  pass(
    'Reward bypasses enabled voting, preserves the active run/all queued songs, replays once and selects the rewarded song next',
  );
  await api(owner, `${path}/commands`, { action: 'kick', user_id: member.user.id });
  await api(member, `${path}/wheel`, undefined, 403);
  await api(member, `${path}/wheel`, command, 403, key);
  pass('Revoked members cannot read results or replay a previously authorized spin');
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
  assert.deepEqual(await fingerprint('dist'), publicBefore, 'Public assets changed');
  assert.equal(await readFile('.wrangler/deploy/config.json', 'utf8'), deploymentBefore);
  await writeFile(
    `${directory}/result.json`,
    JSON.stringify(
      { run, base, checked_at: new Date().toISOString(), checks, cleaned, failed },
      null,
      2,
    ),
  );
  if (!cleaned) failed = true;
  console.log(`Temporary data cleanup: ${cleaned ? 'PASS' : 'FAILED'}; public build unchanged.`);
  console.log('Evidence: ' + directory);
}
process.exitCode = failed ? 1 : 0;
