import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testReorderVoting({ sql, owner, users, videos, check }) {
  const command = async (actor, room, body, key = randomUUID()) =>
    (
      await sql`select public.room_command(${actor}::uuid,${room}::uuid,${key}::uuid,${sql.json(body)}::jsonb) r`
    )[0].r;
  const snapshot = async (actor, room) =>
    (await sql`select public.room_snapshot(${actor}::uuid,${room}::uuid) r`)[0].r;
  const presence = async (actor, room, session = randomUUID(), sequence = 1, online = true) =>
    (
      await sql`select public.room_presence(${actor}::uuid,${room}::uuid,${session}::uuid,${sequence},${online}) r`
    )[0].r;
  const ordered = (s) =>
    s.queue
      .filter((item) => item.status === 'QUEUED')
      .sort((a, b) => a.position - b.position)
      .map((item) => item.id);
  const configure = async (room, enabled) => {
    const s = await snapshot(owner, room);
    return command(owner, room, {
      action: 'settings',
      name: s.room.name,
      description: '',
      settings: { ...s.settings, queue_mode: 'MANUAL', reorder_approval: enabled },
    });
  };
  const fixture = async (count = 4) => {
    const room = (
      await sql`select public.create_room(${owner}::uuid,'Biểu quyết thử','', '',${randomUUID()}::uuid) r`
    )[0].r;
    for (const user of users.slice(0, 4))
      await sql`select public.join_room(${user}::uuid,${room.code},'Người thử','')`;
    for (const video of videos.slice(0, 4))
      await command(owner, room.id, { action: 'enqueue', video_id: video });
    await configure(room.id, true);
    const actors = [owner, ...users.slice(0, count - 1)];
    for (const actor of actors) await presence(actor, room.id);
    return { room: room.id, actors, ids: ordered(await snapshot(owner, room.id)) };
  };
  const propose = async (
    actor,
    room,
    ids,
    position = 1,
    entry = ids.at(-1),
    key = randomUUID(),
  ) => {
    await command(
      actor,
      room,
      { action: 'reorder.propose', entry_id: entry, position, queue_ids: ids },
      key,
    );
    return (await snapshot(actor, room)).reorder.proposal;
  };
  await check(
    'reorder is opt-in, owner-configured, server-protected and cannot be self-approved',
    async () => {
      const { room, ids } = await fixture(1);
      await assert.rejects(propose(owner, room, ids), /NOT_ENOUGH_ONLINE/);
      await presence(owner, room); // A second tab is still one voter.
      assert.equal((await snapshot(owner, room)).reorder.online_count, 1);
      await assert.rejects(propose(owner, room, ids), /NOT_ENOUGH_ONLINE/);
      await assert.rejects(
        command(owner, room, {
          action: 'reorder',
          ids: [...ids].reverse(),
          version: (await snapshot(owner, room)).version,
        }),
        /REORDER_REQUIRES_APPROVAL/,
      );
      const s = await snapshot(owner, room);
      await assert.rejects(
        command(users[0], room, {
          action: 'settings',
          name: s.room.name,
          description: '',
          settings: { ...s.settings, reorder_approval: false },
        }),
        /PERMISSION_DENIED/,
      );
      await configure(room, false);
      await assert.rejects(propose(owner, room, ids), /REORDER_VOTING_DISABLED/);
      await command(owner, room, {
        action: 'reorder',
        ids: [...ids].reverse(),
        version: (await snapshot(owner, room)).version,
      });
      assert.deepEqual(ordered(await snapshot(owner, room)), [...ids].reverse());
    },
  );
  await check(
    'online leases ignore old heartbeats, count users once and reject outsiders',
    async () => {
      const { room } = await fixture(1);
      const session = randomUUID();
      await presence(users[0], room, session, 2, false);
      await presence(users[0], room, session, 1, true);
      assert.equal((await snapshot(owner, room)).reorder.online_count, 1);
      await presence(users[0], room, session, 3, true);
      const second = randomUUID();
      await presence(users[0], room, second);
      assert.equal((await snapshot(owner, room)).reorder.online_count, 2);
      await presence(users[0], room, session, 4, false);
      assert.equal((await snapshot(owner, room)).reorder.online_count, 2);
      await sql`update private.room_presence set expires_at=now()-interval '1 second' where room_id=${room} and user_id=${users[0]}`;
      assert.equal((await snapshot(owner, room)).reorder.online_count, 1);
      await assert.rejects(presence(users[6], room), /PERMISSION_DENIED/);
    },
  );
  await check(
    'majority approval moves to the requested position atomically with idempotent votes',
    async () => {
      const { room, ids } = await fixture(4);
      const before = (await snapshot(owner, room)).playback;
      const proposal = await propose(users[0], room, ids, 2);
      assert.equal(proposal.required_votes, 3);
      assert.equal(proposal.yes_votes, 1);
      assert.equal(proposal.electorate_count, 4);
      await assert.rejects(propose(owner, room, ids), /PROPOSAL_EXISTS/);
      const body = { action: 'reorder.vote', proposal_id: proposal.id, approved: true };
      await command(users[0], room, body); // Self vote again is not an additional vote.
      assert.equal((await snapshot(owner, room)).reorder.proposal.yes_votes, 1);
      await command(owner, room, body);
      assert.deepEqual(ordered(await snapshot(owner, room)), ids);
      const key = randomUUID();
      const results = await Promise.all([
        command(users[1], room, body, key),
        command(users[1], room, body, key),
      ]);
      assert.deepEqual(results[0], results[1]);
      const after = await snapshot(owner, room);
      assert.deepEqual(ordered(after), [ids[0], ids[3], ids[1], ids[2]]);
      assert.equal(after.reorder.proposal.status, 'APPLIED');
      assert.deepEqual(after.playback, before);
      await assert.rejects(command(users[2], room, body), /PROPOSAL_CLOSED/);
      await assert.rejects(
        command(users[1], room, { ...body, approved: false }, key),
        /IDEMPOTENCY_CONFLICT/,
      );
    },
  );
  await check(
    'electorate and majority stay fixed after disconnect; late arrivals cannot vote',
    async () => {
      const { room, ids } = await fixture(4);
      const p = await propose(owner, room, ids);
      await sql`update private.room_presence set expires_at=now()-interval '1 second' where room_id=${room} and user_id=${users[2]}`;
      await presence(users[3], room);
      await assert.rejects(
        command(users[3], room, { action: 'reorder.vote', proposal_id: p.id, approved: true }),
        /NOT_ELIGIBLE/,
      );
      await assert.rejects(
        command(users[2], room, { action: 'reorder.vote', proposal_id: p.id, approved: true }),
        /PRESENCE_REQUIRED/,
      );
      await command(users[0], room, { action: 'reorder.vote', proposal_id: p.id, approved: true });
      assert.equal((await snapshot(owner, room)).reorder.proposal.status, 'OPEN');
      assert.equal((await snapshot(owner, room)).reorder.proposal.required_votes, 3);
      await presence(users[2], room);
      await command(users[2], room, { action: 'reorder.vote', proposal_id: p.id, approved: true });
      assert.equal((await snapshot(owner, room)).reorder.proposal.status, 'APPLIED');
    },
  );
  await check(
    'negative votes can reject, voting can change while open, and only proposer/managers cancel',
    async () => {
      const { room, ids } = await fixture(4);
      const p = await propose(users[0], room, ids);
      await assert.rejects(
        command(users[1], room, { action: 'reorder.cancel', proposal_id: p.id }),
        /PERMISSION_DENIED/,
      );
      await command(users[1], room, { action: 'reorder.vote', proposal_id: p.id, approved: false });
      assert.equal((await snapshot(owner, room)).reorder.proposal.status, 'OPEN');
      await command(users[1], room, { action: 'reorder.vote', proposal_id: p.id, approved: true });
      await command(users[1], room, { action: 'reorder.vote', proposal_id: p.id, approved: false });
      await command(users[2], room, { action: 'reorder.vote', proposal_id: p.id, approved: false });
      assert.equal((await snapshot(owner, room)).reorder.proposal.status, 'REJECTED');
      assert.deepEqual(ordered(await snapshot(owner, room)), ids);
      const next = await propose(users[0], room, ids);
      await command(users[0], room, { action: 'reorder.cancel', proposal_id: next.id });
      assert.equal((await snapshot(owner, room)).reorder.proposal.status, 'CANCELLED');
    },
  );
  await check('expired/stale proposals cannot move songs or leak across rooms', async () => {
    const { room, ids } = await fixture(3);
    const other = await fixture(3);
    await assert.rejects(propose(owner, room, [...ids].reverse()), /QUEUE_CHANGED/);
    let p = await propose(owner, room, ids);
    await assert.rejects(
      command(owner, other.room, { action: 'reorder.vote', proposal_id: p.id, approved: true }),
      /PROPOSAL_CLOSED/,
    );
    await sql`update private.reorder_proposals set expires_at=now()-interval '1 second' where id=${p.id}`;
    assert.equal((await snapshot(owner, room)).reorder.proposal.status, 'EXPIRED');
    await assert.rejects(
      command(users[0], room, { action: 'reorder.vote', proposal_id: p.id, approved: true }),
      /PROPOSAL_CLOSED/,
    );
    p = await propose(owner, room, ids);
    await command(owner, room, { action: 'remove', entry_id: ids[0] });
    assert.equal((await snapshot(owner, room)).reorder.proposal.status, 'STALE');
    await assert.rejects(
      command(users[0], room, { action: 'reorder.vote', proposal_id: p.id, approved: true }),
      /PROPOSAL_CLOSED/,
    );
    assert.deepEqual(ordered(await snapshot(owner, room)), ids.slice(1));
  });
  await check('turning approval off or revoking a voter cancels pending proposals', async () => {
    const { room, ids } = await fixture(3);
    await propose(owner, room, ids);
    await configure(room, false);
    assert.equal((await snapshot(owner, room)).reorder.proposal.status, 'CANCELLED');
    await configure(room, true);
    const p = await propose(owner, room, ids);
    await command(owner, room, { action: 'kick', user_id: users[0] });
    assert.equal((await snapshot(owner, room)).reorder.proposal.status, 'CANCELLED');
    await assert.rejects(
      command(users[0], room, { action: 'reorder.vote', proposal_id: p.id, approved: true }),
      /PERMISSION_DENIED/,
    );
  });
  await check(
    'private ballots/presence and new RPC cannot be forged through authenticated SQL access',
    async () => {
      const { room } = await fixture(2);
      await assert.rejects(
        sql.begin(async (tx) => {
          await tx.unsafe('set local role authenticated');
          await tx`select * from private.reorder_votes`;
        }),
        /permission denied/,
      );
      await assert.rejects(
        sql.begin(async (tx) => {
          await tx.unsafe('set local role authenticated');
          await tx`select public.room_presence(${owner}::uuid,${room}::uuid,${randomUUID()}::uuid,1,true)`;
        }),
        /permission denied/,
      );
    },
  );
  await check(
    'two-member approval and concurrent final votes preserve a currently playing song',
    async () => {
      const { room } = await fixture(2);
      const controller = randomUUID();
      const claim = await command(owner, room, { action: 'claim', controller_id: controller });
      await command(owner, room, {
        action: 'play',
        controller_id: controller,
        fence: claim.playback.fence,
        run_id: null,
      });
      const before = await snapshot(owner, room);
      const ids = ordered(before);
      const p = await propose(users[0], room, ids);
      assert.equal(p.required_votes, 2);
      assert.equal(p.yes_votes, 1);
      const results = await Promise.allSettled([
        command(owner, room, { action: 'reorder.vote', proposal_id: p.id, approved: true }),
        command(owner, room, { action: 'reorder.vote', proposal_id: p.id, approved: true }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      const after = await snapshot(owner, room);
      assert.deepEqual(after.playback, before.playback);
      assert.deepEqual(ordered(after), [ids[2], ids[0], ids[1]]);
      assert.equal(after.reorder.proposal.status, 'APPLIED');
      assert.equal(after.reorder.proposal.yes_votes, 2);
    },
  );
  await check(
    'maintenance expires old presence/proposals and cascades ballots without touching active data',
    async () => {
      const { room, ids } = await fixture(2);
      const p = await propose(owner, room, ids);
      await sql`update private.reorder_proposals set created_at=now()-interval '31 days' where id=${p.id}`;
      await sql`update private.room_presence set expires_at=now()-interval '2 days' where room_id=${room} and user_id=${users[0]}`;
      await sql`select public.maintenance_cleanup()`;
      assert.equal(
        (await sql`select * from private.reorder_votes where proposal_id=${p.id}`).length,
        0,
      );
      const after = await snapshot(owner, room);
      assert.equal(after.reorder.proposal, null);
      assert.equal(after.reorder.online_count, 1);
      assert.deepEqual(ordered(after), ids);
    },
  );
}
