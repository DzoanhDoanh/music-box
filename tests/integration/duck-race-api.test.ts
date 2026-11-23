import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/server/index';
import {
  defaultRaceConfig,
  defaultDuckRoomSettings,
  type Race,
} from '../../src/shared/duck-race/contracts';
import { buildPlan } from '../../src/shared/duck-race/engine';
import { commitment, lockedHash } from '../../src/shared/duck-race/fairness';
const actor = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
const room = '20000000-0000-4000-8000-000000000001',
  id = '30000000-0000-4000-8000-000000000001';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public-fixture',
  SUPABASE_SECRET_KEY: 'server-fixture',
  YOUTUBE_API_KEY: '',
  APP_BASE_URL: 'http://localhost',
  ENABLE_DUCK_RACE: 'true',
};
let state: Race,
  calls: string[],
  denied = false,
  owner = true;
const seed = 'ab'.repeat(32);
beforeEach(async () => {
  calls = [];
  denied = false;
  owner = true;
  state = {
    id,
    roomId: room,
    name: 'API',
    host: actor,
    config: defaultRaceConfig,
    version: 2,
    status: 'LOBBY',
    entries: [actor, other].map((userId, i) => ({
      id: userId,
      userId,
      songId: null,
      name: 'Duck ' + i,
      skin: 'YELLOW',
      team: '',
      ready: true,
    })),
    banned: [],
    lobbyClosed: false,
    createdAt: 0,
    startAt: null,
    commitment: await commitment(id, seed),
    lockedHash: null,
    algorithm: 1,
    seed: null,
    results: [],
    frames: [],
    round: 1,
    seriesId: id,
    previousId: null,
    songReward: 'NONE',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === '/auth/v1/user') return Response.json({ id: actor });
      calls.push(path);
      if (path.endsWith('/consume_rate_limit')) return Response.json(true);
      if (denied) return Response.json({ message: 'PERMISSION_DENIED' }, { status: 400 });
      const body = JSON.parse(String(init?.body));
      const context = async (race: Race) => ({
        race,
        seed,
        plan: race.startAt === null ? null : await buildPlan(race, seed),
        serverNow: 12000,
        receipt: false,
        members: [
          { id: actor, name: 'A', role: owner ? 'owner' : 'member' },
          { id: other, name: 'B', role: 'member' },
        ],
        songs: [],
      });
      if (path.endsWith('/duck_race_context')) return Response.json(await context(state));
      if (path.endsWith('/duck_race_commit')) {
        state = body.p_state;
        return Response.json(await context(state));
      }
      if (path.endsWith('/duck_race_list'))
        return Response.json({
          serverNow: 12000,
          settings: defaultDuckRoomSettings,
          race: null,
          races: [],
          rounds: [],
          standings: [],
          leaderboard: [],
          presets: [],
        });
      throw new Error('Unexpected RPC ' + path);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function request(body?: unknown, headers: Record<string, string> = {}, flags = env) {
  return app.request(
    `/api/v1/rooms/${room}/duck-race/${id}`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer fixture',
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    flags,
  );
}
describe('Duck Race trusted HTTP boundary', () => {
  it('updates custom configuration and entries atomically, rejecting capacity overflow', async () => {
    const entries = [
      { name: 'Phở', skin: 'YELLOW', team: '' },
      { name: 'Bún', skin: 'WHITE', team: '' },
    ];
    const body = {
      action: 'configure',
      name: 'Meals',
      config: { ...defaultRaceConfig, mode: 'CUSTOM', capacity: 2 },
      entries,
      songs: [],
    };
    expect((await request(body)).status).toBe(200);
    expect(state.entries.map((e) => e.name)).toEqual(['Phở', 'Bún']);
    const before = structuredClone(state);
    expect(
      (
        await request({
          ...body,
          name: 'Overflow',
          entries: [...entries, { name: 'Cơm', skin: 'KING', team: '' }],
        })
      ).status,
    ).toBe(400);
    expect(state).toEqual(before);
  });
  it('requires authenticated, enabled, same-origin access and a valid request key', async () => {
    expect((await request(undefined, { Authorization: '' })).status).toBe(401);
    expect((await request(undefined, {}, { ...env, ENABLE_DUCK_RACE: 'false' })).status).toBe(404);
    expect((await request({ action: 'start' }, { Origin: 'https://evil.invalid' })).status).toBe(
      403,
    );
    expect((await request({ action: 'start' }, { 'Idempotency-Key': '' })).status).toBe(400);
    expect(calls.filter((p) => p.endsWith('/duck_race_commit'))).toHaveLength(0);
  });
  it('rejects seed, result, identity and reward injection before the RPC boundary', async () => {
    for (const body of [
      { action: 'start', seed },
      { action: 'start', results: [] },
      { action: 'join', skin: 'YELLOW', userId: other },
      { action: 'finalize' },
      { action: 'reaction', emoji: '<script>' },
      {
        action: 'configure',
        name: 'A',
        config: {
          ...defaultRaceConfig,
          rewards: { ...defaultRaceConfig.rewards, winner: 1000000 },
        },
      },
    ])
      expect((await request(body)).status).toBe(400);
    expect(calls.some((p) => p.endsWith('/duck_race_commit'))).toBe(false);
  });
  it('locks authoritative entries; never exposes secrets or future segments', async () => {
    const started = await request({ action: 'start' });
    expect(started.status).toBe(200);
    const body = await started.json();
    expect(body.race.seed).toBe(null);
    expect(body.race.results).toEqual([]);
    expect(body.race.frames.every((f: { at: number }) => f.at === 0)).toBe(true);
    state.startAt = 1000;
    state.lockedHash = await lockedHash(state);
    const race = (await (await request()).json()).race;
    expect(race.frames.every((f: { at: number }) => f.at <= 11000)).toBe(true);
    expect(race.seed).toBe(null);
    expect(race.results).toEqual([]);
    expect((await request({ action: 'cancel' })).status).toBe(409);
  });
  it('a transferred, non-owner host cannot start a race that pays coin rewards', async () => {
    owner = false;
    state.config = {
      ...defaultRaceConfig,
      rewards: { ...defaultRaceConfig.rewards, enabled: true, winner: 500 },
    };
    const started = await request({ action: 'start' });
    expect(started.status).toBe(200);
    expect(state.status).toBe('COUNTDOWN');
    expect(state.config.rewards.enabled).toBe(false);
  });
  it('the room owner keeps the configured rewards when starting', async () => {
    state.config = {
      ...defaultRaceConfig,
      rewards: { ...defaultRaceConfig.rewards, enabled: true, winner: 500 },
    };
    expect((await request({ action: 'start' })).status).toBe(200);
    expect(state.config.rewards.enabled).toBe(true);
  });
  it('denies host controls to members and hides cross-room snapshots', async () => {
    owner = false;
    state.host = other;
    expect((await request({ action: 'start' })).status).toBe(403);
    denied = true;
    expect((await request()).status).toBe(403);
  });
});
