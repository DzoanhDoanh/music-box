create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (id uuid primary key references auth.users on delete cascade, name text not null check(char_length(name) between 2 and 40), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.system_admins (user_id uuid primary key references auth.users on delete cascade, created_at timestamptz not null default now());
create table public.rooms (id uuid primary key default gen_random_uuid(), code text unique not null default upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,8)), name text not null check(char_length(name) between 2 and 80), description text not null default '' check(char_length(description)<=240), owner_id uuid not null references auth.users, version bigint not null default 0, next_position bigint not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table private.room_pins (room_id uuid primary key references public.rooms on delete cascade, pin_hash text);
create table public.room_settings (room_id uuid primary key references public.rooms on delete cascade,
  capacity int not null default 30 check(capacity between 2 and 200), max_per_member int not null default 5 check(max_per_member between 1 and 30), max_queue int not null default 100 check(max_queue between 1 and 500), max_duration int not null default 900 check(max_duration between 30 and 14400), queue_mode text not null default 'VOTING' check(queue_mode in ('FIFO','VOTING','FAIR','MANUAL')),
  voting boolean not null default true, allow_duplicates boolean not null default false, allow_remove_own boolean not null default true, require_approval boolean not null default false, auto_advance boolean not null default true, requests_enabled boolean not null default true, locked boolean not null default false, updated_at timestamptz not null default now());
create table public.room_members (room_id uuid references public.rooms on delete cascade, user_id uuid references public.profiles on delete cascade, role text not null default 'member' check(role in ('member','moderator','owner')), joined_at timestamptz not null default now(), primary key(room_id,user_id));
create table public.songs (youtube_video_id text primary key check(youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'), title text not null, channel text not null, thumbnail text not null, duration int not null check(duration>0), verified_at timestamptz not null default now());
create table public.queue_entries (id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms on delete cascade, youtube_video_id text not null references public.songs, requested_by uuid not null references public.profiles, requested_at timestamptz not null default now(), status text not null default 'QUEUED' check(status in ('PENDING','QUEUED','PREPARING','PLAYING','PLAYED','SKIPPED','FAILED','REMOVED')), position bigint not null, playback_run_id uuid, failure_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(room_id,position) deferrable initially deferred);
create unique index one_active_entry on public.queue_entries(room_id) where status in ('PREPARING','PLAYING');
create index queue_room_status on public.queue_entries(room_id,status,position);
create index queue_requester on public.queue_entries(room_id,requested_by,status);
create table public.votes (entry_id uuid references public.queue_entries on delete cascade, user_id uuid references public.profiles on delete cascade, created_at timestamptz not null default now(), primary key(entry_id,user_id));
create table public.playback_sessions (room_id uuid primary key references public.rooms on delete cascade, controller_id uuid, controller_user uuid references public.profiles, fence bigint not null default 0, lease_until timestamptz, run_id uuid, entry_id uuid references public.queue_entries, state text not null default 'IDLE' check(state in ('IDLE','WAITING_FOR_HOST','NEEDS_USER_GESTURE','LOADING','PLAYING','PAUSED','BUFFERING','ERROR')), intent text not null default 'PAUSED' check(intent in ('PLAYING','PAUSED')), position numeric not null default 0, updated_at timestamptz not null default now());
create table private.operation_receipts (actor uuid not null references auth.users on delete cascade, request_id uuid not null, scope text not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(), primary key(actor,request_id));
create table public.playback_history (id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms on delete cascade, entry_id uuid unique not null references public.queue_entries, run_id uuid unique not null, status text not null, played_at timestamptz not null default now());
create index history_room_date on public.playback_history(room_id,played_at desc);
create table public.playlists (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade, name text not null check(char_length(name) between 1 and 80), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.playlist_items (id uuid primary key default gen_random_uuid(), playlist_id uuid not null references public.playlists on delete cascade, youtube_video_id text not null references public.songs, created_at timestamptz not null default now(), unique(playlist_id,youtube_video_id));
create table public.favorites (user_id uuid references public.profiles on delete cascade, youtube_video_id text references public.songs, created_at timestamptz not null default now(), primary key(user_id,youtube_video_id));
create table public.bans (room_id uuid references public.rooms on delete cascade, user_id uuid references auth.users on delete cascade, created_at timestamptz not null default now(), primary key(room_id,user_id));
create table public.audit_logs (id uuid primary key default gen_random_uuid(), room_id uuid references public.rooms on delete cascade, actor uuid references auth.users on delete set null, action text not null, details jsonb not null default '{}', created_at timestamptz not null default now());
create index audit_room_date on public.audit_logs(room_id,created_at desc);
create table private.rate_limits (key text primary key, count int not null, window_at timestamptz not null);

create function private.is_member(r uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.room_members m where m.room_id=r and m.user_id=auth.uid()) and not exists(select 1 from public.bans b where b.room_id=r and b.user_id=auth.uid()) $$;
create function private.is_manager(r uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.room_members where room_id=r and user_id=auth.uid() and role in ('owner','moderator')) $$;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid), private.is_manager(uuid) to authenticated;

do $$ declare t text; begin
 foreach t in array array['profiles','system_admins','rooms','room_settings','room_members','songs','queue_entries','votes','playback_sessions','playback_history','playlists','playlist_items','favorites','bans','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create policy profiles_self on public.profiles for select to authenticated using(id=auth.uid());
create policy rooms_member on public.rooms for select to authenticated using(private.is_member(id));
create policy settings_member on public.room_settings for select to authenticated using(private.is_member(room_id));
create policy members_member on public.room_members for select to authenticated using(private.is_member(room_id));
create policy queue_member on public.queue_entries for select to authenticated using(private.is_member(room_id));
create policy playback_member on public.playback_sessions for select to authenticated using(private.is_member(room_id));
create policy history_member on public.playback_history for select to authenticated using(private.is_member(room_id));
create policy votes_member on public.votes for select to authenticated using(exists(select 1 from public.queue_entries q where q.id=entry_id and private.is_member(q.room_id)));
create policy songs_member on public.songs for select to authenticated using(exists(select 1 from public.queue_entries q where q.youtube_video_id=songs.youtube_video_id and private.is_member(q.room_id)) or exists(select 1 from public.favorites f where f.youtube_video_id=songs.youtube_video_id and f.user_id=auth.uid()));
create policy playlists_self on public.playlists for select to authenticated using(user_id=auth.uid());
create policy items_self on public.playlist_items for select to authenticated using(exists(select 1 from public.playlists p where p.id=playlist_id and p.user_id=auth.uid()));
create policy favorites_self on public.favorites for select to authenticated using(user_id=auth.uid());
create policy bans_manager on public.bans for select to authenticated using(private.is_manager(room_id));
create policy audit_manager on public.audit_logs for select to authenticated using(private.is_manager(room_id));

-- Only database-origin broadcasts are writable; clients may send presence only.
create policy room_broadcast_read on realtime.messages for select to authenticated using(extension in ('broadcast','presence') and private.is_member(case when realtime.topic() ~ '^room:[0-9a-f-]{36}$' then substring(realtime.topic() from 6)::uuid else null end));
create policy room_presence_write on realtime.messages for insert to authenticated with check(extension='presence' and private.is_member(case when realtime.topic() ~ '^room:[0-9a-f-]{36}$' then substring(realtime.topic() from 6)::uuid else null end));
create function private.room_changed() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform realtime.send(jsonb_build_object('version',new.version),'room.updated','room:'||new.id::text,true); return new;
end $$;
create trigger room_changed after update of version on public.rooms for each row execute function private.room_changed();
