import { ComingSoon } from '@/components/shell/coming-soon';
import { requirePerm } from '@/lib/auth/require';

export const metadata = { title: 'จุดหมาย' };

export default async function Page() {
  await requirePerm('places.manage');
  return <ComingSoon title="จุดหมาย" phase="P2" />;
}
