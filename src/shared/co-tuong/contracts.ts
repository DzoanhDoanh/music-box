import { z } from 'zod';

/** The computer's seat id; computer seats are never room members. */
export const CO_TUONG_BOT = '00000000-0000-4000-8000-0000000000b0';
export const CO_TUONG_MAX_MOVES = 600;

const side = z.enum(['r', 'b']);
const level = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const square = z.number().int().min(0).max(89);

export const createCoTuongSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    /** The side the creator plays. */
    side,
    /** Computer difficulty to fill the other seat at once; null waits for a room member. */
    bot: level.nullable(),
  })
  .strict();
export type CreateCoTuong = z.infer<typeof createCoTuongSchema>;

export const coTuongCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join') }).strict(),
  z.object({ action: z.literal('leave') }).strict(),
  z.object({ action: z.literal('switch_side') }).strict(),
  z.object({ action: z.literal('add_bot'), level }).strict(),
  z.object({ action: z.literal('remove_bot') }).strict(),
  z.object({ action: z.literal('move'), from: square, to: square }).strict(),
  z.object({ action: z.literal('undo') }).strict(),
  z.object({ action: z.literal('resign') }).strict(),
  z.object({ action: z.literal('offer_draw') }).strict(),
  z.object({ action: z.literal('answer_draw'), accept: z.boolean() }).strict(),
  z.object({ action: z.literal('rematch') }).strict(),
]);
export type CoTuongCommand = z.infer<typeof coTuongCommandSchema>;
export const coTuongRequestSchema = z
  .object({ version: z.number().int().min(0), command: coTuongCommandSchema })
  .strict();

const seatSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(40),
    bot: z.boolean(),
    level: level.optional(),
  })
  .strict();
export type CoTuongSeat = z.infer<typeof seatSchema>;

const moveSchema = z
  .object({
    from: square,
    to: square,
    piece: z.string().length(1),
    captured: z.string().length(1).nullable(),
    text: z.string().max(40),
    check: z.boolean(),
  })
  .strict();
export type CoTuongMove = z.infer<typeof moveSchema>;

export const coTuongReasons = [
  'CHECKMATE',
  'STALEMATE',
  'RESIGN',
  'LEFT',
  'DRAW_AGREED',
  'REPETITION',
  'NO_PROGRESS',
  'MATERIAL',
  'MOVE_LIMIT',
] as const;
export type CoTuongReason = (typeof coTuongReasons)[number];

export const coTuongStateSchema = z
  .object({
    schema: z.literal(1),
    id: z.uuid(),
    room: z.uuid(),
    host: z.uuid(),
    name: z.string().min(1).max(60),
    version: z.number().int().min(0),
    status: z.enum(['WAITING', 'PLAYING', 'FINISHED', 'CANCELLED']),
    seats: z.object({ r: seatSchema.nullable(), b: seatSchema.nullable() }).strict(),
    board: z.string().regex(/^[KAEHRCPkaehrcp.]{90}$/),
    turn: side,
    moves: z.array(moveSchema).max(CO_TUONG_MAX_MOVES),
    result: z
      .object({ winner: side.nullable(), reason: z.enum(coTuongReasons) })
      .strict()
      .nullable(),
    drawOffer: side.nullable(),
    /** The latest thing worth telling the table, e.g. a declined draw. */
    note: z.string().max(120).nullable(),
    /** Games won at this table, by player id, across rematches. */
    score: z.record(z.string(), z.number().int().min(0)),
    updatedAt: z.number().int(),
  })
  .strict();
export type CoTuongState = z.infer<typeof coTuongStateSchema>;
export type CoTuongSnapshot = { state: CoTuongState; serverNow: number };
export type CoTuongMember = { id: string; name: string; role: string };
export type CoTuongListItem = {
  id: string;
  name: string;
  status: CoTuongState['status'];
  host: string;
  seats: CoTuongState['seats'];
  result: CoTuongState['result'];
  moves: number;
  createdAt: string;
};

export const levelNames: Record<1 | 2 | 3, string> = { 1: 'Dễ', 2: 'Vừa', 3: 'Khó' };
export const sideNames = { r: 'Đỏ', b: 'Đen' } as const;
