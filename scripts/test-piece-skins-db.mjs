import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testPieceSkins({
  sql,
  check,
  store,
  GameService,
  defaultRules,
  legacyRules,
  pieceSkins,
}) {
  const owner = randomUUID(),
    friend = randomUUID(),
    spectator = randomUUID(),
    outsider = randomUUID();
  for (const id of [owner, friend, spectator, outsider])
    await sql`insert into auth.users(id,is_anonymous) values(${id},${id !== owner})`;
  await sql`insert into public.system_admins values(${owner},now())`;
  const room = (
    await sql`select public.create_room(${owner}::uuid,'Piece skins isolated','','',${randomUUID()}::uuid) r`
  )[0].r;
  for (const id of [friend, spectator])
    await sql`select public.join_room(${id}::uuid,${room.code},'Bạn thử','')`;
  const service = (actor) => new GameService(store, actor);
  let state;
  const valid = async (s) =>
    (await sql`select private.valid_game_state(${sql.json(s)}::jsonb) ok`)[0].ok;
  const send = async (actor, body) => {
    state = (
      await service(actor).execute(room.id, state.id, randomUUID(), {
        ...body,
        version: state.version,
      })
    ).state;
  };
  await check(
    'piece skins persist on create/join and SQL accepts only the catalog for both saved board versions',
    async () => {
      state = (
        await service(owner).create(room.id, randomUUID(), {
          name: 'Quân riêng',
          rules: defaultRules,
          skin: 'CAT',
        })
      ).state;
      assert.equal(state.players[0].skin, 'CAT');
      await send(friend, { action: 'join', color: 1, skin: 'ROCKET' });
      assert.deepEqual(
        state.players.map((p) => p.skin),
        ['CAT', 'ROCKET'],
      );
      const old = { ...state, schema: 1, rules: legacyRules };
      for (const source of [old, state]) {
        for (const { id: skin } of pieceSkins) {
          const next = structuredClone(source);
          next.players[0].skin = skin;
          assert.equal(await valid(next), true, skin);
        }
        for (const skin of [null, '', 'cat', 'https://example.com/a.svg', '<svg/>', 1, {}]) {
          const bad = structuredClone(source);
          bad.players[0].skin = skin;
          assert.equal(await valid(bad), false);
        }
        const historical = structuredClone(source);
        for (const p of historical.players) delete p.skin;
        assert.equal(await valid(historical), true);
        const malformed = structuredClone(source);
        malformed.players[0].forged = true;
        assert.equal(await valid(malformed), false);
      }
    },
  );
  await check(
    'skin update is self-only, preserves ready/turn/die/time and receipt retry never changes it twice',
    async () => {
      for (const actor of [owner, friend]) await send(actor, { action: 'ready', ready: true });
      await send(friend, { action: 'skin', skin: 'RABBIT' });
      assert.equal(state.status, 'READY');
      await send(owner, { action: 'start' });
      await send(state.turn, { action: 'roll' });
      const before = structuredClone(state);
      const body = { action: 'skin', skin: 'GEM', version: state.version },
        key = randomUUID();
      const result = await service(friend).execute(room.id, state.id, key, body);
      state = result.state;
      assert.deepEqual(state, {
        ...before,
        version: before.version + 1,
        players: before.players.map((p) => (p.id === friend ? { ...p, skin: 'GEM' } : p)),
        last: { type: 'skin', actor: friend },
      });
      assert.deepEqual(await service(friend).execute(room.id, state.id, key, body), result);
      assert.deepEqual((await service(owner).read(room.id, state.id)).state, state);
      assert.deepEqual((await service(spectator).read(room.id, state.id)).state, state);
      await assert.rejects(service(friend).execute(room.id, state.id, randomUUID(), body), {
        code: 'GAME_STALE',
      });
      await assert.rejects(send(spectator, { action: 'skin', skin: 'DOG' }), {
        code: 'GAME_ACTION_INVALID',
      });
      await assert.rejects(send(outsider, { action: 'skin', skin: 'DOG' }), {
        code: 'PERMISSION_DENIED',
      });
      const bad = structuredClone(state);
      bad.players[0].skin = 'INVALID';
      await assert.rejects(
        sql`update public.game_matches set state=${sql.json(bad)} where id=${state.id}`,
      );
    },
  );
  await check(
    'skin choices persist in results and rematch while revocation blocks reads and receipt replay',
    async () => {
      await send(owner, { action: 'pause' });
      const before = structuredClone(state);
      await send(friend, { action: 'skin', skin: 'DOG' });
      assert.equal(state.remaining, before.remaining);
      assert.deepEqual(state.players[0], before.players[0]);
      await send(owner, { action: 'resume' });
      await send(friend, { action: 'surrender' });
      const history = (await service(owner).read(room.id, state.id)).results;
      assert.deepEqual(history[0].rankings.map((p) => p.skin).sort(), ['CAT', 'DOG']);
      await send(owner, { action: 'rematch' });
      assert.deepEqual(
        state.players.map((p) => p.skin),
        ['CAT', 'DOG'],
      );
      const key = randomUUID(),
        body = { action: 'skin', skin: 'GHOST', version: state.version };
      state = (await service(friend).execute(room.id, state.id, key, body)).state;
      await sql`select public.room_command(${owner}::uuid,${room.id}::uuid,${randomUUID()}::uuid,${sql.json({ action: 'kick', user_id: friend })})`;
      await assert.rejects(service(friend).execute(room.id, state.id, key, body), {
        code: 'PERMISSION_DENIED',
      });
      assert.deepEqual((await service(owner).read(room.id, state.id)).results, history);
    },
  );
}
