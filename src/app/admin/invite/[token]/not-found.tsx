import Link from 'next/link';
import { ACCEPT_COPY as A } from '@/lib/copy/team';

/** one page for every unusable invite link — it never says why */
export default function InviteGone() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="card-surface w-full max-w-sm p-5 text-center" data-testid="invite-gone">
        <h1 className="mb-2 text-xl font-semibold text-ink">{A.goneTitle}</h1>
        <p className="mb-4 text-sm text-ink-2">{A.goneBody}</p>
        <Link href="/admin/login" className="btn-secondary min-h-11 w-full">
          {A.goLogin}
        </Link>
      </div>
    </main>
  );
}
