import { z } from 'zod';

/** The computer's seat id; computer seats are never room members. */
export const BILLIARDS_BOT = '00000000-0000-4000-8000-0000000000b1';
export const BILLIARDS_SHOTS_KEPT = 12;

export const billiardsModes = ['EIGHT', 'NINE', 'CAROM'] as const;
export type BilliardsMode = (typeof billiardsModes)[number];
export const modeNames: Record<BilliardsMode, string> = {
  EIGHT: 'Bi-a lỗ 8 bi',
  NINE: 'Bi-a lỗ 9 bi',
  CAROM: 'Bi-a phăng',
};
export const levelNames: Record<1 | 2 | 3, string> = { 1: 'Dễ', 2: 'Vừa', 3: 'Khó' };

const seatSide = z.enum(['a', 'b']);
const level = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const coord = z.number().finite();
const spinSchema = z
  .object({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1) })
  .strict();

export const createBilliardsSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    mode: z.enum(billiardsModes),
    /** Computer difficulty for the other seat; null waits for a room member. */
    bot: level.nullable(),
    /** Points to win a carom game; ignored by pool. */
    target: z.union([z.literal(5), z.literal(10), z.literal(20)]).default(10),
  })
  .strict();
export type CreateBilliards = z.infer<typeof createBilliardsSchema>;

export const billiardsCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join') }).strict(),
  z.object({ action: z.literal('leave') }).strict(),
  z.object({ action: z.literal('add_bot'), level }).strict(),
  z.object({ action: z.literal('remove_bot') }).strict(),
  z
    .object({
      action: z.literal('shoot'),
      dx: z.number().min(-1.01).max(1.01),
      dy: z.number().min(-1.01).max(1.01),
      power: z.number().min(0).max(1),
      /** Where the tip strikes the cue ball: side (x) and top/back (y) spin, each −1..1. */
      spin: spinSchema.optional(),
      /** Where the cue ball is placed first, when the shooter has ball in hand. */
      place: z.object({ x: coord, y: coord }).strict().nullable().default(null),
    })
    .strict(),
  z.object({ action: z.literal('resign') }).strict(),
  z.object({ action: z.literal('rematch') }).strict(),
]);
export type BilliardsCommand = z.infer<typeof billiardsCommandSchema>;
export const billiardsRequestSchema = z
  .object({ version: z.number().int().min(0), command: billiardsCommandSchema })
  .strict();

const seatSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(40),
    bot: z.boolean(),
    level: level.optional(),
  })
  .strict();
export type BilliardsSeat = z.infer<typeof seatSchema>;
const ballSchema = z
  .object({ n: z.number().int().min(0).max(15), x: coord, y: coord, on: z.boolean() })
  .strict();
const group = z.enum(['SOLID', 'STRIPE']).nullable();

const shotRecordSchema = z
  .object({
    seq: z.number().int().min(1),
    by: seatSide,
    /** Balls before the shot (after any placement), so every viewer can replay it. */
    start: z.array(ballSchema).max(16),
    cue: z.number().int().min(0).max(15),
    dx: z.number(),
    dy: z.number(),
    power: z.number(),
    spin: spinSchema.optional(),
    text: z.string().max(160),
  })
  .strict();
export type BilliardsShot = z.infer<typeof shotRecordSchema>;

export const billiardsReasons = [
  'EIGHT_POTTED',
  'EIGHT_EARLY',
  'NINE_POTTED',
  'POINTS',
  'RESIGN',
  'LEFT',
] as const;
export type BilliardsReason = (typeof billiardsReasons)[number];

export const billiardsStateSchema = z
  .object({
    schema: z.literal(1),
    id: z.uuid(),
    room: z.uuid(),
    host: z.uuid(),
    name: z.string().min(1).max(60),
    version: z.number().int().min(0),
    status: z.enum(['WAITING', 'PLAYING', 'FINISHED', 'CANCELLED']),
    mode: z.enum(billiardsModes),
    target: z.number().int().min(1).max(20),
    seats: z.object({ a: seatSchema.nullable(), b: seatSchema.nullable() }).strict(),
    turn: seatSide,
    /** Who breaks the next rack. */
    breaker: seatSide,
    balls: z.array(ballSchema).max(16),
    groups: z.object({ a: group, b: group }).strict(),
    /** The shooter may place the cue ball first; `kitchen` keeps it behind the head string. */
    ballInHand: z.boolean(),
    kitchen: z.boolean(),
    /** The next shot is the break. */
    opening: z.boolean(),
    points: z.object({ a: z.number().int().min(0), b: z.number().int().min(0) }).strict(),
    shots: z.array(shotRecordSchema).max(BILLIARDS_SHOTS_KEPT),
    seq: z.number().int().min(0),
    result: z
      .object({ winner: seatSide.nullable(), reason: z.enum(billiardsReasons) })
      .strict()
      .nullable(),
    note: z.string().max(160).nullable(),
    /** Racks won at this table, by player id. */
    score: z.record(z.string(), z.number().int().min(0)),
    updatedAt: z.number().int(),
  })
  .strict();
export type BilliardsState = z.infer<typeof billiardsStateSchema>;
export type BilliardsSnapshot = { state: BilliardsState; serverNow: number };
export type BilliardsMember = { id: string; name: string; role: string };
export type BilliardsListItem = {
  id: string;
  name: string;
  status: BilliardsState['status'];
  mode: BilliardsMode;
  host: string;
  seats: BilliardsState['seats'];
  result: BilliardsState['result'];
  createdAt: string;
};
