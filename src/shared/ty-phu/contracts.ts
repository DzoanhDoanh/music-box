import { z } from 'zod';
import { cardIds, type CardId } from './cards';

export const tyPhuRulesSchema = z
  .object({
    startCash: z.number().int().min(1500).max(3000).multipleOf(100).default(2000),
    turnSeconds: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).default(45),
    /** Match length in minutes; null plays until someone wins or one player remains. */
    minutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.null()]).default(45),
    buyout: z.boolean().default(true),
  })
  .strict();
export type TyPhuRules = z.infer<typeof tyPhuRulesSchema>;
export const defaultTyPhuRules = tyPhuRulesSchema.parse({});

const tileIndex = z.number().int().min(0).max(31);
export const tyPhuCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join') }).strict(),
  z.object({ action: z.literal('leave') }).strict(),
  z.object({ action: z.literal('ready'), ready: z.boolean() }).strict(),
  z.object({ action: z.literal('start') }).strict(),
  z.object({ action: z.literal('roll') }).strict(),
  z.object({ action: z.literal('pay_jail') }).strict(),
  z.object({ action: z.literal('use_pass') }).strict(),
  z.object({ action: z.literal('buy'), level: z.number().int().min(0).max(3) }).strict(),
  z.object({ action: z.literal('build'), level: z.number().int().min(1).max(4) }).strict(),
  z.object({ action: z.literal('buyout') }).strict(),
  z.object({ action: z.literal('skip') }).strict(),
  z
    .object({ action: z.literal('card_target'), tile: tileIndex, player: z.uuid().optional() })
    .strict(),
  z.object({ action: z.literal('festival'), tile: tileIndex }).strict(),
  z.object({ action: z.literal('start_build'), tile: tileIndex }).strict(),
  z.object({ action: z.literal('fly'), to: tileIndex }).strict(),
  z.object({ action: z.literal('surrender') }).strict(),
]);
export type TyPhuCommand = z.infer<typeof tyPhuCommandSchema>;

export type TyPhuPlayer = {
  id: string;
  name: string;
  color: number;
  ready: boolean;
  cash: number;
  position: number;
  /** Laps started; everyone begins on lap 1 and gains one each time they pass Start. */
  lap: number;
  jailed: boolean;
  jailTries: number;
  status: 'ACTIVE' | 'BANKRUPT' | 'LEFT';
  /** Consecutive turn timeouts; three switch the seat to automatic play. */
  misses: number;
  auto: boolean;
  doubles: number;
  /** Held cards (at most one of each). */
  pass: boolean;
  shield: boolean;
  half: boolean;
  /** Pending ×2 on the next rent or tax payment. */
  fine: boolean;
  /** Next turn starts at the airport with a free choice of destination. */
  flyNext: boolean;
  freeFly: boolean;
};
export type TyPhuTileState = { owner: string; level: number; blackout: number };
export type TyPhuPhase =
  | 'ROLL'
  | 'BUY'
  | 'BUILD'
  | 'BUYOUT'
  | 'CARD'
  | 'FESTIVAL'
  | 'START_BUILD'
  | 'FLY';
export type WinReason = 'MONOPOLY' | 'LINE' | 'BEACHES' | 'LAST_STANDING' | 'TIME';
export type TyPhuEvent = { at: number; type: string; actor?: string; text: string };
export type TyPhuState = {
  schema: 1;
  id: string;
  room: string;
  host: string;
  name: string;
  version: number;
  status: 'WAITING' | 'PLAYING' | 'FINISHED' | 'CANCELLED';
  rules: TyPhuRules;
  players: TyPhuPlayer[];
  turn: string | null;
  phase: TyPhuPhase;
  /** Decision context for the current phase. `from` is the level at the start of the stop. */
  pending: { tile?: number; card?: CardId; from?: number } | null;
  tiles: (TyPhuTileState | null)[];
  festival: number | null;
  dice: [number, number] | null;
  /** True after a normal double: the same player rolls again once the stop resolves. */
  extraRoll: boolean;
  /** Remaining chance cards in order. Server-only: never sent to clients. */
  deck: CardId[];
  /** Net bank balance: Σ cash + bank always equals the money handed out at the start. */
  bank: number;
  deadline: number | null;
  startedAt: number | null;
  endsAt: number | null;
  winner: string | null;
  winReason: WinReason | null;
  log: TyPhuEvent[];
};
export type TyPhuPublicState = Omit<TyPhuState, 'deck'> & { deckCount: number };
export const cardIdSchema = z.enum(cardIds);
