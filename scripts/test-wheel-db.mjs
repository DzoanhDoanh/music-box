import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testWheel({ sql, owner, users, check }) {
  const videos = Array.from({ length: 6 }, (_, index) => 'wheel' + String(index).padStart(6, '0'));
  for (const id of videos)
    await sql`insert into public.songs(youtube_video_id,title,channel,thumbnail,duration) values(${id},${'Bài thử ' + id},'Fixture','https://i.ytimg.com/vi/example/default.jpg',180)`;
  const member = users[0],
    outsider = users[1];
  const snapshot = async (actor, room) =>
    (await sql`select public.room_snapshot(${actor}::uuid,${room}::uuid) r`)[0].r;
  const read = async (actor, room) =>
    (await sql`select public.wheel_snapshot(${actor}::uuid,${room}::uuid) r`)[0].r;
  const command = async (actor, room, body) =>
    (
      await sql`select public.room_command(${actor}::uuid,${room}::uuid,${randomUUID()}::uuid,${sql.json(body)}) r`
    )[0].r;
  const presence = async (actor, room) =>
    sql`select public.room_presence(${actor}::uuid,${room}::uuid,${randomUUID()}::uuid,1,true)`;
  const spin = async (actor, room, body, key = randomUUID()) =>
    (
      await sql`select public.wheel_spin(${actor}::uuid,${room}::uuid,${key}::uuid,${sql.json(body)}) r`
    )[0].r;
  const custom = {
    action: 'spin',
    mode: 'CUSTOM',
    reward: 'NONE',
    labels: ['Phở', 'Bún bò', 'Cơm tấm'],
    previous_id: null,
  };
  async function fixture(mode = 'MANUAL', approval = false) {
    const room = (
      await sql`select public.create_room(${owner}::uuid,'Vòng quay thử','','',${randomUUID()}::uuid) r`
    )[0].r;
    await sql`select public.join_room(${member}::uuid,${room.code},'Bạn thử','')`;
    const initial = await snapshot(owner, room.id);
    await command(owner, room.id, {
      action: 'settings',
      name: room.name,
      description: '',
      settings: {
        ...initial.settings,
        queue_mode: mode,
        reorder_approval: approval,
        max_per_member: 30,
      },
    });
    for (let i = 0; i < 6; i++)
      await command(i < 3 ? owner : member, room.id, { action: 'enqueue', video_id: videos[i] });
    await presence(owner, room.id);
    await presence(member, room.id);
    return room.id;
  }
  await check(
    'wheel guards membership, online leases, private results and malformed/custom rewards',
    async () => {
      const room = await fixture();
      await assert.rejects(read(outsider, room), /PERMISSION_DENIED/);
      await assert.rejects(spin(outsider, room, custom), /PERMISSION_DENIED/);
      for (const body of [
        { ...custom, labels: ['One'] },
        { ...custom, labels: ['Phở', ' phở '] },
        { ...custom, reward: 'LATEST_FIRST' },
        { ...custom, winner_index: 0 },
        { ...custom, mode: 'MEMBERS' },
        { ...custom, labels: [null, 'Two'] },
      ])
        await assert.rejects(spin(owner, room, body), /INVALID_INPUT/);
      await sql`update private.room_presence set expires_at=now()-interval '1 second' where room_id=${room}::uuid and user_id=${member}::uuid`;
      await assert.rejects(spin(member, room, custom), /PRESENCE_REQUIRED/);
      await assert.rejects(
        sql.begin(async (tx) => {
          await tx.unsafe('set local role authenticated');
          await tx`select public.wheel_spin(${owner}::uuid,${room}::uuid,${randomUUID()}::uuid,${sql.json(custom)})`;
        }),
        /permission denied/,
      );
      await assert.rejects(
        sql.begin(async (tx) => {
          await tx.unsafe('set local role authenticated');
          await tx.unsafe('select * from private.wheel_spins');
        }),
        /permission denied/,
      );
    },
  );
  await check(
    'custom no-reward spins persist one common result and preserve every queue entry and playback',
    async () => {
      const room = await fixture(),
        before = await snapshot(owner, room),
        key = randomUUID();
      const result = await spin(member, room, custom, key);
      assert.deepEqual(result.winner, result.choices[result.winner_index]);
      assert.ok(custom.labels.includes(result.winner.label));
      assert.deepEqual(result.rewarded, []);
      assert.deepEqual(await spin(member, room, custom, key), result);
      assert.deepEqual((await read(owner, room)).latest, result);
      const after = await snapshot(owner, room);
      assert.deepEqual(after.queue, before.queue);
      assert.deepEqual(after.playback, before.playback);
      await assert.rejects(
        spin(member, room, { ...custom, labels: ['A', 'B'] }, key),
        /IDEMPOTENCY_CONFLICT/,
      );
      await assert.rejects(spin(owner, room, custom), /WHEEL_STALE/);
      await assert.rejects(spin(owner, room, { ...custom, previous_id: result.id }), /WHEEL_BUSY/);
      await command(owner, room, { action: 'kick', user_id: member });
      await assert.rejects(spin(member, room, custom, key), /PERMISSION_DENIED/);
    },
  );
  await check(
    'concurrent wheel requests commit one result; duplicate requests award at most once',
    async () => {
      const room = await fixture(),
        key = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 8 }, () => spin(member, room, custom, key)),
      );
      assert.equal(new Set(results.map((x) => x.id)).size, 1);
      assert.equal((await read(owner, room)).recent.length, 1);
      const other = await fixture();
      const races = await Promise.allSettled([
        spin(owner, other, custom),
        spin(member, other, custom),
      ]);
      assert.equal(races.filter((x) => x.status === 'fulfilled').length, 1);
      assert.equal((await read(owner, other)).recent.length, 1);
    },
  );
  for (const mode of ['FIFO', 'VOTING', 'FAIR', 'MANUAL'])
    await check(
      `wheel rewards outrank ${mode} without deleting earlier songs or interrupting the active run`,
      async () => {
        const room = await fixture(mode, mode === 'MANUAL');
        const controller = randomUUID();
        await command(owner, room, { action: 'claim', controller_id: controller });
        const claimed = await snapshot(owner, room);
        await command(owner, room, {
          action: 'play',
          controller_id: controller,
          fence: claimed.playback.fence,
          run_id: null,
        });
        const before = await snapshot(owner, room);
        const body = {
            action: 'spin',
            mode: 'MEMBERS',
            reward: 'TWO_FIRST',
            labels: [],
            previous_id: null,
          },
          key = randomUUID();
        const result = await spin(member, room, body, key);
        const latest = before.queue
          .filter((x) => x.status === 'QUEUED' && x.requested_by === result.winner.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
          .slice(0, 2);
        assert.deepEqual(
          result.rewarded.map((x) => x.id),
          latest.map((x) => x.id),
        );
        assert.deepEqual(await spin(member, room, body, key), result);
        const after = await snapshot(owner, room);
        assert.deepEqual(after.playback, before.playback);
        const identities = (s) =>
          s.queue
            .map((x) => ({ id: x.id, status: x.status, position: x.position }))
            .sort((a, b) => a.id.localeCompare(b.id));
        assert.deepEqual(identities(after), identities(before));
        assert.equal(after.settings.queue_mode, mode);
        assert.equal(after.settings.reorder_approval, mode === 'MANUAL');
        await command(owner, room, {
          action: 'next',
          controller_id: controller,
          fence: after.playback.fence,
          run_id: after.playback.run_id,
        });
        assert.equal((await snapshot(owner, room)).playback.entry_id, latest[0].id);
      },
    );
  await check(
    'reward invalidates an old proposal and manual reordering can replace reward priority',
    async () => {
      const room = await fixture('MANUAL', true);
      let s = await snapshot(owner, room);
      const ids = s.queue.filter((x) => x.status === 'QUEUED').map((x) => x.id);
      await command(owner, room, {
        action: 'reorder.propose',
        entry_id: ids.at(-1),
        position: 1,
        queue_ids: ids,
      });
      const result = await spin(member, room, {
        action: 'spin',
        mode: 'MEMBERS',
        reward: 'LATEST_FIRST',
        labels: [],
        previous_id: null,
      });
      s = await snapshot(owner, room);
      assert.equal(s.reorder.proposal.status, 'STALE');
      assert.equal(result.rewarded.length, 1);
      assert.equal(s.queue.find((x) => x.id === result.rewarded[0].id).priority, 1);
      await command(owner, room, {
        action: 'settings',
        name: s.room.name,
        description: '',
        settings: { ...s.settings, reorder_approval: false },
      });
      s = await snapshot(owner, room);
      await command(owner, room, {
        action: 'reorder',
        ids: [...ids].reverse(),
        version: s.version,
      });
      s = await snapshot(owner, room);
      assert.deepEqual(
        s.queue.map((x) => x.id),
        [...ids].reverse(),
      );
      assert.ok(s.queue.every((x) => x.priority === 0));
    },
  );
  await check(
    'member wheel choices deduplicate sessions and exclude offline/no-song members only when rewarding',
    async () => {
      const room = await fixture();
      await presence(member, room);
      assert.equal((await read(owner, room)).online.length, 2);
      const s = await snapshot(owner, room);
      for (const entry of s.queue.filter((x) => x.requested_by === member))
        await command(member, room, { action: 'remove', entry_id: entry.id });
      await assert.rejects(
        spin(owner, room, {
          action: 'spin',
          mode: 'MEMBERS',
          reward: 'LATEST_FIRST',
          labels: [],
          previous_id: null,
        }),
        /WHEEL_EMPTY/,
      );
      const result = await spin(member, room, {
        action: 'spin',
        mode: 'MEMBERS',
        reward: 'NONE',
        labels: [],
        previous_id: null,
      });
      assert.equal(result.choices.length, 2);
      assert.deepEqual(result.rewarded, []);
      await sql`delete from public.rooms where id=${room}::uuid`;
      assert.equal(
        (await sql`select count(*)::int n from private.wheel_spins where room_id=${room}::uuid`)[0]
          .n,
        0,
      );
    },
  );
}
