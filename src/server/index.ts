import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import {
  commandSchema,
  deleteResourceSchema,
  createRoomSchema,
  joinSchema,
  librarySchema,
  presenceSchema,
  chatCommandSchema,
  uuid,
} from '../shared/contracts';
import { AppError } from '../shared/domain';
import { database, SupabaseRepository, type Env } from './repository';
import type { RoomStore } from './ports';
import { YouTubeService } from './youtube';
import { AuthService } from './services/auth';
import { RoomService } from './services/room';
import { ChatService } from './services/chat';
import { GameService, settleDueGames } from './services/game';
import { createGameSchema, gameCommandSchema } from '../shared/game/contracts';
import { RoomCommandService } from './services/commands';
import { PlaylistService } from './services/library';
import { MaintenanceService, SearchService } from './services/search';
import { RecommendationService } from './services/recommendations';
import { wheelCommandSchema, type WheelSnapshot, type WheelResult } from '../shared/wheel';
import {
  tarotCommandSchema,
  tarotSettingsSchema,
  type TarotReading,
  type TarotSnapshot,
} from '../shared/tarot/contracts';
import { writeClaimedTarotReading, writeTarotReading } from './services/tarot-ai';
import {
  askRoomAi,
  checkBaseUrl,
  describeFailure,
  hasAi,
  keyHint,
  loadRoomAi,
  openKey,
  sealKey,
  type RoomAiConfig,
} from './services/room-ai';
import {
  roomAiEnableSchema,
  roomAiSaveSchema,
  type RoomAiResult,
  type RoomAiView,
} from '../shared/room-ai';
import { BauCuaService } from './services/bau-cua';
import { commandSchema as bauCommandSchema } from '../shared/bau-cua/contracts';
import { DuckRaceService } from './services/duck-race';
import { duckCommandSchema } from '../shared/duck-race/contracts';
import { TyPhuService, settleDueTyPhu } from './services/ty-phu';
import { createTyPhuSchema, tyPhuRequestSchema } from '../shared/ty-phu/contracts';
import { CoTuongService } from './services/co-tuong';
import { coTuongRequestSchema, createCoTuongSchema } from '../shared/co-tuong/contracts';
import { BilliardsService } from './services/billiards';
import { billiardsRequestSchema, createBilliardsSchema } from '../shared/billiards/contracts';

