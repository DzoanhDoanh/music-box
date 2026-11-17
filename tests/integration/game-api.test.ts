import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { app } from '../../src/server/index';
import { createInitialGameState, transition } from '../../src/shared/game/engine';
import { defaultRules, type GameCommand, type GameSnapshot } from '../../src/shared/game/contracts';
import { secureDice } from '../../src/server/services/game';

const actor = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
const room = '20000000-0000-4000-8000-000000000001',
  game = '30000000-0000-4000-8000-000000000001';
const key = '40000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
  SUPABASE_SECRET_KEY: 'fixture-secret',
  YOUTUBE_API_KEY: '',
  APP_BASE_URL: 'http://localhost',
  ENABLE_LUDO: 'true',
};
let state: GameSnapshot,
  denied = false,
  receipt: GameSnapshot | null = null;
let calls: { path: string; body: Record<string, unknown> }[];
beforeEach(() => {
  let s = createInitialGameState(game, room, actor, 'Bàn thử', 'A');
  s = transition(s, other, 'B', false, { action: 'join', color: 1, version: s.version }, 0);
  for (const id of [actor, other])
    s = transition(
      s,
      id,
      id === actor ? 'A' : 'B',
      false,
      { action: 'ready', ready: true, version: s.version },
      0,
    );
  s = transition(s, actor, 'A', false, { action: 'start', version: s.version }, Date.now());
  state = { state: s, serverNow: Date.now(), spectators: [], results: [] };
  calls = [];
  denied = false;
  receipt = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === '/auth/v1/user') return Response.json({ id: actor });
      const body = JSON.parse(String(init?.body));
      calls.push({ path, body });
      if (path.endsWith('/consume_rate_limit')) return Response.json(true);
      if (denied) return Response.json({ message: 'PERMISSION_DENIED' }, { status: 400 });
      if (path.endsWith('/game_context'))
        return Response.json(
          receipt
            ? { receipt }
            : {
                snapshot: state,
                members: [
                  { id: actor, name: 'A', role: 'member' },
                  { id: other, name: 'B', role: 'member' },
                ],
              },
        );
      if (path.endsWith('/game_commit')) return Response.json({ ...state, state: body.p_state });
      if (path.endsWith('/game_create')) return Response.json({ ...state, state: body.p_state });
      if (path.endsWith('/game_list')) return Response.json([state.state]);
      if (path.endsWith('/game_watch')) return Response.json(state);
      if (path.endsWith('/game_delete') || path.endsWith('/room_delete'))
        return Response.json({ deleted: true });
      throw new Error('Unexpected upstream ' + path);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const request = (body?: unknown, suffix = '/' + game, settings = env) =>
  app.request(
    `/api/v1/rooms/${room}/games${suffix}`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer fixture',
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    settings,
  );
describe('trusted game API', () => {
  it('changes only the authenticated player skin and rejects forged targets and unknown skins before committing', async () => {
    state.state.phase = 'MOVE';
    state.state.dice = 6;
    const before = structuredClone(state.state);
    const response = await request({ action: 'skin', skin: 'CAT', version: before.version });
    expect(response.status).toBe(200);
    const result = ((await response.json()) as GameSnapshot).state;
    expect(result.players[0].skin).toBe('CAT');
    expect(result.players[1]).toEqual(before.players[1]);
    expect(result.deadline).toBe(before.deadline);
    expect(result.dice).toBe(6);
    expect(result.turn).toBe(before.turn);
    for (const invalid of [
      { action: 'skin', skin: 'DOG', user_id: other },
      { action: 'skin', skin: 'url' },
    ]) {
      calls = [];
      expect((await request({ ...invalid, version: before.version })).status).toBe(400);
      expect(calls.some((c) => c.path.endsWith('/game_commit'))).toBe(false);
    }
    const created = await request({ name: 'Hình quân', rules: before.rules, skin: 'ROCKET' }, '');
    expect(created.status).toBe(201);
    expect(((await created.json()) as GameSnapshot).state.players[0].skin).toBe('ROCKET');
  });
  it('chooses the automatic jump server-side when only a horse is submitted, then falls back to a counted capture', async () => {
    state.state.phase = 'MOVE';
    state.state.dice = 1;
    state.state.players[0].pieces[0] = 13;
    state.state.players[1].pieces[0] = 0;
    const body = { action: 'move', version: state.state.version, piece: 0 };
    const jump = await request(body);
    expect(jump.status).toBe(200);
    expect(((await jump.json()) as GameSnapshot).state.last).toMatchObject({
      to: 27,
      moveKind: 'JUMP',
    });
    expect((await request({ ...body, moveKind: 'STEP' })).status).toBe(409);
    state.state.players[1].pieces[1] = 1;
    const step = await request(body);
    expect(step.status).toBe(200);
    const result = ((await step.json()) as GameSnapshot).state;
    expect(result.last).toMatchObject({ to: 15, moveKind: 'STEP', captures: [other + ':1'] });
    expect(result.players[1].pieces).toEqual([0, -1, -1, -1]);
    expect((await request({ ...body, moveKind: 'JUMP' })).status).toBe(409);
  });
  it('safe starts allow passage but reject foreign landing and a second spawn without committing', async () => {
    state.state.phase = 'MOVE';
    state.state.dice = 1;
    state.state.players[0].pieces[0] = 13;
    const body = { action: 'move', version: state.state.version, piece: 0, moveKind: 'STEP' };
    for (const occupied of [false, true]) {
      state.state.players[1].pieces[0] = occupied ? 0 : -1;
      calls = [];
      expect((await request(body)).status).toBe(409);
      expect(calls.some((c) => c.path.endsWith('/game_commit'))).toBe(false);
    }
    state.state.dice = 2;
    const response = await request(body);
    expect(response.status).toBe(200);
    const result = (await response.json()) as GameSnapshot;
    expect(result.state.players[0].pieces[0]).toBe(16);
    expect(result.state.players[1].pieces[0]).toBe(0);
    expect(result.state.last.captures).toEqual([]);
    state.state.players[0].pieces = [-1, 0, -1, -1];
    state.state.dice = 6;
    calls = [];
    expect((await request(body)).status).toBe(409);
    expect(calls.some((c) => c.path.endsWith('/game_commit'))).toBe(false);
  });

  it('validates deletion confirmation and routes verified identity, scope and receipt to SQL', async () => {
    expect((await request({ name: 'Bàn thử' }, '/' + game + '/delete')).status).toBe(200);
    expect(calls.find((c) => c.path.endsWith('/game_delete'))?.body).toEqual({
      p_actor: actor,
      p_room: room,
      p_game: game,
      p_request: key,
      p_name: 'Bàn thử',
    });
    expect((await request({ name: 'Bàn thử', actor: other }, '/' + game + '/delete')).status).toBe(
      400,
    );
    expect(
      (await request({ name: 'Bàn thử' }, '/' + game + '/delete', { ...env, ENABLE_LUDO: 'false' }))
        .status,
    ).toBe(404);
    denied = true;
    expect((await request({ name: 'Bàn thử' }, '/' + game + '/delete')).status).toBe(403);
  });
  it('room deletion uses the authenticated identity and requires a request ID', async () => {
    const result = await app.request(
      `/api/v1/rooms/${room}/delete`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer fixture',
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({ name: 'Phòng thử' }),
      },
      env,
    );
    expect(result.status).toBe(200);
    expect(calls.find((c) => c.path.endsWith('/room_delete'))?.body).toEqual({
      p_actor: actor,
      p_room: room,
      p_request: key,
      p_name: 'Phòng thử',
    });
    const invalid = await app.request(
      `/api/v1/rooms/${room}/delete`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Phòng thử' }),
      },
      env,
    );
    expect(invalid.status).toBe(400);
  });
  it('computes v2 jumps on the server and rejects them when the route is blocked', async () => {
    state.state.players[0].pieces[0] = 2;
    state.state.phase = 'MOVE';
    state.state.dice = 1;
    const body = { action: 'move', version: state.state.version, piece: 0, moveKind: 'JUMP' };
    const response = await request(body);
    expect(response.status).toBe(200);
    expect(((await response.json()) as GameSnapshot).state.players[0].pieces[0]).toBe(13);
    state.state.players[1].pieces[0] = 47;
    calls = [];
    expect((await request(body)).status).toBe(409);
    expect(calls.some((c) => c.path.endsWith('/game_commit'))).toBe(false);
  });
  it('does not call game SQL on a minute tick while the feature is disabled', async () => {
    await worker.scheduled({ cron: '* * * * *' }, { ...env, ENABLE_LUDO: undefined });
    expect(calls).toEqual([]);
  });
  it('is disabled by default, including snapshots and commands', async () => {
    for (const suffix of ['', '/' + game])
      expect((await request(undefined, suffix, { ...env, ENABLE_LUDO: '' })).status).toBe(404);
    expect(
      (
        await request({ action: 'roll', version: state.state.version }, '/' + game, {
          ...env,
          ENABLE_LUDO: '',
        })
      ).status,
    ).toBe(404);
    expect(calls.some((c) => c.path.includes('/game_'))).toBe(false);
  });
  it('requires authentication and current membership', async () => {
    expect((await app.request(`/api/v1/rooms/${room}/games`, {}, env)).status).toBe(401);
    denied = true;
    expect((await request()).status).toBe(403);
    expect((await request({ action: 'roll', version: state.state.version })).status).toBe(403);
  });
  it.each([
    { action: 'roll', version: 4, dice: 6 },
    { action: 'roll', version: 4, actor: other },
    { action: 'move', version: 4, piece: 0, to: 57 },
    { action: 'move', version: 4, piece: 4 },
    { action: 'move', version: 4, piece: 0, moveKind: 'TELEPORT' },
    { action: 'roll', version: -1 },
    { action: 'sync', version: 4 },
    { action: 'roll', version: 4, state: {} },
  ])('rejects forged command %j before game RPC', async (body) => {
    expect((await request(body)).status).toBe(400);
    expect(calls.some((c) => c.path.includes('/game_'))).toBe(false);
  });
  it('generates a die on the trusted side and commits with verified actor/CAS', async () => {
    const version = state.state.version;
    const response = await request({ action: 'roll', version });
    expect(response.status).toBe(200);
    const result = (await response.json()) as GameSnapshot;
    expect(result.state.last.dice).toBeGreaterThanOrEqual(1);
    expect(result.state.last.dice).toBeLessThanOrEqual(6);
    expect(calls.find((c) => c.path.endsWith('/game_commit'))?.body).toMatchObject({
      p_actor: actor,
      p_room: room,
      p_game: game,
      p_request: key,
      p_version: version,
      p_command: { action: 'roll', version },
    });
  });
  it('returns the original receipt without generating another die', async () => {
    receipt = state;
    const rng = vi.spyOn(crypto, 'getRandomValues');
    expect((await request({ action: 'roll', version: 0 })).status).toBe(200);
    expect(rng).not.toHaveBeenCalled();
    expect(calls.some((c) => c.path.endsWith('/game_commit'))).toBe(false);
  });
  it('rejects stale rolls before requesting random bytes', async () => {
    const rng = vi.spyOn(crypto, 'getRandomValues');
    expect((await request({ action: 'roll', version: 0 })).status).toBe(409);
    expect(rng).not.toHaveBeenCalled();
  });
  it('rejection sampling rejects bytes 252–255 and maps all accepted residues', () => {
    for (let face = 1; face <= 6; face++) {
      const bytes = [252, 253, 254, 255, face - 1];
      vi.spyOn(crypto, 'getRandomValues').mockImplementation(
        <T extends ArrayBufferView | null>(buffer: T): T => {
          (buffer as Uint8Array)[0] = bytes.shift()!;
          return buffer;
        },
      );
      expect(secureDice()).toBe(face);
      expect(bytes).toHaveLength(0);
    }
  });
  it('watching does not run the engine and creating supplies a trusted initial state', async () => {
    expect((await request({ action: 'watch' } satisfies GameCommand)).status).toBe(200);
    expect(calls.some((c) => c.path.endsWith('/game_commit'))).toBe(false);
    expect((await request({ name: ' Bàn mới ', rules: {} }, '')).status).toBe(201);
    expect(calls.find((c) => c.path.endsWith('/game_create'))?.body).toMatchObject({
      p_actor: actor,
      p_state: { host: actor, name: 'Bàn mới', version: 0, status: 'WAITING' },
    });
  });
  it('rejects disabling automatic jumps or spawn-only squares in the fixed rule profile', async () => {
    for (const overrides of [{ jumpOnOne: false }, { safe: 'NONE' }, { movement: 'FORGED' }]) {
      const rules = { ...defaultRules, ...overrides };
      expect((await request({ name: 'Luật cố định', rules }, '')).status).toBe(400);
      expect(
        (await request({ action: 'settings', rules, version: state.state.version })).status,
      ).toBe(400);
    }
    expect(
      calls.some((c) => c.path.endsWith('/game_create') || c.path.endsWith('/game_commit')),
    ).toBe(false);
    const created = await request({ name: 'Luật cố định', rules: defaultRules }, '');
    expect(created.status).toBe(201);
    expect(calls.find((c) => c.path.endsWith('/game_create'))?.body).toMatchObject({
      p_state: { rules: defaultRules },
    });
  });
});
