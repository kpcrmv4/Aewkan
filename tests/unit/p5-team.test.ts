import { describe, expect, it } from 'vitest';
import {
  groupPermissions,
  inviteMessage,
  newRoleKey,
  permsWithin,
  roleLock,
  ROLE_KEY_RE,
  staffLock,
  teamError,
  type RoleRow,
  type StaffRow,
  type Viewer,
} from '@/features/team/model';
import { TEAM_ERRORS } from '@/lib/copy/team';

describe('P5-07-U1 teamError', () => {
  it('maps RPC exception codes to HTTP status', () => {
    expect(teamError('forbidden')).toEqual({ status: 403, code: 'forbidden' });
    expect(teamError('invite_not_found')).toEqual({ status: 404, code: 'invite_not_found' });
    expect(teamError('already_staff')).toEqual({ status: 409, code: 'already_staff' });
    expect(teamError('role_in_use')).toEqual({ status: 409, code: 'role_in_use' });
    expect(teamError('bad_email')).toEqual({ status: 422, code: 'bad_email' });
    expect(teamError('not_signed_in')).toEqual({ status: 401, code: 'not_signed_in' });
    expect(teamError('admin_role_owner_only')).toEqual({ status: 403, code: 'admin_role_owner_only' });
  });
  it('a refused direct table write is forbidden', () => {
    expect(teamError('permission denied for table staff')).toEqual({ status: 403, code: 'forbidden' });
  });
  it('unknown or empty messages are not mapped (500 upstream)', () => {
    expect(teamError('duplicate key value violates unique constraint')).toBeNull();
    expect(teamError('')).toBeNull();
    expect(teamError(undefined)).toBeNull();
    expect(teamError('toString')).toBeNull();
  });
  it('every mapped code has Thai copy', () => {
    for (const code of ['forbidden', 'invite_not_found', 'already_staff', 'role_in_use', 'cannot_grant_more', 'cannot_manage_higher', 'cannot_change_self', 'cannot_edit_own_role', 'owner_row_protected', 'system_role_locked', 'admin_role_owner_only', 'owner_role_not_assignable', 'email_mismatch', 'transfer_to_self', 'role_has_pending_invites']) {
      expect(TEAM_ERRORS[code], code).toBeTruthy();
      expect(teamError(code), code).not.toBeNull();
    }
  });
});

describe('P5-07-U2 permsWithin', () => {
  const mine = ['jobs.read', 'team.manage'];
  it('owner always passes', () => expect(permsWithin([], ['team.manage', 'pricing.manage'], true)).toBe(true));
  it('empty set passes', () => expect(permsWithin(mine, [], false)).toBe(true));
  it('subset passes', () => expect(permsWithin(mine, ['jobs.read'], false)).toBe(true));
  it('one extra permission fails', () => expect(permsWithin(mine, ['jobs.read', 'pricing.manage'], false)).toBe(false));
});

describe('P5-07-U3 groupPermissions', () => {
  it('sorts by sort and keeps groups in first-seen order', () => {
    const g = groupPermissions([
      { key: 'team.manage', nameTh: 'ทีม', group: 'ระบบ', sort: 100 },
      { key: 'jobs.read', nameTh: 'ดูงาน', group: 'งาน', sort: 10 },
      { key: 'pricing.manage', nameTh: 'ราคา', group: 'ตั้งค่า', sort: 50 },
      { key: 'jobs.manage', nameTh: 'จัดงาน', group: 'งาน', sort: 20 },
      { key: 'finance.read', nameTh: 'เงิน', group: 'การเงิน', sort: 80 },
    ]);
    expect(g.map((x) => x.group)).toEqual(['งาน', 'ตั้งค่า', 'การเงิน', 'ระบบ']);
    expect(g[0].items.map((x) => x.key)).toEqual(['jobs.read', 'jobs.manage']);
  });
});

describe('P5-07-U4 inviteMessage', () => {
  it('carries company, role, link and the Thai-time expiry', () => {
    const m = inviteMessage({ company: 'แอ่วกัน', roleName: 'จัดงาน', url: 'https://x.test/admin/invite/abc', expiresAt: '2026-10-28T08:00:00Z' });
    expect(m).toContain('แอ่วกัน');
    expect(m).toContain('จัดงาน');
    expect(m).toContain('https://x.test/admin/invite/abc');
    expect(m).toContain('28 ต.ค. 15:00');
  });
});

describe('P5-07-U5 newRoleKey', () => {
  it('matches the role key rule', () => {
    for (let i = 0; i < 50; i += 1) expect(newRoleKey()).toMatch(ROLE_KEY_RE);
    expect(newRoleKey(() => 0)).toBe('r_00000000');
  });
});

describe('P5 row locks', () => {
  const viewer: Viewer = { id: 'me', isOwner: false, permissions: ['jobs.read', 'team.manage'] };
  const row = (id: string, roleKey: string): StaffRow => ({ id, email: `${id}@x.co`, fullName: id, roleKey, roleName: roleKey, isActive: true });
  const perms = { small: ['jobs.read'], big: ['jobs.read', 'pricing.manage'] };
  it('self, owner, higher, free', () => {
    expect(staffLock(viewer, row('me', 'small'), 'boss', perms)).toBe('self');
    expect(staffLock(viewer, row('boss', 'small'), 'boss', perms)).toBe('owner');
    expect(staffLock(viewer, row('x', 'big'), 'boss', perms)).toBe('higher');
    expect(staffLock(viewer, row('x', 'small'), 'boss', perms)).toBeNull();
  });
  const role = (key: string, permissions: string[], isSystem = false): RoleRow => ({ key, nameTh: key, description: '', isSystem, permissions, members: 0 });
  it('owner locked, admin owner-only, own role, higher', () => {
    expect(roleLock(viewer, role('owner', [], true), 'tm')).toBe('locked');
    expect(roleLock(viewer, role('admin', ['jobs.read'], true), 'tm')).toBe('owner_only');
    expect(roleLock({ ...viewer, isOwner: true }, role('admin', ['jobs.read'], true), 'owner')).toBeNull();
    expect(roleLock(viewer, role('tm', ['jobs.read']), 'tm')).toBe('own');
    expect(roleLock(viewer, role('x', ['pricing.manage']), 'tm')).toBe('higher');
    expect(roleLock(viewer, role('x', ['jobs.read']), 'tm')).toBeNull();
  });
});
