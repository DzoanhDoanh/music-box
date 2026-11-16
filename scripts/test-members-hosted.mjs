import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';

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
const users = [],
  rooms = [],
  clients = [],
  checks = [];
const run = randomUUID(),
  directory = `.roomtune/members-check/${run}`;
await mkdir(directory, { recursive: true });
let browser,
  failed = false;
const checked = (result, label) => {
  if (result.error)
    throw new Error(`${label}: ${result.error.code ?? result.error.status ?? 'upstream'}`);
  return result.data;
};
const pass = (label) => {
  checks.push(label);
  console.log('PASS ' + label);
};
const record = () => writeFile(`${directory}/owned.json`, JSON.stringify({ users, rooms }));
async function identity(label, admin = false) {
  const email = `roomtune-members-${label}-${run}@example.invalid`,
    password = `${randomUUID()}Aa9!`;
  const { user } = checked(
    await service.auth.admin.createUser({ email, password, email_confirm: true }),
    'create test identity',
  );
  users.push(user.id);
  await record();
  if (admin)
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
      Origin: base,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
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
  const owner = await identity('owner', true),
    member = await identity('member'),
    offline = await identity('offline');
  const room = await api(
    owner,
    '/rooms',
    {
      name: `Kiểm thử thành viên ${run.slice(0, 6)}`,
      description: 'Phòng tạm, tự dọn sau kiểm thử.',
      pin: '8426',
    },
    201,
  );
  rooms.push(room.id);
  await record();
  const path = `/rooms/${room.id}`,
    url = `${base}/room/${room.id}`;
  await api(null, `${path}/snapshot`, undefined, 401);
  await api(offline, `${path}/snapshot`, undefined, 403);
  await api(member, '/rooms/join', { code: room.code, name: 'Bạn nghe online', pin: '8426' });
  await api(offline, '/rooms/join', { code: room.code, name: 'Bạn đang nghỉ', pin: '8426' });
  pass('Real membership protects the roster; temporary room has three known members');
  browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  async function context(session, mobile) {
    const result = await browser.newContext(
      mobile
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1440, height: 960 } },
    );
    await result.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      { key: `sb-${project}-auth-token`, value: session },
    );
    return result;
  }
  const desktopContext = await context(owner, false),
    mobileContext = await context(member, true);
  const desktop = await desktopContext.newPage(),
    mobile = await mobileContext.newPage();
  await desktop.goto(url);
  await desktop
    .getByRole('button', { name: 'Xem thành viên: 1 đang online' })
    .click({ timeout: 20000 });
  const list = desktop.getByRole('dialog', { name: 'Thành viên trong phòng' });
  await expect(list.getByRole('status')).toHaveText('1 online · 2 offline');
  await mobile.goto(url);
  await expect(list.getByRole('status')).toHaveText('2 online · 1 offline', { timeout: 20000 });
  const row = (id) => list.locator(`[data-member-id="${id}"]`);
  await expect(row(member.user.id)).toHaveAttribute('data-presence', 'online');
  await expect(row(offline.user.id)).toHaveAttribute('data-presence', 'offline');
  await mobile.getByRole('button', { name: 'Xem thành viên: 2 đang online' }).click();
  const mobileList = mobile.getByRole('dialog', { name: 'Thành viên trong phòng' });
  await expect(mobileList.getByRole('status')).toHaveText('2 online · 1 offline');
  for (const page of [desktop, mobile])
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await desktop.screenshot({ path: `${directory}/desktop.png` });
  await mobile.screenshot({ path: `${directory}/mobile.png` });
  pass('Real private Realtime identifies online and offline members on desktop/mobile');
  const duplicate = await mobileContext.newPage();
  await duplicate.goto(url);
  await expect(
    duplicate.getByRole('button', { name: 'Xem thành viên: 2 đang online' }),
  ).toBeVisible({ timeout: 20000 });
  await expect(list.getByRole('status')).toHaveText('2 online · 1 offline');
  await mobile.goto(`${base}/rooms`);
  await expect(
    duplicate.getByRole('button', { name: 'Xem thành viên: 2 đang online' }),
  ).toBeVisible();
  await expect(row(member.user.id)).toHaveAttribute('data-presence', 'online');
  await duplicate.close();
  await expect(row(member.user.id)).toHaveAttribute('data-presence', 'offline', { timeout: 45000 });
  await expect(list.getByRole('status')).toHaveText('1 online · 2 offline');
  pass('Multiple tabs count once; leaving one retains presence, closing the last removes it');
  await mobile.goto(url);
  await expect(row(member.user.id)).toHaveAttribute('data-presence', 'online', { timeout: 20000 });
  await list.getByRole('button', { name: /^Offline/ }).click();
  await expect(list.locator('.room-member-item')).toHaveCount(1);
  await expect(list.getByText('Bạn đang nghỉ', { exact: true })).toBeVisible();
  await list.getByRole('button', { name: /^Tất cả/ }).click();
  pass(
    'Returning to the room updates open rosters automatically; offline filtering uses current members',
  );
  await desktopContext.setOffline(true);
  await expect(list.getByText('Đang cập nhật trạng thái kết nối…')).toBeVisible();
  await expect(list.locator('[data-presence="unknown"]')).toHaveCount(3);
  await desktopContext.setOffline(false);
  await expect(list.getByRole('status')).toHaveText('2 online · 1 offline', { timeout: 45000 });
  pass(
    'Local network loss shows unknown rather than false offline; reconnect restores live status',
  );
  await mobile.getByRole('button', { name: 'Xem thành viên: 2 đang online' }).click();
  await api(owner, `${path}/commands`, { action: 'kick', user_id: member.user.id });
  await api(member, `${path}/snapshot`, undefined, 403);
  await expect(mobileList).not.toBeVisible({ timeout: 20000 });
  await expect(list.locator(`[data-member-id="${member.user.id}"]`)).toHaveCount(0, {
    timeout: 20000,
  });
  pass('Revoked membership closes the roster and removes that user despite any stale Presence');
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
    pass('Exact run-owned rooms and identities cleaned');
  } else failed = true;
  assert.deepEqual(await fingerprint('dist'), publicBefore);
  assert.equal(await readFile('.wrangler/deploy/config.json', 'utf8'), deployBefore);
  pass('Public build and deployment pointer remain unchanged');
  await writeFile(
    publicCheck ? 'docs/MEMBERS_PUBLIC_CHECK.md' : 'docs/MEMBERS_HOSTED_CHECK.md',
    [
      '# Kiểm thử trạng thái thành viên với dịch vụ thật',
      '',
      `UTC: ${new Date().toISOString()}`,
      `URL: ${base}`,
      '',
      `Kết quả: ${failed ? 'CHƯA ĐẠT' : 'PASS'}`,
      '',
      ...checks.map((label) => '- ' + label),
      '',
      'Auth, Supabase, private Realtime và API thật. Chỉ tạo/dọn phòng và tài khoản tạm theo ID của lượt chạy. Không dùng phòng người dùng, không đổi schema hoặc cấu hình hosted. Hai context Chromium mô phỏng desktop/mobile; không kiểm chứng âm thanh trong lượt này.',
      publicCheck
        ? 'Kiểm tra qua domain HTTPS public thật.'
        : 'Kiểm tra runtime thử riêng; chưa phát hành hoặc xác minh tính năng này trên public.',
      '',
    ].join('\n'),
  );
  process.exitCode = failed ? 1 : 0;
}
