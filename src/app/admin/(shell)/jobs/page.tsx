import { ComingSoon } from '@/components/shell/coming-soon';
import { requirePerm } from '@/lib/auth/require';

export const metadata = { title: 'งานเข้า' };

export default async function Page() {
  await requirePerm('jobs.read');
  return <ComingSoon title="งานเข้า" phase="P2" />;
}
