-- P2a follow-up (orchestrator): row times come from the database clock,
-- one-round KPIs for the jobs page, and a status change that keeps its reason.

-- 1 · stamp booking times with now(), whatever the client sent ----------------
create or replace function public.bookings_stamp_times()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- a (re)sent quote: sent now, deadline = now + the hours the staff chose
  if new.quote_sent_at is distinct from old.quote_sent_at and new.quote_sent_at is not null then
    new.quote_sent_at := now();
    if new.quote_hours is not null then
      new.quote_deadline := now() + make_interval(hours => new.quote_hours);
    end if;
  end if;
  if new.driver_id is distinct from old.driver_id then
    new.assigned_at := case when new.driver_id is null then null else now() end;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'traveling' and old.started_at is null then new.started_at := now(); end if;
    if new.status = 'done' then new.finished_at := now(); end if;
  end if;
  return new;
end $$;
create or replace trigger bookings_stamp_times before update on public.bookings
  for each row execute function public.bookings_stamp_times();
revoke all on function public.bookings_stamp_times() from public, anon, authenticated;

-- 2 · status log carries an optional reason set by admin_set_status ----------
create or replace function public.bookings_log_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := nullif(current_setting('app.status_reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.booking_events (booking_id, kind, data, actor)
    values (new.id, 'created', jsonb_build_object('status', new.status, 'mode', new.mode),
            coalesce('staff:' || auth.uid()::text, 'public'));
  elsif new.status is distinct from old.status then
    insert into public.booking_events (booking_id, kind, data, actor)
    values (new.id, 'status',
            jsonb_strip_nulls(jsonb_build_object('from', old.status, 'to', new.status, 'reason', v_reason)),
            coalesce('staff:' || auth.uid()::text, coalesce(current_setting('app.actor', true), 'system')));
  end if;
  return new;
end $$;

-- compare-and-set status change; runs as the caller so RLS decides (jobs.manage / quotes.manage)
create or replace function public.admin_set_status(p_booking uuid, p_from text, p_to text, p_reason text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_reason is not null and length(p_reason) > 300 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  perform set_config('app.status_reason', coalesce(p_reason, ''), true);
  update public.bookings set status = p_to
   where id = p_booking and status = p_from
  returning id into v_id;
  perform set_config('app.status_reason', '', true);
  return v_id is not null;
end $$;
revoke all on function public.admin_set_status(uuid, text, text, text) from public, anon;
grant execute on function public.admin_set_status(uuid, text, text, text) to authenticated;

-- 3 · jobs page KPIs in one round trip ---------------------------------------
-- runs as the caller: RLS limits rows to jobs.read; revenue only with finance.read
create or replace function public.admin_job_kpis()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with today as (select (now() at time zone 'Asia/Bangkok')::date as d),
  month_start as (select (date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok') as t)
  select jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(status, n) from (
        select b.status, count(*) as n from public.bookings b group by b.status) s), '{}'::jsonb),
    'today', (select count(*) from public.bookings b, today
               where b.travel_date = today.d and b.status <> 'cancelled'),
    'month_revenue', case when public.has_perm('finance.read') then
        (select coalesce(sum(coalesce(b.quote_price, b.price_total)), 0) from public.bookings b, month_start
          where b.created_at >= month_start.t
            and b.status not in ('quote_requested', 'quoted', 'quote_expired', 'cancelled'))
      end
  )
$$;
revoke all on function public.admin_job_kpis() from public, anon;
grant execute on function public.admin_job_kpis() to authenticated;

create index if not exists bookings_travel_date_idx on public.bookings(travel_date);
