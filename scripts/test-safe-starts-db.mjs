import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

/** Runs only against the isolated PostgreSQL harness, never hosted rooms. */
export async function testSafeStarts({ sql, owner, check, store, GameService, defaultRules }) {
  const friend = randomUUID();
  await sql`insert into auth.users(id) values(${friend})`;
  const room = (
    await sql`select public.create_room(${owner}::uuid,'Safe starts isolated','','',${randomUUID()}::uuid) r`
  )[0].r;
  await sql`select public.join_room(${friend}::uuid,${room.code},'Bạn thử','')`;
  const service = (actor) => new GameService(store, actor);
  let state = (
    await service(owner).create(room.id, randomUUID(), {
      name: 'Ô xuất an toàn',
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
  await check(
    'safe-start SQL accepts new rules but strictly rejects malformed fields and foreign starts',
    async () => {
      assert.equal(state.rules.safe, 'STARTS');
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
      for (const color of [0, 1, 2, 3]) {
        const s = structuredClone(state);
        s.players[0].color = color;
        for (const position of [0, 14, 28, 42]) {
          s.players[0].pieces[0] = position;
          assert.equal(await valid(s), position === 0);
        }
        s.players[0].pieces = [0, 0, -1, -1];
        assert.equal(await valid(s), false);
      }
    },
  );
  await send(friend, { action: 'join', color: 1 });
  for (const actor of [owner, friend]) await send(actor, { action: 'ready', ready: true });
  await send(owner, { action: 'start' });
  const stage = async (pieces, opponent, dice) => {
    const s = structuredClone(state);
    s.players[0].pieces = pieces;
    s.players[1].pieces = opponent;
    s.turn = owner;
    s.phase = 'MOVE';
    s.dice = dice;
    s.last = { type: 'dice_rolled', actor: owner, dice };
    s.version++;
    state = (
      await store.call('game_commit', {
        p_actor: owner,
        p_room: room.id,
        p_game: state.id,
        p_request: randomUUID(),
        p_command: { action: 'isolated_fixture' },
        p_version: state.version,
        p_state: s,
      })
    ).state;
  };
  const move = { action: 'move', piece: 0, moveKind: 'STEP' };
  await check(
    'safe-start passage persists once and survives retries; occupied start blocks spawning',
    async () => {
      for (const opponent of [
        [-1, -1, -1, -1],
        [0, -1, -1, -1],
      ]) {
        await stage([13, -1, -1, -1], opponent, 1);
        await assert.rejects(send(owner, move), { code: 'GAME_ILLEGAL_MOVE' });
        await stage([13, -1, -1, -1], opponent, 2);
        const key = randomUUID(),
          body = { ...move, version: state.version };
        const result = await service(owner).execute(room.id, state.id, key, body);
        state = result.state;
        assert.equal(state.players[0].pieces[0], 15);
        assert.deepEqual(state.players[1].pieces, opponent);
        assert.deepEqual(state.last.captures, []);
        assert.deepEqual(await service(owner).execute(room.id, state.id, key, body), result);
        assert.equal((await service(owner).read(room.id, state.id)).state.version, state.version);
        await assert.rejects(service(owner).execute(room.id, state.id, randomUUID(), body), {
          code: 'GAME_STALE',
        });
      }
      await stage([-1, 0, -1, -1], [-1, -1, -1, -1], 6);
      await assert.rejects(send(owner, move), { code: 'GAME_ILLEGAL_MOVE' });
      await send(owner, { ...move, piece: 1 });
      assert.deepEqual(state.players[0].pieces, [-1, 6, -1, -1]);
    },
  );
  await check(
    'safe-start jump passes protected horse; ordinary blocking and exact captures persist',
    async () => {
      await stage([13, -1, -1, -1], [0, -1, -1, -1], 1);
      await send(owner, { ...move, moveKind: 'JUMP' });
      assert.equal(state.players[0].pieces[0], 27);
      assert.equal(state.players[1].pieces[0], 0);
      await stage([13, -1, -1, -1], [0, 1, -1, -1], 3);
      await assert.rejects(send(owner, move), { code: 'GAME_ILLEGAL_MOVE' });
      await stage([13, -1, -1, -1], [0, 1, -1, -1], 2);
      await send(owner, move);
      assert.deepEqual(state.players[1].pieces, [0, -1, -1, -1]);
      assert.equal(state.last.captures.length, 1);
    },
  );
  await check(
    'CHECK constraint rejects foreign safe occupants, stacking and active rule changes',
    async () => {
      for (const pieces of [
        [14, -1, -1, -1],
        [28, -1, -1, -1],
        [42, -1, -1, -1],
        [0, 0, -1, -1],
      ]) {
        const bad = structuredClone(state);
        bad.players[0].pieces = pieces;
        await assert.rejects(
          sql`update public.game_matches set state=${sql.json(bad)} where id=${state.id}`,
        );
      }
      const changed = { ...state, rules: { ...state.rules, safe: 'NONE' } };
      await assert.rejects(
        sql`update public.game_matches set state=${sql.json(changed)} where id=${state.id}`,
        /INVALID_INPUT/,
      );
      await assert.rejects(send(owner, { action: 'settings', rules: changed.rules }), {
        code: 'GAME_ACTION_INVALID',
      });
      assert.deepEqual((await service(owner).read(room.id, state.id)).state, state);
    },
  );
  await check(
    'safe-start rematch retains rules; waiting tables can explicitly switch without rewriting history',
    async () => {
      await send(friend, { action: 'surrender' });
      await send(owner, { action: 'rematch' });
      assert.equal(state.rules.safe, 'STARTS');
      assert.equal(state.schema, 2);
      assert.ok(state.players.every((p) => p.pieces.every((n) => n === -1)));
      await send(owner, { action: 'settings', rules: { ...defaultRules, safe: 'NONE' } });
      assert.equal(state.rules.safe, 'NONE');
      await send(owner, { action: 'settings', rules: defaultRules });
      assert.equal(state.rules.safe, 'STARTS');
      assert.ok(state.players.every((p) => !p.ready));
    },
  );
}
