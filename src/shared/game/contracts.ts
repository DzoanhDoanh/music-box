import { z } from 'zod';

export const rulesSchema = z
  .object({
    entry: z.enum(['SIX', 'ONE_OR_SIX']).default('SIX'),
    safe: z.enum(['STARS', 'STARTS', 'NONE']).default('STARS'),
    captureBonus: z.boolean().default(false),
    finishBonus: z.boolean().default(false),
    threeSixes: z.boolean().default(true),
    turnSeconds: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).default(45),
    maxMisses: z.number().int().min(2).max(5).default(3),
  })
  .strict();
export type GameRules = z.infer<typeof rulesSchema>;
export const defaultRules = rulesSchema.parse({});
export const colorNames = ['Đỏ', 'Xanh lá', 'Vàng', 'Xanh dương'] as const;
export const statusNames = {
  WAITING: 'Đợi người chơi',
  READY: 'Sẵn sàng',
  PLAYING: 'Đang chơi',
  PAUSED: 'Tạm dừng',
  FINISHED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};
export const playerSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(40),
    color: z.number().int().min(0).max(3),
    ready: z.boolean(),
    pieces: z.array(z.number().int().min(-1).max(57)).length(4),
    status: z.enum(['ACTIVE', 'FINISHED', 'FORFEITED']),
    rank: z.number().int().min(1).max(4).nullable(),
    misses: z.number().int().min(0).max(5),
  })
  .strict();
export const stateSchema = z
  .object({
    schema: z.literal(1),
    id: z.uuid(),
    room: z.uuid(),
    host: z.uuid(),
    name: z.string().trim().min(1).max(60),
    version: z.number().int().nonnegative(),
    round: z.number().int().positive(),
    status: z.enum(['WAITING', 'READY', 'PLAYING', 'PAUSED', 'FINISHED', 'CANCELLED']),
    rules: rulesSchema,
    players: z.array(playerSchema).max(4),
    turn: z.uuid().nullable(),
    phase: z.enum(['ROLL', 'MOVE', 'DONE']),
    dice: z.number().int().min(1).max(6).nullable(),
    sixes: z.number().int().min(0).max(3),
    deadline: z.number().int().nonnegative().nullable(),
    remaining: z.number().int().min(0).max(90000).nullable(),
    last: z
      .object({
        type: z.string().max(40),
        actor: z.string().max(40),
        piece: z.number().int().min(0).max(3).optional(),
        from: z.number().int().min(-1).max(57).optional(),
        to: z.number().int().min(-1).max(57).optional(),
        dice: z.number().int().min(1).max(6).optional(),
        captures: z.array(z.string().max(40)).max(12).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (
      new Set(s.players.map((p) => p.id)).size !== s.players.length ||
      new Set(s.players.map((p) => p.color)).size !== s.players.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate player/seat' });
    if (
      ['PLAYING', 'PAUSED'].includes(s.status) &&
      !s.players.some((p) => p.id === s.turn && p.status === 'ACTIVE')
    )
      ctx.addIssue({ code: 'custom', message: 'Missing active turn' });
    if ((s.phase === 'MOVE') !== (s.dice !== null))
      ctx.addIssue({ code: 'custom', message: 'Missing dice' });
    const ranks = s.players.flatMap((p) => (p.rank === null ? [] : [p.rank]));
    if (
      new Set(ranks).size !== ranks.length ||
      s.players.some((p) => (p.status === 'ACTIVE') !== (p.rank === null))
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid ranking' });
    if (
      (s.status === 'PLAYING' && (s.deadline === null || s.remaining !== null)) ||
      (s.status !== 'PLAYING' && s.deadline !== null) ||
      (s.status === 'PAUSED' && s.remaining === null)
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid deadline' });
    if (
      ['PLAYING', 'PAUSED'].includes(s.status) &&
      (s.phase === 'DONE' || s.players.filter((p) => p.status === 'ACTIVE').length < 2)
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid active game' });
    if (!['PLAYING', 'PAUSED'].includes(s.status) && s.turn !== null)
      ctx.addIssue({ code: 'custom', message: 'Invalid inactive turn' });
    if (s.status === 'FINISHED' && (s.phase !== 'DONE' || ranks.length !== s.players.length))
      ctx.addIssue({ code: 'custom', message: 'Incomplete result' });
  });
export type GameState = z.infer<typeof stateSchema>;
export type GamePlayer = z.infer<typeof playerSchema>;
const version = z.number().int().nonnegative();
export const createGameSchema = z
  .object({ name: z.string().trim().min(1).max(60), rules: rulesSchema })
  .strict();
export const gameCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join'), color: z.number().int().min(0).max(3), version }).strict(),
  z.object({ action: z.literal('color'), color: z.number().int().min(0).max(3), version }).strict(),
  z.object({ action: z.literal('ready'), ready: z.boolean(), version }).strict(),
  z.object({ action: z.literal('settings'), rules: rulesSchema, version }).strict(),
  z
    .object({
      action: z.enum([
        'start',
        'roll',
        'leave',
        'surrender',
        'pause',
        'resume',
        'cancel',
        'rematch',
      ]),
      version,
    })
    .strict(),
  z.object({ action: z.literal('move'), piece: z.number().int().min(0).max(3), version }).strict(),
  z.object({ action: z.enum(['watch', 'unwatch']) }).strict(),
]);
export type GameCommand = z.infer<typeof gameCommandSchema>;
export type EngineAction = Exclude<GameCommand, { action: 'watch' | 'unwatch' }>;
export type GameSnapshot = {
  state: GameState;
  serverNow: number;
  spectators: { id: string; name: string }[];
  results: { round: number; rankings: GamePlayer[]; created_at: string }[];
};
export type GameContext = {
  snapshot: GameSnapshot;
  members: { id: string; name: string; role: string }[];
  receipt?: GameSnapshot;
};
