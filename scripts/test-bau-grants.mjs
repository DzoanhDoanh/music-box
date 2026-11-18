import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testBauGrants({ sql, owner: admin, check }) {
  const [owner, moderator, member, outsider, anonymousAdmin] = Array.from({ length: 5 }, () =>
    randomUUID(),
  );
  const users = [owner, moderator, member, outsider, anonymousAdmin];
  for (const user of users) {
    await sql`insert into auth.users(id, is_anonymous) values(${user}, ${user === anonymousAdmin})`;
  }
  const room = (
    await sql`select public.create_room(${admin}::uuid, 'Coin grant test', '', '', ${randomUUID()}::uuid) r`
  )[0].r;
  const seed = 'ab'.repeat(32);
  const command = async (actor, body, key = randomUUID(), table = null) =>
    (
      await sql`select public.bau_cua_command(${actor}::uuid, ${room.id}::uuid, ${table}::uuid, ${key}::uuid, ${sql.json(body)}, ${seed}) r`
    )[0].r;
  const read = async (actor) =>
    (
      await sql`select public.bau_cua_read(${actor}::uuid, ${room.id}::uuid, null::uuid, ${seed}) r`
    )[0].r;
  const grant = {
    action: 'adjust',
    user: member,
    amount: 5000,
    reason: 'Thưởng hoạt động trong phòng',
  };
  try {
    for (const user of [owner, moderator, member, anonymousAdmin])
      await sql`select public.join_room(${user}::uuid, ${room.code}, 'Thành viên thử', '')`;
    await sql`update public.rooms set owner_id=${owner} where id=${room.id}`;
    await sql`update public.room_members set role=case when user_id=${owner} then 'owner' when user_id=${moderator} then 'moderator' else 'member' end where room_id=${room.id}`;
    await sql`insert into public.system_admins(user_id) values(${anonymousAdmin})`;

    await check(
      'coin grants deny room owners, moderators, members and anonymous admins',
      async () => {
        for (const actor of [owner, moderator, member, anonymousAdmin])
          await assert.rejects(command(actor, grant), /PERMISSION_DENIED/);
        assert.equal(
          (await sql`select count(*)::int n from public.coin_wallets where user_id=${member}`)[0].n,
          0,
        );
        assert.equal(
          (
            await sql`select count(*)::int n from public.audit_logs where room_id=${room.id} and action='bau.adjust'`
          )[0].n,
          0,
        );
      },
    );

    await check(
      'coin grant validates target membership, bans and amounts before any credit',
      async () => {
        await assert.rejects(command(admin, { ...grant, user: outsider }), /PERMISSION_DENIED/);
        await sql`insert into public.bans(room_id,user_id) values(${room.id},${member})`;
        await assert.rejects(command(admin, grant), /PERMISSION_DENIED/);
        await sql`delete from public.bans where room_id=${room.id} and user_id=${member}`;
        for (const amount of [0, 1.5, 1000001])
          await assert.rejects(command(admin, { ...grant, amount }), /INVALID_INPUT/);
        assert.equal(
          (await sql`select count(*)::int n from public.coin_wallets where user_id=${member}`)[0].n,
          0,
        );
      },
    );

    await check(
      'offline lobby grant initializes once, credits once under retries, audits and invalidates privately',
      async () => {
        const key = randomUUID();
        const initial = Number(
          (await sql`select settings->>'initial' n from private.bau_economy`)[0].n,
        );
        await Promise.all([command(admin, grant, key), command(admin, grant, key)]);
        const state = await read(member);
        assert.equal(state.wallet.available, initial + 5000);
        assert.equal(state.wallet.reserved, 0);
        assert.equal(state.ledger.filter((entry) => entry.reason === 'INITIAL_GRANT').length, 1);
        assert.equal(state.ledger.filter((entry) => entry.reason === 'ADMIN_ADJUSTMENT').length, 1);
        const entry = state.ledger.find((entry) => entry.reason === 'ADMIN_ADJUSTMENT');
        assert.equal(entry.available_delta, 5000);
        assert.equal(entry.available_after, initial + 5000);
        const audits =
          await sql`select actor, details from public.audit_logs where room_id=${room.id} and action='bau.adjust'`;
        assert.equal(audits.length, 1);
        assert.equal(audits[0].actor, admin);
        assert.deepEqual(audits[0].details, grant);
        const events =
          await sql`select payload, delivered_at from private.bau_outbox where room_id=${room.id} and kind='wallet.updated'`;
        assert.equal(events.length, 1);
        assert.deepEqual(events[0].payload, { user: member });
        assert.ok(events[0].delivered_at);
        assert.equal(
          (
            await sql`select count(*)::int n from realtime.messages where topic=${'room:' + room.id} and payload->>'kind'='wallet.updated'`
          )[0].n,
          1,
        );
        await assert.rejects(
          command(admin, { ...grant, amount: 6000 }, key),
          /IDEMPOTENCY_CONFLICT/,
        );
        assert.ok(state.diagnostics.walletConsistent);
      },
    );

    await check(
      'grant during active betting leaves reserved stake, escrow and bets unchanged',
      async () => {
        const table = (await command(owner, { action: 'create', name: 'Grant while betting' }))
          .table.id;
        await command(member, { action: 'join', spectator: false }, randomUUID(), table);
        await command(owner, { action: 'volunteer' }, randomUUID(), table);
        const round = (await command(owner, { action: 'start' }, randomUUID(), table)).round.id;
        await command(
          member,
          { action: 'bet', round, symbol: 'CUA', amount: 100 },
          randomUUID(),
          table,
        );
        const before = (await read(member)).wallet;
        await command(admin, grant);
        const after = (await read(member)).wallet;
        assert.equal(after.available, before.available + 5000);
        assert.equal(after.reserved, before.reserved);
        assert.equal(after.reserved, 100);
        const bets =
          await sql`select amount from public.bau_cua_bets where round_id=${round} and user_id=${member}`;
        assert.equal(bets.length, 1);
        assert.equal(Number(bets[0].amount), 100);
        await command(
          owner,
          { action: 'cancel', reason: 'Cleanup grant test' },
          randomUUID(),
          table,
        );
      },
    );
  } finally {
    await sql`delete from public.rooms where id=${room.id}`;
    await sql`delete from auth.users where id in ${sql(users)}`;
  }
}
