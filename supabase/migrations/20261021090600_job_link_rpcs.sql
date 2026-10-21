-- Aewkan · P0 contract extension · job links resolved in the database (supersedes R-009).
-- The pepper lives in Vault (one value for every environment); raw tokens exist only
-- in URLs; every customer/driver read and write is a SECURITY DEFINER function that
-- resolves the token first. anon never gets a table grant.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'aewkan_link_pepper') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'aewkan_link_pepper', 'Pepper for job-link and invite token hashes');
  end if;
end $$;

create or replace function public.token_hash(p_token text)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.digest(
    (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'aewkan_link_pepper') || ':' || p_token,
    'sha256'), 'hex');
$$;
revoke all on function public.token_hash(text) from public, anon, authenticated;

-- live link row for a raw token, or nothing
create or replace function public.job_link_for(p_token text)
returns public.job_links language sql stable security definer set search_path = '' as $$
  select l.* from public.job_links l
  where p_token is not null and length(p_token) between 40 and 60
    and l.token_hash = public.token_hash(p_token) and l.revoked_at is null;
$$;
revoke all on function public.job_link_for(text) from public, anon, authenticated;

-- staff (jobs.manage) or the service role issue a link; an older live link of the same audience is revoked
create or replace function public.issue_job_link(p_booking uuid, p_audience text, p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.has_perm('jobs.manage')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_audience not in ('customer', 'driver') then raise exception 'bad_audience' using errcode = '22023'; end if;
  if p_token is null or length(p_token) not between 40 and 60 then raise exception 'bad_token' using errcode = '22023'; end if;
  update public.job_links set revoked_at = now()
  where booking_id = p_booking and audience = p_audience and revoked_at is null;
  insert into public.job_links (booking_id, audience, token_hash)
  values (p_booking, p_audience, public.token_hash(p_token))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.issue_job_link(uuid, text, text) from public, anon;
grant execute on function public.issue_job_link(uuid, text, text) to authenticated, service_role;

-- photo object paths: '<booking_id>/<pickup|dropoff>/<file>' for a job that is assigned or traveling
create or replace function public.job_photo_path_ok(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.id::text = split_part(p_name, '/', 1)
      and split_part(p_name, '/', 2) in ('pickup', 'dropoff')
      and b.status in ('assigned', 'traveling', 'done')
  );
$$;
revoke all on function public.job_photo_path_ok(text) from public;
grant execute on function public.job_photo_path_ok(text) to anon, authenticated;

create policy aewkan_job_photos_link_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'job-photos' and public.job_photo_path_ok(name));
create policy aewkan_job_photos_link_read on storage.objects for select to anon
  using (bucket_id = 'job-photos' and public.job_photo_path_ok(name));

