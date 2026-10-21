'use client';

import {
  CalendarCheck,
  Car,
  CircleDollarSign,
  LogOut,
  MapPin,
  MessageSquareQuote,
  Moon,
  MoreHorizontal,
  Plug,
  Plus,
  Sun,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { BRAND, LOGO } from '@/lib/copy/common';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { BOTTOM_LEFT, BOTTOM_RIGHT, CENTER_ACTION, type NavIcon, type NavItem } from './nav';

const ICONS: Record<NavIcon, LucideIcon> = {
  jobs: CalendarCheck,
  quotes: MessageSquareQuote,
  assign: UserCheck,
  payments: Wallet,
  drivers: Car,
  pricing: CircleDollarSign,
  places: MapPin,
  integrations: Plug,
  team: Users,
};

export interface ShellStaff {
  fullName: string;
  email: string;
  roleName: string;
}

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

export function AdminShell({ items, staff, children }: { items: NavItem[]; staff: ShellStaff; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [sheet, setSheet] = useState(false);
  const groups = ['งาน', 'ตั้งค่า', 'ระบบ'] as const;
  const byIcon = (i: NavIcon) => items.find((x) => x.icon === i);
  const overflow = items.filter((i) => !BOTTOM_LEFT.includes(i.icon) && !BOTTOM_RIGHT.includes(i.icon));
  const initials = (staff.fullName || staff.email).slice(0, 2);

  async function signOut() {
    const { error } = await getSupabaseBrowser().auth.signOut({ scope: 'local' });
    if (error) {
      toast.error('ออกจากระบบไม่สำเร็จ ลองใหม่อีกครั้ง');
      return;
    }
    router.replace('/admin/login');
    router.refresh();
  }
  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');

  const bottomLink = (icon: NavIcon) => {
    const it = byIcon(icon);
    if (!it) return <span key={icon} />;
    const Icon = ICONS[icon];
    const on = isActive(path, it.href);
    return (
      <Link key={icon} href={it.href} className={`flex flex-col items-center justify-center gap-0.5 text-[10.5px] ${on ? 'font-semibold text-brand' : 'text-muted-token'}`}>
        <Icon className="size-5" aria-hidden />
        <span>{it.label}</span>
      </Link>
    );
  };

  return (
    <div className="flex min-h-dvh">
      <nav aria-label="เมนูหลัก" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-sidebar-line bg-sidebar px-3 py-4 text-sidebar-fg lg:flex">
        <Link href="/admin/jobs" className="mb-2 block px-3 py-1.5" aria-label={`${BRAND.th} หลังบ้านทีมงาน`}>
          <Image src={LOGO.src} alt="" width={144} height={Math.round(144 / LOGO.ratio)} priority className="h-auto w-36" />
          <span className="mt-1 block text-xs text-sidebar-fg-dim">หลังบ้านทีมงาน</span>
        </Link>
        {groups.map((g) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="flex flex-col gap-0.5">
              <div className="px-3 pb-1.5 pt-3.5 text-[11px] font-semibold tracking-wide text-sidebar-fg-dim">{g}</div>
              {list.map((it) => {
                const Icon = ICONS[it.icon];
                const on = isActive(path, it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={on ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-pill px-3.5 py-2 text-sm ${on ? 'bg-sidebar-active-bg font-semibold text-sidebar-active-fg' : 'hover:bg-sidebar-hover'}`}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <span className="block">{it.label}</span>
                      <span className="block truncate text-[11px] font-normal text-sidebar-fg-dim">{it.sub}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          );
        })}
        <div className="mt-auto flex items-center gap-2.5 border-t border-sidebar-line px-3 pt-3 text-sm">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink font-heading text-xs font-semibold text-canvas">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-sidebar-title">{staff.fullName || staff.email}</span>
            <span className="block text-xs text-sidebar-fg-dim">{staff.roleName}</span>
          </span>
          <button type="button" onClick={toggleTheme} className="btn-ghost btn-sm !px-2" aria-label="สลับโหมดมืด">
            {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button type="button" onClick={signOut} className="btn-ghost btn-sm !px-2" aria-label="ออกจากระบบ">
            <LogOut className="size-4" />
          </button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 lg:px-7 lg:pb-12" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
        <div className="mx-auto max-w-[1120px]">{children}</div>
      </main>

      <nav
        aria-label="เมนูมือถือ"
        className="fixed inset-x-0 bottom-0 z-20 grid h-16 grid-cols-5 border-t border-line bg-surface lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', boxSizing: 'content-box' }}
      >
        {BOTTOM_LEFT.map(bottomLink)}
        <Link href={CENTER_ACTION.href} aria-label={CENTER_ACTION.label} className="relative">
          <span className="absolute -top-5 left-1/2 grid size-[58px] -translate-x-1/2 place-items-center rounded-full bg-fab text-fab-fg shadow-e3">
            <Plus className="size-6" aria-hidden />
          </span>
        </Link>
        {BOTTOM_RIGHT.map(bottomLink)}
        <button type="button" onClick={() => setSheet(true)} className="flex flex-col items-center justify-center gap-0.5 text-[10.5px] text-muted-token">
          <MoreHorizontal className="size-5" aria-hidden />
          <span>เพิ่มเติม</span>
        </button>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label="เพิ่มเติม">
          <button type="button" className="absolute inset-0 bg-black/45" aria-label="ปิด" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-xl bg-surface px-4 pt-2 shadow-e3" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
            <div className="mx-auto mb-3 mt-1 h-1 w-10 rounded-full bg-line-strong" />
            <div className="px-1 pb-1 pt-2 text-[11px] text-muted-token">เมนูอื่น</div>
            {overflow.map((it) => {
              const Icon = ICONS[it.icon];
              return (
                <Link key={it.href} href={it.href} onClick={() => setSheet(false)} className="flex items-center gap-3 border-b border-line-soft px-1 py-3.5 text-[15px]">
                  <Icon className="size-5" aria-hidden />
                  {it.label}
                </Link>
              );
            })}
            <div className="px-1 pb-1 pt-3 text-[11px] text-muted-token">บัญชี · {staff.fullName || staff.email}</div>
            <button type="button" onClick={toggleTheme} className="flex w-full items-center gap-3 border-b border-line-soft px-1 py-3.5 text-left text-[15px]">
              <Moon className="size-5" aria-hidden />
              สลับโหมดมืด
            </button>
            <button type="button" onClick={signOut} className="flex w-full items-center gap-3 px-1 py-3.5 text-left text-[15px]">
              <LogOut className="size-5" aria-hidden />
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
