'use client';

import { Loader2, LogOut, MailCheck } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ACCEPT_COPY as A } from '@/lib/copy/team';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { postTeam } from './api-client';

type Tab = 'new' | 'existing';

const MIN_PASSWORD = 10;

/**
 * Invite acceptance without a service role:
 *   new account  → auth.signUp (email confirmation is ON in this project, so
 *                  usually no session yet → "check your email"; the link comes
 *                  back here with ?code= and the browser client exchanges it)
 *   existing     → signInWithPassword
 *   signed in    → POST /api/invite/accept → accept_staff_invite checks token,
 *                  expiry, single use and that the account email is the invited one
 */
export function AcceptForm({ token, email, signedInEmail }: { token: string; email: string; signedInEmail: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>('new');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const matches = signedInEmail !== null && signedInEmail.toLowerCase() === email.toLowerCase();

  // back from the confirmation email: the browser client exchanges ?code= while it
  // initialises; then drop the code from the URL and let the server see the session
  useEffect(() => {
    const code = search.get('code');
    const authError = search.get('error_description') ?? search.get('error');
    if (!code && !authError) return;
    let cancelled = false;
    void (async () => {
      const { data } = await getSupabaseBrowser().auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        // opened in another browser, or the link expired: the account is
        // confirmed (or can be re-sent) — the password path finishes the job
        setTab('existing');
        setHint(A.confirmedHint);
      }
      router.replace(pathname);
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [search, pathname, router]);

  async function accept(name: string) {
    const res = await postTeam<{ roleKey: string }>('/api/invite/accept', { token, fullName: name });
    if (!res.ok) {
      setBusy(false);
      setError(res.message);
      return;
    }
    toast.success(A.joined);
    router.replace('/admin');
    router.refresh();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = fullName.trim();
    if (!name) return setError(A.nameRequired);
    if (matches) {
      setBusy(true);
      return accept(name);
    }
    if (password.length < (tab === 'new' ? MIN_PASSWORD : 1)) return setError(A.passwordShort);
    if (tab === 'new' && password !== password2) return setError(A.passwordMismatch);

    setBusy(true);
    const sb = getSupabaseBrowser();
    if (tab === 'existing') {
      const { error: err } = await sb.auth.signInWithPassword({ email, password });
      if (err) {
        setBusy(false);
        return setError(A.signInFailed);
      }
      return accept(name);
    }

    const { data, error: err } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/admin/invite/${token}`, data: { full_name: name } },
    });
    if (err) {
      setBusy(false);
      if (/already|registered|exists/i.test(err.message)) {
        setTab('existing');
        setHint(A.existsHint);
        return;
      }
      return setError(A.signUpFailed);
    }
    if (data.session) return accept(name);
    setBusy(false);
    // no session: either confirmation is required, or the address already has an
    // account (Supabase answers with an empty identities list instead of an error)
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setTab('existing');
      setHint(A.existsHint);
      return;
    }
    setCheckEmail(true);
  }

  async function signOut() {
    setBusy(true);
    await getSupabaseBrowser().auth.signOut();
    setBusy(false);
    router.refresh();
  }

  if (signedInEmail && !matches) {
    return (
      <div className="card-surface space-y-4 p-5" data-testid="accept-mismatch">
        <p className="text-sm text-ink-2">{A.signedInAs(signedInEmail)}</p>
        <p role="alert" className="text-sm text-urgent">
          {A.mismatch(email)}
        </p>
        <button type="button" className="btn-secondary min-h-11 w-full" onClick={signOut} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
          {A.signOut}
        </button>
      </div>
    );
  }

  if (checkEmail) {
    return (
      <div className="card-surface space-y-4 p-5" role="status" data-testid="accept-check-email">
        <div className="flex items-center gap-2 text-base font-semibold text-ink">
          <MailCheck className="size-5 text-brand" aria-hidden />
          {A.checkEmailTitle}
        </div>
        <p className="text-sm text-ink-2">{A.checkEmailBody(email)}</p>
        <button
          type="button"
          className="btn-secondary min-h-11 w-full"
          onClick={() => {
            setCheckEmail(false);
            setTab('existing');
            setHint(A.confirmedHint);
          }}
        >
          {A.checkEmailBack}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card-surface flex flex-col gap-4 p-5" noValidate>
      {matches ? (
        <p className="text-sm text-ink-2">{A.signedInAs(signedInEmail ?? email)}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label={A.title}>
          {(['new', 'existing'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`pill min-h-11 justify-center ${tab === t ? 'is-on' : ''}`}
              onClick={() => {
                setTab(t);
                setError(null);
              }}
            >
              {t === 'new' ? A.tabNew : A.tabExisting}
            </button>
          ))}
        </div>
      )}
      {hint && !matches && <p className="text-sm text-ink-2">{hint}</p>}
      <div>
        <label htmlFor="fullName" className="label-base">
          {A.fullName}
        </label>
        <input id="fullName" required maxLength={120} autoComplete="name" className="input-base" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      {!matches && (
        <>
          <div>
            <label htmlFor="password" className="label-base">
              {tab === 'new' ? A.password : A.passwordExisting}
            </label>
            <input
              id="password"
              type="password"
              autoComplete={tab === 'new' ? 'new-password' : 'current-password'}
              className="input-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {tab === 'new' && (
            <div>
              <label htmlFor="password2" className="label-base">
                {A.passwordConfirm}
              </label>
              <input id="password2" type="password" autoComplete="new-password" className="input-base" value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary min-h-11 w-full" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {matches ? A.join : tab === 'new' ? A.create : A.signIn}
      </button>
    </form>
  );
}
