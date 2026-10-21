import { ComingSoon } from '@/components/shell/coming-soon';
import { requirePerm } from '@/lib/auth/require';

export const metadata = { title: 'ทีมงานและสิทธิ์' };

export default async function Page() {
  await requirePerm('team.manage');
  return <ComingSoon title="ทีมงานและสิทธิ์" phase="P5" />;
}
