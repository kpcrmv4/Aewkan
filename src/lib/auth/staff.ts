import 'server-only';
import { cache } from 'react';
import { getSupabaseServer } from '@/lib/supabase/server';

export type Permission =
  | 'jobs.read'
  | 'jobs.manage'
  | 'quotes.manage'
  | 'drivers.manage'
  | 'pricing.manage'
  | 'places.manage'
  | 'commission.manage'
  | 'finance.read'
  | 'integrations.manage'
  | 'team.manage';

export interface StaffSession {
  id: string;
  email: string;
  fullName: string;
  roleKey: string;
  roleName: string;
  isOwner: boolean;
  permissions: Set<Permission>;
}

/**
 * The signed-in staff member, or null (no session, no staff row, or
 * deactivated). Cached per request. getUser() is used here (not getClaims)
 * because an admin action must not run on a revoked session.
 */
export const getStaff = cache(async (): Promise<StaffSession | null> => {
  const sb = await getSupabaseServer();
  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth.user) return null;

  const [{ data: row, error: rowErr }, { data: perms, error: permErr }, { data: ownerId, error: ownerErr }] = await Promise.all([
    sb.from('staff').select('id, email, full_name, role_key, is_active, roles(name_th)').eq('id', auth.user.id).maybeSingle(),
    sb.rpc('my_permissions'),
    sb.rpc('current_owner_id'),
  ]);
  if (rowErr || permErr || ownerErr) {
    console.error('[auth] staff lookup failed', { rowErr: rowErr?.message, permErr: permErr?.message, ownerErr: ownerErr?.message });
    return null;
  }
  if (!row || !row.is_active) return null;
  const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    roleKey: row.role_key,
    roleName: role?.name_th ?? row.role_key,
    isOwner: ownerId === row.id,
    permissions: new Set((perms ?? []) as Permission[]),
  };
});

export const can = (s: StaffSession | null, p: Permission) => Boolean(s?.permissions.has(p));
