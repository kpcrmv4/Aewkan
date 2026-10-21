'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';

export function SetupForm() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/admin/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setBusy(false);
      setError(body?.error?.message ?? 'สร้างบัญชีไม่สำเร็จ');
      return;
    }
    const { error: err } = await getSupabaseBrowser().auth.signInWithPassword({ email: form.email.trim(), password: form.password });
    if (err) {
      setBusy(false);
      setError('สร้างบัญชีแล้ว แต่เข้าสู่ระบบไม่สำเร็จ ลองเข้าสู่ระบบอีกครั้ง');
      return;
    }
    router.replace('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card-surface flex flex-col gap-4 p-5">
      <div>
        <label htmlFor="fullName" className="label-base">ชื่อ</label>
        <input id="fullName" required maxLength={120} className="input-base" value={form.fullName} onChange={set('fullName')} />
      </div>
      <div>
        <label htmlFor="email" className="label-base">อีเมล</label>
        <input id="email" type="email" autoComplete="email" required className="input-base" value={form.email} onChange={set('email')} />
      </div>
      <div>
        <label htmlFor="password" className="label-base">รหัสผ่าน (อย่างน้อย 10 ตัวอักษร)</label>
        <input id="password" type="password" autoComplete="new-password" minLength={10} required className="input-base" value={form.password} onChange={set('password')} />
      </div>
      {error && <p role="alert" className="text-sm text-urgent">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy || form.password.length < 10 || !form.email || !form.fullName}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        สร้างบัญชีเจ้าของ
      </button>
    </form>
  );
}