-- ── the job view ──────────────────────────────────────────────────────────────
-- One JSON document per audience. The driver sees the customer's contact and the
-- commission policy; the customer never sees commission or driver-only fields.
create or replace function public.get_job_view(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.job_links;
  b public.bookings;
  v_rules jsonb;
  v_driver boolean;
begin
  l := public.job_link_for(p_token);
  if l.id is null then return null; end if;
  update public.job_links set last_seen_at = now() where id = l.id;
  select * into b from public.bookings where id = l.booking_id;
  select r.rules into v_rules from public.pricing_rule_sets r where r.version = b.rule_version;
  v_driver := l.audience = 'driver';

  return jsonb_build_object(
    'audience', l.audience,
    'booking', jsonb_build_object(
      'id', b.id, 'booking_no', b.booking_no, 'status', b.status, 'lang', b.customer_lang,
      'travel_date', b.travel_date, 'pickup_time', to_char(b.pickup_time, 'HH24:MI'),
      'vehicle_key', b.vehicle_key, 'pax', b.pax, 'round_trip', b.round_trip, 'mode', b.mode,
      'rule_version', b.rule_version, 'price_total', b.price_total, 'deposit', b.deposit,
      'price_lines', b.price_lines, 'plan', b.plan, 'lang_driver', b.lang_driver,
      'quote_price', b.quote_price, 'quote_deposit', b.quote_deposit, 'quote_deadline', b.quote_deadline,
      'quote_message', b.quote_message, 'started_at', b.started_at, 'finished_at', b.finished_at,
      'cash_collected', case when v_driver then b.cash_collected end
    ),
    'pickup', (select jsonb_build_object('id', p.id, 'name_th', p.name_th, 'name_en', p.name_en, 'lat', p.lat, 'lng', p.lng)
               from public.places p where p.id = b.pickup_place_id),
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seq', s.seq, 'place_id', s.place_id, 'name_th', p.name_th, 'name_en', p.name_en, 'lat', p.lat, 'lng', p.lng,
        'dwell', s.dwell_min, 'planned_minutes', s.planned_minutes, 'planned_km', s.planned_km,
        'measured', s.measured, 'checked_in_at', s.checked_in_at,
        'commission', case when v_driver then (
          select jsonb_build_object('type', c.type, 'amount', c.amount, 'split_key', c.split_key, 'note', c.note)
          from public.commission_rules c where c.place_id = s.place_id) end,
        'commission_report', case when v_driver then (
          select jsonb_build_object('sale_amount', cr.sale_amount, 'total', cr.total, 'driver_share', cr.driver_share, 'company_share', cr.company_share)
          from public.commission_reports cr where cr.booking_id = b.id and cr.seq = s.seq) end
      ) order by s.seq)
      from public.booking_stops s join public.places p on p.id = s.place_id
      where s.booking_id = b.id), '[]'::jsonb),
    'driver', (select jsonb_build_object(
        'nickname', d.nickname, 'name_en', d.name_en, 'full_name', d.full_name, 'car_th', d.car_th, 'car_en', d.car_en,
        'plate', d.plate, 'phone', d.phone, 'line_id', d.line_id, 'langs', d.langs, 'langs_en', d.langs_en,
        'rating', d.rating, 'years', d.years)
      from public.drivers d where d.id = b.driver_id and b.status in ('assigned', 'traveling', 'done')),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('kind', ph.kind, 'taken_at', ph.taken_at, 'path', case when v_driver then ph.storage_path end)
             order by ph.taken_at desc)
      from public.booking_photos ph where ph.booking_id = b.id), '[]'::jsonb),
    'paid', coalesce((select sum(pm.amount) from public.payments pm where pm.booking_id = b.id and pm.status = 'paid'), 0),
    'customer', case when v_driver then jsonb_build_object(
        'name', b.customer_name, 'contact', b.customer_contact, 'channel', b.contact_channel,
        'hotel', b.hotel, 'note', b.note) end,
    'commission_policy', case when v_driver then jsonb_build_object(
        'policy_th', v_rules #>> '{commission,policy_th}', 'splits', v_rules #> '{commission,splits}',
        'assumed_spend', v_rules #> '{commission,assumed_spend}') end,
    'return_offer', (select jsonb_build_object(
        'from_place_id', ro.from_place_id, 'discount_pct', ro.discount_pct, 'valid_until', ro.valid_until,
        'dismissed_at', ro.dismissed_at,
        'return_booking_no', (select rb.booking_no from public.bookings rb where rb.id = ro.return_booking_id))
      from public.return_offers ro where ro.booking_id = b.id and l.audience = 'customer')
  );
end $$;
revoke all on function public.get_job_view(text) from public;
grant execute on function public.get_job_view(text) to anon, authenticated;

-- ── driver actions ────────────────────────────────────────────────────────────
create or replace function public.job_driver_link(p_token text)
returns public.job_links language plpgsql stable security definer set search_path = '' as $$
declare l public.job_links;
begin
  l := public.job_link_for(p_token);
  if l.id is null then raise exception 'link_not_found' using errcode = 'P0002'; end if;
  if l.audience <> 'driver' then raise exception 'driver_only' using errcode = '42501'; end if;
  return l;
end $$;
revoke all on function public.job_driver_link(text) from public, anon, authenticated;

