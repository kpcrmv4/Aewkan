-- Aewkan · P4 (worker F) · deposits, staff review, provider settlement, LINE binding,
-- web-push keys and integration secrets. Additive only (L-002): new tables, new
-- functions, one partial index, one storage policy, one cron job.
--
-- Money is integer baht. Every amount a customer owes is recomputed here from the
-- booking row (deposit_due) — the browser never sends an amount.

-- ── 1 · payments: one pending slip per booking ──────────────────────────────────
-- A second slip while the first is still waiting replaces it on the same row
-- (job_pay_slip keeps the old path in verify_result.replaced).
create unique index if not exists payments_one_pending_slip on public.payments(booking_id)
  where method = 'promptpay_slip' and purpose = 'deposit' and status in ('pending', 'verifying');
create index if not exists payments_method_status_idx on public.payments(method, status, created_at desc);

-- deposit still owed: quote_deposit for a quoted booking, else deposit, minus deposits already paid.
-- SECURITY INVOKER: staff see it under RLS; definer functions below call it as owner.
create or replace function public.deposit_due(p_booking uuid)
returns int language sql stable set search_path = '' as $$
  select greatest(0,
    (case when b.quote_price is not null then coalesce(b.quote_deposit, b.deposit) else b.deposit end)
    - coalesce((select sum(p.amount) from public.payments p
                where p.booking_id = b.id and p.purpose = 'deposit' and p.status = 'paid'), 0))::int
  from public.bookings b where b.id = p_booking;
$$;
revoke all on function public.deposit_due(uuid) from public, anon;
grant execute on function public.deposit_due(uuid) to authenticated, service_role;

