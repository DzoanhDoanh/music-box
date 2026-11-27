import type { BrowserContext } from '@playwright/test';
import { AppError } from '../../src/shared/domain';
import type { CoTuongState } from '../../src/shared/co-tuong/contracts';
import { createCoTuongState, transition } from '../../src/shared/co-tuong/engine';

export const roomId = '10000000-0000-4000-8000-000000000001',
  me = '20000000-0000-4000-8000-000000000001',
  friend = '20000000-0000-4000-8000-000000000002';

/** A fake API that runs the real Cờ Tướng engine (and computer player) in the test process. */
export async function coTuongFixture(context: BrowserContext) {
  const now = () => Date.now();
  // Deterministic: the computer always takes the first of its equally good moves.
  const random = { index: () => 0 };
  const tables = new Map<string, CoTuongState>();
  const deleted: string[] = [];
  const at = new Date().toISOString();
  const room = {
    room: {
      id: roomId,
      code: 'XQ000001',
      name: 'Phòng cờ tướng',
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
      { user_id: friend, name: 'Bình', role: 'member', joined_at: at },
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
    const base = `/rooms/${roomId}/co-tuong`;
    try {
      if (path === '/rooms')
        return json({ rooms: [{ role: 'owner', room: room.room }], canCreate: true });
      if (path.endsWith('/snapshot')) return json(room);
      if (path.endsWith('/chat'))
        return json({ messages: [], latest_sequence: 0, read_sequence: 0, unread_count: 0 });
      if (path.endsWith('/presence')) return json({ online_count: 2 });
      if (path === base) {
        if (request.method() === 'GET')
          return json({
            serverNow: now(),
            matches: [...tables.values()].reverse().map((s) => ({
              id: s.id,
              name: s.name,
              status: s.status,
              host: s.host,
              seats: s.seats,
              result: s.result,
              moves: s.moves.length,
              createdAt: at,
            })),
          });
        const state = createCoTuongState(
          crypto.randomUUID(),
          roomId,
          me,
          'An',
          request.postDataJSON(),
          now(),
          random,
        );
        tables.set(state.id, state);
        return json({ state, serverNow: now() }, 201);
      }
      const id = path.slice(base.length + 1).split('/')[0];
      const table = tables.get(id);
      if (table && path === `${base}/${id}/delete`) {
        if (request.postDataJSON().name !== table.name)
          return json({ error: { code: 'DELETE_NAME_MISMATCH' } }, 409);
        tables.delete(id);
        deleted.push(id);
        return json({ deleted: true });
      }
      if (table && path === `${base}/${id}`) {
        if (request.method() === 'POST') {
          const body = request.postDataJSON();
          if (body.version !== table.version)
            return json({ error: { code: 'COTUONG_STALE' } }, 409);
          tables.set(id, transition(table, me, 'An', body.command, now(), random));
        }
        return json({ state: tables.get(id), serverNow: now() });
      }
      return json({ error: { code: 'NOT_FOUND' } }, 404);
    } catch (error) {
      if (error instanceof AppError) return json({ error: { code: error.code } }, error.status);
      throw error;
    }
  });
  return {
    tables,
    deleted,
    /** A friend in the room takes the free seat of a table. */
    join(id: string) {
      tables.set(
        id,
        transition(tables.get(id)!, friend, 'Bình', { action: 'join' }, now(), random),
      );
    },
    /** The friend plays a move. */
    play(id: string, from: number, to: number) {
      tables.set(
        id,
        transition(tables.get(id)!, friend, 'Bình', { action: 'move', from, to }, now(), random),
      );
    },
  };
}