create or replace function public.job_record_photo(p_token text, p_kind text, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.job_links;
begin
  l := public.job_driver_link(p_token);
  if p_kind not in ('pickup', 'dropoff') then raise exception 'bad_kind' using errcode = '22023'; end if;
  if split_part(p_path, '/', 1) <> l.booking_id::text or split_part(p_path, '/', 2) <> p_kind then
    raise exception 'bad_path' using errcode = '22023';
  end if;
  insert into public.booking_photos (booking_id, kind, storage_path) values (l.booking_id, p_kind, p_path);
end $$;

-- pickup photo required (the owner asked for proof at pickup and at drop-off)
create or replace function public.job_start(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.job_links;
begin
  l := public.job_driver_link(p_token);
  if not exists (select 1 from public.booking_photos where booking_id = l.booking_id and kind = 'pickup') then
    raise exception 'pickup_photo_required' using errcode = 'P0001';
  end if;
  perform set_config('app.actor', 'driver', true);
  update public.bookings set status = 'traveling', started_at = coalesce(started_at, now())
  where id = l.booking_id and status = 'assigned';
  if not found then raise exception 'not_assigned' using errcode = 'P0001'; end if;
end $$;

-- arrival at stop `p_seq`; the measured drive time feeds segments(source = checkins)
create or replace function public.job_checkin(p_token text, p_seq int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  l public.job_links;
  b public.bookings;
  s public.booking_stops;
  prev_place uuid;
  prev_time timestamptz;
  prev_dwell int := 0;
  v_minutes int;
  a uuid;
  z uuid;
begin
  l := public.job_driver_link(p_token);
  select * into b from public.bookings where id = l.booking_id;
  if b.status <> 'traveling' then raise exception 'not_traveling' using errcode = 'P0001'; end if;
  select * into s from public.booking_stops where booking_id = b.id and seq = p_seq for update;
  if s.booking_id is null then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if s.checked_in_at is not null then return null; end if;
  update public.booking_stops set checked_in_at = now() where booking_id = b.id and seq = p_seq;

  if p_seq = 1 then
    prev_place := b.pickup_place_id; prev_time := b.started_at;
  else
    select ps.place_id, ps.checked_in_at, ps.dwell_min into prev_place, prev_time, prev_dwell
    from public.booking_stops ps where ps.booking_id = b.id and ps.seq = p_seq - 1;
  end if;
  if prev_time is null then return null; end if;
  v_minutes := round(extract(epoch from (now() - prev_time)) / 60.0)::int - coalesce(prev_dwell, 0);
  if v_minutes between 2 and 600 and s.planned_km > 0 and prev_place <> s.place_id then
    a := least(prev_place, s.place_id); z := greatest(prev_place, s.place_id);
    insert into public.segments (place_a, place_b, source, km, minutes, samples, note)
    values (a, z, 'checkins', s.planned_km, v_minutes, 1, 'จากเช็กอินคนขับ')
    on conflict (place_a, place_b, source) do update
      set minutes = round((public.segments.minutes * public.segments.samples + excluded.minutes)::numeric / (public.segments.samples + 1))::int,
          samples = public.segments.samples + 1,
          measured_at = now(),
          note = 'จากเช็กอินคนขับ ' || (public.segments.samples + 1) || ' ทริป';
  end if;
  return v_minutes;
end $$;

-- commission for one stop, computed from the booking's own rule version
create or replace function public.job_commission(p_token text, p_seq int, p_sale int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.job_links;
  b public.bookings;
  c public.commission_rules;
  v_place uuid;
  v_rules jsonb;
  v_sale int;
  v_total int;
  v_pct int;
  v_driver int;
begin
  l := public.job_driver_link(p_token);
  select * into b from public.bookings where id = l.booking_id;
  select place_id into v_place from public.booking_stops where booking_id = b.id and seq = p_seq;
  if v_place is null then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  select * into c from public.commission_rules where place_id = v_place;
  if c.place_id is null then raise exception 'no_commission_here' using errcode = 'P0001'; end if;
  select rules into v_rules from public.pricing_rule_sets where version = b.rule_version;
  if c.type = 'sale' and (p_sale is null or p_sale < 0) then raise exception 'sale_required' using errcode = '22023'; end if;
  v_sale := case when c.type = 'sale' then p_sale end;
  v_total := case c.type when 'head' then c.amount * b.pax when 'booking' then c.amount else round(v_sale * c.amount / 100.0)::int end;
  v_pct := coalesce((v_rules #>> array['commission', 'splits', c.split_key, 'driver_pct'])::int, 0);
  v_driver := round(v_total * v_pct / 100.0)::int;
  insert into public.commission_reports (booking_id, seq, place_id, rule_type, sale_amount, total, driver_share, company_share)
  values (b.id, p_seq, v_place, c.type, v_sale, v_total, v_driver, v_total - v_driver)
  on conflict (booking_id, seq) do update set sale_amount = excluded.sale_amount, total = excluded.total,
    driver_share = excluded.driver_share, company_share = excluded.company_share, reported_at = now();
  return jsonb_build_object('total', v_total, 'driver_share', v_driver, 'company_share', v_total - v_driver);
end $$;

-- drop-off photo required; a one-way job opens the return-trip offer
create or replace function public.job_finish(p_token text, p_cash int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.job_links;
  b public.bookings;
  v_rules jsonb;
  v_last uuid;
  v_offer boolean := false;
begin
  l := public.job_driver_link(p_token);
  if p_cash is null or p_cash < 0 then raise exception 'cash_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.booking_photos where booking_id = l.booking_id and kind = 'dropoff') then
    raise exception 'dropoff_photo_required' using errcode = 'P0001';
  end if;
  perform set_config('app.actor', 'driver', true);
  update public.bookings set status = 'done', finished_at = now(), cash_collected = p_cash
  where id = l.booking_id and status = 'traveling'
  returning * into b;
  if b.id is null then raise exception 'not_traveling' using errcode = 'P0001'; end if;
  select rules into v_rules from public.pricing_rule_sets where version = b.rule_version;
  if not b.round_trip and coalesce((v_rules #>> '{return_offer,enabled}')::boolean, false) then
    select place_id into v_last from public.booking_stops where booking_id = b.id order by seq desc limit 1;
    insert into public.return_offers (booking_id, from_place_id, discount_pct, valid_until)
    values (b.id, v_last, coalesce((v_rules #>> '{return_offer,pct}')::int, 0),
            b.travel_date + coalesce((v_rules #>> '{return_offer,valid_days}')::int, 7))
    on conflict (booking_id) do nothing;
    v_offer := true;
  end if;
  return jsonb_build_object('return_offer', v_offer);
end $$;

-- ── customer actions ──────────────────────────────────────────────────────────
create or replace function public.job_return_dismiss(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.job_links;
begin
  l := public.job_link_for(p_token);
  if l.id is null or l.audience <> 'customer' then raise exception 'link_not_found' using errcode = 'P0002'; end if;
  update public.return_offers set dismissed_at = coalesce(dismissed_at, now()) where booking_id = l.booking_id;
end $$;

create or replace function public.job_push_subscribe(p_token text, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.job_links;
begin
  l := public.job_link_for(p_token);
  if l.id is null then raise exception 'link_not_found' using errcode = 'P0002'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'bad_endpoint' using errcode = '22023'; end if;
  insert into public.push_subscriptions (job_link_id, endpoint, p256dh, auth)
  values (l.id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set job_link_id = excluded.job_link_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

revoke all on function public.job_record_photo(text, text, text), public.job_start(text), public.job_checkin(text, int),
  public.job_commission(text, int, int), public.job_finish(text, int), public.job_return_dismiss(text),
  public.job_push_subscribe(text, text, text, text) from public;
grant execute on function public.job_record_photo(text, text, text), public.job_start(text), public.job_checkin(text, int),
  public.job_commission(text, int, int), public.job_finish(text, int), public.job_return_dismiss(text),
  public.job_push_subscribe(text, text, text, text) to anon, authenticated;
