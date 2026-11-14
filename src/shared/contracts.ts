import { z } from 'zod';
export const uuid = z.uuid();
export const roomCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6,10}$/);
export const displayName = z.string().trim().min(2).max(40);
export const settingsSchema = z
  .object({
    capacity: z.number().int().min(2).max(200),
    max_per_member: z.number().int().min(1).max(30),
    max_queue: z.number().int().min(1).max(500),
    max_duration: z.number().int().min(30).max(14400),
    queue_mode: z.enum(['FIFO', 'VOTING', 'FAIR', 'MANUAL']),
    playback_mode: z.enum(['HOST_ONLY', 'ALL_DEVICES']).default('HOST_ONLY'),
    voting: z.boolean(),
    reorder_approval: z.boolean().default(false),
    allow_duplicates: z.boolean(),
    allow_remove_own: z.boolean(),
    require_approval: z.boolean(),
    auto_advance: z.boolean(),
    requests_enabled: z.boolean(),
    locked: z.boolean(),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  capacity: 30,
  max_per_member: 5,
  max_queue: 100,
  max_duration: 900,
  queue_mode: 'VOTING',
  playback_mode: 'HOST_ONLY',
  voting: true,
  reorder_approval: false,
  allow_duplicates: false,
  allow_remove_own: true,
  require_approval: false,
  auto_advance: true,
  requests_enabled: true,
  locked: false,
};
export const joinSchema = z.object({
  code: roomCode,
  name: displayName,
  pin: z.string().max(32).default(''),
});
export const createRoomSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().max(240).default(''),
  pin: z.string().max(32).default(''),
});
export const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('enqueue'), video_id: z.string().regex(/^[\w-]{11}$/) }),
  z.object({ action: z.enum(['remove', 'approve', 'reject']), entry_id: uuid }),
  z.object({ action: z.literal('vote'), entry_id: uuid, enabled: z.boolean() }),
  z
    .object({
      action: z.literal('reorder.propose'),
      entry_id: uuid,
      position: z.number().int().min(1).max(500),
      queue_ids: z.array(uuid).min(2).max(500),
    })
    .strict(),
  z
    .object({ action: z.literal('reorder.vote'), proposal_id: uuid, approved: z.boolean() })
    .strict(),
  z.object({ action: z.literal('reorder.cancel'), proposal_id: uuid }).strict(),
  z.object({
    action: z.literal('reorder'),
    ids: z.array(uuid).max(500),
    version: z.number().int().nonnegative(),
  }),
  z.object({ action: z.enum(['clear', 'rotate_code']) }),
  z.object({
    action: z.literal('settings'),
    settings: settingsSchema,
    name: z.string().min(2).max(80),
    description: z.string().max(240),
    pin: z.string().max(32).optional(),
  }),
  z.object({ action: z.enum(['kick', 'ban', 'unban', 'moderator', 'demote']), user_id: uuid }),
  z.object({ action: z.literal('claim'), controller_id: uuid }),
  z.object({
    action: z.enum(['heartbeat', 'release']),
    controller_id: uuid,
    fence: z.number().int().positive(),
    run_id: uuid.nullable().optional(),
    position: z.number().min(0).max(86400).optional(),
  }),
  z.object({
    action: z.enum(['next', 'ended', 'failed', 'play', 'pause', 'report', 'seek']),
    controller_id: uuid,
    fence: z.number().int().positive(),
    run_id: uuid.nullable(),
    state: z
      .enum(['IDLE', 'NEEDS_USER_GESTURE', 'LOADING', 'PLAYING', 'PAUSED', 'BUFFERING', 'ERROR'])
      .optional(),
    position: z.number().min(0).max(86400).optional(),
  }),
]);
export type RoomCommand = z.infer<typeof commandSchema>;
export const presenceSchema = z
  .object({
    session_id: uuid,
    sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    online: z.boolean(),
  })
  .strict();
export interface ReorderProposal {
  id: string;
  entry_id: string;
  title: string;
  requested_by: string | null;
  requester: string;
  from_position: number;
  target_position: number;
  electorate_count: number;
  required_votes: number;
  yes_votes: number;
  no_votes: number;
  my_vote: boolean | null;
  eligible: boolean;
  expires_at: string;
  status: 'OPEN' | 'APPLIED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'STALE';
}
export interface Song {
  youtube_video_id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  verified_at: string;
}
export const chatCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('send'),
      body: z
        .string()
        .trim()
        .min(1)
        .max(1000)
        .refine((value) => !value.includes(String.fromCharCode(0))),
    })
    .strict(),
  z.object({ action: z.literal('remove'), message_id: uuid }).strict(),
]);
export type ChatCommand = z.infer<typeof chatCommandSchema>;
export interface ChatMessage {
  id: string;
  sequence: number;
  sender_id: string;
  sender: string;
  body: string;
  created_at: string;
  deleted: boolean;
}
export interface ChatSnapshot {
  latest_sequence: number;
  read_sequence: number;
  unread_count: number;
  messages: ChatMessage[];
}
export interface QueueEntry {
  id: string;
  room_id: string;
  youtube_video_id: string;
  requested_by: string | null;
  requested_at: string;
  status: string;
  position: number;
  vote_count: number;
  song: Song;
  requester: string;
  voted: boolean;
}
export interface Room {
  id: string;
  code: string;
  name: string;
  description: string;
  owner_id: string;
  version: number;
  created_at: string;
}
export interface Member {
  user_id: string;
  name: string;
  role: 'member' | 'moderator' | 'owner';
  joined_at: string;
}
export interface Playback {
  controller_id: string | null;
  fence: number;
  lease_until: string | null;
  run_id: string | null;
  entry_id: string | null;
  state: string;
  intent: string;
  position: number;
  updated_at: string;
}
export interface Snapshot {
  reorder?: { online_count: number; proposal: ReorderProposal | null };
  server_time?: string;
  clock_offset_ms?: number;
  room: Room;
  settings: Settings;
  members: Member[];
  queue: QueueEntry[];
  playback: Playback;
  me: string;
  role: Member['role'];
  version: number;
}
export interface HistoryEntry {
  id: string;
  status: string;
  played_at: string;
  requester: string;
  song: Song;
}
export interface Playlist {
  id: string;
  name: string;
  items: {
    id: string;
    song: Song;
  }[];
}
export interface Library {
  favorites: Song[];
  playlists: Playlist[];
  name: string;
}
export const librarySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('profile'), name: displayName }),
  z.object({
    action: z.literal('favorite'),
    video_id: z.string().regex(/^[\w-]{11}$/),
    enabled: z.boolean(),
  }),
  z.object({ action: z.literal('playlist.create'), name: z.string().trim().min(1).max(80) }),
  z.object({
    action: z.literal('playlist.rename'),
    id: uuid,
    name: z.string().trim().min(1).max(80),
  }),
  z.object({ action: z.literal('playlist.delete'), id: uuid }),
  z.object({
    action: z.literal('playlist.add'),
    id: uuid,
    video_id: z.string().regex(/^[\w-]{11}$/),
  }),
  z.object({ action: z.literal('playlist.remove'), id: uuid, item_id: uuid }),
]);
