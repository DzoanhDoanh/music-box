import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testTarot({ sql, owner, users, check }) {
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
  async function fixture() {
    const room = (
      await sql`select public.create_room(${owner}::uuid,'Tarot thử','','',${randomUUID()}::uuid) r`
    )[0].r;
    await sql`select public.join_room(${member}::uuid,${room.code},'Bạn thử','')`;
    await presence(owner, room.id);
    await presence(member, room.id);
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
