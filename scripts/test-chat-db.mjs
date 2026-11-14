import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testChat({ sql, owner, check }) {
  const users = Array.from({ length: 3 }, () => randomUUID());
  for (const id of users) await sql`insert into auth.users(id) values(${id})`;
  const room = (
    await sql`select public.create_room(${owner}::uuid,'Chat fixture','','',${randomUUID()}::uuid) r`
  )[0].r;
  for (const user of users.slice(0, 2))
    await sql`select public.join_room(${user}::uuid,${room.code},'Chat member','')`;
  const read = async (actor, since = 0) =>
    (await sql`select public.room_chat(${actor}::uuid,${room.id}::uuid,${since}::bigint) r`)[0].r;
  const send = async (actor, body, key = randomUUID()) =>
    (
      await sql`select public.room_chat_command(${actor}::uuid,${room.id}::uuid,${key}::uuid,${sql.json(body)}::jsonb) r`
    )[0].r;
  const snapshot = async () =>
    (await sql`select public.room_snapshot(${owner}::uuid,${room.id}::uuid) r`)[0].r;
  const before = await snapshot();
  let first;
  await check('chat membership, ban and direct RPC boundaries', async () => {
    await assert.rejects(read(users[2]), /PERMISSION_DENIED/);
    await assert.rejects(send(users[2], { action: 'send', body: 'outside' }), /PERMISSION_DENIED/);
    await sql`insert into public.bans(room_id,user_id) values(${room.id},${users[1]})`;
    await assert.rejects(read(users[1]), /PERMISSION_DENIED/);
    await assert.rejects(send(users[1], { action: 'send', body: 'banned' }), /PERMISSION_DENIED/);
    await sql`delete from public.bans where room_id=${room.id} and user_id=${users[1]}`;
    for (const role of ['anon', 'authenticated']) {
      const permissions = (
        await sql`select has_function_privilege(${role},'public.room_chat(uuid,uuid,bigint)','execute') r,
        has_function_privilege(${role},'public.room_chat_command(uuid,uuid,uuid,jsonb)','execute') w,
        has_function_privilege(${role},'public.chat_export(uuid,integer)','execute') e,
        has_table_privilege(${role},'private.chat_messages','select') t`
      )[0];
      assert.deepEqual(permissions, { r: false, w: false, e: false, t: false });
    }
  });
  await check(
    'chat concurrent retries create exactly one message without changing playback',
    async () => {
      const key = randomUUID();
      const command = { action: 'send', body: '<script>alert(1)</script> Xin chào 🎵' };
      const results = await Promise.all(
        Array.from({ length: 5 }, () => send(users[0], command, key)),
      );
      assert.ok(results.every((r) => r.id === results[0].id));
      first = results[0];
      assert.equal((await read(owner)).messages.length, 1);
      assert.equal((await read(owner)).messages[0].body, command.body);
      assert.equal((await read(owner)).messages[0].sender_id, users[0]);
      await assert.rejects(
        send(users[0], { ...command, body: 'changed' }, key),
        /IDEMPOTENCY_CONFLICT/,
      );
      const after = await snapshot();
      assert.equal(after.version, before.version);
      assert.deepEqual(after.playback, before.playback);
      assert.deepEqual(after.queue, before.queue);
    },
  );
  await check('chat validates size and blank text and counts unread only from others', async () => {
    for (const body of ['', ' \n\t', 'x'.repeat(1001), 3])
      await assert.rejects(send(users[0], { action: 'send', body }), /INVALID_INPUT/);
    await send(owner, { action: 'send', body: 'x'.repeat(1000) });
    assert.equal((await read(users[0])).unread_count, 1);
    assert.equal((await read(users[0], 2)).unread_count, 0);
    await assert.rejects(read(owner, -1), /INVALID_INPUT/);
  });
  await check('chat deletion checks author or manager and erases receipt plaintext', async () => {
    await assert.rejects(
      send(users[1], { action: 'remove', message_id: first.id }),
      /PERMISSION_DENIED/,
    );
    await send(users[0], { action: 'remove', message_id: first.id });
    const deleted = (await read(owner)).messages[0];
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.body, '');
    assert.equal((await read(owner)).unread_count, 0);
    const receipts =
      await sql`select payload::text body from private.operation_receipts where actor=${users[0]}`;
    assert.ok(receipts.every((r) => !r.body.includes('Xin chào')));
    const other = await send(users[1], { action: 'send', body: 'moderation' });
    await send(owner, { action: 'remove', message_id: other.id });
    const foreignRoom = (
      await sql`select public.create_room(${owner}::uuid,'Other chat','','',${randomUUID()}::uuid) r`
    )[0].r;
    await assert.rejects(
      sql`select public.room_chat_command(${owner}::uuid,${foreignRoom.id}::uuid,${randomUUID()}::uuid,${sql.json({ action: 'remove', message_id: other.id })}::jsonb)`,
      /NOT_FOUND/,
    );
    await sql`update public.room_members set role='moderator' where room_id=${room.id} and user_id=${users[1]}`;
    const moderate = await send(owner, { action: 'send', body: 'moderator removes' });
    await send(users[1], { action: 'remove', message_id: moderate.id });
  });
  await check('chat receipt replay requires current membership', async () => {
    const key = randomUUID(),
      body = { action: 'send', body: 'before kick' };
    await send(users[0], body, key);
    await sql`delete from public.room_members where room_id=${room.id} and user_id=${users[0]}`;
    await assert.rejects(send(users[0], body, key), /PERMISSION_DENIED/);
    await assert.rejects(read(users[0]), /PERMISSION_DENIED/);
    await sql`select public.join_room(${users[0]}::uuid,${room.code},'Chat member','')`;
  });
  await check(
    'chat enforces 20 sends per minute but permits receipt replay at the limit',
    async () => {
      await sql`delete from private.rate_limits where key=${`chat:${room.id}:${users[0]}`}`;
      const key = randomUUID(),
        body = { action: 'send', body: 'rate receipt' };
      await send(users[0], body, key);
      await Promise.all(
        Array.from({ length: 19 }, (_, i) =>
          send(users[0], { action: 'send', body: `concurrent ${i}` }),
        ),
      );
      await assert.rejects(send(users[0], { action: 'send', body: 'over limit' }), /RATE_LIMITED/);
      await send(users[0], body, key);
      const state = await read(owner);
      assert.equal(new Set(state.messages.map((m) => m.sequence)).size, state.messages.length);
    },
  );
  await check(
    'chat keeps last 100 messages in order and excludes expired/deleted text from export',
    async () => {
      await sql`insert into private.chat_messages(room_id,sender_id,sequence,body) select ${room.id},${owner},100+i,'history '||i from generate_series(1,110) i`;
      await sql`update public.rooms set chat_sequence=210 where id=${room.id}`;
      await sql`update private.chat_messages set created_at=now()-interval '31 days' where room_id=${room.id} and sequence=210`;
      const state = await read(users[0]);
      assert.equal(state.messages.length, 100);
      assert.equal(state.messages[0].sequence, 110);
      assert.equal(state.messages.at(-1).sequence, 209);
      const exported = (await sql`select public.chat_export(${owner}::uuid,0) r`)[0].r;
      assert.ok(
        exported.every(
          (m) => m.body !== '' && m.body !== 'history 110' && m.body !== 'moderator removes',
        ),
      );
      await sql`select public.maintenance_cleanup()`;
      assert.equal(
        (
          await sql`select count(*)::int n from private.chat_messages where room_id=${room.id} and sequence=210`
        )[0].n,
        0,
      );
    },
  );
  await check('chat account and room deletion cascade only their messages', async () => {
    await sql`delete from auth.users where id=${users[0]}`;
    assert.equal(
      (await sql`select count(*)::int n from private.chat_messages where sender_id=${users[0]}`)[0]
        .n,
      0,
    );
    assert.ok((await read(owner)).messages.length > 0);
    await sql`delete from public.rooms where id=${room.id}`;
    assert.equal(
      (await sql`select count(*)::int n from private.chat_messages where room_id=${room.id}`)[0].n,
      0,
    );
  });
}
