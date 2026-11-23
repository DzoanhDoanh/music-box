import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
import { verifyRace } from '../src/shared/duck-race/fairness.ts';

// Opt-in hosted acceptance. Mutations and cleanup are limited to run-owned users/rooms.
const env = parseEnv(await readFile('.dev.vars', 'utf8'));
const argument = (name) => process.argv[process.argv.indexOf(name) + 1];
assert.ok(process.argv.includes('--project-ref'), 'Explicit --project-ref required');
const project = argument('--project-ref');
assert.equal(new URL(env.SUPABASE_URL).hostname, `${project}.supabase.co`);
const base = process.argv.includes('--base-url')
  ? new URL(argument('--base-url')).origin
  : 'http://127.0.0.1:5183';
assert.ok(
  base === 'http://127.0.0.1:5183' ||
    (base === new URL(env.APP_BASE_URL).origin && base.startsWith('https:')),
);
const run = randomUUID(),
  directory = `.roomtune/duck-hosted/${run}`;
await mkdir(directory, { recursive: true });
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
};
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
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
const pass = (label) => {
  checks.push(label);
  console.log('PASS ' + label);
};
const record = () => writeFile(`${directory}/owned.json`, JSON.stringify({ users, rooms }));
async function identity(label, owner = false) {
  const email = `roomtune-duck-${label}-${run}@example.invalid`,
    password = randomUUID() + 'Aa9!';
  const { user } = checked(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    'identity',
  );
  users.push(user.id);
  await record();
  if (owner)
    checked(await admin.from('system_admins').insert({ user_id: user.id }), 'temporary room owner');
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
  clients.push(client);
  const session = checked(
    await client.auth.signInWithPassword({ email, password }),
    'password login',
  ).session;
  await client.realtime.setAuth(session.access_token);
  return { client, session, email, password };
}
async function api(session, path, body, status = 200, key = randomUUID()) {
  const response = await fetch(base + '/api/v1' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}),
      Origin: base,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  assert.equal(response.status, status, `${path}: ${response.status} ${data.error?.code ?? ''}`);
  return data;
}
function subscribe(channel, denied = false) {
  return new Promise((yes, no) => {
    const timer = setTimeout(() => no(new Error('Realtime subscribe timeout')), 15000);
    channel.subscribe((status) => {
      if (!['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) return;
      clearTimeout(timer);
      if (status === (denied ? 'CHANNEL_ERROR' : 'SUBSCRIBED')) yes();
      else no(new Error('Unexpected channel status: ' + status));
    });
  });
}
async function eventually(read, predicate, label, ms = 15000) {
  const until = Date.now() + ms;
  do {
    const result = await read();
    if (predicate(result)) return result;
    await new Promise((resolve) => setTimeout(resolve, 800));
  } while (Date.now() < until);
  throw new Error('Timed out: ' + label);
}
try {
  assert.equal((await api(null, '/system/health')).duckRaceEnabled, true);
  const owner = await identity('owner', true),
    member = await identity('member'),
    outsider = await identity('outside');
  const room = await api(
    owner.session,
    '/rooms',
    {
      name: 'Duck kiểm tra ' + run.slice(0, 6),
      description: 'Phòng kiểm thử phát hành; tự dọn.',
      pin: '8426',
    },
    201,
  );
  rooms.push(room.id);
  await record();
  const root = `/rooms/${room.id}`,
    hub = root + '/duck-race';
  await api(null, hub, undefined, 401);
  await api(outsider.session, hub, undefined, 403);
  await api(member.session, '/rooms/join', {
    code: room.code,
    name: 'Bạn kiểm thử Duck',
    pin: '8426',
  });
  const musicBefore = await api(owner.session, root + '/snapshot');
  const body = {
    action: 'create',
    name: 'Đua thử hosted',
    config: {
      mode: 'PLAYER',
      duration: 30,
      rewards: { enabled: true, winner: 50, runnerUp: 20, participation: 0, budget: 70 },
    },
  };
  await api(member.session, hub, body, 403);
  const key = randomUUID();
  const created = await api(owner.session, hub, body, 200, key);
  assert.equal((await api(owner.session, hub, body, 200, key)).race.id, created.race.id);
  const race = created.race.id,
    path = hub + '/' + race;
  assert.equal(created.race.seed, null);
  assert.equal(created.race.results.length, 0);
  assert.ok((await member.client.from('duck_race_matches').select('state').eq('id', race)).error);
  assert.ok(
    (
      await member.client
        .schema('private')
        .from('duck_race_secrets')
        .select('seed')
        .eq('race_id', race)
    ).error,
  );
  assert.ok(
    (
      await member.client.rpc('duck_race_context', {
        p_actor: owner.session.user.id,
        p_room: room.id,
        p_race: race,
        p_request: null,
        p_command: null,
      })
    ).error,
  );
  pass('Hosted Auth, room permissions, idempotency, hidden results and raw table/RPC protections');

  const events = [],
    reactions = [];
  const channel = member.client
    .channel('duck:' + race, { config: { private: true } })
    .on('broadcast', { event: 'duck.updated' }, (e) => events.push(e.payload))
    .on('broadcast', { event: 'duck.reaction' }, (e) => reactions.push(e.payload));
  await subscribe(channel);
  const denied = outsider.client.channel('duck:' + race, { config: { private: true } });
  await subscribe(denied, true);
  await outsider.client.removeChannel(denied);

  browser = await chromium.launch({ channel: 'chromium', args: ['--mute-audio'] });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const storage = `sb-${project}-auth-token`;
  await mobileContext.addInitScript(
    ({ storage, session }) => localStorage.setItem(storage, JSON.stringify(session)),
    { storage, session: member.session },
  );
  const desktop = await desktopContext.newPage(),
    mobile = await mobileContext.newPage();
  const errors = [];
  desktop.on('pageerror', (e) => errors.push(e.message));
  mobile.on('pageerror', (e) => errors.push(e.message));
  await desktop.goto(base + '/login?room=' + room.id);
  await desktop.getByLabel('Email', { exact: true }).fill(owner.email);
  await desktop.getByLabel('Mật khẩu', { exact: true }).fill(owner.password);
  await desktop.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(desktop.getByRole('button', { name: 'Giải trí', exact: true })).toBeVisible({
    timeout: 20000,
  });
  const url = base + `/room/${room.id}/games/duck-race/` + race;
  await Promise.all([desktop.goto(url), mobile.goto(url)]);
  for (const page of [desktop, mobile]) {
    await page.getByRole('button', { name: 'Tham gia cuộc đua', exact: true }).click();
    await page.getByRole('button', { name: 'Tôi đã sẵn sàng', exact: true }).click();
  }
  await eventually(
    async () => events,
    (list) => list.length >= 2,
    'private race updates',
  );
  pass(
    'Private Realtime delivery, outsider channel rejection and two simultaneous browser identities',
  );
  await desktop.getByRole('button', { name: 'Khóa đội hình & xuất phát', exact: true }).click();
  await expect(desktop.locator('.duck-stage canvas')).toBeVisible({ timeout: 20000 });
  await expect(mobile.locator('.duck-stage')).toBeVisible({ timeout: 20000 });
  const live = await api(member.session, path);
  assert.equal(live.race.seed, null);
  assert.equal(live.race.results.length, 0);
  assert.ok(live.race.frames.every((f) => f.at <= Math.max(0, live.serverNow - live.race.startAt)));
  await api(member.session, path, { action: 'reaction', emoji: '🦆' });
  await eventually(
    async () => reactions,
    (list) => list.some((e) => e.emoji === '🦆'),
    'private reaction',
  );
  await mobileContext.setOffline(true);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await mobileContext.setOffline(false);
  const refreshed = checked(await member.client.auth.refreshSession(), 'refresh auth').session;
  await member.client.realtime.setAuth(refreshed.access_token);
  member.session = refreshed;
  assert.equal((await api(refreshed, path)).race.id, race);
  await mobile.evaluate(
    ({ storage, session }) => localStorage.setItem(storage, JSON.stringify(session)),
    { storage, session: refreshed },
  );
  await mobile.reload();
  await expect(mobile.locator('.duck-stage')).toBeVisible({ timeout: 20000 });
  await desktop.screenshot({ path: `${directory}/desktop.png`, fullPage: true });
  await mobile.screenshot({ path: `${directory}/mobile.png`, fullPage: true });
  const finished = await eventually(
    () => api(owner.session, path),
    (v) => v.race.status === 'FINISHED',
    'race finish',
    45000,
  );
  const second = await api(member.session, path);
  assert.deepEqual(second.race.results, finished.race.results);
  assert.ok(
    await verifyRace(
      finished.race,
      finished.race.seed,
      finished.race.commitment,
      finished.race.lockedHash,
      finished.race.results,
    ),
  );
  await expect(desktop.getByRole('heading', { name: 'Bảng về đích' })).toBeVisible({
    timeout: 15000,
  });
  await desktop.getByRole('button', { name: 'Kiểm chứng cuộc đua' }).click();
  await expect(
    desktop.getByText('Cam kết, đội hình và thứ hạng đều khớp.', { exact: false }),
  ).toBeVisible();
  const ledger = () =>
    admin
      .from('coin_ledger')
      .select('available_delta')
      .eq('reference', 'duck:' + race);
  const rewards = checked(await ledger(), 'reward ledger');
  assert.equal(rewards.length, 2);
  assert.equal(
    rewards.reduce((sum, row) => sum + Number(row.available_delta), 0),
    70,
  );
  await api(owner.session, path);
  assert.equal(checked(await ledger(), 'reward retry').length, 2);
  assert.deepEqual((await api(owner.session, root + '/snapshot')).playback, musicBefore.playback);
  assert.deepEqual(errors, []);
  pass(
    'Time-gated live race, reactions, token rotation/reconnect, identical results/proof and exactly-once shared-wallet rewards',
  );

  await browser.close();
  browser = null;
  // No race reads after start: only the real database scheduler may finish this race.
  const unattended = await api(owner.session, hub, {
    action: 'create',
    name: 'Kiểm tra chốt nền',
    config: { mode: 'CUSTOM', duration: 30 },
    entries: [{ name: 'A' }, { name: 'B' }],
  });
  await api(owner.session, hub + '/' + unattended.race.id, { action: 'start' });
  await eventually(
    async () =>
      checked(
        await admin
          .from('duck_race_matches')
          .select('status')
          .eq('id', unattended.race.id)
          .single(),
        'unattended status',
      ),
    (row) => row.status === 'FINISHED',
    'automatic database schedule without viewer',
    100000,
  );
  pass('Database schedule finalizes an unattended race without viewer HTTP requests');
  await member.client.removeChannel(channel);
  await api(owner.session, root + '/commands', { action: 'kick', user_id: member.session.user.id });
  await api(member.session, path, undefined, 403);
  const removed = member.client.channel('duck:' + race, { config: { private: true } });
  await subscribe(removed, true);
  pass('Removed room member loses HTTP access and cannot rejoin private race channel');
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
  for (const id of rooms)
    if ((await admin.from('rooms').delete().eq('id', id)).error) cleaned = false;
  for (const id of users) if ((await admin.auth.admin.deleteUser(id)).error) cleaned = false;
  if (!cleaned) failed = true;
  await writeFile(
    `${directory}/result.json`,
    JSON.stringify(
      { run, base, checkedAt: new Date().toISOString(), checks, cleaned, failed },
      null,
      2,
    ),
  );
  console.log(`Temporary data cleanup: ${cleaned ? 'PASS' : 'FAILED'}; evidence: ${directory}`);
}
process.exitCode = failed ? 1 : 0;
