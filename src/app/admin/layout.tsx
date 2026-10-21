import type { Metadata } from 'next';

/** every staff page (login, setup, invite, the shell) stays out of search engines */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminRootLayout({ children }: LayoutProps<'/admin'>) {
  return children;
}
