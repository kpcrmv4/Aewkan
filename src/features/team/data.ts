import 'server-only';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { InviteRow, PermissionDef, RoleRow, StaffRow } from './model';

export interface TeamData {
  staff: StaffRow[];
  invites: InviteRow[];
  roles: RoleRow[];
  permissions: PermissionDef[];
  ownerId: string | null;
}

// a single company's team: these caps are far above any real size, and every
// list still has an explicit order + range (CLAUDE.md §4)
const STAFF_MAX = 200;
const INVITES_MAX = 100;
const ROLES_MAX = 100;

/** everything the team page shows, read with the staff session through RLS */
export async function loadTeam(): Promise<TeamData> {
  const sb = await getSupabaseServer();
  const [staffRes, invitesRes, rolesRes, permsRes, rpRes, ownerRes] = await Promise.all([
    sb
      .from('staff')
      .select('id, email, full_name, role_key, is_active')
      .order('is_active', { ascending: false })
      .order('full_name')
      .order('id')
      .range(0, STAFF_MAX - 1),
    sb
      .from('staff_invites')
      .select('id, email, role_key, expires_at, created_at')
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .order('id')
      .range(0, INVITES_MAX - 1),
    sb
      .from('roles')
      .select('key, name_th, description, is_system')
      .is('archived_at', null)
      .order('is_system', { ascending: false })
      .order('created_at')
      .order('key')
      .range(0, ROLES_MAX - 1),
    sb.from('permissions').select('key, name_th, group_th, sort').order('sort').order('key').range(0, 99),
    sb
      .from('role_permissions')
      .select('role_key, permission_key')
      .is('revoked_at', null)
      .order('role_key')
      .order('permission_key')
      .range(0, 1999),
    sb.rpc('current_owner_id'),
  ]);
  const err = staffRes.error ?? invitesRes.error ?? rolesRes.error ?? permsRes.error ?? rpRes.error ?? ownerRes.error;
  if (err) throw new Error(`team load: ${err.message}`);

  const roleName = new Map((rolesRes.data ?? []).map((r) => [r.key, r.name_th]));
  const permsByRole = new Map<string, string[]>();
  for (const rp of rpRes.data ?? []) {
    const list = permsByRole.get(rp.role_key) ?? [];
    list.push(rp.permission_key);
    permsByRole.set(rp.role_key, list);
  }
  const allKeys = (permsRes.data ?? []).map((p) => p.key);
  const members = new Map<string, number>();
  for (const s of staffRes.data ?? []) members.set(s.role_key, (members.get(s.role_key) ?? 0) + 1);

  return {
    ownerId: (ownerRes.data as string | null) ?? null,
    permissions: (permsRes.data ?? []).map((p) => ({ key: p.key, nameTh: p.name_th, group: p.group_th, sort: p.sort })),
    staff: (staffRes.data ?? []).map((s) => ({
      id: s.id,
      email: s.email,
      fullName: s.full_name,
      roleKey: s.role_key,
      roleName: roleName.get(s.role_key) ?? s.role_key,
      isActive: s.is_active,
    })),
    invites: (invitesRes.data ?? []).map((i) => ({
      id: i.id,
      email: i.email,
      roleKey: i.role_key,
      roleName: roleName.get(i.role_key) ?? i.role_key,
      expiresAt: i.expires_at,
      createdAt: i.created_at,
      // display only; accept_staff_invite re-checks expiry against the database clock
      expired: Date.parse(i.expires_at) <= Date.now(),
    })),
    roles: (rolesRes.data ?? []).map((r) => ({
      key: r.key,
      nameTh: r.name_th,
      description: r.description,
      isSystem: r.is_system,
      // the owner holds every permission whatever rows exist
      permissions: r.key === 'owner' ? allKeys : (permsByRole.get(r.key) ?? []),
      members: members.get(r.key) ?? 0,
    })),
  };
}
