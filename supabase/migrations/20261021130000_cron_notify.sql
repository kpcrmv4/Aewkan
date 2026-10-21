-- Aewkan · R-017 · /api/cron/notify every 5 minutes from pg_cron + pg_net (not Vercel cron)
-- The site URL and CRON_SECRET live in Vault, never in git:
--   select vault.create_secret('<CRON_SECRET>', 'aewkan_cron_secret', 'Bearer for /api/cron/notify');
--   select vault.create_secret('https://<domain>', 'aewkan_site_url', 'site origin for cron calls');
-- Change later with vault.update_secret(id, new_value). Until both exist the job does nothing.
-- (on aewkan it was first created in public; move it from the SQL editor:
--  drop extension pg_net; create extension pg_net with schema extensions;)
create extension if not exists pg_net with schema extensions;

create or replace function public.cron_notify()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site text;
  v_secret text;
begin
  select decrypted_secret into v_site from vault.decrypted_secrets where name = 'aewkan_site_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'aewkan_cron_secret';
  if coalesce(v_site, '') = '' or coalesce(v_secret, '') = '' then
    return null; -- not deployed yet: nothing to call
  end if;
  return net.http_get(
    url := rtrim(v_site, '/') || '/api/cron/notify',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 15000
  );
end $$;

revoke all on function public.cron_notify() from public, anon, authenticated;

-- pg_cron upserts by job name
select cron.schedule('aewkan-notify', '*/5 * * * *', 'select public.cron_notify()');
