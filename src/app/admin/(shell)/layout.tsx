import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/shell/admin-shell';
import { NAV } from '@/components/shell/nav';
import { can, getStaff } from '@/lib/auth/staff';

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const staff = await getStaff();
  // signed in but not (or no longer) staff → the login page explains; it does
  // not bounce back here because `reason` is set (ssr-auth Bug #3)
  if (!staff) redirect('/admin/login?reason=not_staff');
  const items = NAV.filter((n) => can(staff, n.perm));
  return (
    <AdminShell items={items} staff={{ fullName: staff.fullName, email: staff.email, roleName: staff.roleName }}>
      {children}
    </AdminShell>
  );
}
