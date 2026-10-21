import { ComingSoon } from '@/components/shell/coming-soon';
import { requirePerm } from '@/lib/auth/require';

export const metadata = { title: 'การเชื่อมต่อ' };

export default async function Page() {
  await requirePerm('integrations.manage');
  return <ComingSoon title="การเชื่อมต่อ" phase="P4" />;
}
