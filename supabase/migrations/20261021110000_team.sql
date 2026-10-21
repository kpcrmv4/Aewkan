-- Aewkan · P5 · team & RBAC
-- Every team write goes through a SECURITY DEFINER function that checks the
-- caller itself (team.manage / owner) and the rule "nobody grants what they do
-- not hold". The team tables become read-only for signed-in users, so a direct
-- PostgREST write can no longer skip those checks.
-- Rows are never removed (L-002): roles are archived, invites revoked.
-- Split in three files so the connector applies each without a confirmation
-- prompt: 110000 functions · 110010 upsert_role · 110020 table grants.

-- ── columns ─────────────────────────────────────────────────────────────────
alter table public.roles add column if not exists archived_at timestamptz;
alter table public.staff_invites add column if not exists accepted_by uuid references public.staff(id) on delete set null;
create index if not exists staff_invites_accepted_by_idx on public.staff_invites(accepted_by);

-- ── internal helpers (no EXECUTE for API roles; called from the functions below) ──
create or replace function public.role_perms(p_role text)
returns text[] language sql stable set search_path = '' as $$
  select coalesce(array_agg(rp.permission_key order by rp.permission_key), '{}')
  from public.role_permissions rp where rp.role_key = p_role;
$$;

-- true when the caller may hand out every permission in p_perms
create or replace function public.perms_within_mine(p_perms text[])
returns boolean language sql stable set search_path = '' as $$
  select public.is_owner() or not exists (
    select 1 from unnest(coalesce(p_perms, '{}'::text[])) k
    where not (k = any (public.my_permissions()))
  );
$$;

revoke all on function public.role_perms(text), public.perms_within_mine(text[]) from public, anon, authenticated;

-- ── invites ─────────────────────────────────────────────────────────────────
-- the raw token exists only in the link; the row keeps token_hash (pepper in Vault, R-011)
create or replace function public.create_staff_invite(p_email text, p_role text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
  v_exp timestamptz;
begin
  if not public.has_perm('team.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_token is null or length(p_token) not between 40 and 60 then raise exception 'bad_token' using errcode = '22023'; end if;
  if length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'bad_email' using errcode = '22023';
  end if;
  if p_role = 'owner' then raise exception 'owner_role_not_assignable' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.roles r where r.key = p_role and r.archived_at is null) then
    raise exception 'role_not_found' using errcode = 'P0001';
  end if;
  if not public.perms_within_mine(public.role_perms(p_role)) then raise exception 'cannot_grant_more' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff s where lower(s.email) = v_email and s.is_active) then
    raise exception 'already_staff' using errcode = 'P0001';
  end if;

  -- one live invite per address: a new link replaces the older one
  update public.staff_invites i set revoked_at = now()
  where lower(i.email) = v_email and i.accepted_at is null and i.revoked_at is null;

  insert into public.staff_invites (email, role_key, token_hash, invited_by)
  values (v_email, p_role, public.token_hash(p_token), auth.uid())
  returning id, expires_at into v_id, v_exp;
  return jsonb_build_object('id', v_id, 'expires_at', v_exp);
end $$;

