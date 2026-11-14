import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/server/index';

const actor = '10000000-0000-4000-8000-000000000001';
const room = '20000000-0000-4000-8000-000000000001';
const entry = '30000000-0000-4000-8000-000000000001';
const key = '40000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
  SUPABASE_SECRET_KEY: 'fixture-secret',
  YOUTUBE_API_KEY: '',
  APP_BASE_URL: 'http://localhost',
};
let calls: { path: string; body: Record<string, unknown> }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === '/auth/v1/user') return Response.json({ id: actor });
      const body = JSON.parse(String(init?.body));
      calls.push({ path, body });
      if (path.endsWith('/consume_rate_limit')) return Response.json(true);
      if (path.endsWith('/room_presence')) return Response.json({ online_count: 2 });
      if (path.endsWith('/room_command')) return Response.json({ version: 3, playback: {} });
      throw new Error(`Unexpected upstream ${path}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
const post = (path: string, body: unknown) =>
  app.request(
    `/api/v1/rooms/${room}/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer user-token',
        'Idempotency-Key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    env,
  );
describe('presence and consent API boundary', () => {
  it('uses verified identity for leases and passes only the validated session and sequence', async () => {
    const response = await post('presence', { session_id: key, sequence: 2, online: true });
    expect(response.status).toBe(200);
    expect(calls.find((c) => c.path.endsWith('/room_presence'))?.body).toEqual({
      p_actor: actor,
      p_room: room,
      p_session: key,
      p_sequence: 2,
      p_online: true,
    });
    expect(await response.json()).toEqual({ online_count: 2 });
  });
  it.each([
    { session_id: key, sequence: 1, online: true, p_actor: entry },
    { session_id: key, sequence: 0, online: true },
    { session_id: key, sequence: 1.5, online: true },
    { session_id: key, sequence: 1, online: 'true' },
  ])('rejects forged or invalid presence payload %j', async (body) => {
    expect((await post('presence', body)).status).toBe(400);
    expect(calls.some((c) => c.path.endsWith('/room_presence'))).toBe(false);
  });
  it.each([
    { action: 'reorder.propose', entry_id: entry, position: 1, queue_ids: [key, entry] },
    { action: 'reorder.vote', proposal_id: key, approved: true },
    { action: 'reorder.cancel', proposal_id: key },
  ])('dispatches %s with verified actor and durable receipt key', async (body) => {
    const response = await post('commands', body);
    expect(response.status).toBe(200);
    expect(calls.find((c) => c.path.endsWith('/room_command'))?.body).toEqual({
      p_actor: actor,
      p_room: room,
      p_request: key,
      p_command: body,
    });
    expect(await response.text()).not.toContain(env.SUPABASE_SECRET_KEY);
  });
  it.each([
    {
      action: 'reorder.propose',
      entry_id: entry,
      position: 1,
      queue_ids: [key, entry],
      electorate: [actor],
    },
    { action: 'reorder.propose', entry_id: entry, position: 0, queue_ids: [key, entry] },
    { action: 'reorder.propose', entry_id: entry, position: 2.5, queue_ids: [key, entry] },
    { action: 'reorder.vote', proposal_id: key, approved: 'yes' },
    { action: 'reorder.vote', proposal_id: key, approved: true, required_votes: 1 },
  ])('rejects client-defined quorum or invalid move %j', async (body) => {
    expect((await post('commands', body)).status).toBe(400);
    expect(calls.some((c) => c.path.endsWith('/room_command'))).toBe(false);
  });
});
