import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));

/** Real PostgreSQL checks for the Bi-a migration, driven through the server service. */
export async function testBilliards({ sql, owner, check }) {
  const built = await build({
    stdin: {
      contents:
        "export * from './src/server/services/billiards';export * from './src/shared/billiards/engine';export * from './src/shared/billiards/contracts';export {rpc} from './src/server/repository';",
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  await mkdir('.roomtune', { recursive: true });
  const target = resolve('.roomtune/billiards-db-bundle.mjs');
  await writeFile(target, built.outputFiles[0].text);
  const { BilliardsService, rpc, chooseShot, BILLIARDS_BOT } = await import(
    pathToFileURL(target).href
  );

  const users = [owner, randomUUID(), randomUUID(), randomUUID()];
  for (const id of users.slice(1)) await sql`insert into auth.users(id) values(${id})`;
  const room = (
    await sql`select public.create_room(${owner}::uuid,'Bi-a DB','','',${randomUUID()}::uuid) r`
  )[0].r;
  for (const [i, id] of users.slice(1, 3).entries())
    await sql`select public.join_room(${id}::uuid,${room.code},${'Bạn ' + (i + 1)},'')`;
  const outsider = users[3];

  const store = {
    consume: async () => {},
    call: async (name, params) => {
      assert.match(name, /^billiards_[a-z_]+$/);
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
  const service = (u) => new BilliardsService(store, u);
  const errorCode = async (promise) => {
    try {
      await promise;
    } catch (error) {
      return error.code;
    }
    return null;
  };
  const resetCreateLimit = () =>
    sql`delete from private.rate_limits where key like 'billiards:create:%'`;
  const send = (u, game, version, command, key = randomUUID()) =>
    service(u).execute(room.id, game, key, { version, command });

  const create = (u, command, key = randomUUID()) =>
    service(u).create(room.id, key, { target: 10, bot: null, ...command });
  const shot = (state, side) => {
    const plan = chooseShot(state, side, 1, { index: () => 0 });
    return { action: 'shoot', ...plan.shot, place: plan.place };
  };

  let game;
  await check('billiards tables open, seat two members and enforce turns', async () => {
    game = (await create(owner, { name: 'Bàn thử', mode: 'EIGHT' })).state;
    assert.equal(game.status, 'WAITING');
    assert.notEqual(game.seats.a.name, 'Người chơi');
    game = (await send(users[1], game.id, game.version, { action: 'join' })).state;
    assert.equal(game.status, 'PLAYING');
    assert.equal(
      await errorCode(send(users[1], game.id, game.version, shot(game, 'b'))),
      'BILLIARDS_NOT_YOUR_TURN',
    );
    assert.equal(
      await errorCode(
        send(owner, game.id, game.version, { ...shot(game, 'a'), place: { x: 900, y: 250 } }),
      ),
      'BILLIARDS_BAD_SPOT',
    );
    const key = randomUUID();
    const command = shot(game, 'a');
    const after = (await send(owner, game.id, game.version, command, key)).state;
    assert.equal(after.shots.length, 1);
    assert.equal(after.seq, 1);
    // The same request replays its receipt instead of shooting twice.
    assert.deepEqual((await send(owner, game.id, game.version, command, key)).state, after);
    game = after;
    const notices =
      await sql`select payload from realtime.messages where topic=${'room:' + room.id} and payload->>'game'=${game.id}`;
    assert.equal(notices.at(-1).payload.version, game.version);
  });

  await check('billiards denies outsiders and hides tables through RLS', async () => {
    assert.equal(await errorCode(service(outsider).read(room.id, game.id)), 'PERMISSION_DENIED');
    await sql.begin(async (tx) => {
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.jwt.claim.sub',${outsider},true)`;
      assert.equal((await tx`select count(*)::int n from public.billiards_matches`)[0].n, 0);
    });
    const listed = await service(users[2]).list(room.id);
    assert.equal(listed.matches[0].mode, 'EIGHT');
  });

  await check('billiards plays the computer on the server', async () => {
    await resetCreateLimit();
    let bot = (await create(users[2], { name: 'Với máy', mode: 'NINE', bot: 1 })).state;
    assert.equal(bot.seats.b.id, BILLIARDS_BOT);
    const seq = bot.seq;
    bot = (await send(users[2], bot.id, bot.version, shot(bot, 'a'))).state;
    assert.ok(bot.seq > seq);
    assert.ok(bot.turn === 'a' || bot.status === 'FINISHED');
    if (bot.status === 'PLAYING')
      bot = (await send(users[2], bot.id, bot.version, { action: 'resign' })).state;
    assert.equal(bot.status, 'FINISHED');
  });

  await check('billiards retires a player who left the room', async () => {
    await sql`delete from public.room_members where room_id=${room.id} and user_id=${users[1]}`;
    const read = (await service(owner).read(room.id, game.id)).state;
    assert.deepEqual(read.result, { winner: 'a', reason: 'LEFT' });
    await sql`select public.join_room(${users[1]}::uuid,${room.code},'Bạn 1','')`;
    game = read;
  });

  await check('billiards tables are deleted only by their host or the room owner', async () => {
    await resetCreateLimit();
    const createKey = randomUUID();
    const command = { name: 'Bàn của Bạn 1', mode: 'CAROM' };
    const table = (await create(users[1], command, createKey)).state;
    const remove = (u, name, key = randomUUID()) => service(u).delete(room.id, table.id, key, name);
    assert.equal(await errorCode(remove(users[2], table.name)), 'PERMISSION_DENIED');
    assert.equal(await errorCode(remove(users[1], 'Tên khác')), 'DELETE_NAME_MISMATCH');
    assert.deepEqual(await remove(users[1], table.name), { deleted: true });
    await resetCreateLimit();
    assert.equal(await errorCode(create(users[1], command, createKey)), 'NOT_FOUND');
    assert.deepEqual(await service(owner).delete(room.id, game.id, randomUUID(), game.name), {
      deleted: true,
    });
    assert.equal(
      (
        await sql`select count(*)::int n from public.audit_logs where room_id=${room.id} and action='billiards.delete'`
      )[0].n,
      2,
    );
  });

  await check('billiards limits open tables per room', async () => {
    const open = (
      await sql`select count(*)::int n from public.billiards_matches where room_id=${room.id} and status in ('WAITING','PLAYING')`
    )[0].n;
    await resetCreateLimit();
    for (let i = open; i < 10; i++) await create(owner, { name: 'Bàn ' + i, mode: 'EIGHT' });
    assert.equal(
      await errorCode(create(owner, { name: 'Bàn thừa', mode: 'EIGHT' })),
      'BILLIARDS_TABLE_LIMIT',
    );
  });
}
