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

type Services = {
  auth: AuthService;
  rooms: RoomService;
  commands: RoomCommandService;
  library: PlaylistService;
  search: SearchService;
  recommendations: RecommendationService;
  chat: ChatService;
  game: GameService;
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
      return;
    }
    await new MaintenanceService(
      store,
      env.YOUTUBE_API_KEY ? new YouTubeService(env.YOUTUBE_API_KEY) : null,
    ).run();
  },
};
