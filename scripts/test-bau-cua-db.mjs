import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { testBauCuaCases } from './test-bau-cua-cases.mjs';

export async function testBauCua({ sql, owner, check }) {
  const seed = 'ab'.repeat(32),
    people = [owner, ...Array.from({ length: 4 }, () => randomUUID())];
  for (const u of people.slice(1)) await sql`insert into auth.users(id) values(${u})`;
  const room = (
    await sql`select public.create_room(${owner}::uuid,'Bầu Cua kiểm thử','','',${randomUUID()}::uuid) r`
  )[0].r;
  for (const u of people.slice(1, 4))
    await sql`select public.join_room(${u}::uuid,${room.code},'Bạn Bầu Cua','')`;
  const read = async (u = owner, t = null, rid = room.id) =>
    (await sql`select public.bau_cua_read(${u}::uuid,${rid}::uuid,${t}::uuid,${seed}) r`)[0].r;
  const cmd = async (u, body, t = null, key = randomUUID(), rid = room.id) =>
    (
      await sql`select public.bau_cua_command(${u}::uuid,${rid}::uuid,${t}::uuid,${key}::uuid,${sql.json(body)}::jsonb,${seed}) r`
    )[0].r;
  let table, round;
  const expire = async (t = table) => {
    await sql`update public.bau_cua_rounds set deadline=now()-interval '60 seconds' where table_id=${t} and status not in ('RESULT','CANCELLED')`;
    return read(owner, t);
  };
  await check(
    'bau concurrent wallet initialization grants once and isolates room membership',
    async () => {
      const all = await Promise.all(Array.from({ length: 12 }, () => read(people[1])));
      assert.ok(all.every((s) => s.wallet.available === 10000 && s.wallet.reserved === 0));
      assert.equal(
        (
          await sql`select count(*)::int n from public.coin_ledger where user_id=${people[1]} and reason='INITIAL_GRANT'`
        )[0].n,
        1,
      );
      await assert.rejects(read(people[4]), /PERMISSION_DENIED/);
    },
  );
  await check(
    'bau creates independent tables and protects all wallet/seed/RPC boundaries',
    async () => {
      const state = await cmd(owner, { action: 'create', name: 'Bàn chính' });
      table = state.table.id;
      await cmd(people[1], { action: 'join', spectator: false }, table);
      await cmd(people[2], { action: 'join', spectator: false }, table);
      await cmd(people[3], { action: 'join', spectator: true }, table);
      for (const role of ['anon', 'authenticated']) {
        const p = (
          await sql`select has_function_privilege(${role},'public.bau_cua_command(uuid,uuid,uuid,uuid,jsonb,text)','execute') call,
      has_table_privilege(${role},'public.coin_wallets','update') write,has_table_privilege(${role},'private.bau_seeds','select') seed`
        )[0];
        assert.deepEqual(p, { call: false, write: false, seed: false });
      }
      await sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claim.sub',${people[1]},true)`;
        assert.equal((await tx`select * from public.coin_wallets`).length, 1);
      });
      await assert.rejects(
        sql.begin(async (tx) => {
          await tx.unsafe('set local role authenticated');
          await tx`select set_config('request.jwt.claim.sub',${people[1]},true)`;
          await tx`update public.coin_wallets set available=99999`;
        }),
        /permission denied/,
      );
      await sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claim.sub',${people[4]},true)`;
        assert.equal((await tx`select * from public.bau_cua_tables`).length, 0);
      });
    },
  );
  await check('bau dealer commits seed before bets and cannot bet or choose dice', async () => {
    await cmd(owner, { action: 'volunteer' }, table);
    const state = await cmd(owner, { action: 'start' }, table);
    round = state.round.id;
    assert.equal(state.round.commitment, createHash('sha256').update(seed).digest('hex'));
    assert.equal(state.round.revealed_seed, null);
    assert.equal(state.round.dice, null);
    await assert.rejects(
      cmd(owner, { action: 'bet', round, symbol: 'CUA', amount: 100 }, table),
      /PERMISSION_DENIED/,
    );
    await assert.rejects(
      cmd(people[3], { action: 'bet', round, symbol: 'CUA', amount: 100 }, table),
      /PERMISSION_DENIED/,
    );
    await assert.rejects(cmd(people[1], { action: 'reveal' }, table), /PERMISSION_DENIED/);
  });
  await check('bau concurrent bets, exact liability and idempotency preserve escrow', async () => {
    const body = { action: 'bet', round, symbol: 'CUA', amount: 500 },
      key = randomUUID();
    const responses = await Promise.all([
      cmd(people[1], body, table, key),
      cmd(people[1], body, table, key),
    ]);
    // Receipt replay returns a current authorized view, so wall-clock timestamps can differ.
    assert.deepEqual({ ...responses[0], serverNow: 0 }, { ...responses[1], serverNow: 0 });
    assert.equal(
      (await sql`select count(*)::int n from public.coin_ledger where reference=${'bet:' + key}`)[0]
        .n,
      1,
    );
    await assert.rejects(
      cmd(people[1], { ...body, amount: 100 }, table, key),
      /IDEMPOTENCY_CONFLICT/,
    );
    await Promise.all([
      cmd(people[1], { ...body, symbol: 'TOM' }, table),
      cmd(people[2], { ...body, symbol: 'CA' }, table),
    ]);
    const s = await read(owner, table);
    assert.equal(s.round.stake_total, 1500);
    assert.equal((await cmd(people[1], body, table, key)).round.stake_total, 1500);
    const need = (await sql`select private.bau_liability(private.bau_stakes(${round}::uuid)) n`)[0]
      .n;
    assert.equal(s.round.collateral, Number(need));
    assert.equal(s.wallet.reserved, s.round.collateral);
    const before = await read(people[1], table);
    await assert.rejects(cmd(people[1], { ...body, amount: 5000 }, table), /BAU_COLLATERAL/);
    assert.deepEqual((await read(people[1], table)).wallet, before.wallet);
    await cmd(people[1], { action: 'undo', round, symbol: 'TOM' }, table);
    assert.equal((await read(people[1], table)).round.stake_total, 1000);
  });
  await check(
    'bau atomic settlement, deterministic faces and concurrent advance conserve coin',
    async () => {
      const before = (await sql`select sum(total)::text n from public.coin_wallets`)[0].n;
      await sql`update public.bau_cua_rounds set deadline=now()-interval '60 seconds' where id=${round}`;
      await Promise.all(Array.from({ length: 8 }, () => read(owner, table)));
      const s = await read(owner, table);
      assert.equal(s.round.status, 'RESULT');
      assert.equal(s.round.revealed_seed, seed);
      assert.deepEqual(
        s.round.dice,
        (await sql`select private.bau_dice(${round}::uuid,${seed}) d`)[0].d,
      );
      assert.equal((await sql`select sum(total)::text n from public.coin_wallets`)[0].n, before);
      assert.equal(
        (
          await sql`select count(*)::int n from public.coin_ledger where reference=${'dealer:' + round}`
        )[0].n,
        1,
      );
      assert.ok(s.diagnostics.walletConsistent);
      assert.equal(s.wallet.reserved, 0);
    },
  );
  await check('bau daily and relief claims cannot double credit', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => cmd(people[1], { action: 'daily' })),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const w = (await read(people[2])).wallet;
    await cmd(owner, {
      action: 'adjust',
      user: people[2],
      amount: 100 - w.total,
      reason: 'Fixture relief eligibility',
    });
    const relief = await Promise.allSettled(
      Array.from({ length: 6 }, () => cmd(people[2], { action: 'relief' })),
    );
    assert.equal(relief.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await read(people[2])).wallet.total, 1100);
    await assert.rejects(
      cmd(people[2], { action: 'adjust', user: people[2], amount: 1000, reason: 'Forged credit' }),
      /PERMISSION_DENIED/,
    );
  });
  await check('bau cancellation refunds all escrow and applies no penalty', async () => {
    await cmd(owner, { action: 'start' }, table);
    let s = await read(owner, table);
    await cmd(people[1], { action: 'bet', round: s.round.id, symbol: 'GA', amount: 500 }, table);
    const before = (await read(people[1])).wallet.total;
    s = await cmd(owner, { action: 'cancel', reason: 'Kiểm tra hoàn cược' }, table);
    assert.equal(s.round.status, 'CANCELLED');
    assert.equal(s.wallet.reserved, 0);
    assert.equal((await read(people[1])).wallet.total, before);
    assert.equal((await read(people[1])).wallet.reserved, 0);
    assert.equal(s.penalties.length, 0);
  });
  await check(
    'bau bankruptcy removes only latest own queued songs atomically and restores safely',
    async () => {
      const s = await read(owner, table);
      await cmd(owner, {
        action: 'settings',
        settings: { ...s.settings, penaltyCount: 2 },
        confirmed: true,
      });
      const other = (
        await sql`select public.create_room(${owner}::uuid,'Phòng không phạt','','',${randomUUID()}::uuid) r`
      )[0].r;
      await sql`select public.join_room(${people[1]}::uuid,${other.code},'Người thử','')`;
      const songIds = ['baufixture1', 'baufixture2', 'baufixture3', 'baufixture4', 'baufixture5'];
      for (const id of songIds)
        await sql`insert into public.songs(youtube_video_id,title,channel,thumbnail,duration) values(${id},'Nhạc thử','Fixture','https://i.ytimg.com/fixture.jpg',180)`;
      const entries = [];
      for (let i = 0; i < 5; i++) {
        entries.push(
          (
            await sql`insert into public.queue_entries(room_id,youtube_video_id,requested_by,position,status,requested_at)
       values(${i === 4 ? other.id : room.id},${songIds[i]},${i === 3 ? owner : people[1]},${i + 100},${i === 2 ? 'PLAYING' : 'QUEUED'},now()+make_interval(secs=>${i})) returning id`
          )[0].id,
        );
      }
      const initial = (await read(people[1])).wallet;
      await cmd(owner, {
        action: 'adjust',
        user: people[1],
        amount: 500 - initial.total,
        reason: 'Fixture bankruptcy test',
      });
      let fresh = await cmd(owner, { action: 'start' }, table);
      const rid = fresh.round.id;
      const dice = (await sql`select private.bau_dice(${rid}::uuid,${seed}) d`)[0].d;
      const symbols = ['BAU', 'CUA', 'TOM', 'CA', 'GA', 'NAI'];
      const loss = symbols.find((_, i) => !dice.includes(i));
      await cmd(people[1], { action: 'bet', round: rid, symbol: loss, amount: 500 }, table);
      assert.equal((await read(people[1])).penalties.length, 0, 'reserve alone never penalizes');
      await cmd(owner, {
        action: 'settings',
        settings: { ...s.settings, penaltyEnabled: false },
        confirmed: true,
      });
      fresh = await expire();
      assert.equal(fresh.penalties.length, 1, 'round uses accepted rules snapshot');
      const p = fresh.penalties[0];
      assert.equal(p.user_id, people[1]);
      assert.equal(p.songs.length, 2);
      const statuses =
        await sql`select id,status from public.queue_entries where id in ${sql(entries)}`;
      for (const x of statuses)
        assert.equal(
          x.status,
          entries.slice(0, 2).includes(x.id)
            ? 'REMOVED'
            : x.id === entries[2]
              ? 'PLAYING'
              : 'QUEUED',
        );
      await Promise.all(Array.from({ length: 6 }, () => read(people[1], table)));
      assert.equal((await read(people[1], table)).penalties.length, 1);
      await assert.rejects(
        cmd(people[1], { action: 'restore', penalty: p.id, entry: p.songs[0].id }),
        /PERMISSION_DENIED/,
      );
      await cmd(owner, { action: 'restore', penalty: p.id, entry: p.songs[0].id });
      assert.equal(
        (await sql`select status from public.queue_entries where id=${p.songs[0].id}`)[0].status,
        'QUEUED',
      );
      await assert.rejects(
        cmd(owner, { action: 'restore', penalty: p.id, entry: p.songs[0].id }),
        /BAU_RESTORE_UNAVAILABLE/,
      );
    },
  );
  await check(
    'bau room deletion refunds unsettled bets without corrupting other wallets',
    async () => {
      const isolated = (
        await sql`select public.create_room(${owner}::uuid,'Phòng xóa Bầu Cua','','',${randomUUID()}::uuid) r`
      )[0].r;
      await sql`select public.join_room(${people[2]}::uuid,${isolated.code},'Thử xóa','')`;
      let s = await cmd(
        owner,
        { action: 'create', name: 'Bàn sẽ xóa' },
        null,
        randomUUID(),
        isolated.id,
      );
      const t = s.table.id;
      await cmd(people[2], { action: 'join', spectator: false }, t, randomUUID(), isolated.id);
      await cmd(owner, { action: 'volunteer' }, t, randomUUID(), isolated.id);
      s = await cmd(owner, { action: 'start' }, t, randomUUID(), isolated.id);
      await cmd(
        people[2],
        { action: 'bet', round: s.round.id, symbol: 'BAU', amount: 100 },
        t,
        randomUUID(),
        isolated.id,
      );
      const total = (await read(people[2])).wallet.total;
      await sql`select public.room_delete(${owner}::uuid,${isolated.id}::uuid,${randomUUID()}::uuid,${isolated.name})`;
      const w = (await read(people[2])).wallet;
      assert.equal(w.total, total);
      assert.equal(w.reserved, 0);
    },
  );
  await testBauCuaCases({ sql, check });
}
