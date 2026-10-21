import Link from 'next/link';
import { Suspense } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { ListSkeleton } from '@/components/ui/states';
import { TeamView, type TeamTab } from '@/features/team/team-view';
import { requirePerm } from '@/lib/auth/require';
import { TEAM_COPY as C } from '@/lib/copy/team';

export const metadata = { title: C.title };

const TABS: { key: TeamTab; label: string; href: string }[] = [
  { key: 'staff', label: C.tabs.staff, href: '/admin/team' },
  { key: 'roles', label: C.tabs.roles, href: '/admin/team?tab=roles' },
];

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePerm('team.manage');
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: TeamTab = raw === 'roles' ? 'roles' : 'staff';
  return (
    <>
      <PageHeader title={C.title} subtitle={C.subtitle} />
      <nav className="no-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1" aria-label={C.title}>
        {TABS.map((t) => (
          <Link key={t.key} href={t.href} className={`pill min-h-11 ${t.key === tab ? 'is-on' : ''}`} aria-current={t.key === tab ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      <Suspense key={tab} fallback={<ListSkeleton rows={4} />}>
        <TeamView tab={tab} staff={staff} />
      </Suspense>
    </>
  );
}
