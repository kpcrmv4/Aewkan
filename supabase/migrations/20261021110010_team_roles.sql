-- Aewkan · P5 · roles editor.
-- A permission taken off a role is marked revoked_at (status flag, L-002) instead of
-- the row going away, so the editor never removes rows and the change stays visible.
-- Every reader of role_permissions filters revoked_at is null: has_perm,
-- my_permissions and role_perms are re-created here with that filter.

alter table public.role_permissions add column if not exists revoked_at timestamptz;

create or replace function public.has_perm(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_owner() or exists (
    select 1
    from public.staff s
    join public.role_permissions rp on rp.role_key = s.role_key and rp.revoked_at is null
    where s.id = auth.uid() and s.is_active and rp.permission_key = p_key
  );
$$;

create or replace function public.my_permissions()
returns text[] language sql stable security definer set search_path = '' as $$
  select case
    when public.is_owner() then (select coalesce(array_agg(key order by sort), '{}') from public.permissions)
    else coalesce((
      select array_agg(rp.permission_key order by rp.permission_key)
      from public.staff s join public.role_permissions rp on rp.role_key = s.role_key and rp.revoked_at is null
      where s.id = auth.uid() and s.is_active
    ), '{}')
  end;
$$;

create or replace function public.role_perms(p_role text)
returns text[] language sql stable set search_path = '' as $$
  select coalesce(array_agg(rp.permission_key order by rp.permission_key), '{}')
  from public.role_permissions rp where rp.role_key = p_role and rp.revoked_at is null;
$$;

-- create or edit a role and set its permissions in one transaction. owner is locked;
-- admin (system) is the owner's to edit; nobody edits the role they hold, grants
-- what they lack, or edits a role that holds more than they do.
create or replace function public.upsert_role(p_key text, p_name text, p_description text, p_permissions text[])
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_role public.roles;
  v_name text := trim(coalesce(p_name, ''));
  v_desc text := trim(coalesce(p_description, ''));
  v_perms text[];
begin
  if not public.has_perm('team.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key = 'owner' then raise exception 'system_role_locked' using errcode = 'P0001'; end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{1,30}$' then raise exception 'bad_key' using errcode = '22023'; end if;
  if length(v_name) not between 1 and 60 or length(v_desc) > 200 then raise exception 'bad_name' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into v_perms from unnest(coalesce(p_permissions, '{}'::text[])) x;
  if exists (select 1 from unnest(v_perms) k where not exists (select 1 from public.permissions p where p.key = k)) then
    raise exception 'unknown_permission' using errcode = '22023';
  end if;
  if not public.perms_within_mine(v_perms) then raise exception 'cannot_grant_more' using errcode = 'P0001'; end if;

  select * into v_role from public.roles where key = p_key for update;
  if found then
    if v_role.archived_at is not null then raise exception 'role_key_taken' using errcode = 'P0001'; end if;
    if v_role.is_system and not public.is_owner() then raise exception 'admin_role_owner_only' using errcode = 'P0001'; end if;
    if not public.is_owner() and exists (select 1 from public.staff s where s.id = auth.uid() and s.role_key = p_key) then
      raise exception 'cannot_edit_own_role' using errcode = 'P0001';
    end if;
    if not public.perms_within_mine(public.role_perms(p_key)) then raise exception 'cannot_manage_higher' using errcode = 'P0001'; end if;
    update public.roles set name_th = v_name, description = v_desc where key = p_key;
    update public.role_permissions set revoked_at = now()
    where role_key = p_key and revoked_at is null and not (permission_key = any (v_perms));
    insert into public.role_permissions (role_key, permission_key)
    select p_key, k from unnest(v_perms) k
    on conflict (role_key, permission_key) do update set revoked_at = null;
    return 'updated';
  end if;

  insert into public.roles (key, name_th, description, is_system) values (p_key, v_name, v_desc, false);
  insert into public.role_permissions (role_key, permission_key) select p_key, k from unnest(v_perms) k;
  return 'created';
end $$;

revoke all on function public.role_perms(text) from public, anon, authenticated;
revoke all on function public.upsert_role(text, text, text, text[]) from public, anon;
grant execute on function public.upsert_role(text, text, text, text[]) to authenticated;
