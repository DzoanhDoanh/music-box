-- The current public app runs behind a tunnel, so Workers Cron Triggers do not fire there.
-- Settle unattended races in the hosted database instead. Read-time settlement stays active.
-- Embedded PostgreSQL used by the test harness does not ship the optional pg_cron extension.
do $migration$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
    perform cron.schedule(
      'roomtune-duck-settle',
      '* * * * *',
      $job$set statement_timeout = '20s'; select public.duck_race_tick();$job$
    );
  else
    raise notice 'pg_cron unavailable: use read-time settlement or the scheduled Worker handler';
  end if;
end
$migration$;
