import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';

// Use only identities and rooms created by this run; never accepts an existing room ID.
const env = parseEnv(await readFile('.dev.vars', 'utf8'));
const argument = (name) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
assert.equal(argument('--project-ref') + '.supabase.co', new URL(env.SUPABASE_URL).hostname);
const base = new URL(argument('--base-url')).origin;
assert.equal(base, new URL(env.APP_BASE_URL).origin);
assert.equal(new URL(base).protocol, 'https:');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
const owner = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
const member = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
const users = [],
  rooms = [],
  checks = [];
let failed = false;
function checked(result, label) {
  if (result.error) throw new Error(label + ': ' + (result.error.code ?? result.error.status));
  return result.data;
}
function pass(label) {
  checks.push(label);
  console.log('PASS ' + label);
}
async function api(session, path, body, expected = 200, key = randomUUID()) {
  const response = await fetch(base + '/api/v1' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + session.access_token,
      'Content-Type': 'application/json',
      Origin: base,
      'Idempotency-Key': key,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  assert.equal(response.status, expected, path + ': ' + (data.error?.code ?? 'unexpected status'));
  return data;
}
try {
  const email = `roomtune-management-${randomUUID()}@example.invalid`,
    password = `${randomUUID()}Aa9!`;
  const account = checked(
    await service.auth.admin.createUser({ email, password, email_confirm: true }),
    'create owner',
  ).user;
  users.push(account.id);
  checked(await service.from('system_admins').insert({ user_id: account.id }), 'temporary owner');
  const host = checked(
    await owner.auth.signInWithPassword({ email, password }),
    'owner login',
  ).session;
  const guest = checked(await member.auth.signInAnonymously(), 'member login').session;
  users.push(guest.user.id);
  const name = 'Quản lý thử ' + randomUUID().slice(0, 8);
  const room = await api(
    host,
    '/rooms',
    { name, description: 'Chỉ dữ liệu thử, tự dọn.', pin: '' },
    201,
  );
  rooms.push(room.id);
  await api(guest, '/rooms/join', { code: room.code, name: 'Bạn kiểm thử', pin: '' });
  const music = () => api(host, `/rooms/${room.id}/snapshot`);
  const baseline = await music();
  const rules = {
    variant: 'CANGUA_V2',
    safe: 'STARTS',
    entry: 'SIX',
    jumpOnOne: true,
    captureBonus: false,
    finishBonus: false,
    threeSixes: false,
    turnSeconds: 90,
    maxMisses: 3,
  };
  const gamesPath = `/rooms/${room.id}/games`,
    createBody = { name: 'Bàn quản lý thử', rules },
    createKey = randomUUID();
  let snapshot = await api(host, gamesPath, createBody, 201, createKey);
  const game = snapshot.state.id,
    path = gamesPath + '/' + game;
  assert.equal(snapshot.state.rules.safe, 'STARTS');
  const send = async (session, command) =>
    (snapshot = await api(session, path, { ...command, version: snapshot.state.version }));
  await send(guest, { action: 'join', color: 1 });
  await api(guest, path + '/delete', { name: createBody.name }, 403);
  await api(guest, `/rooms/${room.id}/delete`, { name }, 403);
  await api(
    guest,
    path,
    { action: 'kick', user_id: host.user.id, version: snapshot.state.version },
    403,
  );
  assert.equal(
    (await api(host, path + '/delete', { name: 'Tên sai' }, 409)).error.code,
    'DELETE_NAME_MISMATCH',
  );
  pass(
    'Hosted safe-start table persists; members cannot kick owner or delete table/room; exact name enforced',
  );
  for (const session of [host, guest]) await send(session, { action: 'ready', ready: true });
  await send(host, { action: 'start' });
  await api(
    host,
    path,
    { action: 'settings', rules: { ...rules, safe: 'NONE' }, version: snapshot.state.version },
    409,
  );
  const kickKey = randomUUID(),
    kickBody = { action: 'kick', user_id: guest.user.id, version: snapshot.state.version };
  snapshot = await api(host, path, kickBody, 200, kickKey);
  assert.equal(snapshot.state.status, 'FINISHED');
  assert.equal(snapshot.state.players.find((p) => p.id === guest.user.id).status, 'FORFEITED');
  assert.ok(snapshot.removedPlayers.includes(guest.user.id));
  assert.deepEqual(await api(host, path, kickBody, 200, kickKey), snapshot);
  await api(guest, path);
  await api(guest, `/rooms/${room.id}/snapshot`);
  await send(host, { action: 'rematch' });
  assert.equal(snapshot.state.rules.safe, 'STARTS');
  assert.equal(snapshot.state.players.length, 1);
  pass(
    'Active kick and receipt replay work; removed player retains music/viewing, stays excluded from rematch',
  );
  const deleteKey = randomUUID(),
    deleteBody = { name: createBody.name };
  assert.deepEqual(await api(host, path + '/delete', deleteBody, 200, deleteKey), {
    deleted: true,
  });
  assert.deepEqual(await api(host, path + '/delete', deleteBody, 200, deleteKey), {
    deleted: true,
  });
  assert.equal((await api(host, gamesPath, createBody, 409, createKey)).error.code, 'NOT_FOUND');
  assert.equal((await api(host, gamesPath)).length, 0);
  const after = await music();
  assert.equal(after.version, baseline.version);
  assert.deepEqual(after.playback, baseline.playback);
  assert.deepEqual(after.queue, baseline.queue);
  pass(
    'Table deletion retries safely, delayed CREATE cannot resurrect it, music state remains unchanged',
  );
  const cascade = await api(host, gamesPath, { name: 'Bàn xóa cùng phòng', rules }, 201);
  const roomKey = randomUUID();
  assert.deepEqual(await api(host, `/rooms/${room.id}/delete`, { name }, 200, roomKey), {
    deleted: true,
  });
  assert.deepEqual(await api(host, `/rooms/${room.id}/delete`, { name }, 200, roomKey), {
    deleted: true,
  });
  assert.deepEqual(
    checked(await service.from('rooms').select('id').eq('id', room.id), 'room deleted'),
    [],
  );
  assert.deepEqual(
    checked(
      await service.from('game_matches').select('id').eq('id', cascade.state.id),
      'table cascaded',
    ),
    [],
  );
  pass('Owner room deletion and retry succeed; room-owned table is deleted by cascade');
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
  for (const id of rooms) {
    const result = await service.from('rooms').delete().eq('id', id);
    if (result.error) {
      failed = true;
      cleaned = false;
      console.error('Room cleanup failed: ' + result.error.code);
    }
  }
  for (const id of users) {
    const result = await service.auth.admin.deleteUser(id);
    if (result.error) {
      failed = true;
      cleaned = false;
      console.error('Identity cleanup failed: ' + result.error.code);
    }
  }
  owner.auth.stopAutoRefresh();
  member.auth.stopAutoRefresh();
  if (cleaned) pass('Exact run-owned rooms and identities cleaned; no user room was modified');
  await writeFile(
    'docs/MANAGEMENT_PUBLIC_CHECK.md',
    [
      '# Kiểm thử quản lý phòng/bàn public',
      '',
      `UTC: ${new Date().toISOString()}`,
      `URL: ${base}`,
      '',
      `Kết quả: ${failed ? 'CHƯA ĐẠT' : 'PASS'}`,
      '',
      ...checks.map((c) => '- ' + c),
      '',
      'Kiểm thử API HTTPS với Supabase Auth/PostgreSQL thật. Chỉ tạo và dọn dữ liệu của lượt thử; giao diện xóa/kick được kiểm tra bằng browser fixture desktop/mobile.',
      '',
    ].join('\n'),
  );
  process.exitCode = failed ? 1 : 0;
}
