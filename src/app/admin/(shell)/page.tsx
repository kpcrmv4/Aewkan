import { redirect } from 'next/navigation';
import { NAV } from '@/components/shell/nav';
import { can, getStaff } from '@/lib/auth/staff';

/** /admin → the first section this person may open */
export default async function AdminHome() {
  const staff = await getStaff();
  const first = NAV.find((n) => can(staff, n.perm));
  redirect(first?.href ?? '/admin/login?reason=no_permission');
}
