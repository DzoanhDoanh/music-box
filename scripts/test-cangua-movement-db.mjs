import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

/** Invoked exclusively by test-db's isolated PostgreSQL instance. */
export async function testCaNguaMovement({ sql, check, store, GameService, defaultRules }) {
  // A dedicated fixture owner keeps this suite independent of other suites' create quotas.
  const owner = randomUUID(),
    friend = randomUUID();
  await sql`insert into auth.users(id,is_anonymous) values(${owner},false),(${friend},true)`;
  await sql`insert into public.system_admins values(${owner},now())`;
  const room = (
    await sql`select public.create_room(${owner}::uuid,'Movement isolated','','',${randomUUID()}::uuid) r`
  )[0].r;
  await sql`select public.join_room(${friend}::uuid,${room.code},'Bạn thử','')`;
  const service = (actor) => new GameService(store, actor);
  let state = (
    await service(owner).create(room.id, randomUUID(), {
      name: 'Luật di chuyển',
      rules: defaultRules,
    })
  ).state;
  const valid = async (s) =>
    (await sql`select private.valid_game_state(${sql.json(s)}::jsonb) ok`)[0].ok;
  const send = async (actor, command) => {
    state = (
      await service(actor).execute(room.id, state.id, randomUUID(), {
        ...command,
        version: state.version,
      })
    ).state;
  };
  const oldRules = { ...defaultRules };
  delete oldRules.movement;
  await check(
    'fixed profile requires protected spawn squares and automatic jumps in PostgreSQL',
    async () => {
      for (const safe of ['NONE', 'STARTS'])
        for (const jumpOnOne of [false, true]) {
          const rules = { ...defaultRules, safe, jumpOnOne };
          assert.equal(await valid({ ...state, rules }), safe === 'STARTS' && jumpOnOne);
          assert.equal(
            await valid({ ...state, rules: { ...rules, movement: 'SKIP_STARTS_AUTO_JUMP' } }),
            true,
          );
        }
      for (const n of [14, 28, 42]) {
        const bad = structuredClone(state);
        bad.players[0].pieces[0] = n;
        assert.equal(await valid(bad), false);
      }
    },
  );
  await check(
    'movement revision validates strictly and preserves both saved v2 rule sets',
    async () => {
      assert.equal(await valid(state), true);
      for (const safe of ['NONE', 'STARTS']) {
        const saved = { ...state, rules: { ...oldRules, safe } };
        assert.equal(await valid(saved), true);
        const parsed = (
          await service(owner).create(room.id, randomUUID(), {
            name: 'Saved ' + safe,
            rules: saved.rules,
          })
        ).state;
        assert.deepEqual(parsed.rules, saved.rules);
        assert.equal(
          Object.hasOwn((await service(owner).read(room.id, parsed.id)).state.rules, 'movement'),
          false,
        );
        for (const movement of [null, false, 2, 'AUTO', {}])
          assert.equal(await valid({ ...saved, rules: { ...saved.rules, movement } }), false);
      }
      assert.equal(await valid({ ...state, rules: { ...defaultRules, forged: true } }), false);
      const legacy = { ...oldRules, safe: 'STARS', threeSixes: true };
      delete legacy.variant;
      delete legacy.jumpOnOne;
      assert.equal(await valid({ ...state, schema: 1, rules: legacy }), true);
      assert.equal(
        await valid({ ...state, schema: 1, rules: { ...legacy, movement: defaultRules.movement } }),
        false,
      );
    },
  );
  await send(friend, { action: 'join', color: 1 });
  for (const actor of [owner, friend]) await send(actor, { action: 'ready', ready: true });
  await send(owner, { action: 'start' });
  const stage = async (pieces, opponent, dice) => {
    const next = structuredClone(state);
    next.players[0].pieces = pieces;
    next.players[1].pieces = opponent;
    next.turn = owner;
    next.phase = 'MOVE';
    next.dice = dice;
    next.last = { type: 'dice_rolled', actor: owner, dice };
    next.version++;
    state = (
      await store.call('game_commit', {
        p_actor: owner,
        p_room: room.id,
        p_game: state.id,
        p_request: randomUUID(),
        p_command: { action: 'isolated_fixture' },
        p_version: state.version,
        p_state: next,
      })
    ).state;
  };
  await check(
    'six counted steps persist across a sheltered start and retries never move twice',
    async () => {
      await stage([11, -1, -1, -1], [0, -1, -1, -1], 6);
      const key = randomUUID(),
        body = { action: 'move', piece: 0, version: state.version };
      const result = await service(owner).execute(room.id, state.id, key, body);
      state = result.state;
      assert.equal(state.players[0].pieces[0], 18);
      assert.equal(state.players[1].pieces[0], 0);
      assert.equal(state.last.moveKind, 'STEP');
      assert.deepEqual(await service(owner).execute(room.id, state.id, key, body), result);
      assert.deepEqual((await service(friend).read(room.id, state.id)).state, state);
      await assert.rejects(service(owner).execute(room.id, state.id, randomUUID(), body), {
        code: 'GAME_STALE',
      });
    },
  );
  await check(
    'server automatically jumps on one; blocked jumps fall back to counted steps or exact captures',
    async () => {
      for (const opponent of [
        [-1, -1, -1, -1],
        [0, -1, -1, -1],
      ]) {
        await stage([13, -1, -1, -1], opponent, 1);
        const before = structuredClone(state);
        await assert.rejects(send(owner, { action: 'move', piece: 0, moveKind: 'STEP' }), {
          code: 'GAME_ILLEGAL_MOVE',
        });
        assert.deepEqual((await service(owner).read(room.id, state.id)).state, before);
        const key = randomUUID(),
          body = { action: 'move', piece: 0, version: state.version };
        const result = await service(owner).execute(room.id, state.id, key, body);
        state = result.state;
        assert.equal(state.players[0].pieces[0], 27);
        assert.equal(state.last.moveKind, 'JUMP');
        assert.deepEqual(state.players[1].pieces, opponent);
        assert.deepEqual(await service(owner).execute(room.id, state.id, key, body), result);
      }
      for (const obstacle of [1, 2, 13]) {
        await stage([13, -1, -1, -1], [0, obstacle, -1, -1], 1);
        await assert.rejects(send(owner, { action: 'move', piece: 0, moveKind: 'JUMP' }), {
          code: 'GAME_ILLEGAL_MOVE',
        });
        await send(owner, { action: 'move', piece: 0 });
        assert.equal(state.players[0].pieces[0], 15);
        assert.equal(state.last.moveKind, 'STEP');
        assert.equal(state.last.captures.length, obstacle === 1 ? 1 : 0);
      }
      await stage([13, 15, -1, -1], [0, -1, -1, -1], 1);
      await assert.rejects(send(owner, { action: 'move', piece: 0 }), {
        code: 'GAME_ILLEGAL_MOVE',
      });
    },
  );
  await check(
    'movement revision is immutable mid-game, including raw SQL; rematch keeps rules and waiting upgrade resets readiness',
    async () => {
      await assert.rejects(
        sql`update public.game_matches set state=${sql.json({ ...state, rules: oldRules })} where id=${state.id}`,
        /INVALID_INPUT/,
      );
      await assert.rejects(send(owner, { action: 'settings', rules: oldRules }), {
        code: 'GAME_ACTION_INVALID',
      });
      await send(friend, { action: 'surrender' });
      const history = (await service(owner).read(room.id, state.id)).results;
      await send(owner, { action: 'rematch' });
      assert.deepEqual(state.rules, defaultRules);
      await send(owner, { action: 'settings', rules: oldRules });
      for (const actor of [owner, friend]) await send(actor, { action: 'ready', ready: true });
      await send(owner, { action: 'settings', rules: defaultRules });
      assert.equal(state.status, 'WAITING');
      assert.ok(state.players.every((p) => !p.ready));
      assert.deepEqual((await service(owner).read(room.id, state.id)).results, history);
      for (const actor of [owner, friend]) await send(actor, { action: 'ready', ready: true });
      await send(owner, { action: 'settings', rules: oldRules });
      for (const actor of [owner, friend]) await send(actor, { action: 'ready', ready: true });
      await send(owner, { action: 'start' });
      await assert.rejects(
        sql`update public.game_matches set state=${sql.json({ ...state, rules: defaultRules })} where id=${state.id}`,
        /INVALID_INPUT/,
      );
      assert.deepEqual((await service(owner).read(room.id, state.id)).state.rules, oldRules);
    },
  );
}
