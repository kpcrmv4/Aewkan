import { JobLinkPlaceholder } from './job-link-placeholder';

export const metadata = { title: 'รายละเอียดงาน', robots: { index: false, follow: false } };

/** P0 placeholder — P3 replaces with src/features/job-link/* */
export default async function JobLinkPage({ params }: PageProps<'/j/[token]'>) {
  const { token } = await params;
  return <JobLinkPlaceholder hasToken={token.length > 0} />;
}
