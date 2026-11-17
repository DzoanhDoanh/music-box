import { z } from 'zod';

export const symbols = ['BAU', 'CUA', 'TOM', 'CA', 'GA', 'NAI'] as const;
export type BauSymbol = (typeof symbols)[number];
export const symbolNames: Record<BauSymbol, string> = {
  BAU: 'Bầu',
  CUA: 'Cua',
  TOM: 'Tôm',
  CA: 'Cá',
  GA: 'Gà',
  NAI: 'Nai',
};
export const symbolIcons: Record<BauSymbol, string> = {
  BAU: '🍐',
  CUA: '🦀',
  TOM: '🦐',
  CA: '🐟',
  GA: '🐓',
  NAI: '🦌',
};
const coin = z.number().int().min(1).max(1000000);
export const settingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    capacity: z.number().int().min(2).max(32).default(12),
    spectators: z.boolean().default(true),
    autoNext: z.boolean().default(false),
    minBet: coin.default(100),
    maxBet: coin.default(5000),
    playerLimit: coin.default(10000),
    tableLimit: coin.default(100000),
    customStake: z.boolean().default(true),
    undoBet: z.boolean().default(true),
    rotateDealer: z.boolean().default(true),
    dealerRounds: z.number().int().min(1).max(20).default(5),
    dealerMinimum: coin.default(1000),
    disconnectPolicy: z.enum(['ROTATE', 'PAUSE']).default('ROTATE'),
    bettingSeconds: z.number().int().min(10).max(120).default(20),
    lockingSeconds: z.number().int().min(2).max(10).default(3),
    shakingSeconds: z.number().int().min(2).max(15).default(4),
    revealingSeconds: z.number().int().min(3).max(15).default(5),
    resultSeconds: z.number().int().min(3).max(30).default(3),
    penaltyEnabled: z.boolean().default(true),
    penaltyTrigger: z.enum(['ZERO', 'BELOW_MINIMUM']).default('ZERO'),
    penaltyCount: z.number().int().min(1).max(3).default(1),
    penaltyPlayers: z.boolean().default(true),
    penaltyDealer: z.boolean().default(true),
    penaltyAnnounce: z.boolean().default(true),
    moderatorManage: z.boolean().default(false),
    moderatorRestore: z.boolean().default(false),
    publishHistory: z.boolean().default(true),
    showCommitment: z.boolean().default(true),
    showVerification: z.boolean().default(true),
  })
  .strict()
  .refine(
    (s) =>
      s.minBet <= s.maxBet &&
      s.maxBet <= s.playerLimit &&
      s.playerLimit <= s.tableLimit &&
      (s.customStake || [100, 500, 1000].some((n) => n >= s.minBet && n <= s.maxBet)),
    { message: 'Giới hạn cược phải tăng dần từ tối thiểu đến tổng bàn.' },
  );
export type BauSettings = z.infer<typeof settingsSchema>;
export const defaultSettings = settingsSchema.parse({});
export const economySchema = z
  .object({
    initial: z.number().int().min(100).max(1000000).default(10000),
    dailyEnabled: z.boolean().default(true),
    dailyAmount: coin.default(2000),
    reliefEnabled: z.boolean().default(true),
    reliefAmount: coin.default(1000),
    reliefThreshold: coin.default(200),
    reliefHours: z.number().int().min(1).max(72).default(6),
    timezone: z.enum(['Asia/Ho_Chi_Minh', 'UTC']).default('Asia/Ho_Chi_Minh'),
  })
  .strict();
