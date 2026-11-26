import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));

/** Real PostgreSQL checks for the Tỷ Phú migration, driven through the server service. */
export async function testTyPhu({ sql, owner, check }) {
  const built = await build({
    stdin: {
      contents:
        "export * from './src/server/services/ty-phu';export * from './src/shared/ty-phu/engine';export * from './src/shared/ty-phu/board';export {rpc} from './src/server/repository';",
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  await mkdir('.roomtune', { recursive: true });
  const target = resolve('.roomtune/ty-phu-db-bundle.mjs');
  await writeFile(target, built.outputFiles[0].text);
  const { TyPhuService, settleDueTyPhu, rpc, cardTargets, buildCap, buildCost, board, cities } =
    await import(pathToFileURL(target).href);

  const users = [owner, randomUUID(), randomUUID(), randomUUID()];
  for (const id of users.slice(1)) await sql`insert into auth.users(id) values(${id})`;
  const room = (
    await sql`select public.create_room(${owner}::uuid,'Tỷ Phú DB','','',${randomUUID()}::uuid) r`
  )[0].r;
  for (const [i, id] of users.slice(1, 3).entries())
    await sql`select public.join_room(${id}::uuid,${room.code},${'Bạn ' + (i + 1)},'')`;
  const outsider = users[3];

  const store = {
    consume: async () => {},
    call: async (name, params) => {
      assert.match(name, /^ty_phu_[a-z_]+$/);
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
  const service = (u) => new TyPhuService(store, u);
  const rules = { startCash: 2000, turnSeconds: 45, minutes: null, buyout: true };
  const create = async (u = owner, name = 'Bàn thử') =>
    (await service(u).create(room.id, randomUUID(), { name, rules })).state;
  const send = (u, game, version, command, key = randomUUID()) =>
    service(u).execute(room.id, game, key, { version, command });
  const errorCode = async (promise) => {
    try {
      await promise;
    } catch (error) {
      return error.code;
    }
    return null;
  };
  /** Opens a table with owner + member 1 (+ member 2) and starts it. */
  // Tests open many tables; clear the per-hour creation window between them.
  const resetCreateLimit = () =>
    sql`delete from private.rate_limits where key like 'ty_phu:create:%'`;
  async function startedTable(players = users.slice(0, 2)) {
    await resetCreateLimit();
    let state = await create();
    for (const u of players.slice(1)) {
      state = (await send(u, state.id, state.version, { action: 'join' })).state;
      state = (await send(u, state.id, state.version, { action: 'ready', ready: true })).state;
    }
    return (await send(owner, state.id, state.version, { action: 'start' })).state;
  }

  let game;
  await check('ty phu create, join and start keep the deck order secret', async () => {
    game = await startedTable(users.slice(0, 3));
    assert.equal(game.status, 'PLAYING');
    assert.equal(game.players.length, 3);
    assert.equal('deck' in game, false);
    assert.equal(game.deckCount, 15);
    const stored = (await sql`select state from public.ty_phu_matches where id=${game.id}`)[0]
      .state;
    assert.equal('deck' in stored, false);
    assert.equal(
      (
        await sql`select jsonb_array_length(deck) n from private.ty_phu_decks where match_id=${game.id}`
      )[0].n,
      15,
    );
    // Display names come from profiles, not from the request.
    assert.equal(stored.players.find((p) => p.id === owner).name.length > 0, true);
  });

  await check('ty phu denies outsiders and hides tables through RLS', async () => {
    assert.equal(await errorCode(service(outsider).read(room.id, game.id)), 'PERMISSION_DENIED');
    assert.equal(
      await errorCode(send(outsider, game.id, game.version, { action: 'roll' })),
      'PERMISSION_DENIED',
    );
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${outsider},true)`;
      assert.equal((await tx`select count(*)::int n from public.ty_phu_matches`)[0].n, 0);
      assert.equal(
        (await tx`select private.ty_phu_topic_allowed(${'typhu:' + game.id}) ok`)[0].ok,
        false,
      );
    });
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${owner},true)`;
      assert.equal((await tx`select count(*)::int n from public.ty_phu_matches`)[0].n >= 1, true);
      assert.equal(
        (await tx`select private.ty_phu_topic_allowed(${'typhu:' + game.id}) ok`)[0].ok,
        true,
      );
    });
    // Even a room member cannot read the secret deck order.
    await assert.rejects(
      sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claim.sub',${owner},true)`;
        await tx`select deck from private.ty_phu_decks`;
      }),
      /permission denied/,
    );
  });

  await check('ty phu rejects stale versions, wrong turns and replays receipts', async () => {
    const turn = game.turn,
      other = game.players.find((p) => p.id !== turn).id;
    assert.equal(
      await errorCode(send(other, game.id, game.version, { action: 'roll' })),
      'TYPHU_NOT_YOUR_TURN',
    );
    assert.equal(
      await errorCode(send(turn, game.id, game.version - 1, { action: 'roll' })),
      'TYPHU_STALE',
    );
    const key = randomUUID();
    const first = await send(turn, game.id, game.version, { action: 'roll' }, key);
    const again = await send(turn, game.id, game.version, { action: 'roll' }, key);
    assert.deepEqual(again, first);
    assert.equal(
      await errorCode(send(turn, game.id, first.state.version, { action: 'skip' }, key)),
      'IDEMPOTENCY_CONFLICT',
    );
    game = first.state;
  });

  await check('ty phu concurrent commands on one version commit exactly once', async () => {
    const fresh = await startedTable();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        send(fresh.turn, fresh.id, fresh.version, { action: 'roll' }),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    for (const r of results.filter((r) => r.status === 'rejected'))
      assert.equal(r.reason.code, 'TYPHU_STALE');
  });

  await check('ty phu expired turns settle through the due queue', async () => {
    const fresh = await startedTable();
    await sql`update public.ty_phu_matches set deadline=now()-interval '1 second',
      state=jsonb_set(state,'{deadline}',to_jsonb(0)) where id=${fresh.id}`;
    const due = await store.call('ty_phu_due', {});
    assert.equal(
      due.some((d) => d.id === fresh.id),
      true,
    );
    await settleDueTyPhu(store);
    const after = (await service(owner).read(room.id, fresh.id)).state;
    assert.equal(after.version > fresh.version, true);
    assert.equal(
      after.players.find((p) => p.id === fresh.turn).misses >= 1 ||
        after.turn !== fresh.turn ||
        after.phase !== 'ROLL',
      true,
    );
  });

  await check('ty phu retires a player who leaves the room and declares the survivor', async () => {
    const extra = randomUUID();
    await sql`insert into auth.users(id) values(${extra})`;
    await sql`select public.join_room(${extra}::uuid,${room.code},'Khách','')`;
    await resetCreateLimit();
    let state = await create();
    state = (await send(extra, state.id, state.version, { action: 'join' })).state;
    state = (await send(extra, state.id, state.version, { action: 'ready', ready: true })).state;
    state = (await send(owner, state.id, state.version, { action: 'start' })).state;
    await sql`delete from public.room_members where room_id=${room.id} and user_id=${extra}`;
    const after = (await service(owner).read(room.id, state.id)).state;
    assert.equal(after.players.find((p) => p.id === extra).status, 'LEFT');
    assert.equal(after.status, 'FINISHED');
    assert.equal(after.winner, owner);
    assert.equal(after.winReason, 'LAST_STANDING');
    const result =
      await sql`select winner,reason from public.ty_phu_results where match_id=${state.id}`;
    assert.deepEqual(result[0], { winner: owner, reason: 'LAST_STANDING' });
  });

  await check('ty phu plays complete games through PostgreSQL and records the result', async () => {
    for (let round = 0; round < 3; round++) {
      let state = await startedTable(users.slice(0, 3));
      let steps = 0;
      while (state.status === 'PLAYING' && steps < 3000) {
        steps++;
        state = (await send(state.turn, state.id, state.version, bot(state))).state;
      }
      assert.equal(state.status, 'FINISHED');
      const result = await sql`select winner from public.ty_phu_results where match_id=${state.id}`;
      assert.equal(result[0].winner, state.winner);
      const cash = state.players.reduce((sum, p) => sum + p.cash, 0) + state.bank;
      assert.equal(cash, 6000);
    }
  });

  await check('ty phu plays against computer seats that are not room members', async () => {
    await resetCreateLimit();
    let state = await create();
    for (let i = 0; i < 2; i++)
      state = (await send(owner, state.id, state.version, { action: 'add_bot' })).state;
    assert.equal(state.players.filter((p) => p.bot).length, 2);
    assert.equal(
      await errorCode(send(users[1], state.id, state.version, { action: 'add_bot' })),
      'PERMISSION_DENIED',
    );
    state = (await send(owner, state.id, state.version, { action: 'start' })).state;
    let steps = 0;
    while (state.status === 'PLAYING' && steps < 3000) {
      steps++;
      if (state.turn === owner) {
        state = (await send(owner, state.id, state.version, bot(state))).state;
        continue;
      }
      // Computer turns run when their short deadline passes; expire it instead of waiting.
      await sql`update public.ty_phu_matches set state=jsonb_set(state,'{deadline}','0') where id=${state.id}`;
      state = (await service(owner).read(room.id, state.id)).state;
    }
    assert.equal(state.status, 'FINISHED');
    const result = await sql`select winner from public.ty_phu_results where match_id=${state.id}`;
    assert.equal(result[0].winner, state.winner);
    assert.equal(state.players.reduce((sum, p) => sum + p.cash, 0) + state.bank, 6000);
  });

  await check('ty phu rate-limits table creation per player', async () => {
    await resetCreateLimit();
    await sql`select public.consume_rate_limit(${'ty_phu:create:' + users[1]},6,3600) from generate_series(1,6)`;
    assert.equal(await errorCode(create(users[1])), 'RATE_LIMITED');
    await resetCreateLimit();
  });
  await check('ty phu limits unfinished tables per room', async () => {
    const open = (
      await sql`select count(*)::int n from public.ty_phu_matches where room_id=${room.id} and status not in ('FINISHED','CANCELLED')`
    )[0].n;
    await resetCreateLimit();
    for (let i = open; i < 6; i++) await create(owner, 'Bàn ' + i);
    assert.equal(await errorCode(create(owner, 'Bàn thừa')), 'TYPHU_TABLE_LIMIT');
  });

  function bot(state) {
    const p = state.players.find((x) => x.id === state.turn);
    switch (state.phase) {
      case 'ROLL':
        if (p.jailed && p.pass) return { action: 'use_pass' };
        return { action: 'roll' };
      case 'FLY':
        return { action: 'skip' };
      case 'REVEAL':
        return { action: 'card_ok' };
      case 'BUY': {
        const t = board[state.pending.tile];
        const level = t.kind === 'BEACH' ? 0 : Math.min(buildCap({ lap: 1 }, 0), 2);
        for (let l = level; l >= 0; l--)
          if (t.price + buildCost(t.index, 0, l) <= p.cash) return { action: 'buy', level: l };
        return { action: 'skip' };
      }
      case 'BUILD': {
        const index = state.pending.tile,
          level = state.tiles[index].level,
          cap = buildCap(
            state.players.find((x) => x.id === state.turn),
            state.pending.from ?? level,
          );
        if (cap > level && buildCost(index, level, level + 1) <= p.cash)
          return { action: 'build', level: level + 1 };
        return { action: 'skip' };
      }
      case 'BUYOUT':
        return { action: 'buyout' };
      case 'CARD': {
        const tile = cardTargets(state, p, state.pending.card)[0];
        const other = state.players.find((o) => o.status === 'ACTIVE' && o.id !== p.id);
        return { action: 'card_target', tile, player: other.id };
      }
      case 'DEBT':
        return {
          action: 'sell',
          tile: board.find((t) => state.tiles[t.index]?.owner === p.id).index,
        };
      case 'FESTIVAL':
        return {
          action: 'festival',
          tile: cities.find((c) => state.tiles[c.index]?.owner === p.id).index,
        };
      default:
        return { action: 'skip' };
    }
  }
}
