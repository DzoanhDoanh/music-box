import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

// Called only with the test runner's newly created room/accounts. No real user room is touched.
export async function verifyReorderHosted({
  api,
  ownerSession,
  memberSession,
  outsiderSession,
  room,
  savedSettings,
  videoId,
  base,
  supabaseUrl,
  member,
}) {
  const commandsPath = `/rooms/${room.id}/commands`;
  const snapshotPath = `/rooms/${room.id}/snapshot`;
  const presencePath = `/rooms/${room.id}/presence`;
  const set = (enabled) =>
    api(ownerSession, commandsPath, {
      action: 'settings',
      name: room.name,
      description: room.description,
      settings: {
        ...savedSettings,
        queue_mode: 'MANUAL',
        reorder_approval: enabled,
        allow_duplicates: true,
      },
    });
  const ids = (state) =>
    state.queue
      .filter((entry) => entry.status === 'QUEUED')
      .sort((a, b) => a.position - b.position)
      .map((entry) => entry.id);
  await set(true);
  await api(ownerSession, commandsPath, { action: 'enqueue', video_id: videoId });
  await api(ownerSession, commandsPath, { action: 'enqueue', video_id: videoId });
  const ownerPresence = randomUUID(),
    memberPresence = randomUUID();
  await api(ownerSession, presencePath, { session_id: ownerPresence, sequence: 1, online: true });
  await api(
    outsiderSession,
    presencePath,
    { session_id: randomUUID(), sequence: 1, online: true },
    403,
  );
  const direct = await member.rpc('room_presence', {
    p_actor: ownerSession.user.id,
    p_room: room.id,
    p_session: randomUUID(),
    p_sequence: 1,
    p_online: true,
  });
  assert.ok(direct.error);
  let state = await api(ownerSession, snapshotPath);
  const original = ids(state);
  assert.ok(original.length >= 2);
  const propose = {
    action: 'reorder.propose',
    entry_id: original.at(-1),
    position: 1,
    queue_ids: original,
  };
  const denied = await api(ownerSession, commandsPath, propose, 409);
  assert.equal(denied.error.code, 'NOT_ENOUGH_ONLINE');
  await api(memberSession, presencePath, { session_id: memberPresence, sequence: 1, online: true });
  state = await api(memberSession, snapshotPath);
  assert.equal(state.reorder.online_count, 2);
  const before = state.playback;
  await api(memberSession, commandsPath, propose);
  state = await api(ownerSession, snapshotPath);
  assert.equal(state.reorder.proposal.required_votes, 2);
  assert.equal(state.reorder.proposal.yes_votes, 1);
  assert.deepEqual(ids(state), original);
  const bypass = await api(
    ownerSession,
    commandsPath,
    { action: 'reorder', ids: original.slice().reverse(), version: state.version },
    409,
  );
  assert.equal(bypass.error.code, 'REORDER_REQUIRES_APPROVAL');
  await api(ownerSession, commandsPath, {
    action: 'reorder.vote',
    proposal_id: state.reorder.proposal.id,
    approved: true,
  });
  state = await api(memberSession, snapshotPath);
  assert.equal(state.reorder.proposal.status, 'APPLIED');
  assert.deepEqual(ids(state), [original.at(-1), ...original.slice(0, -1)]);
  assert.deepEqual(state.playback, before);
  await api(ownerSession, presencePath, { session_id: ownerPresence, sequence: 2, online: false });
  await api(memberSession, presencePath, {
    session_id: memberPresence,
    sequence: 2,
    online: false,
  });

  // Real desktop/mobile clients provide their own authenticated presence and receive committed results.
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  try {
    const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
    const open = async (session, viewport) => {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(
        ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
        { key: storageKey, value: session },
      );
      const page = await context.newPage();
      await page.goto(`${base}/room/${room.id}`);
      return page;
    };
    const ownerPage = await open(ownerSession, { width: 1440, height: 900 });
    const memberPage = await open(memberSession, { width: 390, height: 844 });
    const ownerPanel = ownerPage.getByRole('region', { name: 'Biểu quyết đổi vị trí bài' });
    const memberPanel = memberPage.getByRole('region', { name: 'Biểu quyết đổi vị trí bài' });
    await expect(ownerPanel.getByText('2 online', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(memberPanel.getByText('2 online', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    const beforeUi = await api(ownerSession, snapshotPath);
    const queueIds = ids(beforeUi);
    await memberPage
      .getByRole('button', { name: /Đề xuất vị trí cho/ })
      .last()
      .click();
    await memberPage.getByLabel('Vị trí đề xuất', { exact: true }).selectOption('1');
    await memberPage.getByRole('button', { name: 'Gửi đề xuất', exact: true }).click();
    await expect(ownerPanel).toContainText('1/2 phiếu đồng ý', { timeout: 15000 });
    await expect(memberPanel.getByRole('button', { name: 'Bạn đã đồng ý' })).toBeDisabled();
    await ownerPanel.getByRole('button', { name: 'Đồng ý', exact: true }).click();
    await expect(ownerPanel).toContainText('Đã thông qua và chuyển bài');
    await expect(memberPanel).toContainText('Đã thông qua và chuyển bài', { timeout: 15000 });
    const afterUi = await api(ownerSession, snapshotPath);
    assert.deepEqual(ids(afterUi), [queueIds.at(-1), ...queueIds.slice(0, -1)]);
    assert.deepEqual(afterUi.playback, beforeUi.playback);
    await expect(ownerPage.getByRole('button', { name: 'Đưa bài lên', exact: true })).toHaveCount(
      0,
    );
    for (const page of [ownerPage, memberPage])
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
  } finally {
    await browser.close();
    await set(false);
  }
  const disabled = await api(ownerSession, snapshotPath);
  assert.equal(disabled.settings.reorder_approval, false);
  const next = ids(disabled).reverse();
  await api(ownerSession, commandsPath, {
    action: 'reorder',
    ids: next,
    version: disabled.version,
  });
  assert.deepEqual(ids(await api(ownerSession, snapshotPath)), next);
}
