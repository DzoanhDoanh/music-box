import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
export async function testGame({ sql, owner, check }) {
  const bundle = await build({
    stdin: {
      contents:
        "export * from './src/server/services/game'; export * from './src/shared/game/engine'; export {defaultRules} from './src/shared/game/contracts'; export {rpc} from './src/server/repository';",
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  await mkdir('.roomtune', { recursive: true });
  const bundlePath = resolve('.roomtune/game-test-bundle.mjs');
  await writeFile(bundlePath, bundle.outputFiles[0].text);
  const {
    GameService,
    reconcileGame,
    rpc,
    transition,
    getLegalMoves,
    settleDueGames,
    defaultRules,
  } = await import(pathToFileURL(bundlePath).href);
  const people = [owner, ...Array.from({ length: 4 }, () => randomUUID())];
  for (const id of people.slice(1)) await sql`insert into auth.users(id) values(${id})`;
  const room = (
    await sql`select public.create_room(${owner}::uuid,'Ludo integration','','',${randomUUID()}::uuid) r`
  )[0].r;
  for (const id of people.slice(1, 4))
    await sql`select public.join_room(${id}::uuid,${room.code},'Người chơi','')`;
  const store = {
    call: async (name, params) => {
      assert.match(name, /^game_[a-z_]+$/);
      const pairs = Object.entries(params);
      const args = pairs.map(([key], i) => key + ' => $' + (i + 1)).join(',');
      const values = pairs.map(([, value]) =>
        value !== null && typeof value === 'object' ? sql.json(value) : value,
      );
      // Use the production error mapping so CAS retries behave exactly like PostgREST.
      return rpc(
        {
          rpc: async () => {
            try {
              return {
                data: (await sql.unsafe('select public.' + name + '(' + args + ') r', values))[0].r,
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
  const service = (id) => new GameService(store, id);
  const rules = {
    entry: 'SIX',
    safe: 'STARS',
    captureBonus: false,
    finishBonus: false,
    threeSixes: true,
    turnSeconds: 45,
    maxMisses: 3,
  };
  const baseline = (await sql`select public.room_snapshot(${owner}::uuid,${room.id}::uuid) r`)[0].r;
  let state;
  await check('game create receipts, membership, private tables and RPC boundaries', async () => {
    const key = randomUUID(),
      body = { name: 'Bàn số 1', rules };
    const a = await service(owner).create(room.id, key, body),
      b = await service(owner).create(room.id, key, body);
    assert.deepEqual(a, b);
    state = a.state;
    await assert.rejects(
      service(people[4]).create(room.id, randomUUID(), body),
      /PERMISSION_DENIED|quyền/,
    );
    for (const role of ['anon', 'authenticated']) {
      const perms = (
        await sql`select has_function_privilege(${role},'public.game_context(uuid,uuid,uuid,uuid,jsonb)','execute') r,
      has_function_privilege(${role},'public.game_commit(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb)','execute') w,
      has_table_privilege(${role},'public.game_matches','update') u,has_table_privilege(${role},'private.game_receipts','select') t`
      )[0];
      assert.deepEqual(perms, { r: false, w: false, u: false, t: false });
    }
    await assert.rejects(service(people[4]).read(room.id, state.id), /PERMISSION_DENIED|quyền/);
  });
  await check('game SQL schema rejects missing, null, type-confused and extra fields', async () => {
    const valid = async (s) =>
      (await sql`select private.valid_game_state(${sql.json(s)}::jsonb) ok`)[0].ok;
    assert.equal(await valid(state), true);
    for (const path of [[], ['rules'], ['players', 0], ['last']]) {
      const obj = path.reduce((v, k) => v[k], state);
      for (const key of Object.keys(obj)) {
        const bad = structuredClone(state),
          parent = path.reduce((v, k) => v[k], bad);
        delete parent[key];
        assert.equal(await valid(bad), false, 'missing ' + path + '.' + key);
        if (obj[key] !== null) {
          parent[key] = null;
          assert.equal(await valid(bad), false, 'null ' + path + '.' + key);
        }
        if (typeof obj[key] === 'number') {
          parent[key] = String(obj[key]);
          assert.equal(await valid(bad), false, 'string ' + path + '.' + key);
        }
      }
      const bad = structuredClone(state);
      path.reduce((v, k) => v[k], bad).forged = true;
      assert.equal(await valid(bad), false, 'extra ' + path);
    }
  });
  await check(
    'game private topics allow members to read but never to forge broadcasts or writes',
    async () => {
      const topic = 'game:' + state.id;
      await sql`insert into realtime.messages(extension,topic,payload) values('broadcast',${topic},'{"version":0}')`;
      for (const [actor, allowed] of [
        [people[2], true],
        [people[4], false],
      ]) {
        await sql.begin(async (tx) => {
          await tx.unsafe('set local role authenticated');
          await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
          await tx`select set_config('realtime.topic',${topic},true)`;
          assert.equal(
            (await tx`select * from public.game_matches where id=${state.id}`).length,
            allowed ? 1 : 0,
          );
          assert.equal(
            (await tx`select * from realtime.messages where topic=${topic}`).length,
            allowed ? 1 : 0,
          );
        });
      }
      for (const mutate of [
        (tx) =>
          tx`insert into realtime.messages(extension,topic,payload) values('broadcast',${topic},'{"version":999,"dice":6}')`,
        (tx) => tx`update public.game_matches set version=999 where id=${state.id}`,
      ])
        await assert.rejects(
          sql.begin(async (tx) => {
            await tx.unsafe('set local role authenticated');
            await tx`select set_config('request.jwt.claim.sub',${owner},true)`;
            await tx`select set_config('realtime.topic',${topic},true)`;
            await mutate(tx);
          }),
          /permission denied|row-level security/,
        );
    },
  );
  const send = async (actor, action, key = randomUUID(), snapshot = state) => {
    const result = await service(actor).execute(room.id, state.id, key, {
      ...action,
      version: snapshot.version,
    });
    state = result.state;
    return result;
  };
  await check('game concurrent seat claims commit once and stale clients reload', async () => {
    const initial = structuredClone(state);
    const results = await Promise.allSettled(
      [people[1], people[2]].map((id) =>
        send(id, { action: 'join', color: 1 }, randomUUID(), initial),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    state = (await service(owner).read(room.id, state.id)).state;
    assert.equal(state.players.length, 2);
    for (const id of people.slice(1, 4))
      if (!state.players.some((p) => p.id === id)) {
        const color = [0, 1, 2, 3].find((c) => !state.players.some((p) => p.color === c));
        await send(id, { action: 'join', color });
      }
    assert.equal(state.players.length, 4);
    for (const p of state.players) await send(p.id, { action: 'ready', ready: true });
    assert.equal(state.status, 'READY');
    await send(owner, { action: 'start' });
  });
  await check(
    'game concurrent duplicate roll has one committed die and replay survives new service instances',
    async () => {
      const actor = state.turn,
        version = state.version,
        key = randomUUID(),
        body = { action: 'roll', version };
      const results = await Promise.all([
        service(actor).execute(room.id, state.id, key, body),
        service(actor).execute(room.id, state.id, key, body),
      ]);
      assert.deepEqual(results[0], results[1]);
      state = results[0].state;
      assert.ok(state.last.dice >= 1 && state.last.dice <= 6);
      assert.equal(
        (
          await sql`select count(*)::int n from public.game_moves where match_id=${state.id} and action->>'action'='roll'`
        )[0].n,
        1,
      );
      assert.deepEqual(await service(actor).execute(room.id, state.id, key, body), results[0]);
      await assert.rejects(
        service(actor).execute(room.id, state.id, key, { action: 'pause', version }),
        /IDEMPOTENCY_CONFLICT|nội dung khác/,
      );
      await assert.rejects(
        service(people[3]).execute(room.id, state.id, randomUUID(), {
          action: 'move',
          piece: 0,
          version: state.version,
        }),
        /lượt|hợp lệ|thể đi/,
      );
    },
  );
  await check('game concurrent move claims use one atomic transition', async () => {
    // Seed only this isolated fixture with an engine-generated pending six.
    const base = { ...state, phase: 'ROLL', dice: null };
    const next = transition(
      base,
      base.turn,
      'Test',
      false,
      { action: 'roll', version: base.version },
      Date.now(),
      6,
    );
    state = (
      await store.call('game_commit', {
        p_actor: base.turn,
        p_room: room.id,
        p_game: state.id,
        p_request: randomUUID(),
        p_command: { action: 'fixture' },
        p_version: base.version,
        p_state: next,
      })
    ).state;
    const actor = state.turn,
      version = state.version;
    const moves = getLegalMoves(state);
    assert.ok(moves.length);
    const attempts = await Promise.allSettled(
      [0, 1].map(() =>
        service(actor).execute(room.id, state.id, randomUUID(), {
          action: 'move',
          piece: moves[0].piece,
          version,
        }),
      ),
    );
    assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
    state = (await service(owner).read(room.id, state.id)).state;
    assert.equal(state.version, version + 1);
  });
  await check(
    'game pending die persists through reads; direct forged states fail CAS and validation',
    async () => {
      const before = structuredClone(state);
      assert.deepEqual((await service(owner).read(room.id, state.id)).state, before);
      const invalid = {
        ...state,
        version: state.version + 1,
        players: [{ ...state.players[0], pieces: [99, 0, 0, 0] }],
      };
      await assert.rejects(
        store.call('game_commit', {
          p_actor: owner,
          p_room: room.id,
          p_game: state.id,
          p_request: randomUUID(),
          p_command: { action: 'sync' },
          p_version: state.version,
          p_state: invalid,
        }),
        { code: 'INVALID_INPUT' },
      );
      assert.equal(
        (await sql`select private.valid_game_state(${{ schema: 1 }}::jsonb) valid`)[0].valid,
        false,
      );
    },
  );
  await check(
    'game spectator watch never changes turn/version and ordinary players cannot pause',
    async () => {
      const watched = await service(owner).execute(room.id, state.id, randomUUID(), {
        action: 'watch',
      });
      assert.equal(watched.state.version, state.version);
      assert.ok(watched.spectators.some((p) => p.id === owner));
      await assert.rejects(send(people[1], { action: 'pause' }), /quyền/);
      await send(owner, { action: 'pause' });
      const frozen = structuredClone(state);
      assert.deepEqual(reconcileGame(state, people, Date.now() + 86400000), frozen);
      await send(owner, { action: 'resume' });
    },
  );
  await check(
    'game revoked membership blocks reads, receipt replay and realtime; active seat forfeits',
    async () => {
      const removed = people[1];
      const receipt = (
        await sql`select request_id,command from private.game_receipts where actor=${removed} and match_id=${state.id} limit 1`
      )[0];
      assert.ok(receipt);
      await sql`delete from public.room_members where room_id=${room.id} and user_id=${removed}`;
      await assert.rejects(service(removed).read(room.id, state.id), /PERMISSION_DENIED|quyền/);
      await assert.rejects(
        service(removed).execute(room.id, state.id, receipt.request_id, receipt.command),
        /PERMISSION_DENIED|quyền/,
      );
      state = (await service(owner).read(room.id, state.id)).state;
      assert.equal(state.players.find((p) => p.id === removed).status, 'FORFEITED');
      await sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claim.sub',${removed},true)`;
        assert.equal((await tx`select * from public.game_matches where id=${state.id}`).length, 0);
        assert.equal(
          (await tx`select private.game_topic_allowed(${'game:' + state.id}) ok`)[0].ok,
          false,
        );
      });
    },
  );
  await check(
    'game timeout checkpoints, ranking and rematch retain results without touching music',
    async () => {
      // Exact run-owned fixture advances the persisted deadline; production always uses DB time.
      await sql`update public.game_matches set state=jsonb_set(state,'{deadline}',to_jsonb(1::bigint)),deadline=to_timestamp(0.001) where id=${state.id}`;
      const due = await store.call('game_due', {});
      assert.ok(due.some((item) => item.id === state.id && item.room === room.id));
      await settleDueGames(store);
      assert.equal(
        (await sql`select status from public.game_matches where id=${state.id}`)[0].status,
        'FINISHED',
      );
      state = (await service(owner).read(room.id, state.id)).state;
      assert.equal(state.status, 'FINISHED');
      const result = (await service(owner).read(room.id, state.id)).results;
      assert.equal(result.length, 1);
      assert.equal(new Set(result[0].rankings.map((p) => p.rank)).size, 4);
      await send(owner, { action: 'rematch' });
      assert.equal(state.round, 2);
      assert.equal(state.players.length, 3);
      assert.equal((await service(owner).read(room.id, state.id)).results.length, 1);
      const after = (await sql`select public.room_snapshot(${owner}::uuid,${room.id}::uuid) r`)[0]
        .r;
      assert.equal(after.version, baseline.version);
      assert.deepEqual(after.playback, baseline.playback);
      assert.deepEqual(after.queue, baseline.queue);
    },
  );
  await check(
    'game already-ranked departed players keep results without blocking remaining turns',
    async () => {
      const ended = structuredClone(state);
      for (const p of state.players) await send(p.id, { action: 'ready', ready: true });
      await send(owner, { action: 'start' });
      const winner = state.players.find((p) => p.id !== owner);
      const seed = structuredClone(state);
      seed.version++;
      seed.players.find((p) => p.id === winner.id).status = 'FINISHED';
      seed.players.find((p) => p.id === winner.id).rank = 1;
      seed.players.find((p) => p.id === winner.id).pieces = [57, 57, 57, 57];
      state = (
        await store.call('game_commit', {
          p_actor: owner,
          p_room: room.id,
          p_game: state.id,
          p_request: randomUUID(),
          p_command: { action: 'fixture' },
          p_version: state.version,
          p_state: seed,
        })
      ).state;
      await sql`delete from public.room_members where room_id=${room.id} and user_id=${winner.id}`;
      await send(owner, { action: 'pause' });
      assert.equal(state.status, 'PAUSED');
      await send(owner, { action: 'surrender' });
      assert.equal(state.status, 'FINISHED');
      assert.equal(state.players.find((p) => p.id === winner.id).rank, 1);
      assert.equal((await service(owner).read(room.id, state.id)).results.length, ended.round);
    },
  );
  const { testCaNgua } = await import('./test-cangua-db.mjs');
  await testCaNgua({ sql, owner, check, store, GameService, defaultRules, transition });
  const { testSafeStarts } = await import('./test-safe-starts-db.mjs');
  await testSafeStarts({ sql, owner, check, store, GameService, defaultRules });
  const { testManagement } = await import('./test-management-db.mjs');
  await testManagement({ sql, owner, check, store, GameService, defaultRules });
}
