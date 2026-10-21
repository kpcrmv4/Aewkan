-- Aewkan · P0 · scheduled jobs (pg_cron runs in UTC; the job itself is time-zone free)
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'aewkan-expire-quotes';
  perform cron.schedule('aewkan-expire-quotes', '* * * * *', 'select public.expire_quotes()');
end $$;
