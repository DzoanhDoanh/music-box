import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
import { verifyRound } from '../src/shared/bau-cua/fairness.ts';

// Opt-in hosted acceptance. Only run-owned identities and rooms are mutated.
const env = parseEnv(await readFile('.dev.vars', 'utf8'));
const argument = (name) => process.argv[process.argv.indexOf(name) + 1];
assert.ok(process.argv.includes('--project-ref'), 'Explicit --project-ref required');
const project = argument('--project-ref');
assert.equal(new URL(env.SUPABASE_URL).hostname, `${project}.supabase.co`);
const base = process.argv.includes('--base-url')
  ? new URL(argument('--base-url')).origin
  : 'http://127.0.0.1:5181';
assert.ok(
  base === 'http://127.0.0.1:5181' ||
    (base === new URL(env.APP_BASE_URL).origin && base.startsWith('https:')),
);
const run = randomUUID(),
  directory = `.roomtune/bau-hosted/${run}`;
await mkdir(directory, { recursive: true });
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
};
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
const users = [],
  rooms = [],
  clients = [],
  checks = [],
  timings = [];
let browser,
  failed = false;
const safe = (value) =>
  String(value).replace(/sb_(?:secret|publishable)_[\w-]+|eyJ[\w.-]+|AIza[\w-]+/g, '[redacted]');
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
  const email = `roomtune-bau-${label}-${run}@example.invalid`,
    password = randomUUID() + 'Aa9!';
  const { user } = checked(
    await service.auth.admin.createUser({ email, password, email_confirm: true }),
    'create identity',
  );
  users.push(user.id);
  await record();
  if (admin)
    checked(
      await service.from('system_admins').insert({ user_id: user.id }),
      'test owner permission',
    );
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
  clients.push(client);
  const session = checked(
    await client.auth.signInWithPassword({ email, password }),
    'real Auth login',
  ).session;
  await client.realtime.setAuth(session.access_token);
  return { client, session };
}
async function api(session, path, body, expected = 200, key = randomUUID()) {
  const start = performance.now();
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
  timings.push(Math.round(performance.now() - start));
  assert.equal(
    response.status,
    expected,
    `${path}: HTTP ${response.status} (${data.error?.code ?? 'unexpected'})`,
  );
  return data;
}
function subscribe(channel, denied = false) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscribe timeout')), 15000);
    channel.subscribe((status) => {
      if (!['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) return;
      clearTimeout(timer);
      if (status === (denied ? 'CHANNEL_ERROR' : 'SUBSCRIBED')) resolve();
      else reject(new Error('Unexpected Realtime status: ' + status));
    });
  });
}
async function eventually(read, predicate, label, milliseconds = 15000) {
  const until = Date.now() + milliseconds;
  do {
    const result = await read();
    if (predicate(result)) return result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  } while (Date.now() < until);
  throw new Error('Timed out: ' + label);
}
try {
  const health = await api(null, '/system/health');
  assert.equal(health.status, 'configured');
  assert.equal(health.bauCuaEnabled, true);
  const owner = await identity('owner', true),
    player = await identity('player'),
    outsider = await identity('outsider');
  const room = await api(
    owner.session,
    '/rooms',
    {
      name: 'Kiểm tra Bầu Cua ' + run.slice(0, 6),
      description: 'Phòng kiểm thử phát hành; tự dọn.',
      pin: '8426',
    },
    201,
  );
  rooms.push(room.id);
  await record();
  const roomPath = `/rooms/${room.id}`,
    lobby = roomPath + '/bau-cua';
  await api(player.session, lobby, undefined, 403);
  await api(player.session, '/rooms/join', {
    code: room.code,
    name: 'Bạn kiểm thử Bầu Cua',
    pin: '8426',
  });
  await api(null, lobby, undefined, 401);
  await api(outsider.session, lobby, undefined, 403);
  await api(player.session, lobby + '/notices');
  assert.equal(
    checked(
      await service.from('coin_wallets').select('user_id').eq('user_id', player.session.user.id),
      'notice wallet probe',
    ).length,
    0,
  );
  let state = await api(owner.session, lobby);
  assert.equal(state.wallet.total, 10000);
  assert.equal((await api(owner.session, lobby)).wallet.total, 10000);
  const dailyKey = randomUUID();
  state = await api(owner.session, lobby, { action: 'daily' }, 200, dailyKey);
  assert.equal(state.wallet.total, 12000);
  assert.equal(
    (await api(owner.session, lobby, { action: 'daily' }, 200, dailyKey)).wallet.total,
    12000,
  );
  await api(owner.session, lobby, { action: 'daily' }, 409);
  pass(
    'Real Auth, room membership, no wallet from notices, one-time grant and idempotent daily bonus',
  );
  const settings = {
    ...state.settings,
    bettingSeconds: 10,
    lockingSeconds: 2,
    shakingSeconds: 2,
    revealingSeconds: 3,
    resultSeconds: 3,
  };
  await api(owner.session, lobby, { action: 'settings', settings, confirmed: true });
  state = await api(owner.session, lobby, { action: 'create', name: 'Bàn kiểm tra Bầu Cua' });
  const table = state.table.id,
    path = lobby + '/' + table;
  await api(player.session, path, { action: 'join', spectator: false });
  await api(owner.session, path, { action: 'volunteer' });
  const secondTable = await api(owner.session, lobby, { action: 'create', name: 'Bàn độc lập' });
  assert.notEqual(secondTable.table.id, table);
  assert.equal(secondTable.round, null);
  const notices = [],
    events = [];
  const roomChannel = player.client
    .channel('room:' + room.id, { config: { private: true } })
    .on('broadcast', { event: 'room.updated' }, (e) => notices.push(e.payload));
  const channel = player.client
    .channel('bau:' + table, { config: { private: true } })
    .on('broadcast', { event: 'table.updated' }, (e) => events.push(e.payload));
  await subscribe(channel);
  await subscribe(roomChannel);
  const deniedChannel = outsider.client.channel('bau:' + table, { config: { private: true } });
  await subscribe(deniedChannel, true);
  await outsider.client.removeChannel(deniedChannel);
  assert.equal(
    checked(
      await outsider.client.from('bau_cua_tables').select('id').eq('id', table),
      'outsider RLS',
    ).length,
    0,
  );
  const direct = await player.client.rpc('bau_cua_command', {
    p_actor: player.session.user.id,
    p_room: room.id,
    p_table: table,
    p_request: randomUUID(),
    p_command: { action: 'daily' },
    p_seed: 'ab'.repeat(32),
  });
  assert.ok(direct.error, 'Client must not invoke game RPC directly');
  assert.ok(
    (
      await player.client
        .from('coin_wallets')
        .update({ available: 999999 })
        .eq('user_id', player.session.user.id)
    ).error,
    'Client must not edit wallet',
  );
  assert.ok(
    (await player.client.schema('private').from('bau_seeds').select('*')).error,
    'Private seeds must not be exposed',
  );
  pass(
    'Hosted private Broadcast subscription, outsider denial, RLS, wallet/RPC/seed protections and independent tables',
  );
  const music = await api(owner.session, roomPath + '/snapshot');
  const { room_id: ignoredRoom, updated_at: ignoredTime, ...musicSettings } = music.settings;
  assert.equal(ignoredRoom, room.id);
  assert.ok(ignoredTime);
  await api(owner.session, roomPath + '/commands', {
    action: 'settings',
    name: music.room.name,
    description: music.room.description,
    settings: { ...musicSettings, allow_duplicates: true, queue_mode: 'MANUAL', max_per_member: 8 },
  });
  const songs = checked(
    await service
      .from('songs')
      .select('youtube_video_id')
      .gt('verified_at', new Date(Date.now() - 20 * 3600000).toISOString())
      .gt('duration', 1)
      .lt('duration', music.settings.max_duration)
      .limit(1),
    'verified song',
  );
  assert.ok(songs.length, 'A verified song is needed for the isolated penalty check');
  for (const actor of [owner, player, player])
    await api(actor.session, roomPath + '/commands', {
      action: 'enqueue',
      video_id: songs[0].youtube_video_id,
    });
  const musicBefore = await api(owner.session, roomPath + '/snapshot');
  browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  async function pageFor(actor, mobile = false) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, JSON.stringify(value));
        localStorage.setItem('roomtune:bau:low', 'true');
      },
      { key: `sb-${project}-auth-token`, value: actor.session },
    );
    const page = await context.newPage();
    await page.goto(`${base}/room/${room.id}/games/bau-cua/${table}`);
    await expect(page.getByRole('heading', { name: 'Bàn kiểm tra Bầu Cua.' })).toBeVisible({
      timeout: 20000,
    });
    return page;
  }
  const desktop = await pageFor(owner),
    mobile = await pageFor(player, true);
  let penalty;
  for (let attempt = 0; attempt < 10 && !penalty; attempt++) {
    const playerState = await api(player.session, path);
    const adjustment = 100 - playerState.wallet.total;
    if (adjustment)
      await api(owner.session, lobby, {
        action: 'adjust',
        user: player.session.user.id,
        amount: adjustment,
        reason: 'Kiểm thử phá sản trong phòng tạm',
      });
    state = await api(owner.session, path, { action: 'start' });
    const round = state.round;
    assert.equal(round.status, 'BETTING_OPEN');
    assert.equal(round.revealed_seed, null);
    assert.equal(round.dice, null);
    const raw = checked(
      await player.client.from('bau_cua_rounds').select('revealed_seed,dice').eq('id', round.id),
      'round RLS',
    )[0];
    assert.equal(raw.revealed_seed, null);
    assert.equal(raw.dice, null);
    const key = randomUUID(),
      bet = { action: 'bet', round: round.id, symbol: 'CUA', amount: 100 };
    const results = await Promise.all([
      api(player.session, path, bet, 200, key),
      api(player.session, path, bet, 200, key),
    ]);
    assert.ok(results.every((r) => r.wallet.reserved === 100));
    await eventually(
      async () => events,
      (list) => list.some((e) => e.kind === 'bet.accepted'),
      'hosted bet Broadcast',
    );
    await api(player.session, path, { ...bet, dice: [1, 1, 1] }, 400);
    state = await eventually(
      () => api(player.session, path),
      (value) => value.round?.status === 'RESULT',
      'real-time round settlement',
      45000,
    );
    assert.ok(
      await verifyRound(round.id, state.round.revealed_seed, round.commitment, state.round.dice),
    );
    const hits = state.round.dice.filter((n) => n === 1).length,
      payout = hits ? 100 * (hits + 1) : 0;
    assert.equal(state.wallet.total, payout);
    assert.equal(state.wallet.reserved, 0);
    assert.ok(state.diagnostics.walletConsistent && state.diagnostics.collateralSafe);
    const dealer = await api(owner.session, path);
    assert.equal(dealer.round.dealer_net, 100 - payout);
    assert.equal(dealer.wallet.reserved, 0);
    await expect(mobile.locator('.bau-results')).not.toContainText('Chưa mở', { timeout: 15000 });
    await expect(desktop.locator('.bau-results')).not.toContainText('Chưa mở', { timeout: 15000 });
    assert.equal(
      await desktop.locator('.bau-results').innerText(),
      await mobile.locator('.bau-results').innerText(),
    );
    penalty = state.penalties.find((p) => p.round_id === round.id);
    if (!penalty) {
      console.log(
        'INFO Round won; retrying with test-only wallet adjustment to exercise bankruptcy.',
      );
      await new Promise((resolve) => setTimeout(resolve, 3200));
    }
  }
  assert.ok(penalty, 'Could not exercise bankruptcy with ten independent real rounds');
  pass(
    'Real random rounds settle once, exact payout and released collateral; two browsers agree and commitment verifies',
  );
  assert.equal(penalty.user_id, player.session.user.id);
  assert.equal(penalty.songs.length, 1);
  const mine = musicBefore.queue
    .filter((e) => e.requested_by === player.session.user.id)
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at) || b.id.localeCompare(a.id));
  assert.equal(penalty.songs[0].id, mine[0].id);
  const afterPenalty = await api(owner.session, roomPath + '/snapshot');
  assert.ok(afterPenalty.queue.some((e) => e.requested_by === owner.session.user.id));
  assert.ok(!afterPenalty.queue.some((e) => e.id === mine[0].id));
  assert.deepEqual(afterPenalty.playback, musicBefore.playback);
  await eventually(
    async () => notices,
    (list) => list.some((e) => e.kind === 'penalty.updated'),
    'hosted music penalty Broadcast',
  );
  assert.ok((await api(player.session, lobby + '/notices')).some((p) => p.id === penalty.id));
  const reliefKey = randomUUID();
  assert.equal(
    (await api(player.session, path, { action: 'relief' }, 200, reliefKey)).wallet.total,
    1000,
  );
  assert.equal(
    (await api(player.session, path, { action: 'relief' }, 200, reliefKey)).wallet.total,
    1000,
  );
  await api(player.session, path, { action: 'relief' }, 409);
  await api(owner.session, path, { action: 'restore', penalty: penalty.id, entry: mine[0].id });
  assert.ok(
    (await api(owner.session, roomPath + '/snapshot')).queue.some((e) => e.id === mine[0].id),
  );
  pass(
    'Bankruptcy removes only own newest queued song, music state preserved, private room notices arrive, relief/replay and restore work',
  );
  await mobile.reload();
  await expect(mobile.getByRole('heading', { name: 'Bàn kiểm tra Bầu Cua.' })).toBeVisible({
    timeout: 15000,
  });
  assert.equal((await api(player.session, path)).wallet.total, 1000);
  await desktop.screenshot({ path: `${directory}/desktop.png`, fullPage: true });
  await mobile.screenshot({ path: `${directory}/mobile.png`, fullPage: true });
  await api(owner.session, roomPath + '/games');
  await api(owner.session, roomPath + '/wheel');
  await browser.close();
  browser = null;
  await player.client.removeChannel(channel);
  await api(owner.session, path, { action: 'kick', user: player.session.user.id, ban: true });
  await api(player.session, path, undefined, 403);
  const banned = player.client.channel('bau:' + table, { config: { private: true } });
  await subscribe(banned, true);
  pass(
    'Deep links, desktop/mobile reload, persistent wallet, existing Ludo/wheel endpoints and banned-user rejection',
  );
} catch (error) {
  failed = true;
  console.error('FAIL ' + safe(error.message));
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
      console.error('Room cleanup failed: ' + result.error.code);
    }
  }
  for (const id of users) {
    const result = await service.auth.admin.deleteUser(id);
    if (result.error) {
      cleaned = false;
      console.error('Identity cleanup failed: ' + result.error.code);
    }
  }
  if (!cleaned) failed = true;
  const sorted = timings.toSorted((a, b) => a - b);
  const latency = {
    requests: timings.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
  };
  await writeFile(
    `${directory}/result.json`,
    JSON.stringify(
      { run, base, checkedAt: new Date().toISOString(), checks, cleaned, failed, latency },
      null,
      2,
    ),
  );
  console.log(`Temporary data cleanup: ${cleaned ? 'PASS' : 'FAILED'}; evidence: ${directory}`);
  console.log('Observed request latency (not a load SLA): ' + JSON.stringify(latency));
}
process.exitCode = failed ? 1 : 0;
