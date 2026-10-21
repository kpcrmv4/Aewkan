/**
 * Pure team / RBAC logic shared by the routes, the pages and vitest.
 * No Supabase client and no server-only import here.
 */
import { formatDeadline } from '@/lib/format';

export const ROLE_KEY_RE = /^[a-z][a-z0-9_]{1,30}$/;

/** RPC exception message → HTTP status. Anything not listed is a 500. */
const STATUS: Record<string, number> = {
  not_signed_in: 401,
  forbidden: 403,
  owner_only: 403,
  cannot_grant_more: 403,
  cannot_manage_higher: 403,
  cannot_change_self: 403,
  cannot_edit_own_role: 403,
  owner_row_protected: 403,
  system_role_locked: 403,
  system_role_protected: 403,
  admin_role_owner_only: 403,
  owner_role_not_assignable: 403,
  only_owner_can_transfer: 403,
  email_mismatch: 403,
  email_not_confirmed: 403,
  role_not_found: 404,
  staff_not_found: 404,
  invite_not_found: 404,
  already_staff: 409,
  role_in_use: 409,
  role_has_pending_invites: 409,
  role_key_taken: 409,
  new_owner_must_be_active_staff: 409,
  bad_email: 422,
  bad_token: 422,
  bad_name: 422,
  bad_key: 422,
  nothing_to_change: 422,
  unknown_permission: 422,
  transfer_to_self: 422,
};

/** map a Postgres/PostgREST error message from a team RPC to { status, code } */
export function teamError(message: string | undefined | null): { status: number; code: string } | null {
  if (!message) return null;
  const code = message.trim();
  if (Object.hasOwn(STATUS, code)) return { status: STATUS[code], code };
  // a direct table write that the grants refuse
  if (/^permission denied/.test(code)) return { status: 403, code: 'forbidden' };
  return null;
}

/** may someone holding `mine` hand out every permission in `perms`? (DB: perms_within_mine) */
export function permsWithin(mine: Iterable<string>, perms: readonly string[], isOwner: boolean): boolean {
  if (isOwner) return true;
  const have = new Set(mine);
  return perms.every((p) => have.has(p));
}

export interface PermissionDef {
  key: string;
  nameTh: string;
  group: string;
  sort: number;
}

/** permissions grouped by `group_th`, groups in the order of their first permission */
export function groupPermissions(perms: readonly PermissionDef[]): { group: string; items: PermissionDef[] }[] {
  const sorted = [...perms].sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key));
  const out: { group: string; items: PermissionDef[] }[] = [];
  for (const p of sorted) {
    const g = out.find((x) => x.group === p.group);
    if (g) g.items.push(p);
    else out.push({ group: p.group, items: [p] });
  }
  return out;
}

/** a key for a new custom role — the person only ever sees the Thai name */
export function newRoleKey(random: () => number = Math.random): string {
  let s = '';
  while (s.length < 8) s += Math.floor(random() * 36).toString(36);
  return `r_${s.slice(0, 8)}`;
}

/** the message staff paste into LINE / email (sending it is P4) */
export function inviteMessage(i: { company: string; roleName: string; url: string; expiresAt: string }): string {
  return [
    `คุณได้รับเชิญเข้าร่วมทีมงาน ${i.company} ในตำแหน่ง ${i.roleName}`,
    `ตั้งชื่อและรหัสผ่านที่ลิงก์นี้: ${i.url}`,
    `ลิงก์ใช้ได้ครั้งเดียว ถึง ${formatDeadline(i.expiresAt, 'th')}`,
  ].join('\n');
}

export const invitePath = (token: string) => `/admin/invite/${token}`;

export interface StaffRow {
  id: string;
  email: string;
  fullName: string;
  roleKey: string;
  roleName: string;
  isActive: boolean;
}

export interface RoleRow {
  key: string;
  nameTh: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  members: number;
}

export interface InviteRow {
  id: string;
  email: string;
  roleKey: string;
  roleName: string;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
}

export interface Viewer {
  id: string;
  isOwner: boolean;
  permissions: string[];
}

export type RowLock = 'self' | 'owner' | 'higher' | null;

/** why a staff row cannot be changed by this viewer (the DB re-checks every case) */
export function staffLock(viewer: Viewer, row: StaffRow, ownerId: string | null, rolePerms: Record<string, string[]>): RowLock {
  if (row.id === viewer.id) return 'self';
  if (row.id === ownerId) return 'owner';
  if (!permsWithin(viewer.permissions, rolePerms[row.roleKey] ?? [], viewer.isOwner)) return 'higher';
  return null;
}

export type RoleLock = 'locked' | 'owner_only' | 'own' | 'higher' | null;

/** why a role cannot be edited by this viewer */
export function roleLock(viewer: Viewer, role: RoleRow, viewerRoleKey: string): RoleLock {
  if (role.key === 'owner') return 'locked';
  if (role.isSystem && !viewer.isOwner) return 'owner_only';
  if (!viewer.isOwner && role.key === viewerRoleKey) return 'own';
  if (!permsWithin(viewer.permissions, role.permissions, viewer.isOwner)) return 'higher';
  return null;
}
