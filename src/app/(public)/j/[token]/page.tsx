import { notFound } from 'next/navigation';
import { JobPage } from '@/features/job-link/job-page';
import type { JobViewJson } from '@/lib/contracts/job';
import { getSupabaseServer } from '@/lib/supabase/server';

export const metadata = { title: 'รายละเอียดงาน', robots: { index: false, follow: false } };

/** the token is resolved in the database; unknown / revoked → the 404 page (notFound() stays outside any try/catch) */
export default async function JobLinkPage({ params }: PageProps<'/j/[token]'>) {
  const { token } = await params;
  const sb = await getSupabaseServer();
  const { data, error } = await sb.rpc('get_job_view', { p_token: token });
  if (error) throw new Error(`get_job_view: ${error.message}`);
  if (!data) notFound();
  return <JobPage token={token} initial={data as unknown as JobViewJson} serverNow={Date.now()} />;
}
