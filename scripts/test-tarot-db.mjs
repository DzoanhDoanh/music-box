import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testTarot({ sql, owner, users, check }) {
  // These checks top up wallets; put the shared test users' coins back for the suites that follow.
  const people = [owner, users[0]];
  const saved =
    await sql`select user_id,available,reserved from public.coin_wallets where user_id = any(${people}::uuid[])`;
  try {
    await tarotChecks({ sql, owner, users, check });
  } finally {
    for (const id of people) {
      const before = saved.find((w) => w.user_id === id);
      if (before)
        await sql`update public.coin_wallets set available=${before.available},reserved=${before.reserved} where user_id=${id}::uuid`;
      else {
        await sql`delete from public.coin_ledger where user_id=${id}::uuid`;
        await sql`delete from private.coin_grants where user_id=${id}::uuid`;
        await sql`delete from public.coin_wallets where user_id=${id}::uuid`;
      }
    }
  }
}

async function tarotChecks({ sql, owner, users, check }) {
  const member = users[0],
    outsider = users[1];
  const read = async (actor, room) =>
    (await sql`select public.tarot_snapshot(${actor}::uuid,${room}::uuid) r`)[0].r;
  const draw = async (actor, room, body, key = randomUUID()) =>
    (
      await sql`select public.tarot_draw(${actor}::uuid,${room}::uuid,${key}::uuid,${sql.json(body)}) r`
    )[0].r;
  const presence = async (actor, room) =>
    sql`select public.room_presence(${actor}::uuid,${room}::uuid,${randomUUID()}::uuid,1,true)`;
  const three = { action: 'draw', spread: 'THREE', topic: 'LOVE', question: 'Sắp tới thế nào?' };
  const allowAgain = (room) =>
    sql`update private.tarot_readings set created_at=created_at-interval '1 minute' where room_id=${room}::uuid`;
  const coins = async (actor) =>
    (await sql`select available from public.coin_wallets where user_id=${actor}::uuid`)[0]
      ?.available;
  async function fund(actor, amount = 1_000_000) {
    await sql`select private.bau_wallet(${actor}::uuid)`;
    await sql`update public.coin_wallets set available=${amount} where user_id=${actor}::uuid`;
  }
  async function fixture() {
    const room = (
      await sql`select public.create_room(${owner}::uuid,'Tarot thử','','',${randomUUID()}::uuid) r`
    )[0].r;
    await sql`select public.join_room(${member}::uuid,${room.code},'Bạn thử','')`;
    await presence(owner, room.id);
    await presence(member, room.id);
    await fund(owner);
    await fund(member);
    return room.id;
  }

  await check(
    'tarot guards membership, presence, private storage and malformed commands',
    async () => {
      const room = await fixture();
      await assert.rejects(read(outsider, room), /PERMISSION_DENIED/);
      await assert.rejects(draw(outsider, room, three), /PERMISSION_DENIED/);
      for (const body of [
        { ...three, spread: 'CELTIC' },
        { ...three, topic: 'HEALTH' },
        { ...three, question: ' có khoảng trắng ' },
        { ...three, question: 'x'.repeat(201) },
        { ...three, question: 'a\u0007b' },
        { ...three, question: 5 },
        { ...three, cards: [0, 1, 2] },
        { ...three, spread: 'YES_NO', question: '' },
        { action: 'spin', spread: 'ONE', topic: 'GENERAL', question: '' },
      ])
        await assert.rejects(draw(owner, room, body), /INVALID_INPUT/);
      await sql`update private.room_presence set expires_at=now()-interval '1 second' where room_id=${room}::uuid and user_id=${member}::uuid`;
      await assert.rejects(draw(member, room, three), /PRESENCE_REQUIRED/);
      for (const query of [
        'select * from private.tarot_readings',
        `select public.tarot_draw('${owner}','${room}','${randomUUID()}','{}'::jsonb)`,
      ])
        await assert.rejects(
          sql.begin(async (tx) => {
            await tx.unsafe('set local role authenticated');
            await tx.unsafe(query);
          }),
          /permission denied/,
        );
    },
  );

  await check(
    'tarot draws distinct valid cards once per request and shares them with the room',
    async () => {
      const room = await fixture(),
        key = randomUUID();
      const result = await draw(member, room, three, key);
      assert.equal(result.cards.length, 3);
      assert.equal(new Set(result.cards.map((c) => c.card)).size, 3);
      for (const c of result.cards) {
        assert.ok(Number.isInteger(c.card) && c.card >= 0 && c.card < 78);
        assert.equal(typeof c.reversed, 'boolean');
      }
      assert.equal(result.actor, member);
      assert.equal(result.actor_name, 'Bạn thử');
      assert.equal(result.question, three.question);
      assert.equal(Date.parse(result.reveal_at) - Date.parse(result.created_at), 1500 + 900 * 3);
      // The same request returns the same cards; a different body under that key is refused.
      assert.deepEqual(await draw(member, room, three, key), result);
      await assert.rejects(
        draw(member, room, { ...three, topic: 'WORK' }, key),
        /IDEMPOTENCY_CONFLICT/,
      );
      const seen = await read(owner, room);
      assert.deepEqual(seen.latest, result);
      assert.equal(seen.recent.length, 1);
      assert.equal(seen.my_next_at, null);
      assert.ok((await read(member, room)).my_next_at);
      // One reading per person every 20 seconds; others in the room are not blocked.
      await assert.rejects(draw(member, room, three), /TAROT_BUSY/);
      const one = await draw(owner, room, { ...three, spread: 'ONE', question: '' });
      assert.equal(one.cards.length, 1);
      await allowAgain(room);
      const yes = await draw(member, room, { ...three, spread: 'YES_NO', question: 'Có nên đi?' });
      assert.equal(yes.cards.length, 3);
      assert.equal(Date.parse(yes.reveal_at) - Date.parse(yes.created_at), 1500 + 900 * 3);
      assert.equal((await read(owner, room)).recent.length, 3);
    },
  );

  await check('tarot draws cover the whole deck and both orientations', async () => {
    const room = await fixture();
    const cards = new Set(),
      orientations = new Set();
    for (let i = 0; i < 90; i++) {
      await allowAgain(room);
      const r = await draw(owner, room, { ...three, question: '' });
      for (const c of r.cards) {
        cards.add(c.card);
        orientations.add(c.reversed);
      }
    }
    assert.ok(cards.size > 70, `only ${cards.size} distinct cards in 270 draws`);
    assert.equal(orientations.size, 2);
    assert.equal((await read(owner, room)).recent.length, 12);
    assert.equal(
      (await sql`select count(*)::int n from private.tarot_readings where room_id=${room}::uuid`)[0]
        .n,
      90,
    );
  });

  await check('tarot AI readings are claimed by the drawer, stored once and shared', async () => {
    const room = await fixture();
    const claim = async (actor, reading) =>
      (await sql`select public.tarot_ai_claim(${actor}::uuid,${room}::uuid,${reading}::uuid) r`)[0]
        .r;
    const save = async (reading, ok, text) =>
      (await sql`select public.tarot_ai_save(${room}::uuid,${reading}::uuid,${ok},${text}) r`)[0].r;
    const version = async () =>
      (await sql`select version from public.rooms where id=${room}::uuid`)[0].version;
    const reading = await draw(member, room, three);
    await assert.rejects(claim(owner, reading.id), /PERMISSION_DENIED/);
    await assert.rejects(claim(member, randomUUID()), /NOT_FOUND/);
    const before = await version();
    const claimed = await claim(member, reading.id);
    assert.equal(claimed.id, reading.id);
    assert.equal(claimed.ai.status, 'pending');
    assert.equal(claimed.ai.attempts, 1);
    assert.ok((await version()) > before);
    // While one attempt is running nobody can start another.
    assert.equal(await claim(member, reading.id), null);
    assert.equal((await read(owner, room)).latest.ai.status, 'pending');
    await assert.rejects(save(reading.id, true, '   '), /INVALID_INPUT/);
    await assert.rejects(save(reading.id, true, 'x'.repeat(8001)), /INVALID_INPUT/);
    assert.equal(await save(reading.id, false, null), true);
    assert.equal((await read(owner, room)).latest.ai.status, 'failed');
    assert.equal(await save(reading.id, true, 'late'), false);
    // A failed reading may be retried, up to three attempts.
    assert.equal((await claim(member, reading.id)).ai.attempts, 2);
    assert.equal(
      await save(reading.id, true, '## Mở đầu' + String.fromCharCode(10) + 'Nội dung dài.'),
      true,
    );
    const seen = (await read(owner, room)).latest;
    assert.equal(seen.ai.status, 'done');
    assert.equal(seen.ai.text, '## Mở đầu' + String.fromCharCode(10) + 'Nội dung dài.');
    assert.equal(seen.ai.attempts, 2);
    assert.deepEqual(
      { ...seen, ai: undefined },
      { ...reading, ai: undefined },
      'the cards themselves never change',
    );
    assert.equal(await claim(member, reading.id), null);
    // A pending attempt that was lost (worker gone) can be claimed again after 90 seconds.
    await allowAgain(room);
    const other = await draw(member, room, three);
    await claim(member, other.id);
    assert.equal(await claim(member, other.id), null);
    await sql`update private.tarot_readings set result=jsonb_set(result,'{ai,at}',to_jsonb(now()-interval '2 minutes')) where id=${other.id}::uuid`;
    assert.equal((await claim(member, other.id)).ai.attempts, 2);
    await save(other.id, false, null);
    assert.equal((await claim(member, other.id)).ai.attempts, 3);
    await save(other.id, false, null);
    assert.equal(await claim(member, other.id), null, 'no fourth attempt');
    for (const query of [
      `select public.tarot_ai_claim('${member}','${room}','${reading.id}')`,
      `select public.tarot_ai_save('${room}','${reading.id}',true,'x')`,
    ])
      await assert.rejects(
        sql.begin(async (tx) => {
          await tx.unsafe('set local role authenticated');
          await tx.unsafe(query);
        }),
        /permission denied/,
      );
  });

  await check('tarot charges the drawer once per reading and refuses a short wallet', async () => {
    const room = await fixture();
    await fund(member, 1000);
    assert.equal((await read(member, room)).my_coins, 1000);
    const key = randomUUID();
    const first = await draw(member, room, three, key);
    assert.equal(first.cost, 500);
    assert.equal(Number(await coins(member)), 500);
    // A replay of the same request is not charged again; the others in the room pay nothing.
    await draw(member, room, three, key);
    assert.equal(Number(await coins(member)), 500);
    assert.equal(Number(await coins(owner)), 1_000_000);
    const ledger = await sql`select reason,reference,available_delta from public.coin_ledger
      where user_id=${member}::uuid and reason='TAROT_READING' and reference=${'tarot:' + first.id}`;
    assert.deepEqual(
      ledger.map((l) => [l.reference, Number(l.available_delta)]),
      [['tarot:' + first.id, -500]],
    );
    await allowAgain(room);
    const yes = await draw(member, room, { ...three, spread: 'YES_NO', question: 'Đi không?' });
    assert.equal(yes.cost, 300);
    assert.equal(Number(await coins(member)), 200);
    await allowAgain(room);
    // 200 left: three cards are refused without drawing anything, one card is fine.
    const before = (await read(owner, room)).recent.length;
    await assert.rejects(draw(member, room, three), /TAROT_INSUFFICIENT_COINS/);
    assert.equal((await read(owner, room)).recent.length, before);
    assert.equal((await draw(member, room, { ...three, spread: 'ONE' })).cost, 200);
    assert.equal(Number(await coins(member)), 0);
    assert.equal((await read(member, room)).my_coins, 0);
    // Someone who never had a wallet sees the welcome grant and receives it on first draw.
    const fresh = randomUUID();
    await sql`insert into auth.users(id,is_anonymous) values(${fresh},true)`;
    await sql`select public.join_room(${fresh}::uuid,(select code from public.rooms where id=${room}::uuid),'Mới','')`;
    await presence(fresh, room);
    const initial = (await sql`select (settings->>'initial')::bigint n from private.bau_economy`)[0]
      .n;
    assert.equal(Number((await read(fresh, room)).my_coins), Number(initial));
    await draw(fresh, room, { ...three, spread: 'ONE' });
    assert.equal(Number(await coins(fresh)), Number(initial) - 200);
  });

  await check('the room owner makes Tarot free or paid for that room only', async () => {
    const room = await fixture(),
      other = await fixture();
    const configure = async (actor, paid, target = room) =>
      (await sql`select public.tarot_configure(${actor}::uuid,${target}::uuid,${paid}) r`)[0].r;
    const view = await read(owner, room);
    assert.equal(view.paid, true);
    assert.equal(view.can_configure, true);
    assert.equal((await read(member, room)).can_configure, false);
    await assert.rejects(configure(member, false), /PERMISSION_DENIED/);
    await assert.rejects(configure(outsider, false), /PERMISSION_DENIED/);
    await assert.rejects(configure(owner, false, randomUUID()), /ROOM_NOT_FOUND/);
    const before = (await sql`select version from public.rooms where id=${room}::uuid`)[0].version;
    assert.deepEqual(await configure(owner, false), { paid: false });
    assert.ok(
      (await sql`select version from public.rooms where id=${room}::uuid`)[0].version > before,
    );
    assert.equal((await read(member, room)).paid, false);
    assert.equal((await read(member, other)).paid, true, 'other rooms keep charging');
    await fund(member, 0);
    const free = await draw(member, room, three);
    assert.equal(free.cost, 0);
    assert.equal(Number(await coins(member)), 0);
    assert.equal(
      (
        await sql`select count(*)::int n from public.coin_ledger where reference=${'tarot:' + free.id}`
      )[0].n,
      0,
    );
    await assert.rejects(draw(member, other, three), /TAROT_INSUFFICIENT_COINS/);
    const audit =
      await sql`select details from public.audit_logs where room_id=${room}::uuid and action='tarot.settings'`;
    assert.deepEqual(
      audit.map((a) => a.details),
      [{ paid: false }],
    );
    // Switching back on charges again.
    await configure(owner, true);
    await allowAgain(room);
    await assert.rejects(draw(member, room, three), /TAROT_INSUFFICIENT_COINS/);
    await assert.rejects(
      sql.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx.unsafe(`select public.tarot_configure('${owner}','${room}',false)`);
      }),
      /permission denied/,
    );
  });

  await check('concurrent tarot requests with one key commit one reading', async () => {
    const room = await fixture(),
      key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => draw(member, room, three, key)),
    );
    assert.equal(new Set(results.map((x) => x.id)).size, 1);
    assert.equal((await read(owner, room)).recent.length, 1);
    const races = await Promise.allSettled(
      Array.from({ length: 4 }, () => draw(owner, room, three)),
    );
    assert.equal(races.filter((x) => x.status === 'fulfilled').length, 1);
  });
}
