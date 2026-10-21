import { describe, expect, it } from 'vitest';
import { formatDeadline, formatTime, todayInBangkok } from '@/lib/format';

/** every clock the customer sees is Thailand time, whatever zone the server or browser runs in */
describe('Thailand time', () => {
  // 2026-10-31 17:30 UTC = 2026-11-01 00:30 in Bangkok (crosses the month)
  const ts = '2026-10-31T17:30:00Z';

  it('formatTime shows the Bangkok clock', () => {
    expect(formatTime(ts)).toBe('00:30');
  });

  it('formatDeadline shows the Bangkok date and says it is Thailand time', () => {
    expect(formatDeadline(ts, 'th')).toBe('1 พ.ย. 00:30 (เวลาไทย)');
    expect(formatDeadline(ts, 'en')).toBe('1 Nov 00:30 (Thailand time, GMT+7)');
  });

  it('todayInBangkok rolls over at Bangkok midnight, not UTC', () => {
    expect(todayInBangkok(new Date('2026-10-31T16:59:00Z'))).toBe('2026-10-31');
    expect(todayInBangkok(new Date('2026-10-31T17:00:00Z'))).toBe('2026-11-01');
  });
});
