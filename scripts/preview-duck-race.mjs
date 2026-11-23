// Local visual playground only: sample identity, disposable PostgreSQL, real Duck service.
// Never imported by the app, connected to hosted Supabase or exposed through the tunnel.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer as createProbe } from 'node:net';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { duckTestDatabase } from './duck-test-database.mjs';

const origin = 'http://127.0.0.1:5182';
const runtime = resolve('.roomtune/duck-preview');
const actor = '20000000-0000-4000-8000-000000000001';
const token = 'duck-local-preview';
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
const playwrightRequire = createRequire(require.resolve('@playwright/test'));
const { WebSocketServer } = createRequire(playwrightRequire.resolve('playwright-core'))('ws');
let db, vite, socketServer, timer;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  for (const client of socketServer?.clients ?? []) client.terminate();
  socketServer?.close();
  await vite?.close();
  await db?.close();
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => void close().then(() => process.exit(0)));

try {
  // Fail on a conflict, before creating a DB. Never stop another application's listener.
  for (const port of [5182, 55444]) {
    const probe = createProbe();
    await new Promise((yes, no) => {
      probe.once('error', no);
      probe.listen(port, '127.0.0.1', yes);
    });
    await new Promise((yes) => probe.close(yes));
  }
  await mkdir(runtime, { recursive: true });
  const bundle = await build({
    stdin: {
      contents:
        "export * from './src/server/services/duck-race';export * from './src/shared/duck-race/contracts';export {rpc} from './src/server/repository';",
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const modulePath = resolve(runtime, 'service.mjs');
  await writeFile(modulePath, bundle.outputFiles[0].text);
  const { DuckRaceService, duckCommandSchema, defaultRaceConfig, duckSkins, rpc } = await import(
    pathToFileURL(modulePath).href
  );
  db = await duckTestDatabase({ port: 55444 });
  const sql = db.sql;
  // Preserve events in the local fixture so ordinary browser tabs can receive notifications.
  await sql.unsafe(`create or replace function realtime.send(payload jsonb,event text,topic text,private boolean)
    returns void language sql as $$insert into realtime.messages(extension,topic,payload)
    values('broadcast',topic,jsonb_build_object('event',event,'payload',payload))$$`);
  await sql`insert into auth.users(id,is_anonymous) values(${actor},false)`;
  await sql`insert into public.system_admins(user_id) values(${actor})`;
  const room = (
    await sql`select public.create_room(${actor}::uuid,'Duck Race — Chơi thử','Dữ liệu mẫu trên máy này','',${randomUUID()}::uuid) r`
  )[0].r;
  await sql`update public.profiles set name='Bạn (chơi thử)' where id=${actor}`;
  for (let i = 0; i < 4; i++) {
    const video = 'duckSong00' + i;
    await sql`insert into public.songs(youtube_video_id,title,channel,duration,thumbnail)
      values(${video},${'Bài hát mẫu ' + (i + 1)},'Dữ liệu chơi thử',180,'/favicon.svg')`;
    await sql`insert into public.queue_entries(id,room_id,youtube_video_id,requested_by,status,position)
      values(${randomUUID()},${room.id},${video},${actor},'QUEUED',${i + 1})`;
  }
  const store = {
    consume: async () => {},
    call: async (name, params) => {
      if (!/^duck_race_[a-z_]+$/.test(name)) throw new Error('Unexpected preview RPC');
      const pairs = Object.entries(params);
      if (pairs.some(([key]) => !/^p_[a-z_]+$/.test(key))) throw new Error('Invalid parameter');
      return rpc(
        {
          rpc: async () => {
            try {
              const data = (
                await sql.unsafe(
                  'select public.' +
                    name +
                    '(' +
                    pairs.map(([key], i) => key + ' => $' + (i + 1)).join(',') +
                    ') r',
                  pairs.map(([, value]) =>
                    value !== null && typeof value === 'object' ? sql.json(value) : value,
                  ),
                )
              )[0].r;
              return { data, error: null };
            } catch (error) {
              return { data: null, error };
            }
          },
        },
        name,
        params,
      );
    },
  };
  const service = new DuckRaceService(store, actor);
  const samples = [];
  for (const [track, name] of [
    ['SUNNY', 'Chơi thử — Dòng sông nắng'],
    ['TROPICAL', 'Chơi thử — Đảo nhiệt đới'],
    ['FESTIVAL', 'Chơi thử — Lễ hội ánh sáng'],
  ]) {
    const snapshot = await service.execute(room.id, null, randomUUID(), {
      action: 'create',
      name,
      config: { ...defaultRaceConfig, mode: 'CUSTOM', track, duration: 30 },
      entries: duckSkins.map((skin, i) => ({ name: 'Vịt ' + (i + 1), skin, team: '' })),
      songs: [],
    });
    samples.push({ name, id: snapshot.race.id });
  }
  const hub = `/room/${room.id}/games/duck-race`;
  const session = () => ({
    access_token: token,
    refresh_token: token,
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: {
      id: actor,
      aud: 'authenticated',
      role: 'authenticated',
      is_anonymous: false,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  });
  function json(res, data, status = 200) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(data));
  }
  async function api(req, res, next) {
    const path = new URL(req.url, origin).pathname;
    // This playground has no external identity or credentials. Reject cross-origin writes.
    if (
      req.headers.host !== '127.0.0.1:5182' ||
      (req.headers.origin && req.headers.origin !== origin)
    )
      return json(res, {}, 403);
    if (path === '/') {
      res.writeHead(302, { location: hub });
      res.end();
      return;
    }
    if (path === '/__duck-preview/status')
      return json(res, { mode: 'isolated-preview', url: origin + hub, samples, hosted: false });
    if (path.startsWith('/auth/v1/'))
      return json(res, path.endsWith('/user') ? session().user : session());
    if (!path.startsWith('/api/')) return next();
    if (req.headers.authorization !== 'Bearer ' + token) return json(res, {}, 401);
    try {
      let text = '';
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 50000) throw new Error('Preview payload too large');
      }
      const body = text ? JSON.parse(text) : null;
      const prefix = `/api/v1/rooms/${room.id}`;
      if (path === prefix + '/duck-race' || path.startsWith(prefix + '/duck-race/')) {
        const race = path.slice((prefix + '/duck-race').length).replace(/^\//, '') || null;
        const result =
          req.method === 'POST'
            ? await service.execute(
                room.id,
                race,
                String(req.headers['idempotency-key'] || randomUUID()),
                duckCommandSchema.parse(body),
              )
            : race
              ? await service.read(room.id, race)
              : await service.list(room.id);
        return json(res, result);
      }
      if (path === prefix + '/snapshot')
        return json(
          res,
          (await sql`select public.room_snapshot(${actor}::uuid,${room.id}::uuid) r`)[0].r,
        );
      if (path === '/api/v1/rooms')
        return json(res, { rooms: [{ room, role: 'owner' }], canCreate: false });
      if (path === prefix + '/chat')
        return json(res, { messages: [], latest_sequence: 0, read_sequence: 0, unread_count: 0 });
      if (path === '/api/v1/library')
        return json(res, { name: 'Bạn (chơi thử)', favorites: [], playlists: [] });
      return json(
        res,
        { error: { code: 'NOT_FOUND', message: 'Bản thử này dành cho Duck Race.' } },
        404,
      );
    } catch (error) {
      return json(
        res,
        { error: { code: error.code ?? 'INVALID_INPUT', message: error.message } },
        error.status ?? 400,
      );
    }
  }
  vite = await createServer({
    configFile: false,
    envFile: false,
    cacheDir: 'node_modules/.vite/duck-preview',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(origin),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('local-preview-only'),
      'import.meta.env.VITE_TURNSTILE_SITE_KEY': JSON.stringify(''),
      ...Object.fromEntries(
        ['LUDO', 'BAU_CUA', 'WHEEL', 'DUCK_RACE'].map((name) => [
          'import.meta.env.VITE_ENABLE_' + name,
          JSON.stringify(name === 'DUCK_RACE' ? 'true' : 'false'),
        ]),
      ),
    },
    plugins: [
      react(),
      tailwind(),
      {
        name: 'duck-local-preview-only',
        configureServer(server) {
          server.middlewares.use((req, res, next) => void api(req, res, next));
        },
        transformIndexHtml() {
          return [
            {
              tag: 'script',
              injectTo: 'head-prepend',
              children: `localStorage.setItem('sb-127-auth-token', ${JSON.stringify(JSON.stringify(session()))});`,
            },
            {
              tag: 'div',
              injectTo: 'body-prepend',
              attrs: {
                style:
                  'padding:8px 16px;background:#263d37;color:#d3ffea;text-align:center;font:13px system-ui;position:relative;z-index:10',
              },
              children:
                '🦆 BẢN CHƠI THỬ TRÊN MÁY NÀY · Tài khoản, bài hát và coin là dữ liệu mẫu · Chưa public',
            },
          ];
        },
      },
    ],
    server: {
      host: '127.0.0.1',
      port: 5182,
      strictPort: true,
      fs: {
        deny: [
          '.env',
          '.env.*',
          '.dev.vars',
          '.dev.vars.*',
          '**/.roomtune/**',
          '**/.wrangler/**',
          '**/.git/**',
          '**/*.pem',
          '**/*.key',
        ],
      },
      watch: {
        ignored: [
          '**/.roomtune/**',
          '**/.wrangler/**',
          '**/backups/**',
          '**/dist/**',
          '**/test-results/**',
        ],
      },
    },
  });
  // Local Phoenix transport; only the sample identity is accepted. This is not Supabase auth QA.
  socketServer = new WebSocketServer({ noServer: true });
  const channels = new Map();
  const send = (client, topic, event, payload, ref = null) => {
    if (client.readyState === 1) client.send(JSON.stringify([null, ref, topic, event, payload]));
  };
  socketServer.on('connection', (client) => {
    const topics = new Set();
    channels.set(client, topics);
    client.on('close', () => channels.delete(client));
    client.on('message', (raw) => {
      try {
        const data = JSON.parse(String(raw));
        const [, ref, topic, event, payload] = Array.isArray(data)
          ? data
          : [null, data.ref, data.topic, data.event, data.payload];
        if (event === 'phx_join' && payload.access_token !== token)
          return send(client, topic, 'phx_reply', { status: 'error', response: {} }, ref);
        if (event === 'phx_join') topics.add(topic);
        if (event === 'phx_leave') topics.delete(topic);
        send(client, topic, 'phx_reply', { status: 'ok', response: {} }, ref);
        if (event === 'phx_join' || event === 'presence')
          send(client, topic, 'presence_state', {
            [actor]: { metas: [{ phx_ref: 'preview', online_at: new Date().toISOString() }] },
          });
      } catch {
        client.close(1008, 'Invalid preview message');
      }
    });
  });
  vite.httpServer.on('upgrade', (request, socket, head) => {
    if (!request.url.startsWith('/realtime/')) return;
    if (request.headers.host !== '127.0.0.1:5182' || request.headers.origin !== origin) {
      socket.destroy();
      return;
    }
    socketServer.handleUpgrade(request, socket, head, (client) =>
      socketServer.emit('connection', client),
    );
  });
  let cursor = 0,
    polling = false;
  timer = setInterval(async () => {
    if (polling || closing) return;
    polling = true;
    try {
      const messages =
        await sql`select id,topic,payload from realtime.messages where id>${cursor} order by id limit 100`;
      for (const message of messages) {
        cursor = Number(message.id);
        for (const [client, topics] of channels)
          if (topics.has('realtime:' + message.topic))
            send(client, 'realtime:' + message.topic, 'broadcast', {
              type: 'broadcast',
              ...message.payload,
            });
      }
    } catch (error) {
      console.error('Preview notification:', error.message);
    } finally {
      polling = false;
    }
  }, 500);
  await vite.listen();
  await writeFile(
    resolve(runtime, 'process.json'),
    JSON.stringify(
      {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        url: origin + hub,
        samples,
        databasePort: 55444,
        script: 'scripts/preview-duck-race.mjs',
      },
      null,
      2,
    ),
  );
  console.log('Duck Race isolated playground ready:', origin + hub);
  console.log(
    'Open a sample race, then click “Khóa đội hình & xuất phát”. Hosted/public untouched.',
  );
} catch (error) {
  console.error('Duck preview failed:', error.message);
  await close();
  process.exit(1);
}
