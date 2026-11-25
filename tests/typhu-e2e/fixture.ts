import type { BrowserContext } from '@playwright/test';
import { AppError } from '../../src/shared/domain';
import { cards } from '../../src/shared/ty-phu/cards';
import type { TyPhuCommand, TyPhuState } from '../../src/shared/ty-phu/contracts';
import {
  cardTargets,
  createTyPhuState,
  publicTyPhuState,
  reconcile,
  transition,
  type TyPhuRandom,
} from '../../src/shared/ty-phu/engine';

export const roomId = '10000000-0000-4000-8000-000000000001',
  me = '20000000-0000-4000-8000-000000000001',
  bot = '20000000-0000-4000-8000-000000000002';

/**
 * A fake API that runs the real rules engine in the test process. The opponent ("Bình")
 * plays automatically and never buys, so assertions stay predictable.
 */
export async function tyPhuFixture(context: BrowserContext) {
  const now = () => Date.now();
  let seed = 7;
  const nextDice: number[] = [];
  const random: TyPhuRandom = {
    die: () => nextDice.shift() ?? ((seed = (seed * 48271) % 2147483647) % 6) + 1,
    // Seat order and deck order stay as created (no swaps): the host always starts.
    index: (n) => n - 1,
  };
  let match: TyPhuState | null = null;
  /** Earlier tables (e.g. the finished game behind a rematch). */
  const older = new Map<string, TyPhuState>();
  const at = new Date().toISOString();
  const room = {
    room: {
      id: roomId,
      code: 'TYPHU001',
      name: 'Phòng tỷ phú',
      description: 'Fixture',
      owner_id: me,
      version: 1,
      created_at: at,
    },
    settings: {
      room_id: roomId,
      updated_at: at,
      queue_mode: 'FIFO',
      voting: true,
      allow_remove_own: true,
      playback_mode: 'HOST_ONLY',
      reorder_approval: false,
    },
    members: [
      { user_id: me, name: 'An', role: 'owner', joined_at: at },
      { user_id: bot, name: 'Bình', role: 'member', joined_at: at },
    ],
    queue: [],
    playback: {
      controller_id: null,
      fence: 0,
      lease_until: null,
      run_id: null,
      entry_id: null,
      state: 'IDLE',
      intent: 'PAUSED',
      position: 0,
      updated_at: at,
    },
    me,
    role: 'owner',
    version: 1,
  };
  const botCommand = (s: TyPhuState): TyPhuCommand => {
    if (s.phase === 'ROLL') return { action: 'roll' };
    if (s.phase === 'CARD' && cards[s.pending!.card!].kind === 'BAD') {
      const player = s.players.find((p) => p.id === bot)!;
      return {
        action: 'card_target',
        tile: cardTargets(s, player, s.pending!.card!)[0],
        player: me,
      };
    }
    return { action: 'skip' };
  };
  const botPlays = () => {
    for (let guard = 0; match && guard < 60; guard++) {
      if (match.status !== 'PLAYING' || match.turn !== bot) break;
      match = transition(match, bot, 'Bình', botCommand(match), now(), random);
    }
  };
  const view = () => ({ state: publicTyPhuState(match!), serverNow: now() });

  await context.addInitScript((uid) => {
    localStorage.setItem(
      'sb-roomtune-fixture-auth-token',
      JSON.stringify({
        access_token: 'fixture-access-token',
        refresh_token: 'fixture-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: uid,
          aud: 'authenticated',
          role: 'authenticated',
          is_anonymous: false,
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      }),
    );
  }, me);
  await context.routeWebSocket('**/realtime/**', (ws) => ws.close());
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    try {
      if (path === '/rooms')
        return json({ rooms: [{ role: 'owner', room: room.room }], canCreate: true });
      if (path.endsWith('/snapshot')) return json(room);
      if (path.endsWith('/chat'))
        return json({ messages: [], latest_sequence: 0, read_sequence: 0, unread_count: 0 });
      if (path.endsWith('/presence')) return json({ online_count: 2 });
      if (path === `/rooms/${roomId}/ty-phu`) {
        if (request.method() === 'GET')
          return json({
            serverNow: now(),
            matches: match
              ? [
                  {
                    id: match.id,
                    name: match.name,
                    status: match.status,
                    host: match.host,
                    players: match.players.map((p) => ({
                      id: p.id,
                      name: p.name,
                      color: p.color,
                      status: p.status,
                    })),
                    winner: match.winner,
                    createdAt: at,
                  },
                ]
              : [],
          });
        const body = request.postDataJSON();
        if (match) older.set(match.id, match);
        match = createTyPhuState(crypto.randomUUID(), roomId, me, 'An', body.name, body.rules);
        match = transition(match, bot, 'Bình', { action: 'join' }, now(), random);
        match = transition(match, bot, 'Bình', { action: 'ready', ready: true }, now(), random);
        return json(view(), 201);
      }
      const previous = older.get(path.split('/').at(-1) ?? '');
      if (previous) {
        if (request.method() === 'POST') {
          const body = request.postDataJSON();
          older.set(previous.id, transition(previous, me, 'An', body.command, now(), random));
        }
        return json({ state: publicTyPhuState(older.get(previous.id)!), serverNow: now() });
      }
      if (match && path === `/rooms/${roomId}/ty-phu/${match.id}`) {
        match = reconcile(match, now(), random);
        botPlays();
        if (request.method() === 'POST') {
          const body = request.postDataJSON();
          if (body.version !== match.version) return json({ error: { code: 'TYPHU_STALE' } }, 409);
          match = transition(match, me, 'An', body.command, now(), random);
          botPlays();
        }
        return json(view());
      }
      return json({ error: { code: 'NOT_FOUND' } }, 404);
    } catch (error) {
      if (error instanceof AppError) return json({ error: { code: error.code } }, error.status);
      throw error;
    }
  });
  return {
    get match() {
      return match;
    },
    /** Rewrites the server-side state (and bumps the version) between steps. */
    edit(change: (s: TyPhuState) => void) {
      if (!match) throw new Error('No match yet');
      const next = structuredClone(match);
      change(next);
      next.version++;
      match = next;
    },
    nextDice,
    older,
  };
}
