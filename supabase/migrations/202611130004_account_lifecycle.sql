-- Preserve music-room history while removing personal identity on an authorized Auth deletion.
alter table public.queue_entries alter column requested_by drop not null;
alter table public.queue_entries drop constraint queue_entries_requested_by_fkey;
alter table public.queue_entries add constraint queue_entries_requested_by_fkey foreign key(requested_by) references public.profiles(id) on delete set null;
alter table public.playback_sessions drop constraint playback_sessions_controller_user_fkey;
alter table public.playback_sessions add constraint playback_sessions_controller_user_fkey foreign key(controller_user) references public.profiles(id) on delete set null;
create function private.departing_host() returns trigger language plpgsql security definer set search_path='' as $$ begin
 update public.playback_sessions set fence=fence+1,lease_until=now(),state='WAITING_FOR_HOST',updated_at=now() where controller_user=old.id;
 update public.rooms set version=version+1,updated_at=now() where id in (select room_id from public.room_members where user_id=old.id);
 return old;
end $$;
create trigger profile_departing before delete on public.profiles for each row execute function private.departing_host();
revoke all on function private.departing_host() from public,anon,authenticated;
