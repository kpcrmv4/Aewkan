import { LoginForm } from './login-form';

export const metadata = { title: 'เข้าสู่ระบบทีมงาน' };

const REASONS: Record<string, string> = {
  not_staff: 'บัญชีนี้ไม่ได้อยู่ในทีมงาน หรือถูกปิดใช้งาน ติดต่อเจ้าของระบบ',
  no_permission: 'บัญชีนี้ยังไม่มีสิทธิ์เปิดหน้าใดเลย ติดต่อเจ้าของระบบ',
};

export default async function LoginPage({ searchParams }: PageProps<'/admin/login'>) {
  const sp = await searchParams;
  const reason = typeof sp.reason === 'string' ? REASONS[sp.reason] : undefined;
  const next = typeof sp.next === 'string' && sp.next.startsWith('/admin') ? sp.next : '/admin';
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-sm bg-brand-solid font-heading font-semibold text-on-brand">แอ่ว</span>
          <div>
            <h1 className="text-2xl font-semibold text-ink">เข้าสู่ระบบทีมงาน</h1>
            <p className="text-sm text-muted-token">แอ่วกัน · หลังบ้าน</p>
          </div>
        </div>
        <LoginForm next={next} reason={reason} />
      </div>
    </main>
  );
}
