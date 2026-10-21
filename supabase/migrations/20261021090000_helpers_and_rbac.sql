-- Aewkan · P0 · helpers + RBAC (single company, no org_id)
-- Staff sign in with email+password. Customers and drivers never get an auth user:
-- they reach their job through a token link handled server-side.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── roles & permissions ─────────────────────────────────────────────────────
create table if not exists public.roles (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name_th     text not null,
  description text not null default '',
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.permissions (
  key      text primary key,
  name_th  text not null,
  group_th text not null,
  sort     int  not null default 0
);

create table if not exists public.role_permissions (
  role_key       text not null references public.roles(key) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);
create index if not exists role_permissions_permission_idx on public.role_permissions(permission_key);

create table if not exists public.staff (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  role_key   text not null references public.roles(key),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_role_idx on public.staff(role_key);
create unique index if not exists staff_email_uidx on public.staff(lower(email));
create or replace trigger staff_set_updated_at before update on public.staff
  for each row execute function public.set_updated_at();

create table if not exists public.staff_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role_key    text not null references public.roles(key),
  token_hash  text not null unique,
  invited_by  uuid references public.staff(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at  timestamptz
);
create index if not exists staff_invites_email_idx on public.staff_invites(lower(email));
create index if not exists staff_invites_invited_by_idx on public.staff_invites(invited_by);
create index if not exists staff_invites_role_idx on public.staff_invites(role_key);

-- one-row settings table; owner_id changes only through transfer_ownership()
create table if not exists public.app_settings (
  id              boolean primary key default true check (id),
  owner_id        uuid references public.staff(id) on delete restrict,
  company_name_th text not null default 'แอ่วกัน',
  company_name_en text not null default 'Aewkan',
  base_place_id   uuid,
  updated_at      timestamptz not null default now()
);
create index if not exists app_settings_owner_idx on public.app_settings(owner_id);
create or replace trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ── permission helpers (SECURITY DEFINER: read staff without RLS recursion) ──
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_settings a
    join public.staff s on s.id = a.owner_id
    where a.owner_id = auth.uid() and s.is_active
  );
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where id = auth.uid() and is_active);
$$;

create or replace function public.has_perm(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_owner() or exists (
    select 1
    from public.staff s
    join public.role_permissions rp on rp.role_key = s.role_key
    where s.id = auth.uid() and s.is_active and rp.permission_key = p_key
  );
$$;

create or replace function public.my_permissions()
returns text[] language sql stable security definer set search_path = '' as $$
  select case
    when public.is_owner() then (select coalesce(array_agg(key order by sort), '{}') from public.permissions)
    else coalesce((
      select array_agg(rp.permission_key order by rp.permission_key)
      from public.staff s join public.role_permissions rp on rp.role_key = s.role_key
      where s.id = auth.uid() and s.is_active
    ), '{}')
  end;
$$;

create or replace function public.current_owner_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select owner_id from public.app_settings where id;
$$;

-- anyone (also anon) may ask whether first-run setup is still open; it reveals nothing else
create or replace function public.owner_exists()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_settings where owner_id is not null);
$$;

revoke all on function public.is_owner(), public.is_staff(), public.has_perm(text), public.my_permissions(),
  public.current_owner_id(), public.owner_exists() from public, anon;
grant execute on function public.is_owner(), public.is_staff(), public.has_perm(text), public.my_permissions(),
  public.current_owner_id() to authenticated;
grant execute on function public.owner_exists() to anon, authenticated;

-- ── guards ──────────────────────────────────────────────────────────────────
-- owner_id may only change inside transfer_ownership() (sets app.owner_change = 'on')
-- or while it is still null (first-run setup through the service role).
create or replace function public.guard_app_settings()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id
     and old.owner_id is not null
     and coalesce(current_setting('app.owner_change', true), '') <> 'on' then
    raise exception 'owner_change_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace trigger app_settings_guard before update on public.app_settings
  for each row execute function public.guard_app_settings();

-- the owner's own staff row cannot be deactivated or re-roled by anyone
create or replace function public.guard_staff_owner()
returns trigger language plpgsql set search_path = '' as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.app_settings where id;
  if tg_op = 'DELETE' then
    if old.id = v_owner then raise exception 'owner_row_protected' using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.id = v_owner
     and (new.is_active is distinct from old.is_active or new.role_key is distinct from old.role_key)
     and coalesce(current_setting('app.owner_change', true), '') <> 'on' then
    raise exception 'owner_row_protected' using errcode = 'P0001';
  end if;
  return new;
end $$;
create or replace trigger staff_owner_guard before update or delete on public.staff
  for each row execute function public.guard_staff_owner();

-- system roles keep their key and cannot be deleted
create or replace function public.guard_system_roles()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and old.is_system then
    raise exception 'system_role_protected' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.is_system and (new.key <> old.key or not new.is_system) then
    raise exception 'system_role_protected' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create or replace trigger roles_system_guard before update or delete on public.roles
  for each row execute function public.guard_system_roles();

-- ── ownership transfer ──────────────────────────────────────────────────────
create or replace function public.transfer_ownership(p_new_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old uuid;
begin
  select owner_id into v_old from public.app_settings where id for update;
  if v_old is null or v_old <> auth.uid() then
    raise exception 'only_owner_can_transfer' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.staff where id = p_new_owner and is_active) then
    raise exception 'new_owner_must_be_active_staff' using errcode = 'P0001';
  end if;
  perform set_config('app.owner_change', 'on', true);
  update public.staff set role_key = 'owner' where id = p_new_owner;
  update public.staff set role_key = 'admin' where id = v_old;
  update public.app_settings set owner_id = p_new_owner where id;
