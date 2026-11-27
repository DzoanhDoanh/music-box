import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));

/** Real PostgreSQL checks for the Cờ Tướng migration, driven through the server service. */
export async function testCoTuong({ sql, owner, check }) {
  const built = await build({
    stdin: {
      contents:
        "export * from './src/server/services/co-tuong';export * from './src/shared/co-tuong/rules';export * from './src/shared/co-tuong/contracts';export {rpc} from './src/server/repository';",
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  await mkdir('.roomtune', { recursive: true });
  const target = resolve('.roomtune/co-tuong-db-bundle.mjs');
  await writeFile(target, built.outputFiles[0].text);
  const { CoTuongService, rpc, legalMoves, CO_TUONG_BOT } = await import(
    pathToFileURL(target).href
  );

  const users = [owner, randomUUID(), randomUUID(), randomUUID()];
  for (const id of users.slice(1)) await sql`insert into auth.users(id) values(${id})`;
  const room = (
    await sql`select public.create_room(${owner}::uuid,'Cờ Tướng DB','','',${randomUUID()}::uuid) r`
  )[0].r;
  for (const [i, id] of users.slice(1, 3).entries())
    await sql`select public.join_room(${id}::uuid,${room.code},${'Bạn ' + (i + 1)},'')`;
  const outsider = users[3];

  const store = {
    consume: async () => {},
    call: async (name, params) => {
      assert.match(name, /^co_tuong_[a-z_]+$/);
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
  const service = (u) => new CoTuongService(store, u);
  const errorCode = async (promise) => {
    try {
      await promise;
    } catch (error) {
      return error.code;
    }
    return null;
  };
  const resetCreateLimit = () =>
    sql`delete from private.rate_limits where key like 'co_tuong:create:%'`;
  const send = (u, game, version, command, key = randomUUID()) =>
    service(u).execute(room.id, game, key, { version, command });
  const first = (state, side) => legalMoves(state.board, side)[0];

  let game;
  await check('co tuong tables open, seat two members and enforce turns', async () => {
    game = (
      await service(owner).create(room.id, randomUUID(), { name: 'Bàn thử', side: 'r', bot: null })
    ).state;
    assert.equal(game.status, 'WAITING');
    assert.equal(game.seats.r.id, owner);
    // The seat name comes from the profile, not from the request.
    assert.notEqual(game.seats.r.name, 'Người chơi');
    game = (await send(users[1], game.id, game.version, { action: 'join' })).state;
    assert.equal(game.status, 'PLAYING');
    const m = first(game, 'b');
    assert.equal(
      await errorCode(send(users[1], game.id, game.version, { action: 'move', ...m })),
      'COTUONG_NOT_YOUR_TURN',
    );
    assert.equal(
      await errorCode(send(owner, game.id, game.version, { action: 'move', from: 81, to: 45 })),
      'COTUONG_ILLEGAL_MOVE',
    );
    const key = randomUUID();
    const red = first(game, 'r');
    const moved = (await send(owner, game.id, game.version, { action: 'move', ...red }, key)).state;
    assert.equal(moved.moves.length, 1);
    // The same request replays its receipt; an old version is refused.
    assert.deepEqual(
      (await send(owner, game.id, game.version, { action: 'move', ...red }, key)).state,
      moved,
    );
    assert.equal(
      await errorCode(send(users[1], game.id, game.version, { action: 'resign' })),
      'COTUONG_STALE',
    );
    game = moved;
    const notices =
      await sql`select payload from realtime.messages where topic=${'room:' + room.id} and payload->>'game'=${game.id}`;
    assert.equal(notices.at(-1).payload.version, game.version);
  });

  await check('co tuong denies outsiders and hides tables through RLS', async () => {
    assert.equal(await errorCode(service(outsider).read(room.id, game.id)), 'PERMISSION_DENIED');
    assert.equal(await errorCode(service(outsider).list(room.id)), 'PERMISSION_DENIED');
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${outsider},true)`;
      assert.equal((await tx`select count(*)::int n from public.co_tuong_matches`)[0].n, 0);
    });
    const listed = await service(users[2]).list(room.id);
    assert.equal(listed.matches[0].id, game.id);
    assert.equal(listed.matches[0].moves, 1);
  });

  await check('co tuong plays the computer on the server, including its opening move', async () => {
    await resetCreateLimit();
    let bot = (
      await service(users[2]).create(room.id, randomUUID(), { name: 'Với máy', side: 'b', bot: 3 })
    ).state;
    assert.equal(bot.status, 'PLAYING');
    assert.equal(bot.seats.r.id, CO_TUONG_BOT);
    assert.equal(bot.moves.length, 1);
    const reply = first(bot, 'b');
    bot = (await send(users[2], bot.id, bot.version, { action: 'move', ...reply })).state;
    assert.equal(bot.moves.length, 3);
    assert.equal(bot.turn, 'b');
    bot = (await send(users[2], bot.id, bot.version, { action: 'undo' })).state;
    assert.equal(bot.moves.length, 1);
    bot = (await send(users[2], bot.id, bot.version, { action: 'resign' })).state;
    assert.deepEqual(bot.result, { winner: 'r', reason: 'RESIGN' });
  });

  await check('co tuong retires a player who left the room', async () => {
    await sql`delete from public.room_members where room_id=${room.id} and user_id=${users[1]}`;
    const read = (await service(owner).read(room.id, game.id)).state;
    assert.equal(read.status, 'FINISHED');
    assert.deepEqual(read.result, { winner: 'r', reason: 'LEFT' });
    assert.equal(read.seats.b, null);
    await sql`select public.join_room(${users[1]}::uuid,${room.code},'Bạn 1','')`;
    game = read;
  });

  await check('co tuong tables are deleted only by their host or the room owner', async () => {
    await resetCreateLimit();
    const createKey = randomUUID();
    const command = { name: 'Bàn của Bạn 1', side: 'r', bot: null };
    const table = (await service(users[1]).create(room.id, createKey, command)).state;
    const remove = (u, name, key = randomUUID()) => service(u).delete(room.id, table.id, key, name);
    assert.equal(await errorCode(remove(users[2], table.name)), 'PERMISSION_DENIED');
    assert.equal(await errorCode(remove(users[1], 'Tên khác')), 'DELETE_NAME_MISMATCH');
    const key = randomUUID();
    assert.deepEqual(await remove(users[1], table.name, key), { deleted: true });
    assert.deepEqual(await remove(users[1], table.name, key), { deleted: true });
    assert.equal(await errorCode(service(users[1]).read(room.id, table.id)), 'NOT_FOUND');
    await resetCreateLimit();
    assert.equal(
      await errorCode(service(users[1]).create(room.id, createKey, command)),
      'NOT_FOUND',
    );
    // The room owner may delete anyone's table.
    assert.deepEqual(await service(owner).delete(room.id, game.id, randomUUID(), game.name), {
      deleted: true,
    });
    assert.equal(
      (
        await sql`select count(*)::int n from public.audit_logs where room_id=${room.id} and action='co_tuong.delete'`
      )[0].n,
      2,
    );
  });

  await check('co tuong limits open tables per room', async () => {
    const open = (
      await sql`select count(*)::int n from public.co_tuong_matches where room_id=${room.id} and status in ('WAITING','PLAYING')`
    )[0].n;
    await resetCreateLimit();
    for (let i = open; i < 10; i++)
      await service(owner).create(room.id, randomUUID(), {
        name: 'Bàn ' + i,
        side: 'r',
        bot: null,
      });
    assert.equal(
      await errorCode(
        service(owner).create(room.id, randomUUID(), { name: 'Bàn thừa', side: 'r', bot: null }),
      ),
      'COTUONG_TABLE_LIMIT',
    );
  });
}
