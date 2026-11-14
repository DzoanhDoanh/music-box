import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { verifyDeviceListening, verifyRoomSettings } from './test-listening-browser.mjs';
import { verifyRoomReturn } from './test-return-browser.mjs';
import { verifyReorderHosted } from './test-reorder-hosted.mjs';

// Explicit, opt-in integration check against a freshly configured hosted project.
// Creates only run-owned test accounts/rooms; cleans up those exact IDs in finally.
const env = parseEnv(await readFile(new URL('../.dev.vars', import.meta.url), 'utf8'));
const project = process.argv[process.argv.indexOf('--project-ref') + 1];
if (
  !process.argv.includes('--project-ref') ||
  new URL(env.SUPABASE_URL).hostname !== `${project}.supabase.co`
)
  throw new Error('Pass --project-ref matching the configured hosted project.');
const explicitBase = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : undefined;
const base = explicitBase ?? 'http://127.0.0.1:5173';
const browserCheck = process.argv.includes('--browser');
const hostRecoveryCheck = process.argv.includes('--host-recovery');
if (hostRecoveryCheck && !browserCheck) throw new Error('--host-recovery requires --browser.');
const settingsBrowserCheck = process.argv.includes('--settings-browser');
const returnBrowserCheck = process.argv.includes('--return-browser');
const reorderCheck = process.argv.includes('--reorder');
const chatCheck = process.argv.includes('--chat');
const publicCheck = !['localhost', '127.0.0.1'].includes(new URL(base).hostname);
if (
  publicCheck &&
  (new URL(base).protocol !== 'https:' || new URL(base).origin !== new URL(env.APP_BASE_URL).origin)
)
  throw new Error('Public checks require --base-url matching the configured HTTPS APP_BASE_URL.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
const owner = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
const member = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
const outsider = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
const users = [],
  rooms = [],
  checks = [];
let failed = false;
function checked(result, label) {
  if (result.error)
    throw new Error(`${label} failed (${result.error.code ?? result.error.status ?? 'upstream'})`);
  return result.data;
}
function pass(label) {
  checks.push(label);
  console.log(`PASS ${label}`);
}
async function api(session, path, body, expected = body ? 200 : 200) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
      Origin: new URL(base).origin,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    expected,
    `${path}: HTTP ${response.status} (${data.error?.code ?? 'unexpected'})`,
  );
  return data;
}
async function waitUntil(condition, label) {
  const deadline = Date.now() + 12000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
function subscribe(channel, denied = false) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('Realtime subscription timed out'));
    }, 12000);
    channel.subscribe((status, error) => {
      if (settled || !['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) return;
      settled = true;
      clearTimeout(timer);
      if ((denied && status === 'CHANNEL_ERROR') || (!denied && status === 'SUBSCRIBED'))
        resolve({ status, reason: error?.message ?? '' });
      else {
        const detail = String(error?.message ?? '').replace(
          /sb_(?:secret|publishable)_[\w-]+|eyJ[\w.-]+|AIza[\w-]+/g,
          '[redacted]',
        );
        reject(new Error(`Unexpected Realtime status: ${status}; ${detail}`));
      }
    });
  });
}
try {
  const publicChannel = outsider.channel(`roomtune-config-check:${randomUUID()}`);
  const publicResult = await subscribe(publicChannel, true);
  assert.match(publicResult.reason, /private/i);
  await outsider.removeChannel(publicChannel);
  pass('Public channels rejected by hosted Realtime private-only setting');
  const email = `roomtune-check-${randomUUID()}@example.invalid`;
  const password = `${randomUUID()}Aa9!`;
  const created = checked(
    await service.auth.admin.createUser({ email, password, email_confirm: true }),
    'Create temporary owner',
  );
  users.push(created.user.id);
  checked(
    await service.from('system_admins').insert({ user_id: created.user.id }),
    'Temporary administrator',
  );
  const ownerSession = checked(
    await owner.auth.signInWithPassword({ email, password }),
    'Password login',
  ).session;
  const memberSession = checked(await member.auth.signInAnonymously(), 'Anonymous login').session;
  users.push(memberSession.user.id);
  const outsiderSession = checked(
    await outsider.auth.signInAnonymously(),
    'Second anonymous login',
  ).session;
  users.push(outsiderSession.user.id);
  pass('Hosted email/password and anonymous Auth');
  const room = await api(
    ownerSession,
    '/rooms',
    {
      name: `Kiểm thử kết nối ${randomUUID().slice(0, 8)}`,
      description: 'Phòng kiểm thử tự động; sẽ được dọn sau khi chạy.',
      pin: '1234',
    },
    201,
  );
  rooms.push(room.id);
  await api(memberSession, '/rooms/join', {
    code: room.code,
    name: 'Kiểm thử kết nối',
    pin: '1234',
  });
  const snapshotPath = `/rooms/${room.id}/snapshot`;
  const commandsPath = `/rooms/${room.id}/commands`;
  const snapshot = await api(memberSession, snapshotPath);
  assert.equal(snapshot.role, 'member');
  assert.equal(snapshot.members.length, 2);
  pass('Create room, PIN join and authenticated snapshot through Hono Worker');
  await api(outsiderSession, snapshotPath, undefined, 403);
  const deniedRows = checked(
    await outsider.from('rooms').select('id').eq('id', room.id),
    'RLS read',
  );
  assert.equal(deniedRows.length, 0);
  const directRpc = await member.rpc('room_snapshot', {
    p_actor: created.user.id,
    p_room: room.id,
  });
  assert.ok(directRpc.error);
  pass('Non-member API/RLS denial and service-only RPC protection');
  const versions = [],
    chatEvents = [];
  const channel = member
    .channel(`room:${room.id}`, {
      config: { private: true, presence: { key: memberSession.user.id } },
    })
    .on('broadcast', { event: 'room.updated' }, ({ payload }) => versions.push(payload.version))
    .on('broadcast', { event: 'chat.updated' }, ({ payload }) => chatEvents.push(payload))
    .on('presence', { event: 'sync' }, () => {});
  await subscribe(channel);
  assert.equal(await channel.track({ online_at: new Date().toISOString() }), 'ok');
  await waitUntil(() => Object.keys(channel.presenceState()).length > 0, 'Presence sync');
  const outsiderChannel = outsider.channel(`room:${room.id}`, { config: { private: true } });
  await subscribe(outsiderChannel, true);
  await outsider.removeChannel(outsiderChannel);
  pass('Private Realtime subscription, Presence and outsider rejection');
  if (chatCheck) {
    const path = `/rooms/${room.id}/chat`;
    const original = await api(ownerSession, snapshotPath);
    const first = await api(memberSession, path, { action: 'send', body: 'Tin kiểm thử chat 🎵' });
    await waitUntil(() => chatEvents.length > 0, 'Private chat invalidation');
    // Hosted Realtime adds a transport id to the empty application payload.
    assert.ok(Object.keys(chatEvents[0]).every((key) => key === 'id'));
    if (chatEvents[0].id) assert.match(chatEvents[0].id, /^[0-9a-f-]{36}$/i);
    let chat = await api(ownerSession, `${path}?since=0`);
    assert.equal(chat.messages[0].sender_id, memberSession.user.id);
    assert.equal(chat.unread_count, 1);
    await api(outsiderSession, path, undefined, 403);
    await api(outsiderSession, path, { action: 'send', body: 'not permitted' }, 403);
    const forged = await member.rpc('room_chat', {
      p_actor: ownerSession.user.id,
      p_room: room.id,
      p_since: 0,
    });
    assert.ok(forged.error);
    const ownExport = await api(memberSession, '/export');
    assert.equal(
      ownExport.chat_messages.filter((m) => m.body === 'Tin kiểm thử chat 🎵').length,
      1,
    );
    await api(ownerSession, path, { action: 'remove', message_id: first.id });
    await waitUntil(() => chatEvents.length >= 2, 'Chat deletion invalidation');
    chat = await api(memberSession, path);
    assert.equal(chat.messages[0].deleted, true);
    assert.equal(chat.messages[0].body, '');
    assert.equal((await api(memberSession, '/export')).chat_messages.length, 0);
    const after = await api(ownerSession, snapshotPath);
    assert.equal(after.version, original.version);
    assert.deepEqual(after.playback, original.playback);
    assert.deepEqual(after.queue, original.queue);
    pass(
      'Hosted chat: private empty Broadcast, sender identity, outsider/RPC denial, unread, deletion, export and unchanged playback/queue',
    );
  }
  const videoId = browserCheck ? 'sIKGC2VX63I' : 'jNQXAC9IVRw';
  await api(memberSession, commandsPath, { action: 'enqueue', video_id: videoId });
  const enqueued = await api(memberSession, snapshotPath);
  assert.equal(enqueued.queue.length, 1);
  assert.equal(enqueued.queue[0].youtube_video_id, videoId);
  await api(memberSession, commandsPath, {
    action: 'vote',
    entry_id: enqueued.queue[0].id,
    enabled: true,
  });
  const voted = await api(ownerSession, snapshotPath);
  assert.equal(voted.queue[0].vote_count, 1);
  await waitUntil(() => versions.includes(voted.version), 'Committed version broadcast');
  pass('Real YouTube metadata, enqueue, vote and committed version Broadcast');
  const search = await api(
    memberSession,
    `/youtube/search?room=${room.id}&q=${encodeURIComponent('YouTube Audio Library')}`,
  );
  assert.ok(Array.isArray(search.items));
  assert.ok(search.items.length > 0);
  pass('Live YouTube search through authenticated backend');
  const controller = randomUUID();
  const claimed = await api(ownerSession, commandsPath, {
    action: 'claim',
    controller_id: controller,
  });
  assert.ok(claimed.playback.fence > 0);
  await api(memberSession, commandsPath, { action: 'claim', controller_id: randomUUID() }, 403);
  const savedSettings = Object.fromEntries(
    Object.entries(snapshot.settings).filter(([key]) => !['room_id', 'updated_at'].includes(key)),
  );
  const settingsCommand = {
    action: 'settings',
    name: room.name,
    description: room.description,
    settings: { ...savedSettings, playback_mode: 'ALL_DEVICES' },
  };
  assert.equal(savedSettings.playback_mode, 'HOST_ONLY');
  await api(memberSession, commandsPath, settingsCommand, 403);
  await api(ownerSession, commandsPath, settingsCommand);
  const allDevices = await api(memberSession, snapshotPath);
  assert.equal(allDevices.settings.playback_mode, 'ALL_DEVICES');
  assert.ok(Number.isFinite(Date.parse(allDevices.server_time)));
  const playing = await api(ownerSession, commandsPath, {
    action: 'play',
    controller_id: controller,
    fence: claimed.playback.fence,
    run_id: null,
  });
  const heartbeat = await api(ownerSession, commandsPath, {
    action: 'heartbeat',
    controller_id: controller,
    fence: claimed.playback.fence,
    run_id: playing.playback.run_id,
    position: 5,
  });
  await waitUntil(
    () => versions.includes(heartbeat.version),
    'Device listening heartbeat broadcast',
  );
  const seek = {
    action: 'seek',
    controller_id: controller,
    fence: claimed.playback.fence,
    run_id: playing.playback.run_id,
    position: 8,
  };
  await api(memberSession, commandsPath, seek, 403);
  await api(ownerSession, commandsPath, seek);
  assert.equal((await api(memberSession, snapshotPath)).playback.position, 8);
  await api(ownerSession, commandsPath, { ...settingsCommand, settings: savedSettings });
  assert.equal((await api(memberSession, snapshotPath)).settings.playback_mode, 'HOST_ONLY');
  pass('Device listening settings, owner permissions, heartbeat Broadcast and host seek');
  await api(ownerSession, commandsPath, {
    action: 'release',
    controller_id: controller,
    fence: claimed.playback.fence,
  });
  pass('Host claim/release and member playback permission denial');
  if (returnBrowserCheck) {
    await verifyRoomReturn({ base, supabaseUrl: env.SUPABASE_URL, memberSession, room });
    pass(
      'Desktop/mobile re-entry after leaving, reopening the browser, and following an invitation retains the same identity without joining again',
    );
  }
  if (settingsBrowserCheck) {
    await verifyRoomSettings({
      base,
      supabaseUrl: env.SUPABASE_URL,
      ownerSession,
      roomId: room.id,
    });
    assert.equal((await api(ownerSession, snapshotPath)).settings.playback_mode, 'HOST_ONLY');
    pass('Desktop/mobile settings forms save both playback modes from real snapshots');
  }
  if (browserCheck) {
    await api(ownerSession, commandsPath, settingsCommand);
    let chatRoom;
    if (chatCheck) {
      chatRoom = await api(
        ownerSession,
        '/rooms',
        {
          name: `Chat riêng lượt thử ${randomUUID().slice(0, 8)}`,
          description: 'Phòng kiểm thử chat đa phòng; sẽ được dọn.',
          pin: '1234',
        },
        201,
      );
      rooms.push(chatRoom.id);
      await api(memberSession, '/rooms/join', {
        code: chatRoom.code,
        name: 'Kiểm thử kết nối',
        pin: '1234',
      });
    }
    await verifyDeviceListening({
      base,
      supabaseUrl: env.SUPABASE_URL,
      ownerSession,
      memberSession,
      roomId: room.id,
      roomName: room.name,
      chatRoom,
      chat: chatCheck,
      hostRecovery: hostRecoveryCheck,
      readSnapshot: () => api(ownerSession, snapshotPath),
      verifyMemberCannotClaim: async () => {
        await api(
          memberSession,
          commandsPath,
          { action: 'claim', controller_id: randomUUID() },
          403,
        );
      },
    });
    const afterLeave = await api(ownerSession, snapshotPath);
    assert.equal(afterLeave.playback.state, 'WAITING_FOR_HOST');
    pass(
      'Two real YouTube IFrames advance through hosted Auth renewal, follow pause/resume, and cleanly leave',
    );
    if (hostRecoveryCheck)
      pass(
        'Host browser closes without release; after lease expiry a second authorized browser explicitly claims the same song/checkpoint, listener resumes the same IFrame, and ordinary member claim remains denied',
      );
    if (chatCheck)
      pass(
        'Desktop/mobile floating chat exchanges and deletion, including another joined room, synchronize without navigation or listening commands while both real YouTube IFrames keep playing',
      );
  }
  if (reorderCheck) {
    await verifyReorderHosted({
      api,
      ownerSession,
      memberSession,
      outsiderSession,
      room,
      savedSettings,
      videoId,
      base,
      supabaseUrl: env.SUPABASE_URL,
      member,
    });
    pass(
      'Hosted consent: authenticated presence, minimum two approvals, manual bypass denial, atomic move, desktop/mobile proposal and vote, disable restores direct ordering',
    );
  }
  await api(ownerSession, commandsPath, { action: 'kick', user_id: memberSession.user.id });
  await api(memberSession, snapshotPath, undefined, 403);
  if (chatCheck) {
    await api(memberSession, `/rooms/${room.id}/chat`, undefined, 403);
    await api(memberSession, `/rooms/${room.id}/chat`, { action: 'send', body: 'revoked' }, 403);
  }
  await member.removeChannel(channel);
  const revoked = member.channel(`room:${room.id}`, { config: { private: true } });
  await subscribe(revoked, true);
  await member.removeChannel(revoked);
  pass('Membership revocation blocks API and private channel reconnect');
} catch (error) {
  failed = true;
  console.error(`FAIL ${error.message}`);
} finally {
  for (const client of [owner, member, outsider]) {
    await client.removeAllChannels();
    client.auth.stopAutoRefresh();
  }
  let cleaned = true;
  for (const id of rooms) {
    const { error } = await service.from('rooms').delete().eq('id', id);
    if (error) {
      cleaned = false;
      console.error(`Cleanup room failed (${error.code})`);
    }
  }
  for (const id of users) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) {
      cleaned = false;
      console.error(`Cleanup test account failed (${error.code})`);
    }
  }
  if (cleaned) pass('Run-owned test rooms/accounts cleaned up');
  else failed = true;
  await writeFile(
    new URL(publicCheck ? '../docs/PUBLIC_CHECK.md' : '../docs/HOSTED_CHECK.md', import.meta.url),
    [
      '# Kiểm tra kết nối hosted',
      '',
      `Thời điểm UTC: ${new Date().toISOString()}`,
      `URL kiểm tra: ${new URL(base).origin}`,
      '',
      `Kết quả: ${failed ? 'CHƯA ĐẠT' : 'PASS'} — ${checks.length} bước đạt.`,
      '',
      ...checks.map((label) => `- PASS: ${label}`),
      '',
      `${publicCheck ? 'API được gọi qua HTTPS public đã cấu hình' : 'Worker được gọi qua địa chỉ local'}; Auth, PostgreSQL, Realtime WebSocket và YouTube API dùng dịch vụ thật. Tài khoản/phòng kiểm thử thuộc lượt chạy được dọn; cache metadata/tìm kiếm thật và bộ đếm quota vẫn được giữ đúng chính sách.`,
      '',
      browserCheck
        ? 'IFrame thật được thử bằng các browser contexts headless độc lập, âm thanh hệ thống tắt trong kiểm thử. Ép mốc expires_at của phiên kiểm thử để SDK gia hạn qua Auth thật; không thay TTL/cấu hình hosted hoặc chờ JWT hết hạn tự nhiên. Cả host và listener giữ cùng identity/IFrame, thời gian tăng và không có pause event trong cửa sổ gia hạn. Chưa xác nhận âm thanh trên hai thiết bị vật lý, quảng cáo, CAPTCHA, 30 trình duyệt đồng thời hoặc Cloudflare deployment. Không chứa key hoặc token.'
        : 'Không xác minh âm thanh/IFrame/autoplay/quảng cáo, CAPTCHA, 30 trình duyệt đồng thời hoặc Cloudflare deployment. Không chứa key hoặc token.',
      '',
    ].join('\n'),
  );
  process.exitCode = failed ? 1 : 0;
}
