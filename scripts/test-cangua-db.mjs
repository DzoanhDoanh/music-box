import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

/** Only called by the isolated PostgreSQL harness; never targets hosted rooms. */
export async function testCaNgua({
  sql,
  owner,
  check,
  store,
  GameService,
  defaultRules,
  transition,
}) {
  const friend = randomUUID();
  await sql`insert into auth.users(id) values(${friend})`;
  const room = (
    await sql`select public.create_room(${owner}::uuid,'Cangua v2 isolated','','',${randomUUID()}::uuid) r`
  )[0].r;
  await sql`select public.join_room(${friend}::uuid,${room.code},'Bạn thử','')`;
  const service = (actor) => new GameService(store, actor);
  let state = (
    await service(owner).create(room.id, randomUUID(), {
      name: 'Cờ cá ngựa v2',
      rules: defaultRules,
    })
  ).state;
  const valid = async (s) =>
    (await sql`select private.valid_game_state(${sql.json(s)}::jsonb) ok`)[0].ok;
  const send = async (actor, command, key = randomUUID()) => {
    const view = await service(actor).execute(room.id, state.id, key, {
      ...command,
      version: state.version,
    });
    state = view.state;
    return view;
  };
  await check(
    'cangua v2 SQL strictly validates fields, version, rules, bounds and occupancy',
    async () => {
      assert.equal(state.schema, 2);
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
      const positions = structuredClone(state);
      positions.players[0].pieces = [55, 58, 60, 61];
      positions.last = {
        type: 'piece_moved',
        actor: owner,
        from: 55,
        to: 61,
        piece: 0,
        dice: 6,
        moveKind: 'STEP',
        captures: [],
      };
      assert.equal(await valid(positions), true);
      for (const bad of [
        { ...positions, schema: 1 },
        { ...positions, rules: { ...positions.rules, safe: 'STARS' } },
        { ...positions, last: { ...positions.last, moveKind: 'TELEPORT' } },
        { ...positions, last: { ...positions.last, to: 62 } },
      ])
        assert.equal(await valid(bad), false);
      positions.players[0].pieces = [61, 61, -1, -1];
      assert.equal(await valid(positions), false);
      positions.players[0].pieces = [0, -1, -1, -1];
      positions.players.push({
        ...positions.players[0],
        id: friend,
        color: 1,
        pieces: [42, -1, -1, -1],
      });
      assert.equal(await valid(positions), false);
    },
  );
  await send(friend, { action: 'join', color: 1 });
  await send(owner, { action: 'ready', ready: true });
  await send(friend, { action: 'ready', ready: true });
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
  await check(
    'cangua exact capture and blocking persist through service and PostgreSQL',
    async () => {
      for (const dice of [2, 3, 4, 5, 6]) {
        await stage([11, -1, -1, -1], [0, -1, -1, -1], dice);
        if (dice > 3) {
          await assert.rejects(send(owner, { action: 'move', piece: 0, moveKind: 'STEP' }), {
            code: 'GAME_ILLEGAL_MOVE',
          });
          assert.equal((await service(owner).read(room.id, state.id)).state.version, state.version);
        } else {
          await send(owner, { action: 'move', piece: 0, moveKind: 'STEP' });
          assert.equal(state.players[0].pieces[0], 11 + dice);
          assert.equal(state.players[1].pieces[0], dice === 3 ? -1 : 0);
        }
      }
    },
  );
  await check(
    'cangua jump receipts preserve action, survive retry and reject conflicting or stale choices',
    async () => {
      await stage([2, -1, -1, -1], [-1, -1, -1, -1], 1);
      const key = randomUUID(),
        body = { action: 'move', piece: 0, moveKind: 'JUMP', version: state.version };
      const result = await service(owner).execute(room.id, state.id, key, body);
      state = result.state;
      assert.equal(state.players[0].pieces[0], 13);
      assert.equal(state.last.moveKind, 'JUMP');
      assert.deepEqual(await service(owner).execute(room.id, state.id, key, body), result);
      await assert.rejects(
        service(owner).execute(room.id, state.id, key, { ...body, moveKind: 'STEP' }),
        { code: 'IDEMPOTENCY_CONFLICT' },
      );
      await assert.rejects(service(owner).execute(room.id, state.id, randomUUID(), body), {
        code: 'GAME_STALE',
      });
      const event = (
        await sql`select payload from public.game_events where match_id=${state.id} and version=${state.version}`
      )[0].payload;
      assert.equal(event.moveKind, 'JUMP');
      await stage([2, -1, -1, -1], [47, -1, -1, -1], 1);
      await assert.rejects(send(owner, { action: 'move', piece: 0, moveKind: 'JUMP' }), {
        code: 'GAME_ILLEGAL_MOVE',
      });
    },
  );
  await check(
    'cangua stores rank 6, finishes at ranks 3–6, preserves version across rematch',
    async () => {
      await stage([55, -1, -1, -1], [-1, -1, -1, -1], 6);
      await send(owner, { action: 'move', piece: 0, moveKind: 'STEP' });
      assert.equal((await service(owner).read(room.id, state.id)).state.players[0].pieces[0], 61);
      await stage([61, 60, 59, 57], [-1, -1, -1, -1], 3);
      const result = await send(owner, { action: 'move', piece: 3, moveKind: 'STEP' });
      assert.equal(state.status, 'FINISHED');
      assert.deepEqual(result.results[0].rankings[0].pieces, [61, 60, 59, 58]);
      await send(owner, { action: 'rematch' });
      assert.equal(state.schema, 2);
      assert.equal(state.round, 2);
      assert.equal((await service(owner).read(room.id, state.id)).results.length, 1);
      const changed = transition(
        state,
        owner,
        '',
        false,
        {
          action: 'settings',
          version: state.version,
          rules: { ...defaultRules, jumpOnOne: false },
        },
        Date.now(),
      );
      await send(owner, { action: 'settings', rules: changed.rules });
      assert.equal(state.rules.jumpOnOne, false);
    },
  );
  await check(
    'cangua database rejects changing schema or active rules, including direct service writes',
    async () => {
      const legacy = structuredClone(state);
      legacy.schema = 1;
      delete legacy.rules.variant;
      delete legacy.rules.jumpOnOne;
      assert.equal(await valid(legacy), true);
      await assert.rejects(
        sql`update public.game_matches set state=${sql.json(legacy)} where id=${state.id}`,
        /INVALID_INPUT/,
      );
      await send(owner, { action: 'ready', ready: true });
      await send(friend, { action: 'ready', ready: true });
      await send(owner, { action: 'start' });
      const changed = structuredClone(state);
      changed.rules.jumpOnOne = true;
      await assert.rejects(
        sql`update public.game_matches set state=${sql.json(changed)} where id=${state.id}`,
        /INVALID_INPUT/,
      );
    },
  );
}
