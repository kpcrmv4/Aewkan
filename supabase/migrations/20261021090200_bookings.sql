-- Aewkan · P0 · bookings and everything hanging off them.
-- Customers and drivers write only through server routes (secret key) that verify
-- a job-link token; staff read/write through RLS with their own session.

-- ── booking numbers: YYYYMM + 3-digit running number, no dashes (202610118) ──
create table if not exists public.doc_counters (
  prefix  text primary key check (prefix ~ '^[0-9]{6}$'),
  last_no int not null check (last_no >= 0)
);

create or replace function public.next_booking_no()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text := to_char(now() at time zone 'Asia/Bangkok', 'YYYYMM');
  v_no int;
begin
  insert into public.doc_counters (prefix, last_no) values (v_prefix, 1)
  on conflict (prefix) do update set last_no = public.doc_counters.last_no + 1
  returning last_no into v_no;
  return v_prefix || lpad(v_no::text, greatest(3, length(v_no::text)), '0');
end $$;
revoke all on function public.next_booking_no() from public, anon, authenticated;

create table if not exists public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  booking_no          text not null unique,
  status              text not null default 'awaiting_deposit' check (status in (
                        'quote_requested','quoted','quote_expired','awaiting_deposit','deposit_review',
                        'confirmed','assigned','traveling','done','cancelled')),
  customer_name       text not null check (length(customer_name) between 1 and 120),
  customer_contact    text not null check (length(customer_contact) between 3 and 120),
  contact_channel     text not null default 'line' check (contact_channel in ('line','whatsapp','phone','email','other')),
  customer_lang       text not null default 'th' check (customer_lang in ('th','en')),
  hotel               text not null default '',
  note                text not null default '',
  pax                 int not null check (pax between 1 and 15),
  vehicle_key         text not null,
  pickup_place_id     uuid not null references public.places(id),
  travel_date         date not null,
  pickup_time         time not null,
  round_trip          boolean not null default true,
  lang_driver         boolean not null default false,
  festival            boolean not null default false,
  mode                text not null check (mode in ('hourly','daily','trip','oneway','quote')),
  rule_version        int not null references public.pricing_rule_sets(version),
  price_total         int not null check (price_total >= 0),
  deposit             int not null check (deposit >= 0),
  price_lines         jsonb not null default '[]'::jsonb check (jsonb_typeof(price_lines) = 'array'),
  plan                jsonb not null default '{}'::jsonb check (jsonb_typeof(plan) = 'object'),
  quote_price         int check (quote_price >= 0),
  quote_deposit       int check (quote_deposit >= 0),
  quote_hours         int check (quote_hours between 1 and 72),
  quote_message       text,
  quote_sent_at       timestamptz,
  quote_deadline      timestamptz,
  push_opt_in         boolean not null default false,
  driver_id           uuid references public.drivers(id) on delete set null,
  assigned_at         timestamptz,
  assigned_by         uuid references public.staff(id) on delete set null,
  started_at          timestamptz,
  finished_at         timestamptz,
  cash_collected      int check (cash_collected >= 0),
  parent_booking_id   uuid references public.bookings(id) on delete set null,
  return_discount_pct int check (return_discount_pct between 0 and 100),
  created_by          uuid references public.staff(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (quote_deadline is null or quote_sent_at is not null)
);
create index if not exists bookings_status_idx on public.bookings(status, travel_date);
create index if not exists bookings_travel_date_idx on public.bookings(travel_date);
create index if not exists bookings_driver_idx on public.bookings(driver_id, travel_date);
create index if not exists bookings_parent_idx on public.bookings(parent_booking_id);
create index if not exists bookings_pickup_idx on public.bookings(pickup_place_id);
create index if not exists bookings_rule_version_idx on public.bookings(rule_version);
create index if not exists bookings_assigned_by_idx on public.bookings(assigned_by);
create index if not exists bookings_created_by_idx on public.bookings(created_by);
create index if not exists bookings_created_at_idx on public.bookings(created_at desc);

create or replace function public.bookings_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.booking_no is null or new.booking_no = '' then
    new.booking_no := public.next_booking_no();
  end if;
  return new;
end $$;
create or replace trigger bookings_number before insert on public.bookings
  for each row execute function public.bookings_before_insert();
create or replace trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

create table if not exists public.booking_stops (
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  seq             int not null check (seq between 1 and 30),
  place_id        uuid not null references public.places(id),
  dwell_min       int not null default 60 check (dwell_min between 0 and 600),
  planned_minutes int not null default 0 check (planned_minutes >= 0),
  planned_km      numeric(6,1) not null default 0 check (planned_km >= 0),
  measured        boolean not null default false,
  checked_in_at   timestamptz,
  primary key (booking_id, seq)
);
create index if not exists booking_stops_place_idx on public.booking_stops(place_id);

-- token links: raw token only in the URL, sha256(pepper || token) here
create table if not exists public.job_links (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  audience     text not null check (audience in ('customer','driver')),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  last_seen_at timestamptz
);
create unique index if not exists job_links_one_live on public.job_links(booking_id, audience) where revoked_at is null;