end $$;
revoke all on function public.transfer_ownership(uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid) to authenticated;

-- ── grants + RLS ────────────────────────────────────────────────────────────
revoke all on public.roles, public.permissions, public.role_permissions, public.staff,
  public.staff_invites, public.app_settings from public, anon, authenticated;

grant select, insert, update, delete on public.roles, public.role_permissions, public.staff_invites to authenticated;
grant select on public.permissions to authenticated;
grant select, update on public.staff to authenticated;
grant select, update (company_name_th, company_name_en, base_place_id) on public.app_settings to authenticated;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.staff enable row level security;
alter table public.staff_invites enable row level security;
alter table public.app_settings enable row level security;

create policy roles_select on public.roles for select to authenticated using ((select public.is_staff()));
create policy roles_insert on public.roles for insert to authenticated with check ((select public.has_perm('team.manage')) and not is_system);
create policy roles_update on public.roles for update to authenticated
  using ((select public.has_perm('team.manage'))) with check ((select public.has_perm('team.manage')));
create policy roles_delete on public.roles for delete to authenticated using ((select public.has_perm('team.manage')));

create policy permissions_select on public.permissions for select to authenticated using ((select public.is_staff()));

create policy role_permissions_select on public.role_permissions for select to authenticated using ((select public.is_staff()));
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check ((select public.has_perm('team.manage')) and role_key <> 'owner');
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using ((select public.has_perm('team.manage')) and role_key <> 'owner');

create policy staff_select on public.staff for select to authenticated using ((select public.is_staff()));
create policy staff_update on public.staff for update to authenticated
  using ((select public.has_perm('team.manage')))
  with check ((select public.has_perm('team.manage')) and (role_key <> 'owner' or id = (select public.current_owner_id())));

create policy staff_invites_select on public.staff_invites for select to authenticated using ((select public.has_perm('team.manage')));
create policy staff_invites_insert on public.staff_invites for insert to authenticated
  with check ((select public.has_perm('team.manage')) and role_key <> 'owner');
create policy staff_invites_update on public.staff_invites for update to authenticated
  using ((select public.has_perm('team.manage'))) with check ((select public.has_perm('team.manage')));
create policy staff_invites_delete on public.staff_invites for delete to authenticated using ((select public.has_perm('team.manage')));

create policy app_settings_select on public.app_settings for select to authenticated using ((select public.is_staff()));
create policy app_settings_update on public.app_settings for update to authenticated
  using ((select public.has_perm('integrations.manage'))) with check ((select public.has_perm('integrations.manage')));

-- ── seed: permissions, system roles, settings row ───────────────────────────
insert into public.permissions (key, name_th, group_th, sort) values
  ('jobs.read',           'ดูงานทั้งหมด',                 'งาน', 10),
  ('jobs.manage',         'สร้างและแก้งาน จัดคนขับ',        'งาน', 20),
  ('quotes.manage',       'เสนอราคา',                     'งาน', 30),
  ('drivers.manage',      'จัดการคนขับและรถ',              'งาน', 40),
  ('pricing.manage',      'แก้กฎราคา',                    'ตั้งค่า', 50),
  ('places.manage',       'จัดการจุดหมายและระยะทางจริง',    'ตั้งค่า', 60),
  ('commission.manage',   'แก้นโยบายค่าน้ำ',               'ตั้งค่า', 70),
  ('finance.read',        'ดูยอดเงินและการชำระ',            'การเงิน', 80),
  ('integrations.manage', 'ตั้งค่าการเชื่อมต่อและข้อมูลบริษัท', 'ระบบ', 90),
  ('team.manage',         'จัดการทีมงานและสิทธิ์',           'ระบบ', 100)
on conflict (key) do update set name_th = excluded.name_th, group_th = excluded.group_th, sort = excluded.sort;

insert into public.roles (key, name_th, description, is_system) values
  ('owner',      'เจ้าของ',     'ทุกสิทธิ์ และโอนความเป็นเจ้าของได้', true),
  ('admin',      'แอดมิน',      'ทุกอย่างยกเว้นทีมงานและการเชื่อมต่อ', true),
  ('dispatcher', 'จัดงาน',      'รับงาน เสนอราคา จัดคนขับ', false),
  ('finance',    'การเงิน',     'ดูงานและยอดเงิน', false)
on conflict (key) do nothing;

insert into public.role_permissions (role_key, permission_key)
select 'owner', key from public.permissions
on conflict do nothing;
insert into public.role_permissions (role_key, permission_key) values
  ('admin','jobs.read'),('admin','jobs.manage'),('admin','quotes.manage'),('admin','drivers.manage'),
  ('admin','pricing.manage'),('admin','places.manage'),('admin','commission.manage'),('admin','finance.read'),
  ('dispatcher','jobs.read'),('dispatcher','jobs.manage'),('dispatcher','quotes.manage'),
  ('finance','jobs.read'),('finance','finance.read')
on conflict do nothing;

insert into public.app_settings (id) values (true) on conflict (id) do nothing;
