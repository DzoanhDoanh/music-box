import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
export async function testDuckRace({ sql, owner, check }) {
  const built = await build({
    stdin: {
      contents:
        "export * from './src/server/services/duck-race';export * from './src/shared/duck-race/contracts';export * from './src/shared/duck-race/fairness';export {rpc} from './src/server/repository';",
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  await mkdir('.roomtune', { recursive: true });
  const target = resolve('.roomtune/duck-db-bundle.mjs');
  await writeFile(target, built.outputFiles[0].text);
  const { DuckRaceService, defaultRaceConfig, verifyRace, rpc } = await import(
    pathToFileURL(target).href
  );
  const users = [owner, randomUUID(), randomUUID(), randomUUID()];
  for (const id of users.slice(1)) await sql`insert into auth.users(id) values(${id})`;
  const room = (
    await sql`select public.create_room(${owner}::uuid,'Duck DB','','',${randomUUID()}::uuid) r`
  )[0].r;
  for (const id of users.slice(1, 3))
    await sql`select public.join_room(${id}::uuid,${room.code},'Duck member','')`;
  const store = {
    consume: async () => {},
    call: async (name, params) => {
      assert.match(name, /^duck_race_[a-z_]+$/);
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
              console.error('RPC', name, error.message);
              return { data: null, error };
            }
          },
        },
        name,
        params,
      );
    },
  };
  const service = (u) => new DuckRaceService(store, u);
  const command = (u, id, body, key = randomUUID()) => service(u).execute(room.id, id, key, body);
  let race;
  await check('duck create/join/ready; cross-room denial and hidden seed', async () => {
    const config = {
      ...defaultRaceConfig,
      rewards: { ...defaultRaceConfig.rewards, enabled: true },
      tournament: { kind: 'POINTS', rounds: 3, advance: 2 },
    };
    const key = randomUUID(),
      body = { action: 'create', name: 'Đua DB', config, entries: [], songs: [] };
    const [a, b] = await Promise.all([
      command(owner, null, body, key),
      command(owner, null, body, key),
    ]);
    race = a.race.id;
    assert.equal(race, b.race.id);
    assert.equal(a.race.seed, null);
    assert.equal(a.rounds[0].winner, null);
    await assert.rejects(service(users[3]).read(room.id, race), /quyền|phép|phòng/i);
    for (const id of users.slice(0, 3)) {
      await command(id, race, { action: 'join', skin: 'YELLOW', team: '' });
      await command(id, race, { action: 'ready', ready: true });
    }
    const view = await service(owner).read(room.id, race);
    assert.equal(view.race.entries.length, 3);
    assert.equal(view.race.frames.length, 0);
    for (const role of ['anon', 'authenticated']) {
      const p = (
        await sql`select has_function_privilege(${role},'public.duck_race_context(uuid,uuid,uuid,uuid,jsonb)','execute') call,
   has_table_privilege(${role},'private.duck_race_secrets','select') seed,
   has_table_privilege(${role},'public.duck_race_matches','select') raw`
      )[0];
      assert.deepEqual(p, { call: false, seed: false, raw: false });
    }
  });
  await check('duck lock/start idempotency, commitment and no future disclosure', async () => {
    const key = randomUUID(),
      body = { action: 'start' };
    const all = await Promise.all(Array.from({ length: 5 }, () => command(owner, race, body, key)));
    assert.ok(all.every((v) => v.race.startAt === all[0].race.startAt));
    assert.ok(all.every((v) => v.race.frames.every((f) => f.at === 0)));
    assert.ok(all.every((v) => v.race.seed === null && v.race.results.length === 0));
    assert.ok(all.every((v) => v.rounds.every((r) => r.winner === null)));
    await assert.rejects(command(owner, race, { action: 'cancel' }));
    await assert.rejects(command(users[1], race, { action: 'skin', skin: 'KING' }));
    await assert.rejects(command(users[2], race, { action: 'leave' }));
    await assert.rejects(command(owner, race, { action: 'lobby', closed: false }, key));
    const before = (await sql`select seed from private.duck_race_secrets where race_id=${race}`)[0]
      .seed;
    await command(owner, race, { action: 'transfer', user: users[1] });
    assert.equal(
      (await sql`select seed from private.duck_race_secrets where race_id=${race}`)[0].seed,
      before,
    );
  });
  await check(
    'duck concurrent settlement grants shared-wallet rewards once, reveals proof, replay is read-only',
    async () => {
      await sql`update public.duck_race_matches set state=jsonb_set(state,'{startAt}',to_jsonb(floor(extract(epoch from now())*1000)-61000)) where id=${race}`;
      const results = await Promise.all(
        Array.from({ length: 8 }, () => service(owner).read(room.id, race)),
      );
      const state = results[0].race;
      assert.equal(state.status, 'FINISHED');
      assert.equal(state.results.length, 3);
      assert.equal(
        results[0].rounds[0].winner,
        state.entries.find((e) => e.id === state.results[0].entryId).name,
      );
      assert.ok(
        await verifyRace(state, state.seed, state.commitment, state.lockedHash, state.results),
      );
      assert.ok(
        results.every((r) => JSON.stringify(r.race.results) === JSON.stringify(state.results)),
      );
      const ledger =
        await sql`select available_delta from public.coin_ledger where reference=${'duck:' + race}`;
      assert.equal(ledger.length, 2);
      assert.equal(
        ledger.reduce((a, b) => a + Number(b.available_delta), 0),
        700,
      );
      await service(owner).read(room.id, race);
      assert.equal(
        (
          await sql`select count(*)::int n from public.coin_ledger where reference=${'duck:' + race}`
        )[0].n,
        2,
      );
      await assert.rejects(
        sql`update public.duck_race_results set results='[]' where race_id=${race}`,
        /DUCK_LOCKED/,
      );
    },
  );
  await check('duck tournament next round is unique, persisted and retry-safe', async () => {
    const key = randomUUID(),
      body = { action: 'rematch', nextRound: true };
    const [a, b] = await Promise.all([
      command(owner, race, body, key),
      command(owner, race, body, key),
    ]);
    assert.equal(a.race.id, b.race.id);
    assert.equal(a.race.round, 2);
    assert.equal(a.race.seriesId, race);
    assert.equal(a.standings.length, 3);
    assert.equal(a.race.seed, null);
    await assert.rejects(command(owner, race, body));
  });
  await check(
    'duck song priority is atomic, preserves playing song and skips removed winner',
    async () => {
      const entries = [];
      for (let i = 0; i < 3; i++) {
        const video = 'duckSong00' + i;
        await sql`insert into public.songs(youtube_video_id,title,channel,duration,thumbnail) values(${video},${'Song ' + i},'Duck',180,'https://example.invalid/image')`;
        const id = randomUUID();
        entries.push(id);
        await sql`insert into public.queue_entries(id,room_id,youtube_video_id,requested_by,status,position) values(${id},${room.id},${video},${owner},${i === 0 ? 'PLAYING' : 'QUEUED'},${i + 1})`;
      }
      const song = await command(owner, null, {
        action: 'create',
        name: 'Song race',
        config: { ...defaultRaceConfig, mode: 'SONG', songPriority: 'APPROVAL' },
        entries: [],
        songs: entries.slice(1),
      });
      await command(owner, song.race.id, { action: 'start' });
      await sql`update public.duck_race_matches set state=jsonb_set(state,'{startAt}',to_jsonb(floor(extract(epoch from now())*1000)-61000)) where id=${song.race.id}`;
      const done = await service(owner).read(room.id, song.race.id);
      assert.equal(done.race.songReward, 'PENDING');
      const winner = done.race.entries.find((e) => e.id === done.race.results[0].entryId).songId;
      const key = randomUUID();
      await Promise.all([
        command(owner, song.race.id, { action: 'approve_song' }, key),
        command(owner, song.race.id, { action: 'approve_song' }, key),
      ]);
      assert.equal(
        (await sql`select status from public.queue_entries where id=${entries[0]}`)[0].status,
        'PLAYING',
      );
      assert.equal(
        (
          await sql`select id from public.queue_entries where room_id=${room.id} and status='QUEUED' order by priority desc limit 1`
        )[0].id,
        winner,
      );
      const second = await command(owner, null, {
        action: 'create',
        name: 'Unavailable song',
        config: { ...defaultRaceConfig, mode: 'SONG', songPriority: 'AUTO' },
        entries: [],
        songs: entries.slice(1),
      });
      await command(owner, second.race.id, { action: 'start' });
      await sql`update public.queue_entries set status='REMOVED' where id in ${sql(entries.slice(1))}`;
      await sql`update public.duck_race_matches set state=jsonb_set(state,'{startAt}',to_jsonb(floor(extract(epoch from now())*1000)-61000)) where id=${second.race.id}`;
      assert.equal(
        (await service(owner).read(room.id, second.race.id)).race.songReward,
        'SKIPPED_UNAVAILABLE',
      );
      assert.equal(
        (
          await sql`select count(*)::int n from public.queue_entries where room_id=${room.id} and status='QUEUED'`
        )[0].n,
        0,
      );
    },
  );
  await check(
    'duck room policy: owner-only CAS settings, member song races, limits and committed race continuity',
    async () => {
      const initial = (await service(owner).list(room.id)).settings;
      assert.equal(initial.version, 0);
      const settings = {
        songEnabled: true,
        songOwnerOnly: false,
        maxSongEntries: 2,
        songPriority: 'APPROVAL',
      };
      const save = { action: 'settings', expectedVersion: 0, settings };
      await assert.rejects(command(users[1], null, save), { code: 'PERMISSION_DENIED' });
      const key = randomUUID();
      await Promise.all(Array.from({ length: 3 }, () => command(owner, null, save, key)));
      assert.equal((await service(users[1]).list(room.id)).settings.version, 1);
      await assert.rejects(command(owner, null, save), { code: 'DUCK_SETTINGS_STALE' });
      await assert.rejects(
        command(owner, null, { ...save, settings: { ...settings, songPriority: 'AUTO' } }, key),
        { code: 'IDEMPOTENCY_CONFLICT' },
      );
      const songs = [];
      for (let i = 0; i < 3; i++) {
        const video = 'duckPolicy' + i,
          id = randomUUID();
        songs.push(id);
        await sql`insert into public.songs(youtube_video_id,title,channel,duration,thumbnail) values(${video},'Policy','Duck',180,'/favicon.svg')`;
        await sql`insert into public.queue_entries(id,room_id,youtube_video_id,requested_by,status,position) values(${id},${room.id},${video},${owner},'QUEUED',${20 + i})`;
      }
      const create = {
        action: 'create',
        name: 'Member song race',
        config: { ...defaultRaceConfig, mode: 'SONG', songPriority: 'APPROVAL' },
        entries: [],
        songs: songs.slice(0, 2),
      };
      await assert.rejects(command(users[1], null, { ...create, songs }), {
        code: 'DUCK_SONG_LIMIT',
      });
      await assert.rejects(
        command(users[1], null, { ...create, config: { ...create.config, songPriority: 'AUTO' } }),
        { code: 'PERMISSION_DENIED' },
      );
      await assert.rejects(
        command(users[1], null, { ...create, config: { ...create.config, mode: 'PLAYER' } }),
        { code: 'PERMISSION_DENIED' },
      );
      const open = await command(users[1], null, create);
      await assert.rejects(
        command(users[1], open.race.id, {
          action: 'configure',
          name: 'Bypass',
          config: { ...open.race.config, mode: 'CUSTOM' },
          entries: [],
        }),
        { code: 'PERMISSION_DENIED' },
      );
      await command(users[1], open.race.id, { action: 'start' });
      const started = await service(owner).read(room.id, open.race.id);
      const waiting = await command(owner, null, create);
      await command(owner, null, {
        action: 'settings',
        expectedVersion: 1,
        settings: { ...settings, songEnabled: false },
      });
      await assert.rejects(command(owner, waiting.race.id, { action: 'start' }), {
        code: 'DUCK_SONG_DISABLED',
      });
      await assert.rejects(command(owner, null, create), { code: 'DUCK_SONG_DISABLED' });
      const stillRacing = await service(users[1]).read(room.id, open.race.id);
      assert.equal(stillRacing.race.startAt, started.race.startAt);
      assert.equal(stillRacing.race.commitment, started.race.commitment);
      assert.deepEqual(stillRacing.race.config, started.race.config);
      await sql`update public.duck_race_matches set state=jsonb_set(state,'{startAt}',to_jsonb(floor(extract(epoch from now())*1000)-61000)) where id=${open.race.id}`;
      await sql`select public.duck_race_tick()`;
      const finished = await service(users[1]).read(room.id, open.race.id);
      assert.equal(finished.race.status, 'FINISHED');
      assert.equal(finished.race.songReward, 'PENDING');
      await command(owner, open.race.id, { action: 'approve_song' });
      assert.equal(
        (await service(users[1]).read(room.id, open.race.id)).race.songReward,
        'APPLIED',
      );
      for (const role of ['anon', 'authenticated']) {
        const access = (
          await sql`select has_function_privilege(${role},'public.duck_race_settings(uuid,uuid,uuid,jsonb)','execute') rpc, has_table_privilege(${role},'public.duck_race_settings','select') raw`
        )[0];
        assert.deepEqual(access, { rpc: false, raw: false });
      }
    },
  );
  await check('duck preset operations and private Broadcast authorization', async () => {
    const key = randomUUID(),
      body = {
        action: 'save_preset',
        name: 'Món ăn',
        entries: [
          { name: 'Phở', skin: 'YELLOW', team: '' },
          { name: 'Bún', skin: 'WHITE', team: '' },
        ],
      };
    await command(owner, null, body, key);
    await command(owner, null, body, key);
    const presets = (await service(owner).list(room.id)).presets;
    assert.equal(presets.length, 1);
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${users[3]},true)`;
      assert.equal(
        (await tx`select private.duck_topic_allowed(${'duck:' + race}) ok`)[0].ok,
        false,
      );
    });
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${owner},true)`;
      assert.equal((await tx`select private.duck_topic_allowed(${'duck:' + race}) ok`)[0].ok, true);
    });
    await command(owner, null, { action: 'delete_preset', id: presets[0].id });
    assert.equal((await service(owner).list(room.id)).presets.length, 0);
  });
  await check('duck reactions retry safely and cannot reuse another command receipt', async () => {
    const key = randomUUID(),
      body = { action: 'reaction', emoji: '🦆' };
    await Promise.all(Array.from({ length: 3 }, () => command(owner, race, body, key)));
    await command(owner, race, body, key);
    assert.equal(
      (
        await sql`select count(*)::int n from realtime.messages where topic=${'duck:' + race} and payload->>'id'=${key}`
      )[0].n,
      1,
    );
    await assert.rejects(command(owner, race, { action: 'reaction', emoji: '🔥' }, key));
  });
  await check(
    'duck team standings, elimination locks and removed members cannot enter later rounds',
    async () => {
      const config = {
        ...defaultRaceConfig,
        mode: 'CUSTOM',
        tournament: { kind: 'TEAM', rounds: 3, advance: 2 },
      };
      const created = await command(owner, null, {
        action: 'create',
        name: 'Teams',
        config,
        songs: [],
        entries: Array.from({ length: 4 }, (_, i) => ({
          name: 'Team duck ' + i,
          skin: 'YELLOW',
          team: i % 2 ? 'Moon' : 'Sun',
        })),
      });
      const id = created.race.id;
      await command(owner, id, { action: 'start' });
      await sql`update public.duck_race_matches set state=jsonb_set(state,'{startAt}',to_jsonb(floor(extract(epoch from now())*1000)-61000)) where id=${id}`;
      const finished = await service(owner).read(room.id, id);
      assert.equal(finished.standings.length, 2);
      assert.equal(
        finished.standings.reduce((n, t) => n + Number(t.points), 0),
        10,
      );
      const next = await command(owner, id, { action: 'rematch', nextRound: true });
      await assert.rejects(
        command(owner, next.race.id, { action: 'entries', entries: [], songs: [] }),
      );
      await assert.rejects(
        command(owner, next.race.id, {
          action: 'configure',
          name: 'Reroll',
          config: { ...config, track: 'FESTIVAL' },
        }),
      );
      const elimination = await command(owner, null, {
        action: 'create',
        name: 'Knockout',
        config: {
          ...defaultRaceConfig,
          tournament: { kind: 'ELIMINATION', rounds: 3, advance: 2 },
        },
        songs: [],
        entries: [],
      });
      for (const u of users.slice(0, 3)) {
        await command(u, elimination.race.id, { action: 'join', skin: 'YELLOW', team: '' });
        await command(u, elimination.race.id, { action: 'ready', ready: true });
      }
      await command(owner, elimination.race.id, { action: 'start' });
      await sql`update public.duck_race_matches set state=jsonb_set(state,'{startAt}',to_jsonb(floor(extract(epoch from now())*1000)-61000)) where id=${elimination.race.id}`;
      const end = await service(owner).read(room.id, elimination.race.id);
      const round = await command(owner, elimination.race.id, {
        action: 'rematch',
        nextRound: true,
      });
      assert.equal(round.race.entries.length, 2);
      const excluded = end.race.entries.find((e) => !round.race.entries.some((n) => n.id === e.id));
      await assert.rejects(
        command(excluded.userId, round.race.id, { action: 'join', skin: 'YELLOW', team: '' }),
      );
    },
  );
  await check(
    'duck membership revocation, authenticated SQL denial and forged broadcast denial',
    async () => {
      await sql.begin(async (tx) => {
        await tx`insert into public.bans(room_id,user_id) values(${room.id},${users[2]})`;
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claim.sub',${users[2]},true)`;
        assert.equal(
          (await tx`select private.duck_topic_allowed(${'duck:' + race}) ok`)[0].ok,
          false,
        );
      });
      await assert.rejects(service(users[2]).read(room.id, race));
      await assert.rejects(
        sql.begin(async (tx) => {
          await tx.unsafe('set local role authenticated');
          await tx`select * from private.duck_race_secrets`;
        }),
        /permission denied/,
      );
      await assert.rejects(
        sql.begin(async (tx) => {
          await tx.unsafe('set local role authenticated');
          await tx`select set_config('request.jwt.claim.sub',${owner},true)`;
          await tx`select set_config('realtime.topic',${'duck:' + race},true)`;
          await tx`insert into realtime.messages(extension,topic,payload) values('broadcast',${'duck:' + race},'{}')`;
        }),
        /permission denied|row-level security/,
      );
    },
  );
}
