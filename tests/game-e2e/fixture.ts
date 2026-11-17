import { expect, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test';
import { defaultSettings, type Snapshot } from '../../src/shared/contracts';
import { chooseRoomTab } from '../helpers/room-navigation';
import {
  createInitialGameState,
  reconcileGame,
  transition,
  getLegalMoves,
} from '../../src/shared/game/engine';
import {
  legacyRules as defaultRules,
  gameCommandSchema,
  createGameSchema,
  type GameSnapshot,
  type GameState,
  type GameRules,
} from '../../src/shared/game/contracts';
import { AppError } from '../../src/shared/domain';

export const room = '10000000-0000-4000-8000-000000000001';
export const ids = [1, 2, 3, 4, 5].map(
  (n) => '20000000-0000-4000-8000-' + String(n).padStart(12, '0'),
);
export const names = ['An', 'Bình', 'Chi', 'Dũng', 'Khán giả'];
export const match = '30000000-0000-4000-8000-000000000001';
const entry = '40000000-0000-4000-8000-000000000001';
/** Browser-only trusted fixture. It never ships in src or supplies dice to production APIs.
 * Real transaction/RLS/concurrency coverage is in scripts/test-game-db.mjs. */
export function gameFixture() {
  const games = new Map<string, GameState>(),
    receipts = new Map<string, { body: string; result: GameSnapshot }>();
  const watchers = new Map<string, Set<string>>(),
    results = new Map<string, GameSnapshot['results']>();
  const sockets: { socket: WebSocketRoute; topics: Set<string>; actor: string; array: boolean }[] =
    [];
  const revoked = new Set<string>(),
    dropReplies = new Set<string>();
  const requests: { actor: string; key: string; body: unknown }[] = [];
  const musicCommands: Record<string, unknown>[] = [];
  let muteBroadcast = false;
  const music: Snapshot = {
    room: {
      id: room,
      code: 'GAMETEST',
      name: 'Nhạc & những nước đi',
      description: 'Phòng kiểm thử cô lập',
      owner_id: ids[0],
      version: 1,
      created_at: new Date().toISOString(),
    },
    settings: { ...defaultSettings, playback_mode: 'ALL_DEVICES' },
    members: ids.map((id, i) => ({
      user_id: id,
      name: names[i],
      role: i === 0 ? 'owner' : 'member',
      joined_at: new Date().toISOString(),
    })),
    queue: [
      {
        id: entry,
        room_id: room,
        youtube_video_id: 'dQw4w9WgXcQ',
        requested_by: ids[0],
        requested_at: new Date().toISOString(),
        status: 'PLAYING',
        position: 1,
        vote_count: 0,
        voted: false,
        requester: 'An',
        song: {
          youtube_video_id: 'dQw4w9WgXcQ',
          title: 'Giai điệu đang tiếp tục',
          channel: 'Fixture',
          thumbnail: '/favicon.svg',
          duration: 180,
          verified_at: new Date().toISOString(),
        },
      },
    ],
    playback: {
      controller_id: null,
      fence: 0,
      lease_until: new Date(Date.now() + 3600000).toISOString(),
      run_id: '50000000-0000-4000-8000-000000000001',
      entry_id: entry,
      state: 'PLAYING',
      intent: 'PLAYING',
      position: 12,
      updated_at: new Date().toISOString(),
    },
    me: ids[0],
    role: 'owner',
    version: 1,
  };
  const view = (id: string): GameSnapshot => ({
    state: structuredClone(games.get(id)!),
    serverNow: Date.now(),
    spectators: [...(watchers.get(id) ?? [])]
      .filter((id) => !revoked.has(id))
      .map((id) => ({ id, name: names[ids.indexOf(id)] })),
    results: structuredClone(results.get(id) ?? []),
  });
  const send = (
    channel: (typeof sockets)[number],
    event: string,
    payload: unknown,
    topic: string,
    ref: string | null = null,
  ) => {
    try {
      channel.socket.send(
        JSON.stringify(
          channel.array ? [null, ref, topic, event, payload] : { topic, event, payload, ref },
        ),
      );
    } catch {
      /* closed fixture tab */
    }
  };
  const broadcast = (id: string) => {
    if (muteBroadcast) return;
    for (const channel of sockets) {
      for (const topic of channel.topics) {
        const event =
          topic === 'realtime:game:' + id
            ? 'game.state_updated'
            : topic === 'realtime:room:' + room
              ? 'games.updated'
              : null;
        if (event)
          send(
            channel,
            'broadcast',
            { type: 'broadcast', event, payload: { version: games.get(id)?.version } },
            topic,
          );
      }
    }
  };
  const commit = (s: GameState) => {
    games.set(s.id, s);
    if (s.status === 'FINISHED' && !(results.get(s.id) ?? []).some((r) => r.round === s.round))
      results.set(s.id, [
        { round: s.round, rankings: s.players, created_at: new Date().toISOString() },
        ...(results.get(s.id) ?? []),
      ]);
    broadcast(s.id);
  };
  const seed = (
    count = 4,
    rules: GameRules = {
      ...defaultRules,
      threeSixes: false,
      finishBonus: true,
      turnSeconds: 90,
    },
  ) => {
    let s = createInitialGameState(match, room, ids[0], 'Đường đua bạn bè', names[0], rules);
    for (let i = 1; i < count; i++)
      s = transition(
        s,
        ids[i],
        names[i],
        false,
        { action: 'join', color: i, version: s.version },
        Date.now(),
      );
    for (let i = 0; i < count; i++)
      s = transition(
        s,
        ids[i],
        names[i],
        false,
        { action: 'ready', ready: true, version: s.version },
        Date.now(),
      );
    s = transition(s, ids[0], names[0], false, { action: 'start', version: s.version }, Date.now());
    commit(s);
    return s;
  };
  async function attach(context: BrowserContext, index: number) {
    const actor = ids[index];
    await context.addInitScript(
      ({ actor, index }) => {
        localStorage.setItem(
          'sb-roomtune-fixture-auth-token',
          JSON.stringify({
            access_token: 'fixture-' + index,
            refresh_token: 'fixture-refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: 'bearer',
            user: {
              id: actor,
              aud: 'authenticated',
              role: 'authenticated',
              is_anonymous: index !== 0,
              app_metadata: {},
              user_metadata: {},
              created_at: new Date().toISOString(),
            },
          }),
        );
      },
      { actor, index },
    );
    await context.route('**/auth/v1/**', (route) => route.fulfill({ json: { id: actor } }));
    await context.routeWebSocket('**/realtime/**', (socket) => {
      const channel = { socket, topics: new Set<string>(), actor, array: false };
      sockets.push(channel);
      socket.onMessage((data) => {
        const raw = JSON.parse(String(data));
        channel.array = Array.isArray(raw);
        const m = channel.array
          ? { topic: raw[2], event: raw[3], payload: raw[4], ref: raw[1] }
          : raw;
        if (m.event === 'phx_join') channel.topics.add(m.topic);
        if (m.event === 'phx_leave') channel.topics.delete(m.topic);
        send(channel, 'phx_reply', { status: 'ok', response: {} }, m.topic, m.ref);
      });
      socket.onClose(() => channel.topics.clear());
    });
    await context.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname;
      const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
      const key = route.request().headers()['idempotency-key'];
      try {
        if (path.includes('/games')) {
          if (revoked.has(actor)) throw new AppError('PERMISSION_DENIED', 403);
          const id = path.split('/games/')[1];
          if (!id && !body) return route.fulfill({ json: [...games.values()] });
          if (!id) {
            const command = createGameSchema.parse(body),
              receipt = receipts.get(actor + key);
            if (receipt) return route.fulfill({ json: receipt.result });
            const s = createInitialGameState(
              match,
              room,
              actor,
              command.name,
              names[index],
              command.rules,
            );
            commit(s);
            const result = view(s.id);
            receipts.set(actor + key, { body: JSON.stringify(body), result });
            return route.fulfill({ status: 201, json: result });
          }
          const current = games.get(id);
          if (!current) throw new AppError('NOT_FOUND', 404);
          if (!body) {
            const next = reconcileGame(
              current,
              ids.filter((id) => !revoked.has(id)),
              Date.now(),
            );
            if (next.version !== current.version) commit(next);
            return route.fulfill({ json: view(id) });
          }
          const command = gameCommandSchema.parse(body);
          if (!('version' in command)) {
            const list = watchers.get(id) ?? new Set();
            if (command.action === 'watch') list.add(actor);
            else list.delete(actor);
            watchers.set(id, list);
            return route.fulfill({ json: view(id) });
          }
          requests.push({ actor, key, body });
          const receipt = receipts.get(actor + key);
          if (receipt) {
            if (receipt.body !== JSON.stringify(body))
              throw new AppError('IDEMPOTENCY_CONFLICT', 409);
            if (dropReplies.has(actor)) return route.abort('failed');
            return route.fulfill({ json: receipt.result });
          }
          const player = current.players.find((p) => p.id === actor),
            progress = player?.pieces.find((n) => n !== 57) ?? -1;
          // Deterministic browser scenario: one active player completes their circuit
          // while the others roll 2 in the nest. Random multiplayer games are tested
          // separately by the engine suite; greedy best-roll bots can capture forever.
          const leader = current.players.find((p) => p.status === 'ACTIVE');
          const dice =
            current.schema === 1
              ? progress === -1
                ? 6
                : Math.min(6, 57 - progress)
              : actor !== leader?.id
                ? 2
                : [1, 2, 3, 4, 5, 6]
                    .map((face) => ({
                      face,
                      to: Math.max(
                        -1,
                        ...getLegalMoves({ ...current, phase: 'MOVE', dice: face }).map(
                          (m) => m.to,
                        ),
                      ),
                    }))
                    .sort((a, b) => b.to - a.to || b.face - a.face)[0].face;
          const next = transition(
            current,
            actor,
            names[index],
            index === 0,
            command,
            Date.now(),
            command.action === 'roll' ? dice : undefined,
          );
          commit(next);
          const result = view(id);
          receipts.set(actor + key, { body: JSON.stringify(body), result });
          if (dropReplies.has(actor)) return route.abort('failed');
          return route.fulfill({ json: result });
        }
        if (path === '/api/v1/rooms')
          return route.fulfill({
            json: {
              rooms: [{ role: index === 0 ? 'owner' : 'member', room: music.room }],
              canCreate: index === 0,
            },
          });
        if (path.endsWith('/snapshot'))
          return route.fulfill({
            json: { ...music, me: actor, role: index === 0 ? 'owner' : 'member' },
          });
        if (path.endsWith('/chat'))
          return route.fulfill({
            json: { messages: [], latest_sequence: 0, read_sequence: 0, unread_count: 0 },
          });
        if (path.endsWith('/presence')) return route.fulfill({ json: { online_count: 5 } });
        if (path.endsWith('/commands')) {
          musicCommands.push(body);
          if (body.action === 'claim')
            music.playback = {
              ...music.playback,
              controller_id: body.controller_id,
              fence: 1,
              lease_until: new Date(Date.now() + 60000).toISOString(),
            };
          if (body.action === 'heartbeat')
            music.playback.lease_until = new Date(Date.now() + 60000).toISOString();
          if (body.action === 'report') music.playback.state = body.state;
          music.version++;
          return route.fulfill({ json: { version: music.version, playback: music.playback } });
        }
        if (path.endsWith('/library'))
          return route.fulfill({ json: { name: names[index], favorites: [], playlists: [] } });
        if (path.endsWith('/search')) return route.fulfill({ json: { items: [] } });
        if (path.endsWith('/history')) return route.fulfill({ json: { items: [] } });
        if (path.endsWith('/recommendations'))
          return route.fulfill({
            json: {
              familiar: [],
              discover: [],
              seed: null,
              discoveryUnavailable: false,
            },
          });
        return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
      } catch (error) {
        return route.fulfill({
          status: error instanceof AppError ? error.status : 400,
          json: {
            error: {
              code: error instanceof AppError ? error.code : 'INVALID_INPUT',
              message: (error as Error).message,
            },
          },
        });
      }
    });
  }
  return {
    games,
    view,
    seed,
    attach,
    requests,
    music,
    musicCommands,
    revoked,
    dropReplies,
    broadcast,
    commit,
    setMissedEvents: (value: boolean) => {
      muteBroadcast = value;
    },
  };
}
export async function openGame(page: Page, id = match) {
  await page.goto(`/room/${room}?game=${id}`);
  await expect(page.getByRole('group', { name: /Bàn cờ cá ngựa/ })).toBeVisible();
}
export async function nav(page: Page, name: string) {
  if (await page.locator('.game-screen').count()) {
    await page.getByRole('button', { name: 'Về phòng nhạc', exact: true }).click();
    await expect(page.locator('.game-screen')).toHaveCount(0);
  }
  await chooseRoomTab(page, name);
  if (name === 'Trò chơi') await expect(page.locator('.game-screen')).toBeVisible();
}
export async function fakeMusic(context: BrowserContext) {
  await context.addInitScript(() => {
    class Player {
      frame: HTMLIFrameElement;
      state = 5;
      constructor(
        node: HTMLElement,
        readonly options: YT.PlayerOptions,
      ) {
        this.frame = document.createElement('iframe');
        this.frame.title = 'YouTube fixture';
        this.frame.srcdoc =
          '<body style="background:#272331;color:#fff">Âm nhạc vẫn tiếp tục</body>';
        node.replaceWith(this.frame);
        setTimeout(() => options.events?.onReady?.({ target: this as unknown as YT.Player }), 10);
      }
      setVolume() {}
      getCurrentTime() {
        return 12;
      }
      getPlayerState() {
        return this.state;
      }
      seekTo() {}
      playVideo() {
        this.state = 1;
        this.options.events?.onStateChange?.({ target: this as unknown as YT.Player, data: 1 });
      }
      pauseVideo() {
        this.state = 2;
        this.options.events?.onStateChange?.({ target: this as unknown as YT.Player, data: 2 });
      }
      destroy() {
        this.frame.remove();
      }
    }
    Object.assign(window, {
      YT: { Player, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } },
    });
  });
}
