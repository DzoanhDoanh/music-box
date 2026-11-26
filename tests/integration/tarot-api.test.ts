import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/server/index';

const actor = '10000000-0000-4000-8000-000000000001';
const room = '20000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public-fixture',
  SUPABASE_SECRET_KEY: 'server-fixture',
  YOUTUBE_API_KEY: '',
  APP_BASE_URL: 'http://localhost',
  ENABLE_TAROT: 'true',
};
let calls: { path: string; body: Record<string, unknown> }[], busy: boolean;

beforeEach(() => {
  calls = [];
  busy = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === '/auth/v1/user') return Response.json({ id: actor });
      if (path.endsWith('/consume_rate_limit')) return Response.json(true);
      const body = JSON.parse(String(init?.body ?? '{}'));
      calls.push({ path, body });
      if (path.endsWith('/tarot_snapshot'))
        return Response.json({ server_time: '', latest: null, recent: [], my_next_at: null });
      if (path.endsWith('/tarot_draw')) {
        if (busy) return Response.json({ message: 'TAROT_BUSY' }, { status: 400 });
        return Response.json({ id: 'r1', cards: [{ card: 0, reversed: false }] });
      }
      throw new Error('Unexpected RPC ' + path);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function request(body?: unknown, flags: Record<string, string> = env) {
  return app.request(
    `/api/v1/rooms/${room}/tarot`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer fixture',
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    flags,
  );
}
const command = { action: 'draw', spread: 'THREE', topic: 'GENERAL', question: '  Hỏi gì?  ' };

describe('Tarot HTTP boundary', () => {
  it('is hidden unless the runtime flag is on', async () => {
    expect((await request(undefined, { ...env, ENABLE_TAROT: 'false' })).status).toBe(404);
    expect((await request(command, { ...env, ENABLE_TAROT: 'false' })).status).toBe(404);
    expect(calls).toEqual([]);
  });
  it('reads the room snapshot and forwards a trimmed command', async () => {
    expect((await request()).status).toBe(200);
    const response = await request(command);
    expect(response.status).toBe(200);
    const draw = calls.find((c) => c.path.endsWith('/tarot_draw'))!;
    expect(draw.body).toMatchObject({
      p_actor: actor,
      p_room: room,
      p_command: { ...command, question: 'Hỏi gì?' },
    });
  });
  it('rejects client-chosen cards before reaching the database', async () => {
    expect((await request({ ...command, cards: [{ card: 21, reversed: false }] })).status).toBe(
      400,
    );
    expect((await request({ ...command, spread: 'YES_NO', question: '' })).status).toBe(400);
    expect(calls).toEqual([]);
  });
  it('maps the cooldown to a conflict with a Vietnamese message', async () => {
    busy = true;
    const response = await request(command);
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toMatch(/Chờ vài giây/);
  });
});
