import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError, errorMessages } from '../shared/domain';
import { authError } from '../shared/auth-errors';
import type { RoomCommand, Song } from '../shared/contracts';
import type {
  CommandResult,
  IdentityPort,
  RoomStore,
  ReadModel,
  RecommendationContext,
} from './ports';
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  YOUTUBE_API_KEY: string;
  APP_BASE_URL: string;
  ENABLE_LUDO?: string;
  ENABLE_WHEEL?: string;
  ENABLE_BAU_CUA?: string;
  ENABLE_DUCK_RACE?: string;
  ENABLE_TY_PHU?: string;
}
export type UpstreamTiming = (stage: 'auth' | 'limits' | 'data', ms: number) => void;
export function database(env: Env, timing?: UpstreamTiming): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.SUPABASE_PUBLISHABLE_KEY)
    throw new AppError('CONFIG_REQUIRED', 503);
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const started = performance.now();
        try {
          return await fetch(input, { ...init, signal: AbortSignal.timeout(10000) });
        } finally {
          const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
          timing?.(
            path.startsWith('/auth/')
              ? 'auth'
              : path.endsWith('/consume_rate_limit')
                ? 'limits'
                : 'data',
            performance.now() - started,
          );
        }
      },
    },
  });
}
export async function rpc<T>(
  db: SupabaseClient,
  name: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.rpc(name, params);
  if (error) {
    const code = Object.keys(errorMessages).find((k) => error.message === k);
    throw new AppError(
      code ?? 'BACKEND_UNAVAILABLE',
      code === 'PERMISSION_DENIED' ? 403 : code === 'RATE_LIMITED' ? 429 : code ? 409 : 503,
    );
  }
  return data as T;
}
export async function rateLimit(db: SupabaseClient, key: string, limit: number, seconds = 60) {
  const allowed = await rpc<boolean>(db, 'consume_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_seconds: seconds,
  });
  if (!allowed) {
    const code = key.startsWith('enqueue:') ? 'ENQUEUE_RATE_LIMITED' : 'RATE_LIMITED';
    throw new AppError(code, 429, seconds);
  }
}
export async function requireMember(
  db: SupabaseClient,
  actor: string,
  room: string,
  manager = false,
) {
  const { data, error } = await db
    .from('room_members')
    .select('role')
    .eq('room_id', room)
    .eq('user_id', actor)
    .maybeSingle();
  if (error) throw new AppError('BACKEND_UNAVAILABLE', 503);
  if (!data || (manager && !['owner', 'moderator'].includes(data.role)))
    throw new AppError('PERMISSION_DENIED', 403);
}

function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new AppError('BACKEND_UNAVAILABLE', 503);
  return result.data;
}

