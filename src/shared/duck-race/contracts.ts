import { z } from 'zod';

export const duckSkins = [
  'YELLOW',
  'WHITE',
  'BLACK',
  'NINJA',
  'PIRATE',
  'KING',
  'ASTRONAUT',
  'COWBOY',
  'CONICAL',
  'PARTY',
  'ROBOT',
  'RAINBOW',
] as const;
export type DuckSkin = (typeof duckSkins)[number];
export const tracks = ['SUNNY', 'TROPICAL', 'FESTIVAL'] as const;
export type DuckTrack = (typeof tracks)[number];
export const raceConfigSchema = z
  .object({
    mode: z.enum(['PLAYER', 'SONG', 'CUSTOM']).default('PLAYER'),
    track: z.enum(tracks).default('SUNNY'),
    duration: z
      .union([z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)])
      .default(60),
    capacity: z.number().int().min(2).max(30).default(30),
    photoFinishMs: z.number().int().min(20).max(1000).default(150),
    songPriority: z.enum(['OFF', 'AUTO', 'APPROVAL']).default('OFF'),
    rewards: z
      .object({
        enabled: z.boolean().default(false),
        winner: z.number().int().min(0).max(5000).default(500),
        runnerUp: z.number().int().min(0).max(5000).default(200),
        participation: z.number().int().min(0).max(100).default(0),
        budget: z.number().int().min(0).max(10000).default(1000),
      })
      .strict()
      .default({ enabled: false, winner: 500, runnerUp: 200, participation: 0, budget: 1000 }),
    tournament: z
      .object({
        kind: z
          .enum(['SINGLE', 'POINTS', 'ELIMINATION', 'WINNER_REMOVAL', 'TEAM'])
          .default('SINGLE'),
        rounds: z.number().int().min(1).max(10).default(3),
        advance: z.number().int().min(1).max(29).default(2),
      })
      .strict()
      .default({ kind: 'SINGLE', rounds: 3, advance: 2 }),
  })
  .strict();
export type RaceConfig = z.infer<typeof raceConfigSchema>;
export const defaultRaceConfig = raceConfigSchema.parse({});
export const duckRoomSettingsSchema = z
  .object({
    songEnabled: z.boolean().default(true),
    songOwnerOnly: z.boolean().default(true),
    maxSongEntries: z.number().int().min(2).max(30).default(30),
    songPriority: z.enum(['OFF', 'AUTO', 'APPROVAL']).default('OFF'),
  })
  .strict();
export type DuckRoomSettings = z.infer<typeof duckRoomSettingsSchema>;
export const defaultDuckRoomSettings = { ...duckRoomSettingsSchema.parse({}), version: 0 };
export const entryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    skin: z.enum(duckSkins).default('YELLOW'),
    team: z.string().trim().max(30).default(''),
  })
  .strict();
export type EntryInput = z.infer<typeof entryInputSchema>;
export type RaceEntry = EntryInput & {
  id: string;
  userId: string | null;
  songId: string | null;
  requestedBy?: string;
  ready: boolean;
};
export type RaceResult = { entryId: string; rank: number; finishMs: number; points: number };
export type RaceFrame = { at: number; positions: number[] };
export type RacePlan = {
  algorithm: 1;
  order: string[];
  frames: RaceFrame[];
  results: RaceResult[];
};
export type RaceStatus = 'LOBBY' | 'COUNTDOWN' | 'RACING' | 'FINISHED' | 'CANCELLED';
export type RaceSummary = {
  id: string;
  name: string;
  mode: RaceConfig['mode'];
  status: RaceStatus;
  count: number;
  createdAt: number;
};
export type Race = {
  id: string;
  roomId: string;
  name: string;
  host: string;
  version: number;
  status: RaceStatus;
  config: RaceConfig;
  entries: RaceEntry[];
  banned: string[];
  lobbyClosed: boolean;
  createdAt: number;
  startAt: number | null;
  commitment: string;
  lockedHash: string | null;
  algorithm: 1;
  seed: string | null;
  results: RaceResult[];
  frames: RaceFrame[];
  round: number;
  seriesId: string;
  previousId: string | null;
  songReward: string;
};
export type DuckSnapshot = {
  serverNow: number;
  settings: DuckRoomSettings & { version: number };
  race: Race | null;
  races: RaceSummary[];
  rounds: { id: string; round: number; status: RaceStatus; count: number; winner: string | null }[];
  standings: { entryId: string; name: string; team: string; points: number; wins: number }[];
  leaderboard: { userId: string; name: string; wins: number; races: number }[];
  presets: { id: string; name: string; entries: EntryInput[] }[];
};
export const createRaceSchema = z
  .object({
    action: z.literal('create'),
    name: z.string().trim().min(1).max(80),
    config: raceConfigSchema,
    entries: z.array(entryInputSchema).max(30).default([]),
    songs: z.array(z.uuid()).max(30).default([]),
  })
  .strict();
export const duckCommandSchema = z.discriminatedUnion('action', [
  createRaceSchema,
  z
    .object({
      action: z.literal('settings'),
      expectedVersion: z.number().int().min(0),
      settings: duckRoomSettingsSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('join'),
      skin: z.enum(duckSkins),
      team: z.string().trim().max(30).default(''),
    })
    .strict(),
  z.object({ action: z.literal('leave') }).strict(),
  z.object({ action: z.literal('ready'), ready: z.boolean() }).strict(),
  z.object({ action: z.literal('skin'), skin: z.enum(duckSkins) }).strict(),
  z
    .object({
      action: z.literal('configure'),
      config: raceConfigSchema,
      name: z.string().trim().min(1).max(80),
      entries: z.array(entryInputSchema).max(30).optional(),
      songs: z.array(z.uuid()).max(30).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('entries'),
      entries: z.array(entryInputSchema).max(30),
      songs: z.array(z.uuid()).max(30).default([]),
    })
    .strict(),
  z.object({ action: z.literal('lobby'), closed: z.boolean() }).strict(),
  z.object({ action: z.literal('kick'), user: z.uuid() }).strict(),
  z.object({ action: z.literal('transfer'), user: z.uuid() }).strict(),
  z.object({ action: z.literal('start') }).strict(),
  z.object({ action: z.literal('cancel') }).strict(),
  z.object({ action: z.literal('rematch'), nextRound: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal('approve_song') }).strict(),
  z
    .object({ action: z.literal('reaction'), emoji: z.enum(['🦆', '🔥', '👏', '💜', '🏁']) })
    .strict(),
  z
    .object({
      action: z.literal('save_preset'),
      name: z.string().trim().min(1).max(80),
      entries: z.array(entryInputSchema).min(2).max(30),
    })
    .strict(),
  z.object({ action: z.literal('delete_preset'), id: z.uuid() }).strict(),
]);
export type DuckCommand = z.infer<typeof duckCommandSchema>;
export type LockedInput = { id: string; algorithm: 1; config: RaceConfig; entries: RaceEntry[] };
