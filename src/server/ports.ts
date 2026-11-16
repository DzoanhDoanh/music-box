import type { RoomCommand, Snapshot, Song } from '../shared/contracts';

export type ReadModel = Record<string, unknown>;
export type CommandResult = { playback: Snapshot['playback']; version: number };
export interface RecommendationContext {
  maxDuration: number;
  queue: { status: string; song: Song | null }[];
  history: { status: string; played_at: string; song: Song | null }[];
}
export interface IdentityPort {
  verify(token: string): Promise<string>;
  deleteIdentity(actor: string): Promise<void>;
}
/** Transaction boundaries are implemented by PostgreSQL, independently of HTTP hosting. */
export interface RoomStore {
  call<T>(name: string, parameters: Record<string, unknown>): Promise<T>;
  consume(key: string, limit: number, seconds?: number): Promise<void>;
  requireMember(actor: string, room: string, manager?: boolean): Promise<void>;
  command(actor: string, room: string, key: string, command: RoomCommand): Promise<CommandResult>;
  listRooms(actor: string): Promise<ReadModel>;
  history(room: string, page: number): Promise<ReadModel>;
  recommendationContext(room: string): Promise<RecommendationContext>;
  administration(room: string, page: number): Promise<ReadModel>;
  library(actor: string): Promise<ReadModel>;
  exportData(actor: string): Promise<ReadModel>;
  ownsRoom(actor: string): Promise<boolean>;
  saveSong(song: Song): Promise<void>;
  cachedSearch(query: string): Promise<{ items: Song[] } | null>;
  cacheSearch(query: string, items: Song[], ttlSeconds?: number): Promise<void>;
  staleVideos(): Promise<string[]>;
  markUnavailable(id: string): Promise<void>;
}
