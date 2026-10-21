import { ComingSoon } from '@/components/shell/coming-soon';
import { requirePerm } from '@/lib/auth/require';

export const metadata = { title: 'กฎราคา' };

export default async function Page() {
  await requirePerm('pricing.manage');
  return <ComingSoon title="กฎราคา" phase="P2" />;
}
