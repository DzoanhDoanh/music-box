create table public.youtube_search_cache (query text primary key, payload jsonb not null, expires_at timestamptz not null);
alter table public.youtube_search_cache enable row level security;
revoke all on public.youtube_search_cache from public,anon,authenticated;
grant all on public.youtube_search_cache to service_role;

create function public.maintenance_cleanup() returns void language plpgsql security definer set search_path='' as $$ begin
 delete from public.youtube_search_cache where expires_at<now();
 delete from private.rate_limits where window_at<now()-interval '2 days';
 delete from private.operation_receipts where created_at<now()-interval '7 days';
 -- Remove stale display metadata even when the upstream API is unavailable. Keep stable video IDs and application records.
 update public.songs set title='Video cần cập nhật',channel='',thumbnail='/favicon.svg',duration=1 where verified_at<now()-interval '29 days' and title<>'Video cần cập nhật';
end $$;
revoke all on function public.maintenance_cleanup() from public,anon,authenticated;
grant execute on function public.maintenance_cleanup() to service_role;
