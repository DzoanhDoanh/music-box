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
let gemini: { url: string; headers: Headers; body: Record<string, unknown> }[],
  geminiReply: () => Response,
  claimable: boolean;
const reading = {
  id: 'r1',
  actor,
  actor_name: 'An',
  spread: 'THREE',
  topic: 'LOVE',
  question: 'Hỏi gì?',
  cards: [
    { card: 0, reversed: false },
    { card: 23, reversed: true },
    { card: 19, reversed: false },
  ],
  created_at: '2026-11-26T00:00:00Z',
  reveal_at: '2026-11-26T00:00:04.2Z',
};
const longText = '## Mở đầu\n' + 'Một đoạn luận giải rất dài. '.repeat(10);

beforeEach(() => {
  calls = [];
  busy = false;
  gemini = [];
  claimable = true;
  geminiReply = () => Response.json({ candidates: [{ content: { parts: [{ text: longText }] } }] });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname;
      if (url.hostname === 'generativelanguage.googleapis.com') {
        gemini.push({
          url: String(input),
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body)),
        });
        return geminiReply();
      }
      if (path === '/auth/v1/user') return Response.json({ id: actor });
      if (path.endsWith('/consume_rate_limit')) return Response.json(true);
      const body = JSON.parse(String(init?.body ?? '{}'));
      calls.push({ path, body });
      if (path.endsWith('/tarot_snapshot'))
        return Response.json({ server_time: '', latest: null, recent: [], my_next_at: null });
      if (path.endsWith('/tarot_draw')) {
        if (busy) return Response.json({ message: 'TAROT_BUSY' }, { status: 400 });
        return Response.json(reading);
      }
      if (path.endsWith('/tarot_ai_claim'))
        return Response.json(claimable ? { ...reading, ai: { status: 'pending' } } : null);
      if (path.endsWith('/tarot_ai_save')) return Response.json(true);
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

describe('Tarot AI reading', () => {
  const ai = { ...env, GEMINI_API_KEY: 'gemini-fixture' };
  const saved = () => calls.find((c) => c.path.endsWith('/tarot_ai_save'));
  it('is off without a key: the draw never claims or calls Gemini', async () => {
    expect((await request(command)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.map((c) => c.path.split('/').pop())).toEqual(['tarot_draw']);
    expect(gemini).toEqual([]);
    const retry = await app.request(
      `/api/v1/rooms/${room}/tarot/30000000-0000-4000-8000-000000000001/ai`,
      { method: 'POST', headers: { Authorization: 'Bearer fixture' } },
      env,
    );
    expect(retry.status).toBe(404);
  });
  it('writes the reading after the draw and stores it for the room', async () => {
    const response = await request(command, ai);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'r1' });
    await vi.waitFor(() => expect(saved()).toBeTruthy());
    expect(calls.find((c) => c.path.endsWith('/tarot_ai_claim'))!.body).toEqual({
      p_actor: actor,
      p_room: room,
      p_reading: 'r1',
    });
    expect(saved()!.body).toEqual({
      p_room: room,
      p_reading: 'r1',
      p_ok: true,
      p_text: longText.trim(),
    });
    // The key travels in a header, never in the URL; the prompt carries the cards and question.
    expect(gemini).toHaveLength(1);
    expect(gemini[0].url).not.toContain('gemini-fixture');
    expect(gemini[0].url).toContain('/models/gemini-flash-latest:generateContent');
    expect(gemini[0].headers.get('x-goog-api-key')).toBe('gemini-fixture');
    const prompt = JSON.stringify(gemini[0].body);
    for (const text of ['Kẻ Khờ', '2 Gậy', 'NGƯỢC', 'Mặt Trời', 'Hỏi gì?', 'Tình cảm'])
      expect(prompt).toContain(text);
  });
  it('falls back to the lighter model when the main one is busy', async () => {
    let first = true;
    geminiReply = () => {
      if (!first)
        return Response.json({ candidates: [{ content: { parts: [{ text: longText }] } }] });
      first = false;
      return new Response('busy', { status: 503 });
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await request(command, ai)).status).toBe(200);
    await vi.waitFor(() => expect(saved()).toBeTruthy());
    expect(saved()!.body).toMatchObject({ p_ok: true });
    expect(gemini.map((g) => g.url.split('/models/')[1])).toEqual([
      'gemini-flash-latest:generateContent',
      'gemini-flash-lite-latest:generateContent',
    ]);
  });
  it('records a failure when Gemini errors, and only the drawer may retry', async () => {
    geminiReply = () => new Response('quota', { status: 429 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await request(command, ai)).status).toBe(200);
    await vi.waitFor(() => expect(saved()).toBeTruthy());
    expect(saved()!.body).toMatchObject({ p_ok: false, p_text: null });
    calls = [];
    geminiReply = () =>
      Response.json({ candidates: [{ content: { parts: [{ text: longText }] } }] });
    const retry = (id: string) =>
      app.request(
        `/api/v1/rooms/${room}/tarot/${id}/ai`,
        { method: 'POST', headers: { Authorization: 'Bearer fixture' } },
        ai,
      );
    expect((await retry('not-a-uuid')).status).toBe(400);
    const id = '30000000-0000-4000-8000-000000000001';
    const response = await retry(id);
    expect(await response.json()).toEqual({ started: true });
    await vi.waitFor(() => expect(saved()?.body).toMatchObject({ p_ok: true }));
    claimable = false;
    calls = [];
    gemini = [];
    expect(await (await retry(id)).json()).toEqual({ started: false });
    expect(gemini).toEqual([]);
  });
});