export class SupabaseRepository implements RoomStore, IdentityPort {
  constructor(private db: SupabaseClient) {}
  async verify(token: string) {
    const { data, error } = await this.db.auth.getUser(token).catch((error: unknown) => {
      throw authError(error);
    });
    if (error) throw authError(error);
    if (!data.user) throw new AppError('UNAUTHORIZED', 401);
    return data.user.id;
  }
  async deleteIdentity(actor: string) {
    const { error } = await this.db.auth.admin.deleteUser(actor);
    if (error) throw new AppError('BACKEND_UNAVAILABLE', 503);
  }
  call<T>(name: string, parameters: Record<string, unknown>) {
    return rpc<T>(this.db, name, parameters);
  }
  consume(key: string, limit: number, seconds = 60) {
    return rateLimit(this.db, key, limit, seconds);
  }
  requireMember(actor: string, room: string, manager = false) {
    return requireMember(this.db, actor, room, manager);
  }
  command(actor: string, room: string, key: string, command: RoomCommand) {
    return this.call<CommandResult>('room_command', {
      p_actor: actor,
      p_room: room,
      p_request: key,
      p_command: command,
    });
  }
  async listRooms(actor: string) {
    const [rooms, admin] = await Promise.all([
      this.db.from('room_members').select('role,room:rooms(*)').eq('user_id', actor).limit(100),
      this.db.from('system_admins').select('user_id').eq('user_id', actor).maybeSingle(),
    ]);
    return { rooms: checked(rooms), canCreate: Boolean(checked(admin)) };
  }
  async history(room: string, page: number) {
    const data = checked(
      await this.db
        .from('playback_history')
        .select(
          'id,status,played_at,entry:queue_entries(song:songs(*),requester:profiles!queue_entries_requested_by_fkey(name))',
        )
        .eq('room_id', room)
        .order('played_at', { ascending: false })
        .order('id')
        .range(page * 25, page * 25 + 24),
    );
    return { items: data, page };
  }
  async administration(room: string, page: number) {
    const [audit, bans] = await Promise.all([
      this.db
        .from('audit_logs')
        .select('*')
        .eq('room_id', room)
        .order('created_at', { ascending: false })
        .order('id')
        .range(page * 50, page * 50 + 49),
      this.db.from('bans').select('*').eq('room_id', room).limit(200),
    ]);
    return { audit: checked(audit), bans: checked(bans) };
  }
  async recommendationContext(room: string): Promise<RecommendationContext> {
    const [settings, queue, history] = await Promise.all([
      this.db.from('room_settings').select('max_duration').eq('room_id', room).single(),
      this.db
        .from('queue_entries')
        .select('status,song:songs(*)')
        .eq('room_id', room)
        .in('status', ['PENDING', 'QUEUED', 'PREPARING', 'PLAYING'])
        .order('position')
        .limit(500)
        .returns<RecommendationContext['queue']>(),
      this.db
        .from('playback_history')
        .select('status,played_at,entry:queue_entries(song:songs(*))')
        .eq('room_id', room)
        .order('played_at', { ascending: false })
        .order('id')
        .limit(300)
        .returns<{ status: string; played_at: string; entry: { song: Song | null } | null }[]>(),
    ]);
    const configuration = checked(settings);
    if (!configuration) throw new AppError('BACKEND_UNAVAILABLE', 503);
    return {
      maxDuration: configuration.max_duration,
      queue: checked(queue) ?? [],
      history: (checked(history) ?? []).map((row) => ({
        status: row.status,
        played_at: row.played_at,
        song: row.entry?.song ?? null,
      })),
    };
  }
  async library(actor: string) {
    const [favorites, playlists, profile] = await Promise.all([
      this.db
        .from('favorites')
        .select('song:songs(*)')
        .eq('user_id', actor)
        .order('created_at')
        .limit(200),
      this.db
        .from('playlists')
        .select('id,name,items:playlist_items(id,song:songs(*))')
        .eq('user_id', actor)
        .order('created_at')
        .limit(50),
      this.db.from('profiles').select('name').eq('id', actor).maybeSingle(),
    ]);
    return {
      favorites: checked(favorites)?.map((f) => f.song),
      playlists: checked(playlists),
      name: checked(profile)?.name ?? '',
    };
  }
  async ownsRoom(actor: string) {
    return Boolean(
      checked(await this.db.from('rooms').select('id').eq('owner_id', actor).limit(1))?.length,
    );
  }
  async saveSong(song: Song) {
    checked(await this.db.from('songs').upsert(song));
  }
  async cachedSearch(query: string): Promise<{ items: Song[] } | null> {
    const row = checked(
      await this.db
        .from('youtube_search_cache')
        .select('payload')
        .eq('query', query)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle(),
    );
    return row?.payload ?? null;
  }
  async cacheSearch(query: string, items: Song[], ttlSeconds = 600) {
    checked(
      await this.db.from('youtube_search_cache').upsert({
        query,
        payload: { items },
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      }),
    );
  }
  async staleVideos() {
    return (
      checked(
        await this.db
          .from('songs')
          .select('youtube_video_id')
          .lt('verified_at', new Date(Date.now() - 86400000).toISOString())
          .order('verified_at')
          .limit(20),
      ) ?? []
    ).map((item) => String(item.youtube_video_id));
  }
  async markUnavailable(id: string) {
    checked(
      await this.db
        .from('songs')
        .update({
          title: 'Video không còn khả dụng',
          channel: '',
          thumbnail: '/favicon.svg',
          duration: 1,
          verified_at: new Date().toISOString(),
        })
        .eq('youtube_video_id', id),
    );
  }
  async exportData(actor: string): Promise<ReadModel> {
    const result: ReadModel = { exported_at: new Date().toISOString(), user_id: actor };
    const selections = [
      { table: 'profiles', field: 'id', select: '*' },
      { table: 'favorites', field: 'user_id', select: '*,song:songs(*)' },
      { table: 'playlists', field: 'user_id', select: '*,items:playlist_items(*,song:songs(*))' },
      { table: 'queue_entries', field: 'requested_by', select: '*,song:songs(*)' },
    ];
    for (const item of selections) {
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += 500) {
        if (offset >= 50000) throw new AppError('BACKEND_UNAVAILABLE', 503);
        const data =
          checked(
            await this.db
              .from(item.table)
              .select(item.select)
              .eq(item.field, actor)
              .order(item.table === 'favorites' ? 'youtube_video_id' : 'id')
              .range(offset, offset + 499),
          ) ?? [];
        rows.push(...data);
        if (data.length < 500) break;
      }
      result[item.table] = rows;
    }
    const messages: unknown[] = [];
    for (let offset = 0; ; offset += 500) {
      if (offset >= 50000) throw new AppError('BACKEND_UNAVAILABLE', 503);
      const batch = await this.call<unknown[]>('chat_export', { p_actor: actor, p_offset: offset });
      messages.push(...batch);
      if (batch.length < 500) break;
    }
    result.chat_messages = messages;
    return result;
  }
}
