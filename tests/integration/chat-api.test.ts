import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/server/index';

const actor = '10000000-0000-4000-8000-000000000001';
const room = '20000000-0000-4000-8000-000000000001';
const key = '30000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
  SUPABASE_SECRET_KEY: 'fixture-secret',
  YOUTUBE_API_KEY: '',
  APP_BASE_URL: 'http://localhost',
};
let calls: { path: string; body: Record<string, unknown> }[];
let denial = false;
beforeEach(() => {
  calls = [];
  denial = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === '/auth/v1/user') return Response.json({ id: actor });
      if (path.endsWith('/room_members')) return Response.json({ role: 'member' });
      const body = JSON.parse(String(init?.body));
      calls.push({ path, body });
      if (path.endsWith('/consume_rate_limit')) return Response.json(true);
      if (path.endsWith('/room_chat') || path.endsWith('/room_chat_command'))
        return denial
          ? Response.json({ message: 'PERMISSION_DENIED' }, { status: 400 })
          : Response.json({ messages: [], latest_sequence: 0, unread_count: 0, read_sequence: 0 });
      throw new Error(`Unexpected upstream ${path}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
const request = (body?: unknown, query = '', receipt = key) =>
  app.request(
    `/api/v1/rooms/${room}/chat${query}`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer fixture',
        'Content-Type': 'application/json',
        'Idempotency-Key': receipt,
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    env,
  );
describe('room chat API', () => {
  it('dispatches with verified identity and a trimmed body', async () => {
    expect((await request({ action: 'send', body: ' Chào cả phòng! ' })).status).toBe(200);
    expect(calls.find((call) => call.path.endsWith('/room_chat_command'))?.body).toEqual({
      p_actor: actor,
      p_room: room,
      p_request: key,
      p_command: { action: 'send', body: 'Chào cả phòng!' },
    });
  });
  it('reads using the validated cursor and maps membership denial', async () => {
    expect((await request(undefined, '?since=42')).status).toBe(200);
    expect(calls.find((call) => call.path.endsWith('/room_chat'))?.body).toEqual({
      p_actor: actor,
      p_room: room,
      p_since: 42,
    });
    denial = true;
    expect((await request()).status).toBe(403);
    expect((await request({ action: 'remove', message_id: key })).status).toBe(403);
  });
  it.each(['-1', 'NaN', '0.5', '9007199254740992'])('rejects invalid cursor %s', async (cursor) => {
    expect((await request(undefined, `?since=${cursor}`)).status).toBe(400);
    expect(calls.some((c) => c.path.endsWith('/room_chat'))).toBe(false);
  });
  it.each([
    { action: 'send', body: '  ' },
    { action: 'send', body: 'a'.repeat(1001) },
    { action: 'send', body: '\0' },
    { action: 'send', body: 'hi', sender_id: key },
    { action: 'send', body: 1 },
    { action: 'remove', message_id: 'invalid' },
    { action: 'remove', message_id: key, room_id: actor },
  ])('rejects invalid/forged message %j', async (body) => {
    expect((await request(body)).status).toBe(400);
    expect(calls.some((c) => c.path.endsWith('/room_chat_command'))).toBe(false);
  });
  it('requires authentication and receipt keys', async () => {
    expect((await app.request(`/api/v1/rooms/${room}/chat`, {}, env)).status).toBe(401);
    expect((await request({ action: 'send', body: 'hi' }, '', '')).status).toBe(400);
  });
});