type Services = {
  auth: AuthService;
  rooms: RoomService;
  commands: RoomCommandService;
  library: PlaylistService;
  search: SearchService;
  recommendations: RecommendationService;
  chat: ChatService;
  game: GameService;
  bau: BauCuaService;
  duck: DuckRaceService;
  tyPhu: TyPhuService;
  coTuong: CoTuongService;
  billiards: BilliardsService;
  store: SupabaseRepository;
};
type Context = {
  Bindings: Env;
  Variables: {
    services: Services;
    actor: string;
    requestId: string;
    timings: Record<string, number>;
  };
};
export const app = new Hono<Context>();
app.use(
  '*',
  secureHeaders({
    referrerPolicy: 'strict-origin-when-cross-origin',
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(
  '/api/*',
  bodyLimit({
    maxSize: 32 * 1024,
    onError: (c) =>
      c.json({ error: { code: 'INVALID_INPUT', message: 'Nội dung yêu cầu quá lớn.' } }, 413),
  }),
);
app.use('/api/*', async (c, next) => {
  const started = performance.now();
  const timings: Record<string, number> = {};
  c.set('timings', timings);
  c.set('requestId', crypto.randomUUID());
  c.header('X-Request-ID', c.get('requestId'));
  c.header('Cache-Control', 'no-store');
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin && origin !== c.env.APP_BASE_URL)
    throw new AppError('PERMISSION_DENIED', 403);
  await next();
  // Durations only: no tokens, actors, paths, query strings or payloads in headers.
  c.header(
    'Server-Timing',
    [
      ...Object.entries(timings).map(([stage, ms]) => `${stage};dur=${ms.toFixed(1)}`),
      `total;dur=${(performance.now() - started).toFixed(1)}`,
    ].join(', '),
  );
});
app.get('/api/v1/system/health', (c) =>
  c.json({
    status:
      c.env.SUPABASE_URL && c.env.SUPABASE_SECRET_KEY && c.env.SUPABASE_PUBLISHABLE_KEY
        ? 'configured'
        : 'configuration_required',
    youtubeConfigured: Boolean(c.env.YOUTUBE_API_KEY),
    bauCuaEnabled: c.env.ENABLE_BAU_CUA === 'true',
    duckRaceEnabled: c.env.ENABLE_DUCK_RACE === 'true',
    tyPhuEnabled: c.env.ENABLE_TY_PHU === 'true',
    coTuongEnabled: c.env.ENABLE_CO_TUONG === 'true',
    billiardsEnabled: c.env.ENABLE_BILLIARDS === 'true',
    tarotEnabled: c.env.ENABLE_TAROT === 'true',
    tarotAi: c.env.ENABLE_TAROT === 'true' && Boolean(c.env.GEMINI_API_KEY),
    version: '0.1.0',
  }),
);
app.use('/api/v1/*', async (c, next) => {
  const token = c.req.header('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new AppError('UNAUTHORIZED', 401);
  const timings = c.get('timings');
  const store = new SupabaseRepository(
    database(c.env, (stage, ms) => {
      timings[stage] = (timings[stage] ?? 0) + ms;
    }),
  );
  const auth = new AuthService(store, store);
  const actor = await auth.authenticate(token, c.req.method !== 'GET');
  const youtube = new YouTubeService(c.env.YOUTUBE_API_KEY);
  c.set('actor', actor);
  c.set('services', {
    auth,
    rooms: new RoomService(store, actor),
    commands: new RoomCommandService(store, actor, youtube),
    library: new PlaylistService(store, actor),
    search: new SearchService(store, youtube, actor),
    recommendations: new RecommendationService(store, youtube, actor),
    chat: new ChatService(store, actor),
    game: new GameService(store, actor),
    bau: new BauCuaService(store, actor),
    duck: new DuckRaceService(store, actor),
    tyPhu: new TyPhuService(store, actor),
    coTuong: new CoTuongService(store, actor),
    billiards: new BilliardsService(store, actor),
    store,
  });
  await next();
});
const pageNumber = (value?: string) =>
  z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .parse(value ?? 0);
const requestKey = (value?: string) => uuid.parse(value);
// Bi-a stays behind its own flag until the migration is applied on the target.
for (const path of ['/api/v1/rooms/:id/billiards', '/api/v1/rooms/:id/billiards/*'])
  app.use(path, async (c, next) => {
    if (c.env.ENABLE_BILLIARDS !== 'true') throw new AppError('NOT_FOUND', 404);
    await next();
  });
app.get('/api/v1/rooms/:id/billiards', async (c) =>
  c.json(await c.get('services').billiards.list(uuid.parse(c.req.param('id')))),
);
app.post('/api/v1/rooms/:id/billiards', async (c) =>
  c.json(
    await c
      .get('services')
      .billiards.create(
        uuid.parse(c.req.param('id')),
        requestKey(c.req.header('Idempotency-Key')),
        createBilliardsSchema.parse(await c.req.json()),
      ),
    201,
  ),
);
app.get('/api/v1/rooms/:id/billiards/:game', async (c) =>
  c.json(
    await c
      .get('services')
      .billiards.read(uuid.parse(c.req.param('id')), uuid.parse(c.req.param('game'))),
  ),
);
app.post('/api/v1/rooms/:id/billiards/:game/delete', async (c) =>
  c.json(
    await c
      .get('services')
      .billiards.delete(
        uuid.parse(c.req.param('id')),
        uuid.parse(c.req.param('game')),
        requestKey(c.req.header('Idempotency-Key')),
        deleteResourceSchema.parse(await c.req.json()).name,
      ),
  ),
);
app.post('/api/v1/rooms/:id/billiards/:game', async (c) =>
  c.json(
    await c
      .get('services')
      .billiards.execute(
        uuid.parse(c.req.param('id')),
        uuid.parse(c.req.param('game')),
        requestKey(c.req.header('Idempotency-Key')),
        billiardsRequestSchema.parse(await c.req.json()),
      ),
  ),
);
// Cờ Tướng stays behind its own flag until the migration is applied on the target.
for (const path of ['/api/v1/rooms/:id/co-tuong', '/api/v1/rooms/:id/co-tuong/*'])
  app.use(path, async (c, next) => {
    if (c.env.ENABLE_CO_TUONG !== 'true') throw new AppError('NOT_FOUND', 404);
    await next();
  });
app.get('/api/v1/rooms/:id/co-tuong', async (c) =>
  c.json(await c.get('services').coTuong.list(uuid.parse(c.req.param('id')))),
);
app.post('/api/v1/rooms/:id/co-tuong', async (c) =>
  c.json(
    await c
      .get('services')
      .coTuong.create(
        uuid.parse(c.req.param('id')),
        requestKey(c.req.header('Idempotency-Key')),
        createCoTuongSchema.parse(await c.req.json()),
      ),
    201,
  ),
);
app.get('/api/v1/rooms/:id/co-tuong/:game', async (c) =>
  c.json(
    await c
      .get('services')
      .coTuong.read(uuid.parse(c.req.param('id')), uuid.parse(c.req.param('game'))),
  ),
);
app.post('/api/v1/rooms/:id/co-tuong/:game/delete', async (c) =>
  c.json(
    await c
      .get('services')
      .coTuong.delete(
        uuid.parse(c.req.param('id')),
        uuid.parse(c.req.param('game')),
        requestKey(c.req.header('Idempotency-Key')),
        deleteResourceSchema.parse(await c.req.json()).name,
      ),
  ),
);
app.post('/api/v1/rooms/:id/co-tuong/:game', async (c) =>
  c.json(
    await c
      .get('services')
      .coTuong.execute(
        uuid.parse(c.req.param('id')),
        uuid.parse(c.req.param('game')),
        requestKey(c.req.header('Idempotency-Key')),
        coTuongRequestSchema.parse(await c.req.json()),
      ),
  ),
);
// Tỷ Phú stays behind its own flag until the migration is applied on the target.
app.use('/api/v1/rooms/:id/ty-phu', async (c, next) => {
  if (c.env.ENABLE_TY_PHU !== 'true') throw new AppError('NOT_FOUND', 404);
  await next();
});
app.use('/api/v1/rooms/:id/ty-phu/*', async (c, next) => {
  if (c.env.ENABLE_TY_PHU !== 'true') throw new AppError('NOT_FOUND', 404);
  await next();
});
app.get('/api/v1/rooms/:id/ty-phu', async (c) =>
  c.json(await c.get('services').tyPhu.list(uuid.parse(c.req.param('id')))),
);
app.post('/api/v1/rooms/:id/ty-phu', async (c) =>
  c.json(
    await c
      .get('services')
      .tyPhu.create(
        uuid.parse(c.req.param('id')),
        requestKey(c.req.header('Idempotency-Key')),
        createTyPhuSchema.parse(await c.req.json()),
      ),
    201,
  ),
);
app.get('/api/v1/rooms/:id/ty-phu/:game', async (c) =>
  c.json(
    await c
      .get('services')
      .tyPhu.read(uuid.parse(c.req.param('id')), uuid.parse(c.req.param('game'))),
  ),
);
app.post('/api/v1/rooms/:id/ty-phu/:game/delete', async (c) =>
  c.json(
    await c
      .get('services')
      .tyPhu.delete(
        uuid.parse(c.req.param('id')),
        uuid.parse(c.req.param('game')),
        requestKey(c.req.header('Idempotency-Key')),
        deleteResourceSchema.parse(await c.req.json()).name,
      ),
  ),
);
app.post('/api/v1/rooms/:id/ty-phu/:game', async (c) =>
  c.json(
    await c
      .get('services')
      .tyPhu.execute(
        uuid.parse(c.req.param('id')),
        uuid.parse(c.req.param('game')),
        requestKey(c.req.header('Idempotency-Key')),
        tyPhuRequestSchema.parse(await c.req.json()),
      ),
  ),
);
app.use('/api/v1/rooms/:id/duck-race', async (c, next) => {
  if (c.env.ENABLE_DUCK_RACE !== 'true') throw new AppError('NOT_FOUND', 404);
  await next();
});
app.use('/api/v1/rooms/:id/duck-race/*', async (c, next) => {
  if (c.env.ENABLE_DUCK_RACE !== 'true') throw new AppError('NOT_FOUND', 404);
  await next();
});
app.get('/api/v1/rooms/:id/duck-race', async (c) =>
  c.json(await c.get('services').duck.list(uuid.parse(c.req.param('id')))),
);
app.post('/api/v1/rooms/:id/duck-race', async (c) =>
  c.json(
    await c
      .get('services')
      .duck.execute(
        uuid.parse(c.req.param('id')),
        null,
        requestKey(c.req.header('Idempotency-Key')),
        duckCommandSchema.parse(await c.req.json()),
      ),
  ),
);
app.get('/api/v1/rooms/:id/duck-race/:race', async (c) =>
  c.json(
    await c
      .get('services')
      .duck.read(uuid.parse(c.req.param('id')), uuid.parse(c.req.param('race'))),
  ),
);
app.post('/api/v1/rooms/:id/duck-race/:race', async (c) =>
  c.json(
    await c
      .get('services')
      .duck.execute(
        uuid.parse(c.req.param('id')),
        uuid.parse(c.req.param('race')),
        requestKey(c.req.header('Idempotency-Key')),
        duckCommandSchema.parse(await c.req.json()),
      ),
  ),
);
app.use('/api/v1/rooms/:id/bau-cua', async (c, next) => {
  if (c.env.ENABLE_BAU_CUA !== 'true') throw new AppError('NOT_FOUND', 404);
  await next();
});
app.use('/api/v1/rooms/:id/bau-cua/*', async (c, next) => {
  if (c.env.ENABLE_BAU_CUA !== 'true') throw new AppError('NOT_FOUND', 404);
  await next();
});
app.get('/api/v1/rooms/:id/bau-cua', async (c) =>
  c.json(await c.get('services').bau.read(uuid.parse(c.req.param('id')), null)),
);
app.post('/api/v1/rooms/:id/bau-cua', async (c) =>
  c.json(
    await c
      .get('services')
      .bau.execute(
        uuid.parse(c.req.param('id')),
        null,
        requestKey(c.req.header('Idempotency-Key')),
        bauCommandSchema.parse(await c.req.json()),
      ),
  ),
);
app.get('/api/v1/rooms/:id/bau-cua/notices', async (c) =>
  c.json(await c.get('services').bau.notices(uuid.parse(c.req.param('id')))),
);
app.get('/api/v1/rooms/:id/bau-cua/:table', async (c) =>
  c.json(
    await c
      .get('services')
      .bau.read(uuid.parse(c.req.param('id')), uuid.parse(c.req.param('table'))),
  ),
);
app.post('/api/v1/rooms/:id/bau-cua/:table', async (c) =>
  c.json(
    await c
      .get('services')
      .bau.execute(
        uuid.parse(c.req.param('id')),
        uuid.parse(c.req.param('table')),
        requestKey(c.req.header('Idempotency-Key')),
        bauCommandSchema.parse(await c.req.json()),
      ),
  ),
);
app.post('/api/v1/rooms/:id/delete', async (c) =>
  c.json(
    await c
      .get('services')
      .rooms.delete(
        uuid.parse(c.req.param('id')),
        requestKey(c.req.header('Idempotency-Key')),
        deleteResourceSchema.parse(await c.req.json()).name,
      ),
  ),
);
app.use('/api/v1/rooms/:id/wheel', async (c, next) => {
  if (c.env.ENABLE_WHEEL !== 'true') throw new AppError('NOT_FOUND', 404);
  await next();
});
app.get('/api/v1/rooms/:id/wheel', async (c) =>
  c.json(
    await c.get('services').store.call<WheelSnapshot>('wheel_snapshot', {
      p_actor: c.get('actor'),
      p_room: uuid.parse(c.req.param('id')),
    }),
  ),
);
app.post('/api/v1/rooms/:id/wheel', async (c) =>
  c.json(
    await c.get('services').store.call<WheelResult>('wheel_spin', {
      p_actor: c.get('actor'),
      p_room: uuid.parse(c.req.param('id')),
      p_request: requestKey(c.req.header('Idempotency-Key')),
      p_command: wheelCommandSchema.parse(await c.req.json()),
    }),
  ),
);
// The room's AI, used by every AI feature in the room (Tarot readings today): the owner's own
// OpenAI-compatible API. The key is sealed here before it is
// stored and is never sent back: the owner only sees its last four characters.
// Order is enforced here, not only in the page: a setup is saved only after it answered a test
// call, and switching it on tests the saved setup again.
app.get('/api/v1/rooms/:id/ai', async (c) =>
  c.json(
    await c.get('services').store.call<RoomAiView>('room_ai_view', {
      p_actor: c.get('actor'),
      p_room: uuid.parse(c.req.param('id')),
    }),
  ),
);
async function testRoomAi(ai: RoomAiConfig) {
  const started = Date.now();
  try {
    await askRoomAi(ai, 'Bạn là trợ lý kiểm tra kết nối.', 'Trả lời đúng một từ: OK', {
      maxTokens: 256,
      timeoutMs: 30_000,
    });
    return { ok: true as const, seconds: ((Date.now() - started) / 1000).toFixed(1) };
  } catch (error) {
    return { ok: false as const, message: describeFailure(error) };
  }
}
async function savedRoomAi(store: RoomStore, secret: string, room: string) {
  const saved = await store.call<{ base_url: string; model: string; key_cipher: string } | null>(
    'room_ai_secret',
    { p_room: room },
  );
  return saved
    ? {
        baseUrl: saved.base_url,
        model: saved.model,
        key: await openKey(secret, room, saved.key_cipher),
      }
    : null;
}
// Test a base URL, key and model, and store them only when the API answered.
app.post('/api/v1/rooms/:id/ai', async (c) => {
  const actor = c.get('actor'),
    room = uuid.parse(c.req.param('id'));
  const store = c.get('services').store;
  const input = roomAiSaveSchema.parse(await c.req.json());
  // Only the owner gets as far as calling anything.
  const view = await store.call<RoomAiView>('room_ai_view', { p_actor: actor, p_room: room });
  const baseUrl = checkBaseUrl(input.base_url);
  const key =
    input.api_key ?? (await savedRoomAi(store, c.env.SUPABASE_SECRET_KEY, room))?.key ?? null;
  if (!key) return c.json({ ok: false, message: 'Hãy nhập API key.' } satisfies RoomAiResult);
  const test = await testRoomAi({ baseUrl, model: input.model, key });
  if (!test.ok)
    return c.json({ ok: false, message: `Chưa lưu: ${test.message}` } satisfies RoomAiResult);
  const next = await store.call<RoomAiView>('room_ai_configure', {
    p_actor: actor,
    p_room: room,
    p_enabled: view.enabled,
    p_base_url: baseUrl,
    p_model: input.model,
    p_cipher: input.api_key ? await sealKey(c.env.SUPABASE_SECRET_KEY, room, input.api_key) : null,
    p_hint: input.api_key ? keyHint(input.api_key) : null,
    p_clear: false,
  });
  return c.json({
    ok: true,
    message: `Kết nối được và đã lưu. Model trả lời sau ${test.seconds} giây.`,
    view: next,
  } satisfies RoomAiResult);
});
// Switch the saved setup on (after testing it again) or off.
app.post('/api/v1/rooms/:id/ai/enabled', async (c) => {
  const actor = c.get('actor'),
    room = uuid.parse(c.req.param('id'));
  const store = c.get('services').store;
  const { enabled } = roomAiEnableSchema.parse(await c.req.json());
  const view = await store.call<RoomAiView>('room_ai_view', { p_actor: actor, p_room: room });
  let message = 'Đã tắt AI riêng. Phòng dùng AI mặc định.';
  if (enabled) {
    const saved = await savedRoomAi(store, c.env.SUPABASE_SECRET_KEY, room);
    if (!saved || !view.base_url || !view.model)
      return c.json({
        ok: false,
        message: 'Hãy kiểm tra & lưu API thành công trước khi bật.',
      } satisfies RoomAiResult);
    const test = await testRoomAi(saved);
    if (!test.ok)
      return c.json({
        ok: false,
        message: `Chưa bật được: ${test.message}`,
      } satisfies RoomAiResult);
    message = 'Đã bật AI riêng. Các tính năng AI trong phòng sẽ dùng API của bạn.';
  }
  const next = await store.call<RoomAiView>('room_ai_configure', {
    p_actor: actor,
    p_room: room,
    p_enabled: enabled,
    p_base_url: view.base_url,
    p_model: view.model,
    p_cipher: null,
    p_hint: null,
    p_clear: false,
  });
  return c.json({ ok: true, message, view: next } satisfies RoomAiResult);
});
// Forget the saved key; the room goes back to the default AI.
app.post('/api/v1/rooms/:id/ai/clear', async (c) => {
  const actor = c.get('actor'),
    room = uuid.parse(c.req.param('id'));
  const store = c.get('services').store;
  const view = await store.call<RoomAiView>('room_ai_view', { p_actor: actor, p_room: room });
  const next = await store.call<RoomAiView>('room_ai_configure', {
    p_actor: actor,
    p_room: room,
    p_enabled: false,
    p_base_url: view.base_url,
    p_model: view.model,
    p_cipher: null,
    p_hint: null,
    p_clear: true,
  });
  return c.json({ ok: true, message: 'Đã xóa API key.', view: next } satisfies RoomAiResult);
});
app.use('/api/v1/rooms/:id/tarot', async (c, next) => {
  if (c.env.ENABLE_TAROT !== 'true') throw new AppError('NOT_FOUND', 404);
  await next();
});
app.get('/api/v1/rooms/:id/tarot', async (c) =>
  c.json(
    await c.get('services').store.call<TarotSnapshot>('tarot_snapshot', {
      p_actor: c.get('actor'),
      p_room: uuid.parse(c.req.param('id')),
    }),
  ),
);
app.use('/api/v1/rooms/:id/tarot/*', async (c, next) => {
  if (c.env.ENABLE_TAROT !== 'true') throw new AppError('NOT_FOUND', 404);
  await next();
});
// Write the long AI reading after the response, so the cards start flipping right away.
function inBackground(
  c: { executionCtx: { waitUntil(promise: Promise<unknown>): void } },
  task: Promise<unknown>,
) {
  const settled = task.catch((error) => console.error('background task failed', error));
  try {
    c.executionCtx.waitUntil(settled);
  } catch {
    // No execution context outside Workers (tests): the promise still runs to completion.
  }
}
app.post('/api/v1/rooms/:id/tarot', async (c) => {
  const actor = c.get('actor'),
    room = uuid.parse(c.req.param('id'));
  const store = c.get('services').store;
  const reading = await store.call<TarotReading>('tarot_draw', {
    p_actor: actor,
    p_room: room,
    p_request: requestKey(c.req.header('Idempotency-Key')),
    p_command: tarotCommandSchema.parse(await c.req.json()),
  });
  // The room's own AI or the server's Gemini key; without either nothing is claimed.
  inBackground(c, writeTarotReading(store, c.env, actor, room, reading.id));
  return c.json(reading);
});
// The room's owner decides whether drawing costs coins in that room.
app.post('/api/v1/rooms/:id/tarot/settings', async (c) =>
  c.json(
    await c.get('services').store.call<{ paid: boolean }>('tarot_configure', {
      p_actor: c.get('actor'),
      p_room: uuid.parse(c.req.param('id')),
      p_paid: tarotSettingsSchema.parse(await c.req.json()).paid,
    }),
  ),
);
// The person who drew may ask again when the AI reading failed or was lost.
app.post('/api/v1/rooms/:id/tarot/:reading/ai', async (c) => {
  const actor = c.get('actor'),
    room = uuid.parse(c.req.param('id')),
    readingId = uuid.parse(c.req.param('reading'));
  const store = c.get('services').store;
  const ai = await loadRoomAi(store, c.env, room);
  if (!hasAi(c.env, ai)) throw new AppError('NOT_FOUND', 404);
  const reading = await store.call<TarotReading | null>('tarot_ai_claim', {
    p_actor: actor,
    p_room: room,
    p_reading: readingId,
  });
  if (reading) inBackground(c, writeClaimedTarotReading(store, c.env, room, reading, fetch, ai));
  return c.json({ started: Boolean(reading) });
});
// Require an explicit runtime flag so targets without the game migration remain safe.
app.use('/api/v1/rooms/:id/games', async (c, next) => {
  if (c.env.ENABLE_LUDO !== 'true') throw new AppError('NOT_FOUND', 404);
  await next();
});
app.use('/api/v1/rooms/:id/games/*', async (c, next) => {
  if (c.env.ENABLE_LUDO !== 'true') throw new AppError('NOT_FOUND', 404);
  await next();
});
app.get('/api/v1/rooms/:id/games', async (c) =>
  c.json(
    await c
      .get('services')
      .game.list(uuid.parse(c.req.param('id')), pageNumber(c.req.query('page'))),
  ),
);
app.post('/api/v1/rooms/:id/games', async (c) =>
  c.json(
    await c
      .get('services')
      .game.create(
        uuid.parse(c.req.param('id')),
        requestKey(c.req.header('Idempotency-Key')),
        createGameSchema.parse(await c.req.json()),
      ),
    201,
  ),
);
app.get('/api/v1/rooms/:id/games/:game', async (c) =>
  c.json(
    await c
      .get('services')
      .game.read(uuid.parse(c.req.param('id')), uuid.parse(c.req.param('game'))),
  ),
);
app.post('/api/v1/rooms/:id/games/:game/delete', async (c) =>
  c.json(
    await c
      .get('services')
      .game.delete(
        uuid.parse(c.req.param('id')),
        uuid.parse(c.req.param('game')),
        requestKey(c.req.header('Idempotency-Key')),
        deleteResourceSchema.parse(await c.req.json()).name,
      ),
  ),
);
app.post('/api/v1/rooms/:id/games/:game', async (c) =>
  c.json(
    await c
      .get('services')
      .game.execute(
        uuid.parse(c.req.param('id')),
        uuid.parse(c.req.param('game')),
        requestKey(c.req.header('Idempotency-Key')),
        gameCommandSchema.parse(await c.req.json()),
      ),
  ),
);
app.get('/api/v1/rooms/:id/chat', async (c) =>
  c.json(
    await c.get('services').chat.read(
      uuid.parse(c.req.param('id')),
      z.coerce
        .number()
        .int()
        .min(0)
        .max(Number.MAX_SAFE_INTEGER)
        .parse(c.req.query('since') ?? 0),
    ),
  ),
);
app.post('/api/v1/rooms/:id/chat', async (c) =>
  c.json(
    await c
      .get('services')
      .chat.execute(
        uuid.parse(c.req.param('id')),
        requestKey(c.req.header('Idempotency-Key')),
        chatCommandSchema.parse(await c.req.json()),
      ),
  ),
);
app.get('/api/v1/rooms', async (c) => c.json(await c.get('services').rooms.list()));
app.post('/api/v1/rooms', async (c) =>
  c.json(
    await c
      .get('services')
      .rooms.create(
        createRoomSchema.parse(await c.req.json()),
        requestKey(c.req.header('Idempotency-Key')),
      ),
    201,
  ),
);
app.post('/api/v1/rooms/join', async (c) =>
  c.json(
    await c
      .get('services')
      .rooms.join(
        joinSchema.parse(await c.req.json()),
        c.req.header('CF-Connecting-IP') ?? 'local',
      ),
  ),
);
app.get('/api/v1/rooms/:id/snapshot', async (c) =>
  c.json(await c.get('services').rooms.snapshot(uuid.parse(c.req.param('id')))),
);
app.post('/api/v1/rooms/:id/commands', async (c) =>
  c.json(
    await c
      .get('services')
      .commands.execute(
        uuid.parse(c.req.param('id')),
        requestKey(c.req.header('Idempotency-Key')),
        commandSchema.parse(await c.req.json()),
      ),
  ),
);
app.post('/api/v1/rooms/:id/presence', async (c) =>
  c.json(
    await c
      .get('services')
      .rooms.presence(uuid.parse(c.req.param('id')), presenceSchema.parse(await c.req.json())),
  ),
);
app.get('/api/v1/rooms/:id/history', async (c) =>
  c.json(
    await c
      .get('services')
      .rooms.history(uuid.parse(c.req.param('id')), pageNumber(c.req.query('page'))),
  ),
);
app.get('/api/v1/rooms/:id/admin', async (c) =>
  c.json(
    await c
      .get('services')
      .commands.members.administration(
        uuid.parse(c.req.param('id')),
        pageNumber(c.req.query('page')),
      ),
  ),
);
app.get('/api/v1/rooms/:id/recommendations', async (c) =>
  c.json(await c.get('services').recommendations.read(uuid.parse(c.req.param('id')))),
);
app.get('/api/v1/youtube/search', async (c) =>
  c.json(
    await c
      .get('services')
      .search.search(
        uuid.parse(c.req.query('room')),
        z.string().trim().min(2).max(120).parse(c.req.query('q')),
      ),
  ),
);
app.get('/api/v1/library', async (c) => c.json(await c.get('services').library.read()));
app.post('/api/v1/library', async (c) =>
  c.json(
    await c
      .get('services')
      .library.execute(
        librarySchema.parse(await c.req.json()),
        requestKey(c.req.header('Idempotency-Key')),
      ),
  ),
);
app.get('/api/v1/export', async (c) => c.json(await c.get('services').library.export()));
app.post('/api/v1/account/delete', async (c) => {
  z.object({ confirmation: z.literal('DELETE') })
    .strict()
    .parse(await c.req.json());
  return c.json(await c.get('services').auth.deleteAccount(c.get('actor')));
});
app.notFound((c) =>
  c.json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy đường dẫn.' } }, 404),
);
app.onError((error, c) => {
  const known =
    error instanceof AppError
      ? error
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? new AppError('INVALID_INPUT')
        : new AppError('BACKEND_UNAVAILABLE', 503);
  console.error(
    JSON.stringify({
      requestId: c.get('requestId'),
      code: known.code,
      path: c.req.path,
      status: known.status,
    }),
  );
  if (known.status === 429 && known.retryAfterSeconds)
    c.header('Retry-After', String(known.retryAfterSeconds));
  return c.json(
    { error: { code: known.code, message: known.message, requestId: c.get('requestId') } },
    known.status as 400 | 401 | 403 | 409 | 429 | 503,
  );
});
export default {
  fetch: app.fetch,
  scheduled: async (event: { cron?: string }, env: Env) => {
    const store = new SupabaseRepository(database(env));
    if (event.cron === '* * * * *') {
      if (env.ENABLE_LUDO === 'true') await settleDueGames(store);
      if (env.ENABLE_DUCK_RACE === 'true') await store.call('duck_race_tick', {});
      if (env.ENABLE_TY_PHU === 'true') await settleDueTyPhu(store);
      return;
    }
    await new MaintenanceService(
      store,
      env.YOUTUBE_API_KEY ? new YouTubeService(env.YOUTUBE_API_KEY) : null,
    ).run();
  },
};