-- a deposit can be paid while waiting for it, while a slip is under review (replace it),
-- and on a quote whose deadline has not passed
create or replace function public.deposit_open(p_status text, p_deadline timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select p_status in ('awaiting_deposit', 'deposit_review')
      or (p_status = 'quoted' and (p_deadline is null or p_deadline > now()));
$$;
revoke all on function public.deposit_open(text, timestamptz) from public, anon, authenticated;

-- ── 2 · slip uploads: '<booking_id>/<uuid>.<jpg|jpeg|png|webp>' for a booking that takes a deposit ──
create or replace function public.payment_slip_path_ok(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$', false)
    and exists (
      select 1 from public.bookings b
      where b.id::text = split_part(p_name, '/', 1)
        and public.deposit_open(b.status, b.quote_deadline)
    );
$$;
revoke all on function public.payment_slip_path_ok(text) from public;
grant execute on function public.payment_slip_path_ok(text) to anon, authenticated;

-- insert only: no anon read, no update (a slip cannot be overwritten), staff read stays finance.read / jobs.manage
create policy aewkan_payment_slips_link_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'payment-slips' and public.payment_slip_path_ok(name));

-- ── 3 · new tables ──────────────────────────────────────────────────────────────
-- LINE userId ↔ booking, written by the LINE webhook when the customer sends their job link to the OA
create table if not exists public.line_links (
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  line_user_id text not null check (line_user_id ~ '^U[0-9a-f]{32}$'),
  created_at   timestamptz not null default now(),
  primary key (booking_id, line_user_id)
);
create index if not exists line_links_user_idx on public.line_links(line_user_id);

-- provider webhook idempotency (Stripe event id, Beam event:link id, LINE webhookEventId)
create table if not exists public.webhook_events (
  provider    text not null check (provider in ('stripe', 'beam', 'line')),
  event_id    text not null check (length(event_id) between 1 and 200),
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- web-push VAPID keys (R-010): one stable pair for every environment. The integrations.key
-- check has no 'push', so this is its own single-row table instead of a constraint change.
create table if not exists public.push_keys (
  id          boolean primary key default true check (id),
  public_key  text not null check (public_key ~ '^[A-Za-z0-9_-]{80,100}$'),
  subject     text not null check (subject ~ '^(mailto:|https://)' and length(subject) <= 200),
  secret_id   uuid not null,
  is_enabled  boolean not null default true,
  created_by  uuid references public.staff(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists push_keys_created_by_idx on public.push_keys(created_by);
create or replace trigger push_keys_set_updated_at before update on public.push_keys
  for each row execute function public.set_updated_at();

revoke all on public.line_links, public.webhook_events, public.push_keys from public, anon, authenticated;
grant select on public.line_links to authenticated;
alter table public.line_links enable row level security;
alter table public.webhook_events enable row level security;
alter table public.push_keys enable row level security;
create policy line_links_select on public.line_links for select to authenticated using ((select public.has_perm('jobs.read')));
-- webhook_events and push_keys: service role / definer functions only

-- ── 4 · customer (job-link token) functions ─────────────────────────────────────
-- everything the deposit panel needs; null for an unknown/revoked link or a driver link
create or replace function public.job_pay_info(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  l public.job_links;
  b public.bookings;
  v_open boolean;
  v_pp jsonb;
  v_line jsonb;
begin
  l := public.job_link_for(p_token);
  if l.id is null or l.audience <> 'customer' then return null; end if;
  select * into b from public.bookings where id = l.booking_id;
  v_open := public.deposit_open(b.status, b.quote_deadline);

  select case when i.is_enabled and coalesce(i.config ->> 'id', '') <> ''
              then jsonb_build_object('id', i.config ->> 'id', 'name', coalesce(i.config ->> 'name', '')) end
    into v_pp from public.integrations i where i.key = 'promptpay';
  select case when i.is_enabled and coalesce(i.config ->> 'basicId', '') <> ''
              then jsonb_build_object('basic_id', i.config ->> 'basicId',
                     'bound', exists (select 1 from public.line_links ll where ll.booking_id = b.id)) end
    into v_line from public.integrations i where i.key = 'line';

  return jsonb_build_object(
    'booking_id', b.id,
    'booking_no', b.booking_no,
    'status', b.status,
    'lang', b.customer_lang,
    'open', v_open,
    'due', public.deposit_due(b.id),
    'deadline', case when b.status = 'quoted' then b.quote_deadline end,
    'promptpay', case when v_open then v_pp end,
    'stripe', v_open and exists (select 1 from public.integrations i where i.key = 'stripe' and i.is_enabled and i.has_secret),
    'beam', v_open and exists (select 1 from public.integrations i where i.key = 'beam' and i.is_enabled and i.has_secret
                               and coalesce(i.config ->> 'merchantId', '') <> ''),
    'slip_auto', exists (select 1 from public.integrations i where i.key = 'slip' and i.is_enabled and i.has_secret),
    'slip', (select jsonb_build_object('id', p.id, 'status', p.status, 'amount', p.amount, 'uploaded_at', p.updated_at,
                      'checked', coalesce(p.verify_result ? 'check', false),
                      'note', case when p.status = 'failed' then p.verify_result #>> '{review,note}' end)
             from public.payments p
             where p.booking_id = b.id and p.method = 'promptpay_slip' and p.purpose = 'deposit'
             order by p.created_at desc limit 1),
    'paid', coalesce((select sum(p.amount) from public.payments p where p.booking_id = b.id and p.status = 'paid'), 0),
    'line', v_line,
    'push_key', (select k.public_key from public.push_keys k where k.is_enabled)
  );
end $$;
revoke all on function public.job_pay_info(text) from public;
grant execute on function public.job_pay_info(text) to anon, authenticated;

-- record an uploaded slip: amount recomputed here, booking → deposit_review
create or replace function public.job_pay_slip(p_token text, p_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.job_links;
  b public.bookings;
  v_due int;
  v_id uuid;
  v_old_path text;
  v_replaced jsonb;
begin
  l := public.job_link_for(p_token);
  if l.id is null or l.audience <> 'customer' then raise exception 'link_not_found' using errcode = 'P0002'; end if;
  select * into b from public.bookings where id = l.booking_id for update;
  if not public.deposit_open(b.status, b.quote_deadline) then raise exception 'not_payable' using errcode = 'P0001'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> b.id::text or not public.payment_slip_path_ok(p_path) then
    raise exception 'bad_path' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'payment-slips' and o.name = p_path) then
    raise exception 'slip_not_uploaded' using errcode = 'P0002';
  end if;
  v_due := public.deposit_due(b.id);
  if v_due <= 0 then raise exception 'nothing_due' using errcode = 'P0001'; end if;

  select p.id, p.slip_path, coalesce(p.verify_result -> 'replaced', '[]'::jsonb)
    into v_id, v_old_path, v_replaced
  from public.payments p
  where p.booking_id = b.id and p.method = 'promptpay_slip' and p.purpose = 'deposit' and p.status in ('pending', 'verifying')
  for update;

  if v_id is not null and v_old_path = p_path then
    return jsonb_build_object('payment_id', v_id, 'amount', v_due, 'replaced', false); -- a retried call
  end if;
  if v_id is not null then
    if jsonb_array_length(v_replaced) >= 10 then raise exception 'too_many_slips' using errcode = 'P0001'; end if;
    update public.payments
       set slip_path = p_path, amount = v_due, status = 'pending',
           verify_result = jsonb_build_object('replaced', v_replaced || to_jsonb(v_old_path))
     where id = v_id;
  else
    insert into public.payments (booking_id, purpose, method, amount, status, slip_path)
    values (b.id, 'deposit', 'promptpay_slip', v_due, 'pending', p_path)
    returning id into v_id;
  end if;

  insert into public.booking_events (booking_id, kind, data, actor)
  values (b.id, 'payment', jsonb_build_object('payment_id', v_id, 'action', 'slip', 'amount', v_due), 'customer');
  perform set_config('app.actor', 'customer', true);
  update public.bookings set status = 'deposit_review' where id = b.id and status in ('awaiting_deposit', 'quoted');
  return jsonb_build_object('payment_id', v_id, 'amount', v_due, 'replaced', v_old_path is not null);
end $$;
revoke all on function public.job_pay_slip(text, text) from public;
grant execute on function public.job_pay_slip(text, text) to anon, authenticated;

-- ── 5 · staff review (jobs.manage) ──────────────────────────────────────────────
-- approve: payment paid, booking confirmed (from any waiting state).
-- reject:  payment failed + reason; a booking under review goes back to waiting. A rejected
--          QUOTE deposit gets max(old deadline, now + quote_hours) so time spent waiting for
--          the review never expires the quote.
create or replace function public.admin_review_payment(p_payment uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  b public.bookings;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_review jsonb;
  v_to text;
begin
  if not public.has_perm('jobs.manage') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_approve is null then raise exception 'bad_request' using errcode = '22023'; end if;
  if v_note is not null and length(v_note) > 300 then raise exception 'note_too_long' using errcode = '22023'; end if;
  select * into p from public.payments where id = p_payment for update;
  if p.id is null then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if p.status not in ('pending', 'verifying') then raise exception 'payment_already_reviewed' using errcode = 'P0001'; end if;
  select * into b from public.bookings where id = p.booking_id for update;

  v_review := jsonb_strip_nulls(jsonb_build_object('approve', p_approve, 'by', auth.uid(), 'at', now(), 'note', v_note));
  perform set_config('app.status_reason',
    case when p_approve then 'อนุมัติมัดจำ' else 'สลิปไม่ผ่าน' || coalesce(': ' || v_note, '') end, true);

  if p_approve then
    update public.payments
       set status = 'paid', paid_at = now(), verified_by = auth.uid(),
           verify_result = coalesce(verify_result, '{}'::jsonb) || jsonb_build_object('review', v_review)
     where id = p.id;
    if p.purpose = 'deposit' and b.status in ('awaiting_deposit', 'quoted', 'quote_expired', 'deposit_review') then
      update public.bookings set status = 'confirmed' where id = b.id;
      v_to := 'confirmed';
    end if;
  else
    update public.payments
       set status = 'failed', verified_by = auth.uid(),
           verify_result = coalesce(verify_result, '{}'::jsonb) || jsonb_build_object('review', v_review)
     where id = p.id;
    if b.status = 'deposit_review'
       and not exists (select 1 from public.payments x where x.booking_id = b.id and x.purpose = 'deposit' and x.status = 'paid') then
      if b.quote_price is not null then
        update public.bookings
           set status = 'quoted',
               quote_deadline = case when b.quote_sent_at is null then b.quote_deadline
                 else greatest(coalesce(b.quote_deadline, now()), now() + make_interval(hours => greatest(coalesce(b.quote_hours, 2), 2))) end
         where id = b.id;
        v_to := 'quoted';
      else
        update public.bookings set status = 'awaiting_deposit' where id = b.id;
        v_to := 'awaiting_deposit';
      end if;
    end if;
  end if;
  perform set_config('app.status_reason', '', true);

  insert into public.booking_events (booking_id, kind, data, actor)
  values (b.id, 'payment',
          jsonb_strip_nulls(jsonb_build_object('payment_id', p.id, 'action', case when p_approve then 'approve' else 'reject' end,
                                               'method', p.method, 'amount', p.amount, 'note', v_note)),
          'staff:' || auth.uid()::text);
  return jsonb_build_object('payment_id', p.id, 'status', case when p_approve then 'paid' else 'failed' end,
                            'booking_id', b.id, 'booking_status', coalesce(v_to, b.status));
end $$;
revoke all on function public.admin_review_payment(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_payment(uuid, boolean, text) to authenticated;

-- money KPIs for /admin/payments in one round trip; runs as the caller (RLS: finance.read or jobs.manage)
create or replace function public.admin_payment_kpis()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with m as (select (date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') as t)
  select jsonb_build_object(
    'pending_slips', (select count(*) from public.payments p where p.method = 'promptpay_slip' and p.status in ('pending', 'verifying')),
    'pending_online', (select count(*) from public.payments p where p.method in ('stripe', 'beam') and p.status = 'pending'),
    'paid_month', (select coalesce(sum(p.amount), 0) from public.payments p, m where p.status = 'paid' and p.paid_at >= m.t),
    'paid_month_count', (select count(*) from public.payments p, m where p.status = 'paid' and p.paid_at >= m.t)
  )
$$;
revoke all on function public.admin_payment_kpis() from public, anon;
grant execute on function public.admin_payment_kpis() to authenticated;

-- ── 6 · server-side settlement (service role only: webhooks, slip auto-verify) ─────
create or replace function public.payment_settle(p_payment uuid, p_provider_ref text, p_result jsonb, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  b public.bookings;
  v_confirmed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into p from public.payments where id = p_payment for update;
  if p.id is null then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if p.status in ('paid', 'refunded') then
    return jsonb_build_object('already', true, 'booking_id', p.booking_id, 'confirmed', false);
  end if;
  update public.payments
     set status = 'paid', paid_at = now(), provider_ref = coalesce(p_provider_ref, provider_ref),
         verify_result = coalesce(verify_result, '{}'::jsonb)
           || jsonb_build_object('settle', coalesce(p_result, '{}'::jsonb) || jsonb_build_object('at', now(), 'by', p_actor, 'was', p.status))
   where id = p.id;
  select * into b from public.bookings where id = p.booking_id for update;
  perform set_config('app.actor', coalesce(nullif(p_actor, ''), 'system'), true);
  if p.purpose = 'deposit' and b.status in ('awaiting_deposit', 'quoted', 'quote_expired', 'deposit_review') then
    update public.bookings set status = 'confirmed' where id = b.id;
    v_confirmed := true;
  end if;
  insert into public.booking_events (booking_id, kind, data, actor)
  values (b.id, 'payment', jsonb_build_object('payment_id', p.id, 'action', 'paid', 'method', p.method, 'amount', p.amount, 'was', p.status),
          coalesce(nullif(p_actor, ''), 'system'));
  return jsonb_build_object('already', false, 'booking_id', b.id, 'confirmed', v_confirmed,
                            'booking_status', case when v_confirmed then 'confirmed' else b.status end,
                            'late', p.status in ('cancelled', 'failed'));
end $$;
revoke all on function public.payment_settle(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.payment_settle(uuid, text, jsonb, text) to service_role;

-- LINE webhook: the customer sent their own job link to the OA → bind their userId to the booking
create or replace function public.line_bind(p_token text, p_user text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.job_links;
  b public.bookings;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_user is null or p_user !~ '^U[0-9a-f]{32}$' then raise exception 'bad_user' using errcode = '22023'; end if;
  l := public.job_link_for(p_token);
  if l.id is null or l.audience <> 'customer' then return null; end if;
  select * into b from public.bookings where id = l.booking_id;
  insert into public.line_links (booking_id, line_user_id) values (b.id, p_user) on conflict do nothing;
  return jsonb_build_object('booking_id', b.id, 'booking_no', b.booking_no, 'lang', b.customer_lang);
end $$;
revoke all on function public.line_bind(text, text) from public, anon, authenticated;
grant execute on function public.line_bind(text, text) to service_role;

-- notification_log rows from a staff session when the service role is not configured (status 'skipped')
create or replace function public.log_notification(p_booking uuid, p_channel text, p_kind text, p_status text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_staff() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_kind is null or p_kind !~ '^[a-z_]{2,40}$' then raise exception 'bad_kind' using errcode = '22023'; end if;
  insert into public.notification_log (booking_id, channel, kind, status, error)
  values (p_booking, p_channel, p_kind, p_status, left(p_error, 300));
end $$;
revoke all on function public.log_notification(uuid, text, text, text, text) from public, anon;
grant execute on function public.log_notification(uuid, text, text, text, text) to authenticated, service_role;

-- ── 7 · integration secrets with several fields (one JSON secret per integration) ──
-- merge in SQL so a stored value never travels back to the browser: '' removes a field,
-- an absent field is kept. Returns the field names now set.
create or replace function public.merge_integration_secret(p_key text, p_patch jsonb)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  v_cur text;
  v_obj jsonb := '{}'::jsonb;
  k text;
  v jsonb;
begin
  if not public.has_perm('integrations.manage') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.integrations where key = p_key) then
    raise exception 'unknown_integration' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad_patch' using errcode = '22023'; end if;
  select ds.decrypted_secret into v_cur
  from public.integrations i join vault.decrypted_secrets ds on ds.id = i.secret_id
  where i.key = p_key;
  if v_cur is not null then
    begin
      v_obj := v_cur::jsonb;
    exception when others then
      v_obj := '{}'::jsonb;
    end;
    if jsonb_typeof(v_obj) <> 'object' then v_obj := '{}'::jsonb; end if;
  end if;
  for k, v in select e.key, e.value from jsonb_each(p_patch) e loop
    if k !~ '^[A-Za-z]{2,40}$' or jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 4000 then
      raise exception 'bad_patch' using errcode = '22023';
    end if;
    if v #>> '{}' = '' then
      v_obj := v_obj - k;
    else
      v_obj := v_obj || jsonb_build_object(k, v #>> '{}');
    end if;
  end loop;
  perform public.set_integration_secret(p_key, case when v_obj = '{}'::jsonb then '' else v_obj::text end);
  return array(select jsonb_object_keys(v_obj) order by 1);
end $$;
revoke all on function public.merge_integration_secret(text, jsonb) from public, anon;
grant execute on function public.merge_integration_secret(text, jsonb) to authenticated;

-- which secret fields are set, per integration (names only; '*' = one plain secret)
create or replace function public.integration_secret_fields()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_out jsonb := '{}'::jsonb;
  r record;
  o jsonb;
begin
  if not public.has_perm('integrations.manage') then raise exception 'permission_denied' using errcode = '42501'; end if;
  for r in select i.key, ds.decrypted_secret as s
           from public.integrations i left join vault.decrypted_secrets ds on ds.id = i.secret_id loop
    if r.s is null then
      v_out := v_out || jsonb_build_object(r.key, '[]'::jsonb);
    else
      begin
        o := r.s::jsonb;
      exception when others then
        o := null;
      end;
      if o is not null and jsonb_typeof(o) = 'object' then
        v_out := v_out || jsonb_build_object(r.key, (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from jsonb_object_keys(o) x));
      else
        v_out := v_out || jsonb_build_object(r.key, '["*"]'::jsonb);
      end if;
    end if;
  end loop;
  return v_out;
end $$;
revoke all on function public.integration_secret_fields() from public, anon;
grant execute on function public.integration_secret_fields() to authenticated;

-- ── 8 · web-push keys ───────────────────────────────────────────────────────────
-- generated once on the server from the integrations page; the private key goes straight to Vault
create or replace function public.set_push_keys(p_public text, p_private text, p_subject text, p_replace boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old uuid;
begin
  if not public.has_perm('integrations.manage') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_private is null or p_private !~ '^[A-Za-z0-9_-]{40,50}$' then raise exception 'bad_key' using errcode = '22023'; end if;
  select secret_id into v_old from public.push_keys where id for update;
  if v_old is not null and not coalesce(p_replace, false) then
    raise exception 'push_keys_exist' using errcode = 'P0001';
  end if;
  if v_old is not null then
    perform vault.update_secret(v_old, p_private);
    update public.push_keys set public_key = p_public, subject = p_subject, created_by = auth.uid() where id;
  else
    insert into public.push_keys (public_key, subject, secret_id, created_by)
    values (p_public, p_subject,
            vault.create_secret(p_private, 'aewkan_push_vapid_private', 'Web push VAPID private key'), auth.uid());
  end if;
end $$;
revoke all on function public.set_push_keys(text, text, text, boolean) from public, anon;
grant execute on function public.set_push_keys(text, text, text, boolean) to authenticated;

create or replace function public.set_push_settings(p_enabled boolean, p_subject text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('integrations.manage') then raise exception 'permission_denied' using errcode = '42501'; end if;
  update public.push_keys set is_enabled = coalesce(p_enabled, is_enabled), subject = coalesce(nullif(p_subject, ''), subject) where id;
  if not found then raise exception 'push_keys_missing' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.set_push_settings(boolean, text) from public, anon;
grant execute on function public.set_push_settings(boolean, text) to authenticated;

create or replace function public.get_push_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('integrations.manage') then raise exception 'permission_denied' using errcode = '42501'; end if;
  return (select jsonb_build_object('public_key', k.public_key, 'subject', k.subject, 'is_enabled', k.is_enabled,
                                    'created_at', k.created_at, 'updated_at', k.updated_at)
          from public.push_keys k where k.id);
end $$;
revoke all on function public.get_push_config() from public, anon;
grant execute on function public.get_push_config() to authenticated;

create or replace function public.get_push_private_key()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('public_key', k.public_key, 'private_key', ds.decrypted_secret, 'subject', k.subject)
  from public.push_keys k join vault.decrypted_secrets ds on ds.id = k.secret_id
  where k.id and k.is_enabled;
$$;
revoke all on function public.get_push_private_key() from public, anon, authenticated;
grant execute on function public.get_push_private_key() to service_role;

-- ── 9 · housekeeping: unpaid card/e-wallet checkouts older than a day are cancelled ──
create or replace function public.expire_online_payments()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.payments
     set status = 'cancelled', verify_result = coalesce(verify_result, '{}'::jsonb) || jsonb_build_object('expired_at', now())
   where method in ('stripe', 'beam') and status = 'pending' and created_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.expire_online_payments() from public, anon, authenticated;

select cron.schedule('aewkan-expire-online-payments', '17 * * * *', 'select public.expire_online_payments()');
