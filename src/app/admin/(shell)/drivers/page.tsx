import { ComingSoon } from '@/components/shell/coming-soon';
import { requirePerm } from '@/lib/auth/require';

export const metadata = { title: 'คนขับและรถ' };

export default async function Page() {
  await requirePerm('drivers.manage');
  return <ComingSoon title="คนขับและรถ" phase="P2" />;
}
