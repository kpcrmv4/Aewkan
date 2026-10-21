import { ComingSoon } from '@/components/shell/coming-soon';
import { requirePerm } from '@/lib/auth/require';

export const metadata = { title: 'เสนอราคา' };

export default async function Page() {
  await requirePerm('quotes.manage');
  return <ComingSoon title="เสนอราคา" phase="P2" />;
}