create table if not exists public.booking_photos (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  kind         text not null check (kind in ('pickup','dropoff')),
  storage_path text not null,
  taken_at     timestamptz not null default now()
);
create index if not exists booking_photos_booking_idx on public.booking_photos(booking_id, kind, taken_at desc);

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  purpose       text not null default 'deposit' check (purpose in ('deposit','balance')),
  method        text not null check (method in ('promptpay_slip','stripe','beam','cash')),
  amount        int not null check (amount > 0),
  status        text not null default 'pending' check (status in ('pending','verifying','paid','failed','refunded','cancelled')),
  provider_ref  text,
  slip_path     text,
  verify_result jsonb,
  verified_by   uuid references public.staff(id) on delete set null,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  updated_at    timestamptz not null default now()
);
create index if not exists payments_booking_idx on public.payments(booking_id, created_at desc);
create index if not exists payments_status_idx on public.payments(status, created_at desc);
create unique index if not exists payments_provider_ref_uidx on public.payments(method, provider_ref) where provider_ref is not null;
create index if not exists payments_verified_by_idx on public.payments(verified_by);
create or replace trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create table if not exists public.commission_reports (
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  seq           int not null,
  place_id      uuid not null references public.places(id),
  rule_type     text not null check (rule_type in ('head','booking','sale')),
  sale_amount   int check (sale_amount >= 0),
  total         int not null check (total >= 0),
  driver_share  int not null check (driver_share >= 0),
  company_share int not null check (company_share >= 0),
  reported_at   timestamptz not null default now(),
  primary key (booking_id, seq),
  check (driver_share + company_share = total)
);
create index if not exists commission_reports_place_idx on public.commission_reports(place_id);

create table if not exists public.return_offers (
  booking_id        uuid primary key references public.bookings(id) on delete cascade,
  from_place_id     uuid not null references public.places(id),
  discount_pct      int not null check (discount_pct between 0 and 100),
  valid_until       date not null,
  sent_at           timestamptz not null default now(),
  dismissed_at      timestamptz,
  return_booking_id uuid references public.bookings(id) on delete set null
);
create index if not exists return_offers_from_idx on public.return_offers(from_place_id);
create index if not exists return_offers_return_idx on public.return_offers(return_booking_id);

create table if not exists public.booking_events (
  id         bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind       text not null,
  data       jsonb not null default '{}'::jsonb,
  actor      text not null default 'system',
  at         timestamptz not null default now()
);
create index if not exists booking_events_booking_idx on public.booking_events(booking_id, at desc);

-- status history written by the database itself, whoever changed the row
create or replace function public.bookings_log_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_events (booking_id, kind, data, actor)
    values (new.id, 'created', jsonb_build_object('status', new.status, 'mode', new.mode),
            coalesce('staff:' || auth.uid()::text, 'public'));
  elsif new.status is distinct from old.status then
    insert into public.booking_events (booking_id, kind, data, actor)
    values (new.id, 'status', jsonb_build_object('from', old.status, 'to', new.status),
            coalesce('staff:' || auth.uid()::text, coalesce(current_setting('app.actor', true), 'system')));
  end if;
  return new;