export type Economy = z.infer<typeof economySchema>;
export const defaultEconomy = economySchema.parse({});
export const phases = [
  'WAITING_FOR_DEALER',
  'BETTING_OPEN',
  'BETTING_LOCKED',
  'SHAKING',
  'REVEALING',
  'SETTLING',
  'RESULT',
  'PAUSED',
  'CANCELLED',
] as const;
export type Phase = (typeof phases)[number];
export const phaseNames: Record<Phase, string> = {
  WAITING_FOR_DEALER: 'Chờ người cầm cái',
  BETTING_OPEN: 'Đang nhận cược',
  BETTING_LOCKED: 'Đã khóa cược',
  SHAKING: 'Đang lắc bát',
  REVEALING: 'Mở bát',
  SETTLING: 'Đang quyết toán',
  RESULT: 'Kết quả',
  PAUSED: 'Tạm dừng',
  CANCELLED: 'Đã hoàn cược',
};
const id = z.uuid();
export const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: z.string().trim().min(2).max(60) }).strict(),
  z.object({ action: z.literal('join'), spectator: z.boolean() }).strict(),
  ...(
    [
      'leave',
      'watch',
      'volunteer',
      'withdraw',
      'start',
      'shake',
      'reveal',
      'advance',
      'pause',
      'resume',
      'release',
      'daily',
      'relief',
    ] as const
  ).map((action) => z.object({ action: z.literal(action) }).strict()),
  z.object({ action: z.literal('bet'), round: id, symbol: z.enum(symbols), amount: coin }).strict(),
  z.object({ action: z.literal('undo'), round: id, symbol: z.enum(symbols) }).strict(),
  z.object({ action: z.literal('assign'), user: id }).strict(),
  z.object({ action: z.literal('kick'), user: id, ban: z.boolean() }).strict(),
  z.object({ action: z.literal('unban'), user: id }).strict(),
  z.object({ action: z.literal('cancel'), reason: z.string().trim().min(5).max(200) }).strict(),
  z.object({ action: z.literal('close'), name: z.string().min(2).max(60) }).strict(),
  z
    .object({ action: z.literal('settings'), settings: settingsSchema, confirmed: z.literal(true) })
    .strict(),
  z
    .object({
      action: z.literal('economy'),
      economy: economySchema,
      reason: z.string().trim().min(5).max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal('adjust'),
      user: id,
      amount: z
        .number()
        .int()
        .min(-1000000)
        .max(1000000)
        .refine((n) => n !== 0),
      reason: z.string().trim().min(5).max(200),
    })
    .strict(),
  z.object({ action: z.literal('restore'), penalty: id, entry: id }).strict(),
  z
    .object({ action: z.literal('reaction'), emoji: z.enum(['❤️', '👏', '🎉', '🦀', '😮', '🍀']) })
    .strict(),
]);
export type BauCommand = z.infer<typeof commandSchema>;
export interface Wallet {
  user_id: string;
  available: number;
  reserved: number;
  total: number;
  episode: number;
}
export interface Ledger {
  id: number;
  reason: string;
  available_delta: number;
  reserved_delta: number;
  available_after: number;
  reserved_after: number;
  created_at: string;
}
export interface BauMember {
  user_id: string;
  name: string;
  spectator: boolean;
  banned: boolean;
  online: boolean;
}
export interface Bet {
  user_id: string;
  symbol: BauSymbol;
  amount: number;
  payout: number | null;
  name: string;
}
export interface BauRound {
  id: string;
  number: number;
  status: Phase;
  dealer_id: string;
  settings: BauSettings;
  commitment: string;
  revealed_seed: string | null;
  dice: number[] | null;
  deadline: string | null;
  action_at: string | null;
  version: number;
  started_at: string;
  collateral: number;
  stake_total: number;
  dealer_net: number | null;
  bets: Bet[];
}
export interface BauTable {
  id: string;
  name: string;
  room_id: string;
  version: number;
  status: Phase;
  dealer_id: string | null;
  dealer_rounds: number;
  members: number;
  closed: boolean;
  pause_after_round: boolean;
}
export interface Penalty {
  id: string;
  user_id: string;
  round_id: string;
  status: string;
  songs: { id: string; title: string; restored: boolean }[];
  created_at: string;
  name: string;
}
export interface BauEvent {
  id: number;
  kind: string;
  actor: string | null;
  name: string;
  details: Record<string, unknown>;
  created_at: string;
}
export interface BauSnapshot {
  serverNow: number;
  settings: BauSettings;
  economy: Economy;
  wallet: Wallet;
  ledger: Ledger[];
  canDaily: boolean;
  canRelief: boolean;
  reliefAt: string | null;
  tables: BauTable[];
  table: BauTable | null;
  members: BauMember[];
  dealerQueue: { user_id: string; name: string }[];
  dealerAvailable: number | null;
  round: BauRound | null;
  history: BauRound[];
  penalties: Penalty[];
  events: BauEvent[];
  canManage: boolean;
  canRestore: boolean;
  systemAdmin: boolean;
  diagnostics: {
    pendingEvents: number;
    walletConsistent: boolean;
    collateralSafe: boolean;
    lastSettled: string | null;
  };
}
