import { notFound } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { hasServerEnv } from '@/lib/env';
import { SetupForm } from './setup-form';

export const metadata = { title: 'ตั้งค่าครั้งแรก' };

/** first-run: create the owner account. Gone (404) once an owner exists. */
export default async function SetupPage() {
  const sb = await getSupabaseServer();
  const { data: ownerExists, error } = await sb.rpc('owner_exists');
  if (error) throw new Error(`owner_exists failed: ${error.message}`);
  if (ownerExists) notFound();
  const ready = hasServerEnv('SUPABASE_SECRET_KEY');
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold text-ink">ตั้งค่าครั้งแรก</h1>
        <p className="mb-5 text-sm text-muted-token">สร้างบัญชีเจ้าของระบบ ทำได้ครั้งเดียว หลังจากนี้เพิ่มทีมงานด้วยการเชิญ</p>
        {ready ? (
          <SetupForm />
        ) : (
          <div role="alert" className="card-surface p-4 text-sm text-ink-2">
            เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า <code className="font-mono">SUPABASE_SECRET_KEY</code> จึงสร้างบัญชีเจ้าของไม่ได้
          </div>
        )}
      </div>
    </main>
  );
}
