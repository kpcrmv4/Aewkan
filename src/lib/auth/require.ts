import 'server-only';
import { redirect } from 'next/navigation';
import { can, getStaff, type Permission, type StaffSession } from './staff';

/**
 * Page-level guard. The nav hides what a role cannot open; this makes the URL
 * agree with the nav (an endpoint's roles must match where its UI sits).
 * Call outside any try/catch — redirect() throws by design.
 */
export async function requirePerm(perm: Permission): Promise<StaffSession> {
  const staff = await getStaff();
  if (!staff) redirect('/admin/login?reason=not_staff');
  if (!can(staff, perm)) redirect('/admin?denied=1');
  return staff;
}
