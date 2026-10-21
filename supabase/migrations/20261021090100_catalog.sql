-- Aewkan · P0 · catalog: places, measured segments, versioned pricing rules,
-- commission policy, trip templates, drivers.
-- Public (anon) never reads these tables directly: get_public_catalog() returns
-- a field-limited copy (no commission, no hidden places, no driver phones).

create table if not exists public.places (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  name_th           text not null check (length(name_th) between 1 and 120),
  name_en           text not null check (length(name_en) between 1 and 120),
  lat               double precision not null check (lat between 5 and 21),
  lng               double precision not null check (lng between 97 and 106),
  category          text not null check (category in ('pickup','city','temple','nature','craft','province')),
  is_pickup         boolean not null default false,
  is_mountain       boolean not null default false,
  default_dwell_min int not null default 60 check (default_dwell_min between 0 and 600),
  label_pos         text not null default 'r' check (label_pos in ('l','r','t','b')),
  is_hidden         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists places_category_idx on public.places(category) where not is_hidden;
create or replace trigger places_set_updated_at before update on public.places
  for each row execute function public.set_updated_at();

alter table public.app_settings
  add constraint app_settings_base_place_fk foreign key (base_place_id) references public.places(id) on delete set null;
create index if not exists app_settings_base_place_idx on public.app_settings(base_place_id);

-- real road distance/time per pair, stored once per unordered pair and source.
-- planner priority: driven > checkins (samples >= 3) > routing > straight-line estimate
create table if not exists public.segments (
  place_a     uuid not null references public.places(id) on delete cascade,
  place_b     uuid not null references public.places(id) on delete cascade,
  source      text not null check (source in ('driven','checkins','routing')),
  km          numeric(6,1) not null check (km > 0),
  minutes     int not null check (minutes > 0),
  samples     int not null default 1 check (samples >= 1),
  note        text not null default '',
  measured_at timestamptz not null default now(),
  primary key (place_a, place_b, source),
  check (place_a < place_b)
);
create index if not exists segments_place_b_idx on public.segments(place_b);

-- whole rule set as one versioned document; bookings keep the version they were priced with
create table if not exists public.pricing_rule_sets (
  version    int primary key,
  rules      jsonb not null check (jsonb_typeof(rules) = 'object'),
  note       text not null default '',
  is_current boolean not null default false,
  created_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists pricing_rule_sets_one_current on public.pricing_rule_sets(is_current) where is_current;
create index if not exists pricing_rule_sets_created_by_idx on public.pricing_rule_sets(created_by);

-- publishing a new version flips is_current atomically
create or replace function public.publish_rule_set(p_rules jsonb, p_note text default '')
returns int language plpgsql security definer set search_path = '' as $$
declare v_next int;
begin
  if not public.has_perm('pricing.manage') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rules) <> 'object' then
    raise exception 'rules_must_be_object' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v_next from public.pricing_rule_sets;
  update public.pricing_rule_sets set is_current = false where is_current;
  insert into public.pricing_rule_sets (version, rules, note, is_current, created_by)
  values (v_next, p_rules, coalesce(p_note, ''), true, auth.uid());
  return v_next;
end $$;
revoke all on function public.publish_rule_set(jsonb, text) from public, anon;
grant execute on function public.publish_rule_set(jsonb, text) to authenticated;

create table if not exists public.commission_rules (
  place_id   uuid primary key references public.places(id) on delete cascade,
  type       text not null check (type in ('head','booking','sale')),
  amount     int not null check (amount >= 0),
  split_key  text not null check (split_key ~ '^[a-z_]{2,30}$'),
  note       text not null default '',
  updated_at timestamptz not null default now()
);
create or replace trigger commission_rules_set_updated_at before update on public.commission_rules
  for each row execute function public.set_updated_at();

create table if not exists public.trip_templates (
  id           uuid primary key default gen_random_uuid(),
  name_th      text not null,
  name_en      text not null,
  sub_th       text not null default '',
  sub_en       text not null default '',
  stops        jsonb not null check (jsonb_typeof(stops) = 'array'),  -- [{ "place_id": uuid, "dwell": int }]
  round_trip   boolean not null default true,
  vehicle_key  text not null default 'sedan',
  date_hint    date,
  sort         int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists trip_templates_active_idx on public.trip_templates(sort) where is_active;

create table if not exists public.drivers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  nickname    text not null,
  name_en     text not null default '',
  phone       text not null default '',
  line_id     text not null default '',
  langs       text[] not null default '{ไทย}',
  langs_en    text[] not null default '{Thai}',
  vehicle_key text not null,
  car_th      text not null default '',
  car_en      text not null default '',
  plate       text not null default '',
  years       int not null default 0 check (years between 0 and 60),
  rating      numeric(2,1) not null default 5.0 check (rating between 0 and 5),
  note        text not null default '',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists drivers_vehicle_idx on public.drivers(vehicle_key) where is_active;
create or replace trigger drivers_set_updated_at before update on public.drivers
  for each row execute function public.set_updated_at();

create table if not exists public.driver_off_days (
  driver_id uuid not null references public.drivers(id) on delete cascade,
  day       date not null,
  reason    text not null default '',
  primary key (driver_id, day)
);
create index if not exists driver_off_days_day_idx on public.driver_off_days(day);

-- ── grants + RLS ────────────────────────────────────────────────────────────
revoke all on public.places, public.segments, public.pricing_rule_sets, public.commission_rules,
  public.trip_templates, public.drivers, public.driver_off_days from public, anon, authenticated;

grant select, insert, update on public.places to authenticated;
grant select, insert, update, delete on public.segments, public.commission_rules, public.trip_templates,
  public.driver_off_days to authenticated;
grant select on public.pricing_rule_sets to authenticated;
grant select, insert, update on public.drivers to authenticated;

alter table public.places enable row level security;
alter table public.segments enable row level security;
alter table public.pricing_rule_sets enable row level security;
alter table public.commission_rules enable row level security;
alter table public.trip_templates enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_off_days enable row level security;

create policy places_select on public.places for select to authenticated using ((select public.is_staff()));
create policy places_insert on public.places for insert to authenticated with check ((select public.has_perm('places.manage')));
create policy places_update on public.places for update to authenticated
  using ((select public.has_perm('places.manage'))) with check ((select public.has_perm('places.manage')));

create policy segments_select on public.segments for select to authenticated using ((select public.is_staff()));
create policy segments_insert on public.segments for insert to authenticated with check ((select public.has_perm('places.manage')));
create policy segments_update on public.segments for update to authenticated
  using ((select public.has_perm('places.manage'))) with check ((select public.has_perm('places.manage')));
create policy segments_delete on public.segments for delete to authenticated using ((select public.has_perm('places.manage')));

create policy pricing_rule_sets_select on public.pricing_rule_sets for select to authenticated using ((select public.is_staff()));

create policy commission_rules_select on public.commission_rules for select to authenticated using ((select public.is_staff()));
create policy commission_rules_insert on public.commission_rules for insert to authenticated with check ((select public.has_perm('commission.manage')));
create policy commission_rules_update on public.commission_rules for update to authenticated
  using ((select public.has_perm('commission.manage'))) with check ((select public.has_perm('commission.manage')));
create policy commission_rules_delete on public.commission_rules for delete to authenticated using ((select public.has_perm('commission.manage')));

create policy trip_templates_select on public.trip_templates for select to authenticated using ((select public.is_staff()));
create policy trip_templates_insert on public.trip_templates for insert to authenticated with check ((select public.has_perm('places.manage')));
create policy trip_templates_update on public.trip_templates for update to authenticated
  using ((select public.has_perm('places.manage'))) with check ((select public.has_perm('places.manage')));
create policy trip_templates_delete on public.trip_templates for delete to authenticated using ((select public.has_perm('places.manage')));

create policy drivers_select on public.drivers for select to authenticated using ((select public.has_perm('jobs.read')));
create policy drivers_insert on public.drivers for insert to authenticated with check ((select public.has_perm('drivers.manage')));
create policy drivers_update on public.drivers for update to authenticated
  using ((select public.has_perm('drivers.manage'))) with check ((select public.has_perm('drivers.manage')));

create policy driver_off_days_select on public.driver_off_days for select to authenticated using ((select public.has_perm('jobs.read')));
create policy driver_off_days_insert on public.driver_off_days for insert to authenticated with check ((select public.has_perm('drivers.manage')));
create policy driver_off_days_update on public.driver_off_days for update to authenticated
  using ((select public.has_perm('drivers.manage'))) with check ((select public.has_perm('drivers.manage')));
create policy driver_off_days_delete on public.driver_off_days for delete to authenticated using ((select public.has_perm('drivers.manage')));

-- ── public catalog (anon) ───────────────────────────────────────────────────
-- best segment per pair: driven > checkins with >= 3 samples > routing
create or replace function public.get_public_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'name_th', p.name_th, 'name_en', p.name_en,
        'lat', p.lat, 'lng', p.lng, 'category', p.category, 'is_pickup', p.is_pickup,
        'is_mountain', p.is_mountain, 'default_dwell_min', p.default_dwell_min, 'label_pos', p.label_pos
      ) order by p.name_th)
      from public.places p where not p.is_hidden), '[]'::jsonb),
    'rules', (
      select jsonb_build_object('version', r.version, 'rules', r.rules)
      from public.pricing_rule_sets r where r.is_current),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name_th', t.name_th, 'name_en', t.name_en, 'sub_th', t.sub_th, 'sub_en', t.sub_en,
        'stops', t.stops, 'round_trip', t.round_trip, 'vehicle_key', t.vehicle_key, 'date_hint', t.date_hint
      ) order by t.sort)
      from public.trip_templates t where t.is_active), '[]'::jsonb),
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object('a', b.place_a, 'b', b.place_b, 'km', b.km, 'min', b.minutes, 'source', b.source))
      from (
        select distinct on (s.place_a, s.place_b) s.place_a, s.place_b, s.km, s.minutes, s.source
        from public.segments s
        where s.source <> 'checkins' or s.samples >= 3
        order by s.place_a, s.place_b,
          case s.source when 'driven' then 1 when 'checkins' then 2 else 3 end
      ) b), '[]'::jsonb),
    'base_place_id', (select a.base_place_id from public.app_settings a where a.id)
  );
$$;
revoke all on function public.get_public_catalog() from public;
grant execute on function public.get_public_catalog() to anon, authenticated;
