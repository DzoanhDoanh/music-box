import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testManagement({ sql, owner, check, store, GameService, defaultRules }) {
  const host = randomUUID(),
    peer = randomUUID(),
    mod = randomUUID(),
    outsider = randomUUID();
  for (const id of [host, peer, mod, outsider]) await sql`insert into auth.users(id) values(${id})`;
  const room = (
    await sql`select public.create_room(${owner}::uuid,'Quản lý thử','','',${randomUUID()}::uuid) r`
  )[0].r;
  for (const id of [host, peer, mod])
    await sql`select public.join_room(${id}::uuid,${room.code},'Người thử','')`;
  await sql`update public.room_members set role='moderator' where room_id=${room.id} and user_id=${mod}`;
  const service = (actor) => new GameService(store, actor);
  const snap = async () =>
    (await sql`select public.room_snapshot(${owner}::uuid,${room.id}::uuid) r`)[0].r;
  const baseline = await snap();
  const body = { name: 'Bàn quản lý', rules: defaultRules };
  const createKey = randomUUID();
  let state = (await service(host).create(room.id, createKey, body)).state;
  const send = async (actor, command, key = randomUUID()) => {
    const result = await service(actor).execute(room.id, state.id, key, {
      ...command,
      version: state.version,
    });
    state = result.state;
    return result;
  };
  const deleteRoom = (actor, key = randomUUID(), name = room.name) =>
    sql`select public.room_delete(${actor}::uuid,${room.id}::uuid,${key}::uuid,${name}) r`;
  await check(
    'owner deletion RPCs and internal helpers are not callable by browser roles',
    async () => {
      for (const role of ['anon', 'authenticated'])
        for (const fn of [
          'public.room_delete(uuid,uuid,uuid,text)',
          'public.game_delete(uuid,uuid,uuid,uuid,text)',
          'private.game_commit_before_management(uuid,uuid,uuid,uuid,jsonb,bigint,jsonb)',
          'private.game_create_before_management(uuid,uuid,uuid,jsonb,jsonb)',
        ])
          assert.equal(
            (await sql`select has_function_privilege(${role},${fn},'execute') ok`)[0].ok,
            false,
          );
      for (const table of [
        'private.deletion_receipts',
        'private.game_removed_seats',
        'private.deleted_game_creates',
      ])
        assert.equal(
          (await sql`select has_table_privilege('authenticated',${table},'select') ok`)[0].ok,
          false,
        );
    },
  );
  await check(
    'ordinary members, outsiders and non-host moderators cannot kick or delete a table',
    async () => {
      await send(peer, { action: 'join', color: 1 });
      for (const actor of [peer, mod, outsider]) {
        await assert.rejects(
          service(actor).delete(room.id, state.id, randomUUID(), state.name),
          /quyền|PERMISSION_DENIED/,
        );
        await assert.rejects(
          send(actor, { action: 'kick', user_id: host }),
          /quyền|PERMISSION_DENIED/,
        );
        await assert.rejects(deleteRoom(actor), /PERMISSION_DENIED/);
        // SQL repeats the check even if a forged transition bypasses the TypeScript service.
        await assert.rejects(
          store.call('game_commit', {
            p_actor: actor,
            p_room: room.id,
            p_game: state.id,
            p_request: randomUUID(),
            p_command: { action: 'kick', user_id: host, version: state.version },
            p_version: state.version,
            p_state: { ...state, version: state.version + 1 },
          }),
          /quyền|PERMISSION_DENIED/,
        );
      }
      await send(owner, { action: 'join', color: 2 });
      await assert.rejects(
        send(host, { action: 'kick', user_id: owner }),
        /quyền|PERMISSION_DENIED/,
      );
      await assert.rejects(
        send(host, { action: 'kick', user_id: host }),
        /quyền|PERMISSION_DENIED/,
      );
    },
  );
  await check('kick replay is idempotent and an old join replay cannot undo removal', async () => {
    const joinKey = randomUUID();
    await send(peer, { action: 'leave' });
    const joinCommand = { action: 'join', color: 1, version: state.version };
    const joined = await service(peer).execute(room.id, state.id, joinKey, joinCommand);
    state = joined.state;
    const kickKey = randomUUID(),
      kickCommand = { action: 'kick', user_id: peer, version: state.version };
    const removed = await service(host).execute(room.id, state.id, kickKey, kickCommand);
    state = removed.state;
    assert.ok(removed.removedPlayers.includes(peer));
    assert.ok(!state.players.some((p) => p.id === peer));
    assert.deepEqual(await service(host).execute(room.id, state.id, kickKey, kickCommand), removed);
    assert.deepEqual(await service(peer).execute(room.id, state.id, joinKey, joinCommand), joined);
    assert.ok((await service(peer).read(room.id, state.id)).removedPlayers.includes(peer));
    const rejoined = await send(peer, { action: 'join', color: 1 });
    assert.ok(!rejoined.removedPlayers.includes(peer));
  });
  await check(
    'room owner can kick an active table host, preserve pause and exclude removed seats on rematch',
    async () => {
      for (const p of state.players) await send(p.id, { action: 'ready', ready: true });
      await send(host, { action: 'start' });
      await send(host, { action: 'pause' });
      const result = await send(owner, { action: 'kick', user_id: host });
      assert.equal(state.status, 'PAUSED');
      assert.notEqual(state.host, host);
      assert.equal(state.deadline, null);
      assert.equal(state.players.find((p) => p.id === host).status, 'FORFEITED');
      assert.ok(result.removedPlayers.includes(host));
      await assert.rejects(send(host, { action: 'roll' }), /lượt|Thao tác/);
      await send(peer, { action: 'surrender' });
      assert.equal(state.status, 'FINISHED');
      await send(owner, { action: 'rematch' });
      assert.ok(!state.players.some((p) => p.id === host));
      assert.equal((await service(owner).read(room.id, state.id)).results.length, 1);
      const after = await snap();
      assert.equal(after.version, baseline.version);
      assert.deepEqual(after.playback, baseline.playback);
      assert.deepEqual(after.members, baseline.members);
    },
  );
  await check(
    'table deletion checks names, retries safely and cannot resurrect through delayed creation',
    async () => {
      const key = randomUUID(),
        create = randomUUID();
      const table = (
        await service(host).create(room.id, create, { name: 'Bàn để xóa', rules: defaultRules })
      ).state;
      await assert.rejects(
        service(host).delete(room.id, table.id, key, 'Sai tên'),
        /Tên đã thay đổi/,
      );
      const responses = await Promise.all(
        [1, 2].map(() => service(host).delete(room.id, table.id, key, table.name)),
      );
      assert.deepEqual(responses, [{ deleted: true }, { deleted: true }]);
      await assert.rejects(service(host).read(room.id, table.id), /Không tìm thấy/);
      await assert.rejects(
        service(host).create(room.id, create, { name: 'Bàn để xóa', rules: defaultRules }),
        /Không tìm thấy/,
      );
      assert.equal(
        (
          await sql`select count(*)::int n from public.audit_logs where room_id=${room.id} and action='game.delete'`
        )[0].n,
        1,
      );
      assert.ok((await service(owner).list(room.id, 0)).some((g) => g.id === state.id));
      await assert.rejects(
        service(host).delete(room.id, state.id, key, table.name),
        (error) => error.code === 'IDEMPOTENCY_CONFLICT',
      );
      assert.deepEqual((await snap()).playback, baseline.playback);
    },
  );
  await check(
    'a deleted table rejects late commits; deleted-room access cannot replay old table deletion',
    async () => {
      const key = randomUUID(),
        version = state.version;
      const old = structuredClone(state);
      await service(owner).delete(room.id, state.id, key, state.name);
      await assert.rejects(
        store.call('game_commit', {
          p_actor: owner,
          p_room: room.id,
          p_game: state.id,
          p_request: randomUUID(),
          p_command: { action: 'ready', ready: true, version },
          p_version: version,
          p_state: { ...old, version: version + 1 },
        }),
        /Không tìm thấy/,
      );
      await assert.rejects(service(host).create(room.id, createKey, body), /Không tìm thấy/);
      const table = (
        await service(host).create(room.id, randomUUID(), { name: 'Bàn khác', rules: defaultRules })
      ).state;
      const hostKey = randomUUID();
      await service(host).delete(room.id, table.id, hostKey, table.name);
      await sql`select public.room_command(${owner}::uuid,${room.id}::uuid,${randomUUID()}::uuid,${sql.json({ action: 'kick', user_id: host })})`;
      await assert.rejects(
        service(host).delete(room.id, table.id, hostKey, table.name),
        /quyền|PERMISSION_DENIED/,
      );
    },
  );
  await check(
    'owner deletes the whole room once, cascading games while preserving personal libraries',
    async () => {
      await service(owner).create(room.id, randomUUID(), {
        name: 'Bàn sẽ dọn cùng phòng',
        rules: defaultRules,
      });
      const libraries = (await sql`select count(*)::int n from public.playlists`)[0].n;
      const key = randomUUID();
      await assert.rejects(deleteRoom(owner, key, 'Sai tên'), /DELETE_NAME_MISMATCH/);
      const deleted = await Promise.all([deleteRoom(owner, key), deleteRoom(owner, key)]);
      assert.ok(deleted.every((r) => r[0].r.deleted));
      for (const table of [
        'rooms',
        'room_members',
        'room_settings',
        'queue_entries',
        'game_matches',
        'playback_sessions',
      ]) {
        const column = table === 'rooms' ? 'id' : 'room_id';
        assert.equal(
          (
            await sql.unsafe(`select count(*)::int n from public.${table} where ${column}=$1`, [
              room.id,
            ])
          )[0].n,
          0,
        );
      }
      assert.equal(
        (await sql`select count(*)::int n from private.chat_messages where room_id=${room.id}`)[0]
          .n,
        0,
      );
      assert.equal((await sql`select count(*)::int n from public.playlists`)[0].n, libraries);
      await assert.rejects(deleteRoom(peer, key), /ROOM_NOT_FOUND/);
      await assert.rejects(deleteRoom(owner, key, 'Khác'), /IDEMPOTENCY_CONFLICT/);
      await assert.rejects(
        service(owner).create(room.id, randomUUID(), body),
        /quyền|PERMISSION_DENIED/,
      );
    },
  );
}
