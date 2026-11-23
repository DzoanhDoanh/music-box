// Test-only bridge: real production Duck service/RPCs against disposable PostgreSQL.
// Authentication and existing room/music UI use the isolated browser fixture.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { duckTestDatabase } from './duck-test-database.mjs';
const db = await duckTestDatabase(),
  sql = db.sql;
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
let server, exitCode;
try {
  const result = await build({
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
  await mkdir('.roomtune', { recursive: true });
  const target = resolve('.roomtune/duck-browser-service.mjs');
  await writeFile(target, result.outputFiles[0].text);
  const { DuckRaceService, duckCommandSchema, rpc } = await import(pathToFileURL(target).href);
  const users = Array.from(
    { length: 5 },
    (_, i) => '20000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
  );
  const names = ['An', 'Bình', 'Chi', 'Dũng', 'Khán giả'];
  for (const id of users) await sql`insert into auth.users(id,is_anonymous) values(${id},false)`;
  await sql`insert into public.system_admins(user_id) values(${users[0]})`;
  let room;
  const store = {
    consume: async () => {},
    call: async (name, params) => {
      if (!/^duck_race_[a-z_]+$/.test(name)) throw new Error('Unexpected fixture RPC');
      const pairs = Object.entries(params),
        args = pairs.map(([key], i) => key + ' => $' + (i + 1)).join(',');
      return rpc(
        {
          rpc: async () => {
            try {
              return {
                data: (
                  await sql.unsafe(
                    'select public.' + name + '(' + args + ') r',
                    pairs.map(([, v]) => (v !== null && typeof v === 'object' ? sql.json(v) : v)),
                  )
                )[0].r,
                error: null,
              };
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
  server = createServer(async (req, res) => {
    try {
      let text = '';
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 50000) throw new Error('Test payload too large');
      }
      const body = text ? JSON.parse(text) : null,
        path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/setup') {
        room = (
          await sql`select public.create_room(${users[0]}::uuid,'Duck browser','','',${randomUUID()}::uuid) r`
        )[0].r;
        for (let i = 1; i < users.length; i++)
          await sql`select public.join_room(${users[i]}::uuid,${room.code},${names[i]},'')`;
        for (let i = 0; i < users.length; i++)
          await sql`update public.profiles set name=${names[i]} where id=${users[i]}`;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ room: room.id }));
        return;
      }
      if (path === '/time') {
        await sql`update public.duck_race_matches set state=jsonb_set(state,'{startAt}',to_jsonb(floor(extract(epoch from now())*1000)-${body.elapsed}::numeric)) where id=${body.race} and room_id=${room.id}`;
        res.end('{}');
        return;
      }
      if (path === '/songs') {
        if (req.method === 'POST')
          for (let i = 0; i < 3; i++) {
            const video = 'duckSong00' + i;
            await sql`insert into public.songs(youtube_video_id,title,channel,duration,thumbnail) values(${video},${'Bài hát ' + i},'Duck fixture',180,'/favicon.svg') on conflict do nothing`;
            await sql`insert into public.queue_entries(id,room_id,youtube_video_id,requested_by,status,position) values(${randomUUID()},${room.id},${video},${users[0]},${i === 0 ? 'PLAYING' : 'QUEUED'},${i + 1})`;
          }
        const queue =
          await sql`select id,youtube_video_id,status,position,priority from public.queue_entries where room_id=${room.id} order by position`;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(queue));
        return;
      }
      const actor = req.headers['x-fixture-actor'];
      if (!users.includes(actor)) {
        res.statusCode = 403;
        res.end('{}');
        return;
      }
      const service = new DuckRaceService(store, actor),
        race = path.split('/duck-race/')[1] ?? null;
      const value =
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
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(value));
    } catch (error) {
      res.statusCode = error.status ?? 400;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({ error: { code: error.code ?? 'INVALID_INPUT', message: error.message } }),
      );
    }
  });
  await new Promise((resolve) => server.listen(55443, '127.0.0.1', resolve));
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'playwright.duck.config.ts',
        ...process.argv.slice(2),
      ],
      { stdio: 'inherit', windowsHide: true },
    );
    child.on('error', reject);
    child.on('exit', resolve);
  });
  exitCode = code ?? 1;
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await db.close();
  console.log('Duck browser bridge and isolated PostgreSQL stopped; hosted untouched.');
}
// embedded-postgres installs async-exit-hook, whose beforeExit handler exits with 0.
// Cleanup is awaited above; exit explicitly so failed Playwright runs cannot pass CI.
console.log('Duck browser test exit status:', exitCode);
process.exit(exitCode);