create or replace function public.revoke_staff_invite(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('team.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.staff_invites set revoked_at = now()
  where id = p_id and accepted_at is null and revoked_at is null;
  if not found then raise exception 'invite_not_found' using errcode = 'P0001'; end if;
end $$;

-- what the accept page may show for a live invite; null for anything else
-- (wrong, revoked, used, expired — the page cannot tell them apart)
create or replace function public.get_staff_invite(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email', i.email,
    'role_key', i.role_key,
    'role_name', r.name_th,
    'company_th', a.company_name_th,
    'company_en', a.company_name_en,
    'expires_at', i.expires_at)
  from public.staff_invites i
  join public.roles r on r.key = i.role_key and r.archived_at is null
  cross join public.app_settings a
  where p_token is not null and length(p_token) between 40 and 60
    and i.token_hash = public.token_hash(p_token)
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  limit 1;
$$;

-- the signed-in invitee claims the invite: the account's (confirmed) email must be
-- the invited address. A deactivated former staff member is re-activated.
create or replace function public.accept_staff_invite(p_token text, p_full_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_full_name, ''));
  v_inv public.staff_invites;
  v_email text;
  v_confirmed timestamptz;
  v_staff public.staff;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if length(v_name) not between 1 and 120 then raise exception 'bad_name' using errcode = '22023'; end if;
  if p_token is null or length(p_token) not between 40 and 60 then raise exception 'invite_not_found' using errcode = 'P0001'; end if;

  select * into v_inv from public.staff_invites i where i.token_hash = public.token_hash(p_token) for update;
  if not found or v_inv.accepted_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now()
     or not exists (select 1 from public.roles r where r.key = v_inv.role_key and r.archived_at is null) then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_uid;
  if v_email is null or v_email <> lower(v_inv.email) then raise exception 'email_mismatch' using errcode = 'P0001'; end if;
  if v_confirmed is null then raise exception 'email_not_confirmed' using errcode = 'P0001'; end if;

  select * into v_staff from public.staff s where s.id = v_uid for update;
  if found then
    if v_staff.is_active then raise exception 'already_staff' using errcode = 'P0001'; end if;
    update public.staff set is_active = true, role_key = v_inv.role_key, full_name = v_name, email = v_email where id = v_uid;
  else
    insert into public.staff (id, email, full_name, role_key) values (v_uid, v_email, v_name, v_inv.role_key);
  end if;

  update public.staff_invites set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  update public.staff_invites set revoked_at = now()
  where lower(email) = v_email and id <> v_inv.id and accepted_at is null and revoked_at is null;
  return v_inv.role_key;
end $$;

-- ── staff ───────────────────────────────────────────────────────────────────
create or replace function public.update_staff(p_staff uuid, p_role text default null, p_active boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t public.staff;
begin
  if not public.has_perm('team.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role is null and p_active is null then raise exception 'nothing_to_change' using errcode = '22023'; end if;
  if p_staff = auth.uid() then raise exception 'cannot_change_self' using errcode = 'P0001'; end if;
  select * into v_t from public.staff where id = p_staff for update;
  if not found then raise exception 'staff_not_found' using errcode = 'P0001'; end if;
  if v_t.id = public.current_owner_id() then raise exception 'owner_row_protected' using errcode = 'P0001'; end if;
  if not public.perms_within_mine(public.role_perms(v_t.role_key)) then raise exception 'cannot_manage_higher' using errcode = 'P0001'; end if;
  if p_role is not null and p_role <> v_t.role_key then
    if p_role = 'owner' then raise exception 'owner_role_not_assignable' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.roles r where r.key = p_role and r.archived_at is null) then
      raise exception 'role_not_found' using errcode = 'P0001';
    end if;
    if not public.perms_within_mine(public.role_perms(p_role)) then raise exception 'cannot_grant_more' using errcode = 'P0001'; end if;
  end if;
  update public.staff
  set role_key = coalesce(p_role, role_key), is_active = coalesce(p_active, is_active)
  where id = p_staff;
end $$;

-- ── roles (upsert_role lives in 20261021110010_team_roles.sql) ──────────────
-- roles are archived, never removed: staff, invites and history keep their reference
create or replace function public.archive_role(p_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role public.roles;
begin
  if not public.has_perm('team.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_role from public.roles where key = p_key and archived_at is null for update;
  if not found then raise exception 'role_not_found' using errcode = 'P0001'; end if;
  if v_role.is_system then raise exception 'system_role_protected' using errcode = 'P0001'; end if;
  if not public.perms_within_mine(public.role_perms(p_key)) then raise exception 'cannot_manage_higher' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff s where s.role_key = p_key) then raise exception 'role_in_use' using errcode = 'P0001'; end if;
  if exists (select 1 from public.staff_invites i where i.role_key = p_key and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) then
    raise exception 'role_has_pending_invites' using errcode = 'P0001';
  end if;
  update public.roles set archived_at = now() where key = p_key;
end $$;

-- ── ownership transfer: same contract as P0, plus a guard against transferring
-- to yourself (the second UPDATE would leave the owner holding role admin)
create or replace function public.transfer_ownership(p_new_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old uuid;
begin
  select owner_id into v_old from public.app_settings where id for update;
  if v_old is null or v_old <> auth.uid() then
    raise exception 'only_owner_can_transfer' using errcode = 'P0001';
  end if;
  if p_new_owner = v_old then raise exception 'transfer_to_self' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff where id = p_new_owner and is_active) then
    raise exception 'new_owner_must_be_active_staff' using errcode = 'P0001';
  end if;
  perform set_config('app.owner_change', 'on', true);
  update public.staff set role_key = 'owner' where id = p_new_owner;
  update public.staff set role_key = 'admin' where id = v_old;
  update public.app_settings set owner_id = p_new_owner where id;
end $$;

-- ── grants ──────────────────────────────────────────────────────────────────
revoke all on function public.create_staff_invite(text, text, text), public.revoke_staff_invite(uuid),
  public.get_staff_invite(text), public.accept_staff_invite(text, text),
  public.update_staff(uuid, text, boolean),
  public.archive_role(text), public.transfer_ownership(uuid) from public, anon;
grant execute on function public.create_staff_invite(text, text, text), public.revoke_staff_invite(uuid),
  public.get_staff_invite(text), public.accept_staff_invite(text, text),
  public.update_staff(uuid, text, boolean),
  public.archive_role(text), public.transfer_ownership(uuid) to authenticated;
-- the accept page is opened before the invitee has an account
grant execute on function public.get_staff_invite(text) to anon;
-- table write privileges are withdrawn in 20261021110020_team_table_grants.sql