end $$;
create or replace trigger bookings_status_log after insert or update of status on public.bookings
  for each row execute function public.bookings_log_status();

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  job_link_id uuid not null references public.job_links(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_link_idx on public.push_subscriptions(job_link_id);

create table if not exists public.notification_log (
  id         bigint generated always as identity primary key,
  booking_id uuid references public.bookings(id) on delete cascade,
  channel    text not null check (channel in ('push','line','email','copy')),
  kind       text not null,
  status     text not null check (status in ('sent','failed','skipped')),
  error      text,
  created_at timestamptz not null default now()
);
create index if not exists notification_log_booking_idx on public.notification_log(booking_id, created_at desc);

-- third-party settings: non-secret config here, secret in Vault (secret_id)
create table if not exists public.integrations (
  key        text primary key check (key in ('line','stripe','beam','slip','routing','promptpay')),
  is_enabled boolean not null default false,
  config     jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  secret_id  uuid,
  has_secret boolean generated always as (secret_id is not null) stored,
  updated_by uuid references public.staff(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists integrations_updated_by_idx on public.integrations(updated_by);
create or replace trigger integrations_set_updated_at before update on public.integrations
  for each row execute function public.set_updated_at();
insert into public.integrations (key) values ('line'),('stripe'),('beam'),('slip'),('routing'),('promptpay')
on conflict (key) do nothing;

create or replace function public.set_integration_secret(p_key text, p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_perm('integrations.manage') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select secret_id into v_id from public.integrations where key = p_key for update;
  if not found then raise exception 'unknown_integration' using errcode = '22023'; end if;
  if p_secret is null or p_secret = '' then
    update public.integrations set secret_id = null, updated_by = auth.uid() where key = p_key;
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
    return;
  end if;
  if v_id is null then
    v_id := vault.create_secret(p_secret, 'aewkan_integration_' || p_key, 'Aewkan integration secret');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
  update public.integrations set secret_id = v_id, updated_by = auth.uid() where key = p_key;
end $$;
revoke all on function public.set_integration_secret(text, text) from public, anon;
grant execute on function public.set_integration_secret(text, text) to authenticated;

-- decrypted secret: service role only (server routes, webhooks)
create or replace function public.get_integration_secret(p_key text)
returns text language sql stable security definer set search_path = '' as $$
  select ds.decrypted_secret
  from public.integrations i join vault.decrypted_secrets ds on ds.id = i.secret_id
  where i.key = p_key;
$$;
revoke all on function public.get_integration_secret(text) from public, anon, authenticated;
grant execute on function public.get_integration_secret(text) to service_role;

-- quotes past their deadline expire on their own (pg_cron, every minute)
create or replace function public.expire_quotes()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  perform set_config('app.actor', 'system:expire_quotes', true);
  update public.bookings set status = 'quote_expired'
  where status = 'quoted' and quote_deadline is not null and quote_deadline < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.expire_quotes() from public, anon, authenticated;

-- ── grants + RLS ────────────────────────────────────────────────────────────
revoke all on public.doc_counters, public.bookings, public.booking_stops, public.job_links, public.booking_photos,
  public.payments, public.commission_reports, public.return_offers, public.booking_events,
  public.push_subscriptions, public.notification_log, public.integrations from public, anon, authenticated;

grant select, insert, update on public.bookings to authenticated;
grant select, insert, update, delete on public.booking_stops to authenticated;
grant select, insert, update on public.job_links to authenticated;
grant select on public.booking_photos, public.commission_reports, public.return_offers,
  public.booking_events, public.notification_log to authenticated;
grant select, update on public.payments to authenticated;
grant select on public.integrations to authenticated;
grant update (is_enabled, config, updated_by) on public.integrations to authenticated;

alter table public.doc_counters enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_stops enable row level security;
alter table public.job_links enable row level security;
alter table public.booking_photos enable row level security;
alter table public.payments enable row level security;
alter table public.commission_reports enable row level security;
alter table public.return_offers enable row level security;
alter table public.booking_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;
alter table public.integrations enable row level security;

create policy bookings_select on public.bookings for select to authenticated using ((select public.has_perm('jobs.read')));
create policy bookings_insert on public.bookings for insert to authenticated with check ((select public.has_perm('jobs.manage')));
create policy bookings_update on public.bookings for update to authenticated
  using ((select public.has_perm('jobs.manage')) or (select public.has_perm('quotes.manage')))
  with check ((select public.has_perm('jobs.manage')) or (select public.has_perm('quotes.manage')));

create policy booking_stops_select on public.booking_stops for select to authenticated using ((select public.has_perm('jobs.read')));
create policy booking_stops_insert on public.booking_stops for insert to authenticated with check ((select public.has_perm('jobs.manage')));
create policy booking_stops_update on public.booking_stops for update to authenticated
  using ((select public.has_perm('jobs.manage'))) with check ((select public.has_perm('jobs.manage')));
create policy booking_stops_delete on public.booking_stops for delete to authenticated using ((select public.has_perm('jobs.manage')));

create policy job_links_select on public.job_links for select to authenticated using ((select public.has_perm('jobs.read')));
create policy job_links_insert on public.job_links for insert to authenticated with check ((select public.has_perm('jobs.manage')));
create policy job_links_update on public.job_links for update to authenticated
  using ((select public.has_perm('jobs.manage'))) with check ((select public.has_perm('jobs.manage')));

create policy booking_photos_select on public.booking_photos for select to authenticated using ((select public.has_perm('jobs.read')));

create policy payments_select on public.payments for select to authenticated
  using ((select public.has_perm('finance.read')) or (select public.has_perm('jobs.manage')));
create policy payments_update on public.payments for update to authenticated
  using ((select public.has_perm('jobs.manage'))) with check ((select public.has_perm('jobs.manage')));

create policy commission_reports_select on public.commission_reports for select to authenticated
  using ((select public.has_perm('finance.read')) or (select public.has_perm('commission.manage')));

create policy return_offers_select on public.return_offers for select to authenticated using ((select public.has_perm('jobs.read')));

create policy booking_events_select on public.booking_events for select to authenticated using ((select public.has_perm('jobs.read')));

create policy notification_log_select on public.notification_log for select to authenticated using ((select public.has_perm('jobs.read')));

create policy integrations_select on public.integrations for select to authenticated using ((select public.has_perm('integrations.manage')));
create policy integrations_update on public.integrations for update to authenticated
  using ((select public.has_perm('integrations.manage'))) with check ((select public.has_perm('integrations.manage')));
-- doc_counters and push_subscriptions: no authenticated access at all (service role / definer only)

-- ── private storage buckets ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('job-photos', 'job-photos', false, 8388608, array['image/jpeg','image/png','image/webp']),
  ('payment-slips', 'payment-slips', false, 8388608, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy aewkan_job_photos_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and (select public.has_perm('jobs.read')));
create policy aewkan_payment_slips_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips' and ((select public.has_perm('finance.read')) or (select public.has_perm('jobs.manage'))));
