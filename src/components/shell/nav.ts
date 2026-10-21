import type { Permission } from '@/lib/auth/staff';

export type NavIcon = 'jobs' | 'quotes' | 'assign' | 'payments' | 'pricing' | 'places' | 'drivers' | 'integrations' | 'team';

export interface NavItem {
  href: string;
  label: string;
  sub: string;
  icon: NavIcon;
  perm: Permission;
  group: 'งาน' | 'ตั้งค่า' | 'ระบบ';
}

/** sidebar order = demo order; each item shows only with its permission */
export const NAV: NavItem[] = [
  { href: '/admin/jobs', label: 'งานเข้า', sub: 'รอจัดคนขับและงานทั้งหมด', icon: 'jobs', perm: 'jobs.read', group: 'งาน' },
  { href: '/admin/quotes', label: 'เสนอราคา', sub: 'คำขอราคาช่วงเทศกาล', icon: 'quotes', perm: 'quotes.manage', group: 'งาน' },
  { href: '/admin/assign', label: 'จัดคนขับ', sub: 'เลือกคนขับและส่งลิงก์งาน', icon: 'assign', perm: 'jobs.manage', group: 'งาน' },
  { href: '/admin/payments', label: 'การเงิน', sub: 'ตรวจสลิป มัดจำ และยอดรับ', icon: 'payments', perm: 'finance.read', group: 'งาน' },
  { href: '/admin/drivers', label: 'คนขับและรถ', sub: 'ทะเบียน ภาษา ประเภทรถ', icon: 'drivers', perm: 'drivers.manage', group: 'งาน' },
  { href: '/admin/pricing', label: 'กฎราคา', sub: 'โซน รถ ค่าเพิ่ม ค่าน้ำ', icon: 'pricing', perm: 'pricing.manage', group: 'ตั้งค่า' },
  { href: '/admin/places', label: 'จุดหมาย', sub: 'สถานที่ และระยะทางวัดจริง', icon: 'places', perm: 'places.manage', group: 'ตั้งค่า' },
  { href: '/admin/integrations', label: 'การเชื่อมต่อ', sub: 'LINE Stripe Beam สลิป แผนที่', icon: 'integrations', perm: 'integrations.manage', group: 'ระบบ' },
  { href: '/admin/team', label: 'ทีมงานและสิทธิ์', sub: 'เชิญ role และสิทธิ์', icon: 'team', perm: 'team.manage', group: 'ระบบ' },
];

/** bottom nav: 2 items · raised center action · 1 item · เพิ่มเติม */
export const BOTTOM_LEFT: NavIcon[] = ['jobs', 'assign'];
export const BOTTOM_RIGHT: NavIcon[] = ['quotes'];
export const CENTER_ACTION = { href: '/?staff=1', label: 'สร้างงานแทนลูกค้า' } as const;
