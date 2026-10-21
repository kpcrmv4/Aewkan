import { ComingSoon } from '@/components/shell/coming-soon';
import { requirePerm } from '@/lib/auth/require';

export const metadata = { title: 'จัดคนขับ' };

export default async function Page() {
  await requirePerm('jobs.manage');
  return <ComingSoon title="จัดคนขับ" phase="P2" />;
}
