import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';

// Default to the isolated trial. Public checks must target the configured HTTPS origin.
// Never reset production counters; --check-search opts into one real search.
const env = parseEnv(await readFile('.dev.vars', 'utf8'));
const project = process.argv[process.argv.indexOf('--project-ref') + 1];
assert.ok(process.argv.includes('--project-ref'));
assert.equal(new URL(env.SUPABASE_URL).hostname, `${project}.supabase.co`);
const beforeFix = process.argv.includes('--expect-unavailable');
const checkSearch = process.argv.includes('--check-search');
assert.ok(!(beforeFix && checkSearch), 'Search check requires the uncapped build');
const base = process.argv.includes('--base-url')
  ? new URL(process.argv[process.argv.indexOf('--base-url') + 1]).origin
  : 'http://127.0.0.1:5180';
const publicCheck = base !== 'http://127.0.0.1:5180';
if (publicCheck) {
  assert.equal(new URL(base).protocol, 'https:');
  assert.equal(base, new URL(env.APP_BASE_URL).origin);
  assert.ok(!beforeFix, 'Baseline reproduction is restricted to the isolated trial');
}
const run = randomUUID();
const directory = `.roomtune/search-check/${run}`;
await mkdir(directory, { recursive: true });
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
};
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
const users = [],
  rooms = [],
  checks = [];
let failed = false;
function checked(result, label) {
  if (result.error)
    throw new Error(`${label}: ${result.error.code ?? result.error.status ?? 'upstream'}`);
  return result.data;
}
async function record() {
  await writeFile(`${directory}/owned.json`, JSON.stringify({ users, rooms }));
}
function pass(label) {
  checks.push(label);
  console.log('PASS ' + label);
}
async function fingerprint(directory) {
  const output = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(output, await fingerprint(path));
    else
      output[path] = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
  }
  return output;
}
const publicBefore = await fingerprint('dist');
const deploymentBefore = await readFile('.wrangler/deploy/config.json', 'utf8');
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
    `Unexpected HTTP ${response.status}: ${data.error?.code ?? 'response'}`,
  );
  return data;
}
try {
  assert.equal((await api(null, '/system/health')).status, 'configured');
  const email = `roomtune-search-${run}@example.invalid`,
    password = `${randomUUID()}Aa9!`;
  const user = checked(
    await service.auth.admin.createUser({ email, password, email_confirm: true }),
    'create owned identity',
  ).user;
  users.push(user.id);
  await record();
  checked(await service.from('system_admins').insert({ user_id: user.id }), 'owned admin');
  const session = checked(
    await client.auth.signInWithPassword({ email, password }),
    'owned login',
  ).session;
  const room = await api(
    session,
    '/rooms',
    { name: `Kiểm thử link ${run.slice(0, 6)}`, description: 'Phòng tạm tự dọn.', pin: '8426' },
    201,
  );
  rooms.push(room.id);
  await record();
  if (checkSearch) {
    const search = await api(session, `/youtube/search?room=${room.id}&q=bad`);
    assert.ok(Array.isArray(search.items) && search.items.length > 0);
    pass(
      `Real search for bad returns ${search.items.length} results after removing application search caps`,
    );
  }
  const link = new URL(
    'https://www.youtube.com/watch?v=-q_S27LbNKU&list=RD-q_S27LbNKU&start_radio=1',
  );
  const id = link.searchParams.get('v');
  const result = await api(
    session,
    `/rooms/${room.id}/commands`,
    { action: 'enqueue', video_id: id },
    beforeFix ? 400 : 200,
  );
  const snapshot = await api(session, `/rooms/${room.id}/snapshot`);
  if (beforeFix) {
    assert.equal(result.error.code, 'VIDEO_UNAVAILABLE');
    assert.equal(snapshot.queue.length, 0);
    pass('Old trial reproduces VIDEO_UNAVAILABLE for the reported BAD radio video');
  } else {
    const entry = snapshot.queue.find((item) => item.youtube_video_id === id);
    assert.ok(entry);
    assert.equal(entry.song.duration, 225);
    assert.match(entry.song.title, /BAD/);
    pass('Real YouTube metadata and Supabase enqueue accept BAD (-q_S27LbNKU, 225s)');
    pass('Link addition succeeds without calling search or consuming the shared search budget');
  }
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
  client.auth.stopAutoRefresh();
  let cleaned = true;
  for (const id of rooms) {
    const result = await service.from('rooms').delete().eq('id', id);
    if (result.error) {
      cleaned = false;
      console.error('Owned room cleanup failed: ' + result.error.code);
    }
  }
  for (const id of users) {
    const result = await service.auth.admin.deleteUser(id);
    if (result.error) {
      cleaned = false;
      console.error('Owned identity cleanup failed: ' + result.error.code);
    }
  }
  if (cleaned) {
    await rm(`${directory}/owned.json`, { force: true });
    pass('Exact run-owned room and identity cleaned');
  } else failed = true;
  assert.deepEqual(await fingerprint('dist'), publicBefore);
  assert.equal(await readFile('.wrangler/deploy/config.json', 'utf8'), deploymentBefore);
  pass('Public artifacts and deployment pointer preserved');
  await writeFile(
    `${directory}/result.json`,
    JSON.stringify({ at: new Date().toISOString(), beforeFix, failed, checks }, null, 2),
  );
  if (!beforeFix)
    await writeFile(
      publicCheck ? 'docs/SEARCH_LINK_PUBLIC_CHECK.md' : 'docs/SEARCH_LINK_HOSTED_CHECK.md',
      [
        '# Kiểm thử thêm link YouTube với dịch vụ thật',
        '',
        `UTC: ${new Date().toISOString()}`,
        `URL: ${base}`,
        `Kết quả: ${failed ? 'CHƯA ĐẠT' : 'PASS'}`,
        '',
        ...checks.map((label) => '- ' + label),
        '',
        `Auth, YouTube metadata và enqueue Supabase thật trong phòng tạm. ${checkSearch ? 'Gọi tìm kiếm bad một lần trên bản đã bỏ trần tìm kiếm riêng.' : 'Không gọi tìm kiếm.'} Không sửa/reset bộ đếm chung, sửa phòng người dùng hoặc đổi cấu hình hosted. Không kiểm chứng IFrame/âm thanh trong lượt này.`,
        publicCheck
          ? 'Kiểm tra qua domain HTTPS public thật.'
          : 'Kiểm tra runtime thử riêng; không xác minh tính năng này trên public trong lượt này.',
        '',
      ].join('\n'),
    );
  process.exitCode = failed ? 1 : 0;
}
