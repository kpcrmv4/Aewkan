import { describe, expect, it } from 'vitest';
import { assignMessage, cleanSearch, parsePage, plannedTimes } from '@/features/admin-ops/helpers';

const driver = { nickname: 'พี่หมี', nameEn: 'Mee', carTh: 'โตโยต้า ฟอร์จูนเนอร์', carEn: 'Toyota Fortuner', plate: 'กข 1234' };
const base = { bookingNo: '202610118', date: '2026-10-24', time: '08:30:00', pickupName: 'โรงแรมทดสอบ', customerName: 'กานต์ธิดา', driver, link: 'https://x.test/j/abc' };

describe('P2-03-U1 assign message', () => {
  it('Thai message carries number, driver, plate and link', () => {
    const m = assignMessage({ ...base, lang: 'th' });
    expect(m).toContain('202610118');
    expect(m).toContain('รับ 08:30');
    expect(m).toContain('พี่หมี');
    expect(m).toContain('กข 1234');
    expect(m).toContain('https://x.test/j/abc');
  });
  it('English message uses the English names', () => {
    const m = assignMessage({ ...base, lang: 'en' });
    expect(m).toContain('is confirmed');
    expect(m).toContain('Mee · Toyota Fortuner');
    expect(m).toContain('Sat, 24 Oct 2026');
  });
  it('shows a placeholder before a driver is chosen', () => {
    expect(assignMessage({ ...base, lang: 'th', driver: null })).toContain('ยังไม่ได้เลือกคนขับ');
  });
});

describe('helpers', () => {
  it('plannedTimes adds the previous dwell and the leg minutes', () => {
    expect(plannedTimes('09:00:00', [{ planned_minutes: 30, dwell_min: 60 }, { planned_minutes: 20, dwell_min: 30 }])).toEqual(['09:30', '10:50']);
  });
  it('cleanSearch removes filter-breaking characters', () => {
    expect(cleanSearch('a,b(c)%d')).toBe('a b c d');
  });
  it('parsePage clamps junk to 1', () => {
    expect(parsePage('abc')).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('3')).toBe(3);
    expect(parsePage(undefined)).toBe(1);
  });
});
