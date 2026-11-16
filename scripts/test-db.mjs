import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// A real, isolated PostgreSQL cluster. Only Supabase-managed auth/realtime schemas are fixtures.
const directory = await mkdtemp(join(tmpdir(), 'roomtune-test-'));
const password = randomUUID();
const pg = new EmbeddedPostgres({
  databaseDir: join(directory, 'data'),
  user: 'postgres',
  password,
  port: 55439,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
let sql;
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
try {
  await pg.initialise();
  await pg.start();
  sql = postgres({
    host: '127.0.0.1',
    port: 55439,
    user: 'postgres',
    password,
    database: 'postgres',
    max: 35,
  });
  await sql.unsafe(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema extensions; create schema realtime;
 create table auth.users(id uuid primary key,is_anonymous boolean default true);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table realtime.messages(id bigint generated always as identity primary key,extension text,topic text,payload jsonb);
 alter table realtime.messages enable row level security;
 create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
 create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$select$$;
 grant usage on schema auth,realtime to authenticated; grant execute on function auth.uid(),realtime.topic() to authenticated; grant select,insert on realtime.messages to authenticated;`);
  for (const file of (await readdir('supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await sql.unsafe(await readFile(join('supabase/migrations', file), 'utf8'));
  console.log('PASS exact migrations applied on PostgreSQL 17');
  passed++;
  const owner = randomUUID(),
    users = Array.from({ length: 30 }, () => randomUUID()),
    outsider = randomUUID();
  for (const id of [owner, ...users, outsider])
    await sql`insert into auth.users(id,is_anonymous) values(${id},${id !== owner})`;
  await sql`insert into public.system_admins values(${owner},now())`;
  const create = async (actor, name = 'Phòng kiểm thử', pin = '') =>
    (
      await sql`select public.create_room(${actor}::uuid,${name},'',${pin},${randomUUID()}::uuid) r`
    )[0].r;
  const room = await create(owner);
  const other = await create(owner, 'Phòng khác');
  const command = async (actor, body, key = randomUUID(), rid = room.id) =>
    (
      await sql`select public.room_command(${actor}::uuid,${rid}::uuid,${key}::uuid,${sql.json(body)}::jsonb) r`
    )[0].r;
  const snapshot = async (actor = owner, rid = room.id) =>
    (await sql`select public.room_snapshot(${actor}::uuid,${rid}::uuid) r`)[0].r;
  await check('anonymous cannot bootstrap owner', async () => {
    await assert.rejects(create(outsider), /PERMISSION_DENIED/);
  });
  await check('room capacity is enforced', async () => {
    await sql`update public.room_settings set capacity=31 where room_id=${room.id}`;
    for (const user of users)
      await sql`select public.join_room(${user}::uuid,${room.code},'Khách thử','')`;
    await assert.rejects(
      sql`select public.join_room(${outsider}::uuid,${room.code},'Ngoài phòng','')`,
      /ROOM_FULL/,
    );
  });
  await check('PIN checks and rate limit persist', async () => {
    const pinRoom = await create(owner, 'Phòng có PIN', '1234');
    await assert.rejects(
      sql`select public.join_room(${outsider}::uuid,${pinRoom.code},'Ngoài phòng','wrong')`,
      /INVALID_PIN/,
    );
    await sql`select public.join_room(${outsider}::uuid,${pinRoom.code},'Ngoài phòng','1234')`;
    for (let i = 0; i < 3; i++) {
      const r = await sql`select public.consume_rate_limit('fixture-key',2,60) ok`;
      assert.equal(r[0].ok, i < 2);
    }
  });
  const ids = Array.from({ length: 31 }, (_, i) => `fixture${String(i).padStart(4, '0')}`);
  for (const id of ids)
    await sql`insert into public.songs(youtube_video_id,title,channel,thumbnail,duration) values(${id},'Fixture song','Fixture channel','https://i.ytimg.com/fixture.jpg',180)`;
  await check('30 simultaneous requests preserve entries and unique positions', async () => {
    await Promise.all(users.map((u, i) => command(u, { action: 'enqueue', video_id: ids[i] })));
    const state = await snapshot();
    assert.equal(state.queue.length, 30);
    assert.equal(new Set(state.queue.map((e) => e.position)).size, 30);
    assert.equal(state.version, 60);
  });
  let state = await snapshot();
  const entry = state.queue[0].id;
  await check('30 simultaneous votes counted from rows', async () => {
    await Promise.all(
      users.map((u) => command(u, { action: 'vote', entry_id: entry, enabled: true })),
    );
    assert.equal((await snapshot()).queue.find((e) => e.id === entry).vote_count, 30);
  });
  await check('duplicate request ID is idempotent', async () => {
    const key = randomUUID(),
      body = { action: 'vote', entry_id: entry, enabled: true };
    await Promise.all([command(users[0], body, key), command(users[0], body, key)]);
    assert.equal((await snapshot()).queue.find((e) => e.id === entry).vote_count, 30);
    await assert.rejects(
      command(users[0], { ...body, enabled: false }, key),
      /IDEMPOTENCY_CONFLICT/,
    );
  });
  await check('queue duplicates and cross-room access rejected', async () => {
    await assert.rejects(
      command(users[1], { action: 'enqueue', video_id: ids[0] }),
      /SONG_ALREADY_QUEUED/,
    );
    await assert.rejects(
      command(users[1], { action: 'clear' }, randomUUID(), other.id),
      /PERMISSION_DENIED/,
    );
    await assert.rejects(snapshot(outsider), /PERMISSION_DENIED/);
  });
  await check('member cannot pause or claim host', async () => {
    await assert.rejects(
      command(users[0], { action: 'claim', controller_id: randomUUID() }),
      /PERMISSION_DENIED/,
    );
    await assert.rejects(
      command(users[0], { action: 'pause', controller_id: randomUUID(), fence: 1, run_id: null }),
      /PERMISSION_DENIED/,
    );
  });
  const controller = randomUUID();
  let claim = await command(owner, { action: 'claim', controller_id: controller });
  const fence = claim.playback.fence;
  await check('single live host lease', async () => {
    await assert.rejects(
      command(owner, { action: 'claim', controller_id: randomUUID() }),
      /HOST_BUSY/,
    );
  });
  const play = await command(owner, {
    action: 'play',
    controller_id: controller,
    fence,
    run_id: null,
  });
  await check('heartbeat saves resume position without accepting an old run position', async () => {
    await command(owner, {
      action: 'heartbeat',
      controller_id: controller,
      fence,
      run_id: play.playback.run_id,
      position: 42,
    });
    assert.equal((await snapshot()).playback.position, 42);
    await command(owner, {
      action: 'heartbeat',
      controller_id: controller,
      fence,
      run_id: randomUUID(),
      position: 100,
    });
    assert.equal((await snapshot()).playback.position, 42);
  });
  await check('device playback mode is persistent, owner-only and validated', async () => {
    const before = await snapshot();
    assert.equal(before.settings.playback_mode, 'HOST_ONLY');
    assert.ok(Number.isFinite(Date.parse(before.server_time)));
    const settings = Object.fromEntries(
      Object.entries(before.settings).filter(([key]) => !['room_id', 'updated_at'].includes(key)),
    );
    const body = {
      action: 'settings',
      name: before.room.name,
      description: before.room.description,
      settings: { ...settings, playback_mode: 'ALL_DEVICES' },
    };
    await assert.rejects(command(users[1], body), /PERMISSION_DENIED/);
    await command(owner, { action: 'moderator', user_id: users[2] });
    await assert.rejects(command(users[2], body), /PERMISSION_DENIED/);
    await assert.rejects(
      command(owner, { ...body, settings: { ...settings, playback_mode: 'INVALID' } }),
      /INVALID_INPUT/,
    );
    await command(owner, body);
    assert.equal((await snapshot(users[1])).settings.playback_mode, 'ALL_DEVICES');
    const version = (await snapshot()).version;
    await command(owner, {
      action: 'heartbeat',
      controller_id: controller,
      fence,
      run_id: play.playback.run_id,
      position: 42,
    });
    assert.equal((await snapshot()).version, version + 1);
    await command(owner, { ...body, settings });
    const hostOnlyVersion = (await snapshot()).version;
    await command(owner, {
      action: 'heartbeat',
      controller_id: controller,
      fence,
      run_id: play.playback.run_id,
      position: 42,
    });
    assert.equal((await snapshot()).version, hostOnlyVersion);
  });
  await check(
    'seek and pause publish positions while retaining host fencing and run guards',
    async () => {
      const body = {
        action: 'seek',
        controller_id: controller,
        fence,
        run_id: play.playback.run_id,
        position: 65,
      };
      await assert.rejects(command(users[1], body), /PERMISSION_DENIED/);
      await assert.rejects(command(owner, { ...body, fence: fence + 1 }), /STALE_HOST/);
      await assert.rejects(command(owner, { ...body, run_id: randomUUID() }), /STALE_RUN/);
      await assert.rejects(command(owner, { ...body, position: -1 }), /INVALID_INPUT/);
      await command(owner, body);
      assert.equal((await snapshot()).playback.position, 65);
      await command(owner, { ...body, action: 'pause', position: 67 });
      const paused = (await snapshot()).playback;
      assert.equal(paused.position, 67);
      assert.equal(paused.intent, 'PAUSED');
    },
  );
  await check('concurrent Next/ENDED advances only one track', async () => {
    const run = play.playback.run_id;
    const results = await Promise.allSettled(
      ['next', 'ended'].map((action) =>
        command(owner, { action, controller_id: controller, fence, run_id: run }),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (await sql`select count(*)::int n from public.playback_history where room_id=${room.id}`)[0]
        .n,
      1,
    );
    assert.equal(
      (await snapshot()).queue.filter((e) => ['PREPARING', 'PLAYING'].includes(e.status)).length,
      1,
    );
  });
  await check('expired lease and stale fencing rejected', async () => {
    await sql`update public.playback_sessions set lease_until=now()-interval '1 second' where room_id=${room.id}`;
    await assert.rejects(
      command(owner, { action: 'heartbeat', controller_id: controller, fence }),
      /STALE_HOST/,
    );
    claim = await command(owner, { action: 'claim', controller_id: randomUUID() });
    assert.ok(claim.playback.fence > fence);
    await assert.rejects(
      command(owner, {
        action: 'next',
        controller_id: controller,
        fence,
        run_id: claim.playback.run_id,
      }),
      /STALE_HOST/,
    );
  });
  await check('ban prevents rejoin and snapshot', async () => {
    await command(owner, { action: 'ban', user_id: users[0] });
    await assert.rejects(
      sql`select public.join_room(${users[0]}::uuid,${room.code},'Khách thử','')`,
      /BANNED/,
    );
    await assert.rejects(snapshot(users[0]), /PERMISSION_DENIED/);
    await command(owner, { action: 'unban', user_id: users[0] });
  });
  await check('RLS rejects other-room reads and direct mutation RPC', async () => {
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${users[1]},true)`;
      assert.equal((await tx`select * from public.rooms where id=${other.id}`).length, 0);
      assert.equal((await tx`select * from public.rooms where id=${room.id}`).length, 1);
    });
    await assert.rejects(
      sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select public.room_command(${owner}::uuid,${room.id}::uuid,${randomUUID()}::uuid,'{"action":"clear"}'::jsonb)`;
      }),
      /permission denied/,
    );
    await assert.rejects(
      sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`update public.queue_entries set position=999 where id=${entry}`;
      }),
      /permission denied/,
    );
  });
  await check('private realtime policies reject outsiders and forged broadcasts', async () => {
    await sql`insert into realtime.messages(extension,topic,payload) values('broadcast',${'room:' + room.id},'{}')`;
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${outsider},true)`;
      await tx`select set_config('realtime.topic',${'room:' + room.id},true)`;
      assert.equal((await tx`select * from realtime.messages`).length, 0);
    });
    await assert.rejects(
      sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claim.sub',${users[1]},true)`;
        await tx`select set_config('realtime.topic',${'room:' + room.id},true)`;
        await tx`insert into realtime.messages(extension,topic,payload) values('broadcast',${'room:' + room.id},'{}')`;
      }),
      /permission denied|row-level security/,
    );
  });
  await check('playlist ownership and persisted favorites', async () => {
    await sql`select public.library_command(${users[1]}::uuid,${randomUUID()}::uuid,'{"action":"playlist.create","name":"Bộ sưu tập"}'::jsonb)`;
    const p = (await sql`select id from public.playlists where user_id=${users[1]}`)[0];
    await assert.rejects(
      sql`select public.library_command(${users[2]}::uuid,${randomUUID()}::uuid,${sql.json({ action: 'playlist.delete', id: p.id })}::jsonb)`,
      /PERMISSION_DENIED/,
    );
    await sql`select public.library_command(${users[1]}::uuid,${randomUUID()}::uuid,${sql.json({ action: 'favorite', video_id: ids[0], enabled: true })}::jsonb)`;
    assert.equal((await sql`select * from public.favorites where user_id=${users[1]}`).length, 1);
  });
  await check('settings PIN retry is idempotent and does not store plaintext', async () => {
    const state = await snapshot(),
      key = randomUUID();
    const body = {
      action: 'settings',
      settings: state.settings,
      name: state.room.name,
      description: '',
      pin: 'sensitive-test-pin',
    };
    await command(owner, body, key);
    await command(owner, body, key);
    const receipt = (
      await sql`select payload from private.operation_receipts where actor=${owner} and request_id=${key}`
    )[0];
    assert.equal(receipt.payload.pin, undefined);
    assert.ok(receipt.payload.pin_digest);
    await assert.rejects(
      command(owner, { ...body, pin: 'different' }, key),
      /IDEMPOTENCY_CONFLICT/,
    );
  });
  await check('manual reorder validates complete set and stale versions', async () => {
    let s = await snapshot();
    await command(owner, {
      action: 'settings',
      settings: { ...s.settings, queue_mode: 'MANUAL' },
      name: s.room.name,
      description: '',
    });
    s = await snapshot();
    const ids = s.queue
      .filter((e) => e.status === 'QUEUED')
      .map((e) => e.id)
      .reverse();
    await command(owner, { action: 'reorder', ids, version: s.version });
    await assert.rejects(
      command(owner, { action: 'reorder', ids, version: s.version }),
      /STALE_VERSION/,
    );
    assert.deepEqual(
      (await snapshot()).queue.filter((e) => e.status === 'QUEUED').map((e) => e.id),
      ids,
    );
  });
  await check(
    'maintenance removes expired metadata and receipts without deleting queue',
    async () => {
      await sql`update public.songs set verified_at=now()-interval '31 days' where youtube_video_id=${ids[5]}`;
      const before = (await sql`select count(*)::int n from public.queue_entries`)[0].n;
      await sql`select public.maintenance_cleanup()`;
      assert.equal(
        (await sql`select title from public.songs where youtube_video_id=${ids[5]}`)[0].title,
        'Video cần cập nhật',
      );
      assert.equal((await sql`select count(*)::int n from public.queue_entries`)[0].n, before);
    },
  );
  await check('room code rotates only for owner and invalidates old invitations', async () => {
    await assert.rejects(command(users[1], { action: 'rotate_code' }), /PERMISSION_DENIED/);
    await command(owner, { action: 'rotate_code' });
    const newState = await snapshot();
    assert.notEqual(newState.room.code, room.code);
    await assert.rejects(
      sql`select public.join_room(${users[1]}::uuid,${room.code},'Khách thử','')`,
      /ROOM_NOT_FOUND/,
    );
  });
  await check(
    'account deletion removes identity but preserves anonymous queue history',
    async () => {
      const before = (await sql`select count(*)::int n from public.queue_entries`)[0].n;
      await sql`delete from auth.users where id=${users[5]}`;
      assert.equal((await sql`select * from public.profiles where id=${users[5]}`).length, 0);
      assert.equal((await sql`select count(*)::int n from public.queue_entries`)[0].n, before);
      assert.ok(
        (await snapshot()).queue.some(
          (e) => e.requested_by === null && e.requester === 'Thành viên đã rời phòng',
        ),
      );
    },
  );
  const { testReorderVoting } = await import('./test-reorder-db.mjs');
  await testReorderVoting({ sql, owner, users, videos: ids, check });
  const { testChat } = await import('./test-chat-db.mjs');
  await testChat({ sql, owner, check });
  const { testGame } = await import('./test-game-db.mjs');
  await testGame({ sql, owner, check });
  await check('backup and restore into a separate database preserves records', async () => {
    const binary = process.env.PG_BIN
      ? process.env.PG_BIN.replace(/[\\/]?$/, '/')
      : process.platform === 'win32'
        ? 'C:/Program Files/PostgreSQL/18/bin/'
        : '';
    const execute = promisify(execFile),
      archive = join(directory, 'verification.dump');
    const environment = {
      ...process.env,
      PGHOST: '127.0.0.1',
      PGPORT: '55439',
      PGUSER: 'postgres',
      PGPASSWORD: password,
      PGDATABASE: 'postgres',
    };
    await execute(
      binary + 'pg_dump' + (process.platform === 'win32' ? '.exe' : ''),
      ['--format=custom', '--no-owner', '--file', archive],
      { env: environment },
    );
    await sql.unsafe('create database roomtune_restore_check');
    await execute(
      binary + 'pg_restore' + (process.platform === 'win32' ? '.exe' : ''),
      ['--no-owner', '--exit-on-error', '--dbname', 'roomtune_restore_check', archive],
      { env: environment },
    );
    const restored = postgres({
      host: '127.0.0.1',
      port: 55439,
      user: 'postgres',
      password,
      database: 'roomtune_restore_check',
    });
    try {
      for (const table of [
        'rooms',
        'queue_entries',
        'votes',
        'playback_history',
        'playlists',
        'game_matches',
        'game_players',
        'game_settings',
        'game_moves',
        'game_events',
        'game_results',
        'game_spectators',
      ]) {
        const original = (await sql.unsafe(`select count(*)::int n from public.${table}`))[0].n;
        assert.equal(
          (await restored.unsafe(`select count(*)::int n from public.${table}`))[0].n,
          original,
        );
      }
      assert.deepEqual(
        await restored`select id,state from public.game_matches order by id`,
        await sql`select id,state from public.game_matches order by id`,
      );
      assert.deepEqual(
        await restored`select actor,request_id,command,result from private.game_receipts order by actor,request_id`,
        await sql`select actor,request_id,command,result from private.game_receipts order by actor,request_id`,
      );
      const state = (
        await restored`select public.room_snapshot(${owner}::uuid,${room.id}::uuid) r`
      )[0].r;
      assert.equal(state.room.id, room.id);
      assert.equal(
        (await restored`select relrowsecurity from pg_class where oid='public.rooms'::regclass`)[0]
          .relrowsecurity,
        true,
      );
    } finally {
      await restored.end();
    }
  });
  console.log(
    `DATABASE: ${passed} checks passed. Real PostgreSQL; auth/realtime service integration not exercised.`,
  );
} finally {
  if (sql) await sql.end();
  await pg.stop();
  console.log('Isolated cluster stopped; temporary test data retained at ' + directory);
}
