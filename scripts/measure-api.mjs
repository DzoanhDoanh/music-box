import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Only run-owned accounts/rooms. Never print tokens, URLs with IDs, or request bodies.
const env = parseEnv(await readFile(new URL('../.dev.vars', import.meta.url), 'utf8'));
const phase = process.argv.includes('--after') ? 'after' : 'before';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
const auth = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
const origins = { local: 'http://127.0.0.1:4173', public: new URL(env.APP_BASE_URL).origin };
const samples = {};
let user, room, token;
function check({ data, error }) {
  if (error) throw new Error(`Upstream ${error.code ?? error.status ?? 'error'}`);
  return data;
}
async function api(origin, path, body) {
  const started = performance.now();
  const response = await fetch(`${origin}/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: origin,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status} ${data?.error?.code ?? ''}`);
  return {
    data,
    ms: Math.round(performance.now() - started),
    timing: response.headers.get('server-timing'),
  };
}
async function measure(label, task) {
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const started = performance.now();
    const result = await task();
    if (i)
      rows.push({
        ms: result?.ms ?? Math.round(performance.now() - started),
        timing: result?.timing ?? null,
      });
  }
  const values = rows.map((v) => v.ms).sort((a, b) => a - b);
  samples[label] = { median_ms: values[2], min_ms: values[0], max_ms: values[4], samples: rows };
  console.log(`${label}: median=${values[2]}ms range=${values[0]}-${values[4]}ms`);
}
try {
  const email = `latency-${randomUUID()}@example.com`,
    password = randomUUID() + randomUUID();
  user = check(await service.auth.admin.createUser({ email, password, email_confirm: true })).user
    .id;
  check(await service.from('system_admins').insert({ user_id: user }));
  token = check(await auth.auth.signInWithPassword({ email, password })).session.access_token;
  room = (
    await api(origins.local, '/rooms', {
      name: `Đo API ${phase}`,
      description: 'Phòng thử tự dọn.',
      pin: '',
    })
  ).data.id;
  await measure('direct_auth', async () => check(await service.auth.getUser(token)));
  await measure('direct_rate_limit', async () =>
    check(
      await service.rpc('consume_rate_limit', {
        p_key: `latency:${user}`,
        p_limit: 180,
        p_seconds: 60,
      }),
    ),
  );
  await measure('direct_snapshot', async () =>
    check(await service.rpc('room_snapshot', { p_actor: user, p_room: room })),
  );
  for (const [name, origin] of Object.entries(origins)) {
    await measure(`${name}_health`, () => api(origin, '/system/health'));
    await measure(`${name}_snapshot`, () => api(origin, `/rooms/${room}/snapshot`));
    await measure(`${name}_chat_read`, () => api(origin, `/rooms/${room}/chat?since=0`));
    await measure(`${name}_chat_send`, () =>
      api(origin, `/rooms/${room}/chat`, { action: 'send', body: 'Tin đo thời gian API' }),
    );
  }
  await writeFile(
    new URL(`../.roomtune/latency-${phase}.json`, import.meta.url),
    JSON.stringify({ measured_at: new Date().toISOString(), samples }, null, 2),
  );
} finally {
  if (room) check(await service.from('rooms').delete().eq('id', room));
  if (user) check(await service.auth.admin.deleteUser(user));
  auth.auth.stopAutoRefresh();
  await auth.removeAllChannels();
  console.log('Run-owned latency account/room cleaned up.');
}
