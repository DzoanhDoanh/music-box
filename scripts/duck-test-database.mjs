import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function duckTestDatabase({ port = 55442 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'roomtune-duck-test-')),
    password = randomUUID();
  const pg = new EmbeddedPostgres({
    databaseDir: join(directory, 'data'),
    user: 'postgres',
    password,
    port,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1'],
    onLog: () => {},
    onError: () => {},
  });
  let sql;
  try {
    await pg.initialise();
    await pg.start();
    sql = postgres({
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password,
      database: 'postgres',
      max: 24,
    });
    await sql.unsafe(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema extensions; create schema realtime;
 create table auth.users(id uuid primary key,is_anonymous boolean default true);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table realtime.messages(id bigint generated always as identity primary key,extension text,topic text,payload jsonb);
 alter table realtime.messages enable row level security;
 create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
 create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$insert into realtime.messages(extension,topic,payload) values('broadcast',topic,payload)$$;
 grant usage on schema auth,realtime to authenticated; grant execute on function auth.uid(),realtime.topic() to authenticated; grant select,insert on realtime.messages to authenticated;`);
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await sql.unsafe(await readFile(join('supabase/migrations', file), 'utf8'));
    return {
      sql,
      close: async () => {
        await sql.end();
        await pg.stop();
      },
    };
  } catch (error) {
    if (sql) await sql.end();
    await pg.stop();
    throw error;
  }
}
