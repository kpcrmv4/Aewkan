'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';

export function LoginForm({ next, reason }: { next: string; reason?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setBusy(false);
      setError(err.message.toLowerCase().includes('invalid') ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง');
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function signOut() {
    await getSupabaseBrowser().auth.signOut({ scope: 'local' });
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card-surface flex flex-col gap-4 p-5" noValidate>
      {reason && (
        <div role="alert" className="rounded-sm border border-status-progress-ring bg-status-progress-bg px-3 py-2.5 text-sm text-status-progress">
          {reason}
          <button type="button" onClick={signOut} className="ml-1 font-semibold underline underline-offset-2">
            ออกจากระบบ
          </button>
        </div>
      )}
      <div>
        <label htmlFor="email" className="label-base">อีเมล</label>
        <input id="email" type="email" autoComplete="email" required className="input-base" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label htmlFor="password" className="label-base">รหัสผ่าน</label>
        <input id="password" type="password" autoComplete="current-password" required className="input-base" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-urgent">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy || !email || !password}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        เข้าสู่ระบบ
      </button>
    </form>
  );
}
