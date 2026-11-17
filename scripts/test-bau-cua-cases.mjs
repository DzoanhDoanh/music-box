import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
const seed = 'ab'.repeat(32),
  symbols = ['BAU', 'CUA', 'TOM', 'CA', 'GA', 'NAI'];
export async function testBauCuaCases({ sql, check }) {
  async function setup(overrides = {}) {
    const users = Array.from({ length: 4 }, () => randomUUID());
    for (const id of users) await sql`insert into auth.users(id,is_anonymous) values(${id},false)`;
    const owner = users[0];
    await sql`insert into public.system_admins(user_id) values(${owner})`;
    const room = (
      await sql`select public.create_room(${owner}::uuid,'Bàn kiểm thử độc lập','','',${randomUUID()}::uuid) r`
    )[0].r;
    for (const id of users.slice(1))
      await sql`select public.join_room(${id}::uuid,${room.code},'Bạn thử','')`;
    const read = async (u = owner, t = null) =>
      (await sql`select public.bau_cua_read(${u}::uuid,${room.id}::uuid,${t}::uuid,${seed}) r`)[0]
        .r;
    const cmd = async (u, body, t = null, key = randomUUID()) =>
      (
        await sql`select public.bau_cua_command(${u}::uuid,${room.id}::uuid,${t}::uuid,${key}::uuid,${sql.json(body)},${seed}) r`
      )[0].r;
    const base = await read();
    await cmd(owner, {
      action: 'settings',
      settings: { ...base.settings, ...overrides },
      confirmed: true,
    });
    const table = (await cmd(owner, { action: 'create', name: 'Bàn riêng' })).table.id;
    for (const u of users.slice(1)) await cmd(u, { action: 'join', spectator: false }, table);
    await cmd(owner, { action: 'volunteer' }, table);
    const balance = async (u, n) => {
      const w = (await read(u)).wallet;
      if (n !== w.total)
        await cmd(owner, {
          action: 'adjust',
          user: u,
          amount: n - w.total,
          reason: 'Điều chỉnh fixture cô lập',
        });
    };
    const start = async () => cmd(owner, { action: 'start' }, table);
    const finish = async (t = table) => {
      await sql`update public.bau_cua_rounds set deadline=now()-interval '60 seconds' where table_id=${t} and status not in ('RESULT','CANCELLED')`;
      return read(owner, t);
    };
    const dice = async (r) => (await sql`select private.bau_dice(${r}::uuid,${seed}) d`)[0].d;
    const losing = async (r) => symbols.find((_, i) => !r.includes(i));
    async function song(u, status = 'QUEUED', position = 100) {
      const video = randomUUID().replaceAll('-', '').slice(0, 11);
      await sql`insert into public.songs(youtube_video_id,title,channel,thumbnail,duration) values(${video},'Nhạc kiểm thử','Test','/favicon.svg',180)`;
      return (
        await sql`insert into public.queue_entries(room_id,youtube_video_id,requested_by,position,status) values(${room.id},${video},${u},${position},${status}) returning id`
      )[0].id;
    }
    return {
      users,
      owner,
      room,
      table,
      read,
      cmd,
      balance,
      start,
      finish,
      dice,
      losing,
      song,
      settings: { ...base.settings, ...overrides },
    };
  }
  await check(
    'bau SQL fairness matches independent SHA256 rejection sampling and all 216 payouts',
    async () => {
      for (let sample = 0; sample < 16; sample++) {
        const id = randomUUID(),
          secret = createHash('sha256').update(String(sample)).digest('hex'),
          expected = [];
        for (let n = 0; expected.length < 3; n++)
          for (const b of createHash('sha256')
            .update(`ROOMTUNE:BAU_CUA:v1:${id}:${secret}:${n}`)
            .digest())
            if (b < 252 && expected.length < 3) expected.push(b % 6);
        assert.deepEqual(
          (await sql`select private.bau_dice(${id}::uuid,${secret}) d`)[0].d,
          expected,
        );
      }
      for (const stakes of [
        [100, 200, 300, 400, 500, 600],
        [500, 0, 0, 0, 0, 0],
        [100, 100, 100, 100, 100, 100],
      ]) {
        const results =
          await sql`select array[a,b,c] dice,private.bau_gross(${stakes}::bigint[],array[a,b,c])::text payout from generate_series(0,5) a cross join generate_series(0,5) b cross join generate_series(0,5) c`;
        for (const r of results)
          assert.equal(
            Number(r.payout),
            stakes.reduce((n, stake, i) => {
              const count = r.dice.filter((d) => d === i).length;
              return n + (count ? stake * (count + 1) : 0);
            }, 0),
          );
        assert.equal(
          Number((await sql`select private.bau_liability(${stakes}::bigint[])::text n`)[0].n),
          Math.max(0, ...results.map((r) => Number(r.payout) - stakes.reduce((a, b) => a + b, 0))),
        );
      }
    },
  );
  await check(
    'bau penalty matrix: disabled, players excluded, nonzero, threshold, playing/played/absent songs',
    async () => {
      for (const row of [
        {
          rules: { penaltyEnabled: false },
          total: 100,
          bet: 100,
          status: 'QUEUED',
          penalty: false,
        },
        {
          rules: { penaltyPlayers: false },
          total: 100,
          bet: 100,
          status: 'QUEUED',
          penalty: false,
        },
        { rules: {}, total: 200, bet: 100, status: 'QUEUED', penalty: false },
        {
          rules: { penaltyTrigger: 'BELOW_MINIMUM' },
          total: 150,
          bet: 100,
          status: 'QUEUED',
          penalty: true,
        },
        ...['PLAYING', 'PLAYED', null].map((status) => ({
          rules: {},
          total: 100,
          bet: 100,
          status,
          penalty: true,
        })),
      ]) {
        const s = await setup(row.rules),
          u = s.users[1];
        await s.balance(u, row.total);
        const entry = row.status ? await s.song(u, row.status) : null;
        const r = (await s.start()).round,
          loss = await s.losing(await s.dice(r.id));
        await s.cmd(u, { action: 'bet', round: r.id, symbol: loss, amount: row.bet }, s.table);
        const view = await s.finish();
        assert.equal(view.penalties.length, row.penalty ? 1 : 0);
        const removed = row.penalty && row.status === 'QUEUED';
        if (entry)
          assert.equal(
            (await sql`select status from public.queue_entries where id=${entry}`)[0].status,
            removed ? 'REMOVED' : row.status,
          );
        if (row.penalty)
          assert.equal(view.penalties[0].status, removed ? 'APPLIED' : 'SKIPPED_NO_ELIGIBLE_SONG');
        const late = await s.song(u, 'QUEUED', 999);
        await s.read(u, s.table);
        assert.equal(
          (await sql`select status from public.queue_entries where id=${late}`)[0].status,
          'QUEUED',
        );
      }
    },
  );
  await check(
    'bau dealer bankruptcy and disabled dealer penalty use the same safe episode rules',
    async () => {
      for (const enabled of [true, false]) {
        const s = await setup({ dealerMinimum: 100, penaltyDealer: enabled });
        await s.balance(s.owner, 300);
        const entry = await s.song(s.owner),
          r = (await s.start()).round;
        // Find a committed seed with a triple; fixture-only seed injection occurs before any bet.
        let secret, d;
        for (let i = 0; i < 1000; i++) {
          secret = createHash('sha256')
            .update('triple' + i)
            .digest('hex');
          d = (await sql`select private.bau_dice(${r.id}::uuid,${secret}) d`)[0].d;
          if (new Set(d).size === 1) break;
        }
        await sql`update private.bau_seeds set seed=${secret} where round_id=${r.id}`;
        await sql`update public.bau_cua_rounds set commitment=${createHash('sha256').update(secret).digest('hex')} where id=${r.id}`;
        await s.cmd(
          s.users[1],
          { action: 'bet', round: r.id, symbol: symbols[d[0]], amount: 100 },
          s.table,
        );
        const before = (await s.read()).wallet.total + (await s.read(s.users[1])).wallet.total;
        const v = await s.finish();
        assert.equal(v.wallet.total, 0);
        assert.equal(v.wallet.reserved, 0);
        assert.equal((await s.read(s.users[1])).wallet.total, before);
        assert.equal(v.penalties.length, enabled ? 1 : 0);
        assert.equal(
          (await sql`select status from public.queue_entries where id=${entry}`)[0].status,
          enabled ? 'REMOVED' : 'QUEUED',
        );
      }
    },
  );
  await check(
    'bau concurrent tables respect global reserves and apply bankruptcy once after last escrow',
    async () => {
      const s = await setup(),
        u = s.users[1];
      await s.balance(u, 200);
      await s.song(u);
      const other = (await s.cmd(s.owner, { action: 'create', name: 'Bàn thứ hai' })).table.id;
      await s.cmd(u, { action: 'join', spectator: false }, other);
      await s.cmd(s.owner, { action: 'volunteer' }, other);
      const r1 = (await s.start()).round,
        r2 = (await s.cmd(s.owner, { action: 'start' }, other)).round;
      await Promise.all(
        [r1, r2].map(async (r, i) =>
          s.cmd(
            u,
            { action: 'bet', round: r.id, symbol: await s.losing(await s.dice(r.id)), amount: 100 },
            i ? other : s.table,
          ),
        ),
      );
      assert.equal((await s.read(u)).wallet.reserved, 200);
      await assert.rejects(
        s.cmd(u, { action: 'bet', round: r1.id, symbol: 'BAU', amount: 100 }, s.table),
        /BAU_INSUFFICIENT_COINS/,
      );
      assert.equal((await s.finish()).penalties.length, 0);
      assert.equal((await s.read(u)).wallet.total, 100);
      const last = await s.finish(other);
      assert.equal(last.penalties.length, 1);
      assert.equal((await s.read(u)).wallet.total, 0);
      await Promise.all([s.read(u, s.table), s.read(u, other)]);
      assert.equal((await s.read(u)).penalties.length, 1);
    },
  );
  await check(
    'bau dealer controls enforce minimum time, fallback, rotation and requested pause',
    async () => {
      const s = await setup({ dealerRounds: 1 }),
        r = (await s.start()).round;
      await assert.rejects(s.cmd(s.owner, { action: 'reveal' }, s.table), /BAU_PHASE/);
      await sql`update public.bau_cua_rounds set deadline=now() where id=${r.id}`;
      let v = await s.read(s.owner, s.table);
      assert.equal(v.table.status, 'BETTING_LOCKED');
      assert.equal(v.round.revealed_seed, null);
      await assert.rejects(s.cmd(s.owner, { action: 'shake' }, s.table), /BAU_PHASE/);
      await sql`update public.bau_cua_rounds set action_at=now()-interval '1 second' where id=${r.id}`;
      v = await s.cmd(s.owner, { action: 'shake' }, s.table);
      assert.equal(v.table.status, 'SHAKING');
      await assert.rejects(s.cmd(s.users[1], { action: 'reveal' }, s.table), /PERMISSION_DENIED/);
      await s.cmd(s.owner, { action: 'pause' }, s.table);
      await sql`update public.bau_cua_rounds set action_at=now()-interval '1 second' where id=${r.id}`;
      v = await s.cmd(s.owner, { action: 'reveal' }, s.table);
      assert.equal(v.table.status, 'REVEALING');
      await assert.rejects(
        s.cmd(s.owner, { action: 'cancel', reason: 'Không được hủy sau công bố' }, s.table),
        /BAU_PHASE/,
      );
      await s.cmd(s.users[1], { action: 'volunteer' }, s.table);
      v = await s.finish();
      assert.equal(v.table.status, 'PAUSED');
      assert.equal(v.round.status, 'RESULT');
      await s.cmd(s.owner, { action: 'resume' }, s.table);
      v = await s.read(s.owner, s.table);
      assert.equal(v.table.dealer_id, s.users[1]);
      await sql`update public.bau_cua_table_members set online_until=now()-interval '1 minute' where table_id=${s.table} and user_id=${s.users[1]}`;
      await s.cmd(s.users[2], { action: 'volunteer' }, s.table);
      v = await s.read(s.owner, s.table);
      assert.equal(v.table.dealer_id, s.users[2]);
    },
  );
  await check(
    'bau settings, bans, private history/RLS and channels cannot be bypassed',
    async () => {
      const s = await setup({ publishHistory: false, capacity: 4 });
      await s.start();
      await s.finish();
      await s.start();
      await s.finish();
      assert.equal((await s.read(s.users[1], s.table)).history.length, 0);
      await sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claim.sub',${s.users[1]},true)`;
        assert.equal(
          (await tx`select * from public.bau_cua_rounds where table_id=${s.table}`).length,
          1,
        );
        assert.equal(
          (await tx`select private.bau_topic_allowed(${'bau:' + s.table}) ok`)[0].ok,
          true,
        );
        assert.equal(
          (await tx`select private.bau_topic_allowed('bau:not-a-uuid') ok`)[0].ok,
          false,
        );
      });
      const key = randomUUID();
      await s.cmd(s.users[1], { action: 'reaction', emoji: '👏' }, s.table, key);
      await s.cmd(s.owner, { action: 'kick', user: s.users[1], ban: true }, s.table);
      await assert.rejects(
        s.cmd(s.users[1], { action: 'reaction', emoji: '👏' }, s.table, key),
        /PERMISSION_DENIED/,
      );
      await sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claim.sub',${s.users[1]},true)`;
        assert.equal(
          (await tx`select private.bau_topic_allowed(${'bau:' + s.table}) ok`)[0].ok,
          false,
        );
      });
      await assert.rejects(
        s.cmd(s.users[2], { action: 'settings', settings: s.settings, confirmed: true }),
        /PERMISSION_DENIED/,
      );
      await s.cmd(s.owner, {
        action: 'settings',
        settings: { ...s.settings, enabled: false },
        confirmed: true,
      });
      await assert.rejects(
        s.cmd(s.users[2], { action: 'create', name: 'Bàn không được phép' }),
        /BAU_DISABLED/,
      );
    },
  );
  await check(
    'bau outbox survives broadcast failure and retries without leaking wallet/seed',
    async () => {
      const s = await setup();
      await sql.unsafe(
        `create or replace function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language plpgsql as $$begin raise exception 'fixture unavailable'; end $$`,
      );
      try {
        await s.start();
        assert.ok((await s.read(s.owner, s.table)).diagnostics.pendingEvents > 0);
      } finally {
        await sql.unsafe(
          `create or replace function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$insert into realtime.messages(extension,topic,payload) values('broadcast',topic,payload)$$`,
        );
      }
      const v = await s.read(s.owner, s.table);
      assert.equal(v.diagnostics.pendingEvents, 0);
      const messages =
        await sql`select payload from realtime.messages where topic=${'bau:' + s.table}`;
      assert.ok(messages.length > 0);
      for (const { payload } of messages) {
        assert.ok(payload.id);
        assert.ok(payload.table);
        for (const k of ['seed', 'balance', 'wallet', 'dice']) assert.equal(payload[k], undefined);
      }
      await s.finish();
    },
  );
  await check(
    'bau user deletion refunds unrevealed or settles revealed escrow before cascade',
    async () => {
      for (const revealed of [false, true]) {
        const s = await setup(),
          u = s.users[1],
          r = (await s.start()).round;
        await s.cmd(u, { action: 'bet', round: r.id, symbol: 'CUA', amount: 100 }, s.table);
        if (revealed) {
          await sql`update public.bau_cua_rounds set status='REVEALING',dice=private.bau_dice(id,${seed}),revealed_seed=${seed},deadline=now()+interval '10 seconds' where id=${r.id}`;
        }
        await sql`delete from auth.users where id=${u}`;
        const v = await s.read(s.owner, s.table);
        assert.equal(v.round.status, revealed ? 'RESULT' : 'CANCELLED');
        assert.equal(v.wallet.reserved, 0);
        assert.ok(v.diagnostics.walletConsistent);
      }
    },
  );
  await check(
    'bau concurrent queue reorder/removal never changes playing song or penalizes future songs',
    async () => {
      for (const op of ['reorder', 'remove']) {
        const s = await setup(),
          u = s.users[1];
        await s.balance(u, 100);
        const older = await s.song(u, 'QUEUED', 100),
          newest = await s.song(u, 'QUEUED', 101),
          other = await s.song(s.users[2], 'QUEUED', 102),
          playing = await s.song(s.owner, 'PLAYING', 103);
        await sql`update public.queue_entries set requested_at=now()-interval '1 minute' where id=${older}`;
        await sql`update public.room_settings set queue_mode='MANUAL' where room_id=${s.room.id}`;
        const r = (await s.start()).round;
        await s.cmd(
          u,
          { action: 'bet', round: r.id, symbol: await s.losing(await s.dice(r.id)), amount: 100 },
          s.table,
        );
        const version = Number(
          (await sql`select version from public.rooms where id=${s.room.id}`)[0].version,
        );
        const body =
          op === 'reorder'
            ? { action: 'reorder', ids: [other, newest, older], version }
            : { action: 'remove', entry_id: newest };
        const results = await Promise.allSettled([
          s.finish(),
          sql`select public.room_command(${s.owner}::uuid,${s.room.id}::uuid,${randomUUID()}::uuid,${sql.json(body)})`,
        ]);
        assert.equal(results[0].status, 'fulfilled');
        if (results[1].status === 'rejected')
          assert.match(results[1].reason.message, /STALE_VERSION|NOT_FOUND|INVALID_STATE/);
        const view = await s.read(u, s.table);
        assert.equal(view.penalties.length, 1);
        assert.equal(view.penalties[0].songs.length, 1);
        assert.equal(
          (await sql`select status from public.queue_entries where id=${playing}`)[0].status,
          'PLAYING',
        );
        assert.equal(
          (await sql`select status from public.queue_entries where id=${other}`)[0].status,
          'QUEUED',
        );
      }
    },
  );
  await check(
    'bau settings validate playable chips and enforce limits, undo, room privacy and moderator scope',
    async () => {
      const s = await setup({
        minBet: 100,
        maxBet: 500,
        playerLimit: 500,
        tableLimit: 1000,
        customStake: false,
        undoBet: false,
        penaltyAnnounce: false,
      });
      await assert.rejects(
        s.cmd(s.owner, {
          action: 'settings',
          settings: {
            ...s.settings,
            minBet: 2000,
            maxBet: 3000,
            playerLimit: 3000,
            tableLimit: 4000,
          },
          confirmed: true,
        }),
        /PERMISSION_DENIED/,
      );
      await sql`update public.room_members set role='moderator' where room_id=${s.room.id} and user_id=${s.users[2]}`;
      await assert.rejects(s.cmd(s.users[2], { action: 'pause' }, s.table), /PERMISSION_DENIED/);
      const u = s.users[1];
      await s.balance(u, 100);
      const r = (await s.start()).round;
      await assert.rejects(
        s.cmd(u, { action: 'bet', round: r.id, symbol: 'BAU', amount: 200 }, s.table),
        /BAU_BET_LIMIT/,
      );
      await s.cmd(
        u,
        { action: 'bet', round: r.id, symbol: await s.losing(await s.dice(r.id)), amount: 100 },
        s.table,
      );
      await assert.rejects(
        s.cmd(
          u,
          { action: 'undo', round: r.id, symbol: await s.losing(await s.dice(r.id)) },
          s.table,
        ),
        /BAU_BET_CLOSED/,
      );
      await s.finish();
      assert.equal((await s.read(s.users[3], s.table)).penalties.length, 0);
      assert.equal((await s.read(u, s.table)).penalties.length, 1);
      await s.cmd(s.owner, {
        action: 'settings',
        settings: { ...s.settings, moderatorManage: true },
        confirmed: true,
      });
      await s.cmd(s.users[2], { action: 'pause' }, s.table);
      assert.equal((await s.read(s.users[2], s.table)).table.status, 'PAUSED');
    },
  );
  await check(
    'bau disconnected dealer completes escrow then pauses until an owner resumes',
    async () => {
      const s = await setup({ disconnectPolicy: 'PAUSE', autoNext: true });
      await s.cmd(s.users[2], { action: 'volunteer' }, s.table);
      const r = (await s.start()).round;
      await s.cmd(s.users[1], { action: 'bet', round: r.id, symbol: 'CUA', amount: 100 }, s.table);
      await sql`update public.bau_cua_table_members set online_until=now()-interval '1 minute' where table_id=${s.table} and user_id=${s.owner}`;
      await sql`update public.bau_cua_rounds set deadline=now()-interval '60 seconds' where id=${r.id}`;
      const v = await s.read(s.users[1], s.table);
      assert.equal(v.table.status, 'PAUSED');
      assert.equal(v.round.status, 'RESULT');
      assert.equal(v.table.dealer_id, null);
      assert.equal(v.wallet.reserved, 0);
      assert.ok(v.diagnostics.walletConsistent);
      await assert.rejects(s.cmd(s.users[1], { action: 'resume' }, s.table), /PERMISSION_DENIED/);
      await s.cmd(s.owner, { action: 'resume' }, s.table);
      assert.equal((await s.read(s.users[1], s.table)).table.dealer_id, s.users[2]);
    },
  );
  await check('bau cross-room concurrent bets share one wallet and cannot overspend', async () => {
    const a = await setup(),
      b = await setup(),
      user = a.users[1];
    await sql`select public.join_room(${user}::uuid,${b.room.code},'Bạn chung','')`;
    await b.cmd(user, { action: 'join', spectator: false }, b.table);
    await a.balance(user, 100);
    const [ra, rb] = await Promise.all([a.start(), b.start()]);
    const results = await Promise.allSettled([
      a.cmd(user, { action: 'bet', round: ra.round.id, symbol: 'CUA', amount: 100 }, a.table),
      b.cmd(user, { action: 'bet', round: rb.round.id, symbol: 'TOM', amount: 100 }, b.table),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.match(
      results.find((r) => r.status === 'rejected').reason.message,
      /BAU_INSUFFICIENT_COINS/,
    );
    const before = (await a.read(user)).wallet;
    assert.equal(before.available, 0);
    assert.equal(before.reserved, 100);
    await Promise.all([a.finish(), b.finish()]);
    const [wa, wb] = await Promise.all([a.read(user), b.read(user)]);
    assert.deepEqual(wa.wallet, wb.wallet);
    assert.equal(wa.wallet.reserved, 0);
    assert.ok(wa.diagnostics.walletConsistent);
  });
  await check(
    'bau restore includes playing/preparing songs in queue limits and is atomic on rejection',
    async () => {
      for (const activeStatus of ['PLAYING', 'PREPARING']) {
        const s = await setup(),
          user = s.users[1];
        await s.balance(user, 100);
        const song = await s.song(user, 'QUEUED');
        const r = (await s.start()).round;
        await s.cmd(
          user,
          { action: 'bet', round: r.id, symbol: await s.losing(await s.dice(r.id)), amount: 100 },
          s.table,
        );
        const v = await s.finish(),
          penalty = v.penalties[0].id;
        await s.song(user, activeStatus, 200);
        const restore = () => s.cmd(s.owner, { action: 'restore', penalty, entry: song });
        await sql`update public.room_settings set max_queue=1 where room_id=${s.room.id}`;
        await assert.rejects(restore(), /QUEUE_FULL/);
        await sql`update public.room_settings set max_queue=100,max_per_member=1 where room_id=${s.room.id}`;
        await assert.rejects(restore(), /QUEUE_FULL/);
        assert.equal(
          (await sql`select status from public.queue_entries where id=${song}`)[0].status,
          'REMOVED',
        );
        assert.equal(
          (
            await sql`select restored from public.bau_cua_penalty_songs where penalty_id=${penalty}`
          )[0].restored,
          false,
        );
        await sql`update public.room_settings set max_per_member=5 where room_id=${s.room.id}`;
        await restore();
        assert.equal(
          (await sql`select status from public.queue_entries where id=${song}`)[0].status,
          'QUEUED',
        );
        await assert.rejects(restore(), /BAU_RESTORE_UNAVAILABLE/);
      }
    },
  );
  await check(
    'bau raw RLS matches optional moderator access and private penalty visibility',
    async () => {
      const s = await setup({ spectators: false, penaltyAnnounce: false, publishHistory: false });
      const moderator = s.users[2],
        user = s.users[1];
      await sql`update public.room_members set role='moderator' where room_id=${s.room.id} and user_id=${moderator}`;
      await s.cmd(moderator, { action: 'leave' }, s.table);
      await s.balance(user, 100);
      const r = (await s.start()).round;
      await s.cmd(
        user,
        { action: 'bet', round: r.id, symbol: await s.losing(await s.dice(r.id)), amount: 100 },
        s.table,
      );
      await s.finish();
      const counts = () =>
        sql.begin(async (tx) => {
          await tx.unsafe('set local role authenticated');
          await tx`select set_config('request.jwt.claim.sub',${moderator},true)`;
          return {
            tables: (await tx`select id from public.bau_cua_tables where id=${s.table}`).length,
            penalties: (
              await tx`select id from public.bau_cua_penalty_executions where room_id=${s.room.id}`
            ).length,
            channel: (await tx`select private.bau_topic_allowed(${'bau:' + s.table}) ok`)[0].ok,
          };
        });
      const notices = async (user) =>
        (await sql`select public.bau_cua_notices(${user}::uuid,${s.room.id}::uuid) r`)[0].r;
      assert.equal((await notices(moderator)).length, 0);
      assert.equal((await notices(s.owner)).length, 0);
      assert.equal((await notices(user)).length, 1);
      const outsider = randomUUID();
      await sql`insert into auth.users(id) values(${outsider})`;
      await assert.rejects(notices(outsider), /PERMISSION_DENIED/);
      await sql`select public.join_room(${outsider}::uuid,${s.room.code},'Chỉ nghe nhạc','')`;
      assert.equal((await notices(outsider)).length, 0);
      assert.equal(
        (await sql`select user_id from public.coin_wallets where user_id=${outsider}`).length,
        0,
      );
      await sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        assert.equal(
          (
            await tx`select has_function_privilege('authenticated','public.bau_cua_notices(uuid,uuid)','execute') ok`
          )[0].ok,
          false,
        );
      });
      assert.deepEqual(await counts(), { tables: 0, penalties: 0, channel: false });
      await assert.rejects(s.read(moderator, s.table), /PERMISSION_DENIED/);
      await s.cmd(s.owner, {
        action: 'settings',
        settings: { ...s.settings, moderatorRestore: true },
        confirmed: true,
      });
      assert.deepEqual(await counts(), { tables: 0, penalties: 1, channel: false });
      // Moderators can inspect private penalty history but only the affected user gets a toast.
      assert.equal((await notices(moderator)).length, 0);
      await s.cmd(s.owner, {
        action: 'settings',
        settings: { ...s.settings, moderatorManage: true },
        confirmed: true,
      });
      assert.deepEqual(await counts(), { tables: 1, penalties: 1, channel: true });
      await s.start();
      const v = await s.read(user, s.table);
      assert.equal(v.history.length, 0);
      assert.ok(v.events.every((event) => !event.round_id || event.round_id === v.round.id));
    },
  );
  await check(
    'bau economy settings enforce bounds, disabled bonuses and one-time initial grants',
    async () => {
      const s = await setup(),
        original = (await s.read()).economy;
      const change = (economy) =>
        s.cmd(s.owner, { action: 'economy', economy, reason: 'Kiểm tra cấu hình coin' });
      try {
        for (const override of [
          { initial: 99 },
          { reliefHours: 0 },
          { dailyAmount: 1.5 },
          { timezone: 'Invalid/Zone' },
        ])
          await assert.rejects(change({ ...original, ...override }), /INVALID_INPUT/);
        await assert.rejects(
          s.cmd(s.users[1], {
            action: 'economy',
            economy: original,
            reason: 'Không có quyền quản trị',
          }),
          /PERMISSION_DENIED/,
        );
        await change({ ...original, initial: 12345, dailyEnabled: false, reliefEnabled: false });
        const user = randomUUID();
        await sql`insert into auth.users(id) values(${user})`;
        await sql`select public.join_room(${user}::uuid,${s.room.code},'Ví mới','')`;
        assert.equal((await s.read(user)).wallet.total, 12345);
        assert.equal((await s.read(s.users[1])).wallet.total, original.initial);
        await assert.rejects(s.cmd(user, { action: 'daily' }), /BAU_BONUS_UNAVAILABLE/);
        await s.balance(user, 0);
        await assert.rejects(s.cmd(user, { action: 'relief' }), /BAU_BONUS_UNAVAILABLE/);
        await change({ ...original, reliefThreshold: 200, reliefAmount: 1234, reliefHours: 1 });
        await s.balance(user, 200);
        await assert.rejects(s.cmd(user, { action: 'relief' }), /BAU_BONUS_UNAVAILABLE/);
        await s.balance(user, 199);
        assert.equal((await s.cmd(user, { action: 'relief' })).wallet.total, 1433);
        await s.balance(user, 0);
        await assert.rejects(s.cmd(user, { action: 'relief' }), /BAU_BONUS_UNAVAILABLE/);
      } finally {
        await change(original);
      }
    },
  );
  await check(
    'bau small-room concurrent read/bet load conserves ledger without duplicate settlement',
    async () => {
      const s = await setup(),
        r = (await s.start()).round;
      const started = performance.now();
      await Promise.all(
        Array.from({ length: 24 }, (_, i) =>
          s.cmd(
            s.users[1 + (i % 3)],
            { action: 'bet', round: r.id, symbol: symbols[i % 6], amount: 100 },
            s.table,
          ),
        ),
      );
      await Promise.all(Array.from({ length: 32 }, (_, i) => s.read(s.users[i % 4], s.table)));
      const elapsed = Math.round(performance.now() - started);
      assert.equal((await s.read(s.owner, s.table)).round.stake_total, 2400);
      await s.finish();
      for (const u of s.users) assert.ok((await s.read(u)).diagnostics.walletConsistent);
      console.log(`  load: 24 concurrent bets + 32 reads, ${elapsed}ms locally (not a hosted SLA)`);
    },
  );
}
