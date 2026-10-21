import { ComingSoon } from '@/components/shell/coming-soon';
import { requirePerm } from '@/lib/auth/require';

export const metadata = { title: 'การเงิน' };

export default async function Page() {
  await requirePerm('finance.read');
  return <ComingSoon title="การเงิน" phase="P4" />;
}
