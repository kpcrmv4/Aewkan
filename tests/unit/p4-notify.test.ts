import { describe, expect, it } from 'vitest';
import { badSecret, checkConfig, integrationDef, missingSecret, secretFieldsSet, secretsAfter } from '@/lib/integrations/catalog';
import { lineOaMessageUrl, tokenInText } from '@/lib/integrations/line-link';
import { formatPromptPayId, promptPayPayload, promptPayVariants } from '@/lib/integrations/promptpay';
import { customerMessage, staffMessage, type MessageInput } from '@/lib/notify/messages';

const input: MessageInput = {
  lang: 'th',
  bookingNo: '202610118',
  travelDate: '2026-10-24',
  pickupTime: '08:00:00',
  pickupName: 'นิมมานเหมินท์',
  customerName: 'กานต์ธิดา',
  total: 5200,
  deposit: 1500,
  quote: { price: 5200, deposit: 1500, deadline: '2026-10-21T11:30:00.000Z' },
  driver: { nickname: 'พี่เอ', plate: 'กข 1234', car: 'Toyota Camry' },
  returnOffer: { fromName: 'ปาย', pct: 15 },
};

describe('P4-41 customer messages (th + en)', () => {
  it('quote ready carries price, deposit and the Thai-time deadline', () => {
    const m = customerMessage('quote_ready', input)!;
    expect(m.title).toBe('แอ่วกัน · ราคาทริปของคุณมาแล้ว');
    expect(m.body).toContain('ส. 24 ต.ค. 2569 · 08:00');
    expect(m.body).toContain('฿5,200');
    expect(m.body).toContain('โอนมัดจำ ฿1,500 ภายใน 21 ต.ค. 18:30 (เวลาไทย)');
    const en = customerMessage('quote_ready', { ...input, lang: 'en' })!;
    expect(en.title).toBe('Aewkan · Your trip price is ready');
    expect(en.body).toContain('deposit ฿1,500 due by 21 Oct 18:30 (Thailand time, GMT+7)');
  });
  it('driver assigned names the driver, car and plate; the link is appended only when given', () => {
    const m = customerMessage('driver_assigned', { ...input, customerUrl: 'https://aewkan.example/j/abc' })!;
    expect(m.body).toContain('พี่เอ · Toyota Camry · ทะเบียน กข 1234');
    expect(m.text.endsWith('\nhttps://aewkan.example/j/abc')).toBe(true);
    expect(customerMessage('driver_assigned', input)!.text).toContain('เปิดลิงก์งานที่ส่งไว้ในแชทนี้');
  });
  it('confirmed, deposit received and return offer exist in both languages', () => {
    for (const lang of ['th', 'en'] as const) {
      for (const kind of ['confirmed', 'deposit_received', 'return_offer'] as const) {
        const m = customerMessage(kind, { ...input, lang });
        expect(m?.title.length).toBeGreaterThan(5);
        expect(m?.body.length).toBeGreaterThan(5);
      }
    }
    expect(customerMessage('return_offer', input)!.body).toContain('ส่วนลดขากลับ 15%');
  });
  it('kinds without data or staff-only kinds give no customer message', () => {
    expect(customerMessage('quote_ready', { ...input, quote: null })).toBeNull();
    expect(customerMessage('new_booking', input)).toBeNull();
  });
});

describe('P4-41 staff messages', () => {
  it('new booking and slip review in Thai with the admin link', () => {
    const s = staffMessage('new_booking', { ...input, quote: null, adminUrl: 'https://x/admin/jobs/1' })!;
    expect(s).toContain('งานใหม่ · 202610118 · กานต์ธิดา');
    expect(s).toContain('฿5,200 · มัดจำ ฿1,500');
    expect(s.endsWith('https://x/admin/jobs/1')).toBe(true);
    expect(staffMessage('slip_review', input)).toContain('ยอดที่ต้องได้ ฿1,500');
    expect(staffMessage('confirmed', input)).toBeNull();
  });
});

describe('LINE binding helpers', () => {
  const token = 'A'.repeat(43);
  it('finds the job-link token inside the pre-filled message', () => {
    expect(tokenInText(`แอ่วกัน การจอง 202610118\nhttps://aewkan.app/j/${token}`)).toBe(token);
    expect(tokenInText('202610118')).toBeNull();
    expect(tokenInText(`https://aewkan.app/j/${token}X${'B'.repeat(30)}`)).toBeNull();
  });
  it('builds the oaMessage deep link with the basic id and text encoded', () => {
    expect(lineOaMessageUrl('@aewkan', 'a b\nc')).toBe('https://line.me/R/oaMessage/%40aewkan/?a%20b%0Ac');
  });
});

/** CRC-16/CCITT-FALSE, written out here so the check does not reuse the library's own CRC */
function crc16(s: string): string {
  let crc = 0xffff;
  for (const ch of Buffer.from(s, 'utf8')) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

describe('P4-01 PromptPay payload', () => {
  it('is a dynamic EMV QR for the phone ID and the whole-baht amount, with a valid CRC', () => {
    const p = promptPayPayload('081-234-5678', 1500);
    expect(p.startsWith('000201010212')).toBe(true);
    expect(p).toContain('0016A000000677010111011300668123456785802TH53037645407');
    expect(p).toContain('54071500.00');
    expect(p.slice(-8, -4)).toBe('6304');
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });
  it('refuses a bad ID or a non-integer / zero amount', () => {
    expect(() => promptPayPayload('12345', 100)).toThrow('bad_promptpay_id');
    expect(() => promptPayPayload('0812345678', 0)).toThrow('bad_amount');
    expect(() => promptPayPayload('0812345678', 10.5)).toThrow('bad_amount');
  });
  it('formats and expands IDs', () => {
    expect(formatPromptPayId('0812345678')).toBe('081-234-5678');
    expect(formatPromptPayId('1234567890123')).toBe('1-2345-67890-12-3');
    expect(promptPayVariants('0812345678')).toEqual(['0812345678', '66812345678', '0066812345678']);
  });
});

describe('P4-54 integration settings rules', () => {
  const pp = integrationDef('promptpay')!;
  const stripe = integrationDef('stripe')!;
  const slip = integrationDef('slip')!;
  it('enabling needs the required config; saving disabled does not', () => {
    expect(checkConfig(pp, { id: '', name: '' }, true)).toMatchObject({ ok: false, code: 'config_incomplete', field: 'id' });
    expect(checkConfig(pp, { id: '', name: '' }, false)).toMatchObject({ ok: true });
    expect(checkConfig(pp, { id: '081-234-5678', name: 'x' }, false)).toMatchObject({ ok: false, code: 'bad_config', field: 'id' });
    expect(checkConfig(pp, { id: '0812345678', name: ' บจก. แอ่วกัน ', junk: 'dropped' }, true)).toEqual({ ok: true, config: { id: '0812345678', name: 'บจก. แอ่วกัน' } });
  });
  it('select fields default and reject unknown options; SlipOK needs a branch id, EasySlip does not', () => {
    expect(checkConfig(slip, {}, true)).toMatchObject({ ok: false, field: 'branchId' });
    expect(checkConfig(slip, { provider: 'easyslip' }, true)).toEqual({ ok: true, config: { provider: 'easyslip' } });
    expect(checkConfig(slip, { provider: 'other' }, false)).toMatchObject({ ok: false, code: 'bad_config' });
  });
  it('secret patches: undefined keeps, empty clears, shape checked, unknown field refused', () => {
    expect(secretsAfter(stripe, ['secretKey', 'webhookSecret'], { webhookSecret: '' })).toEqual(['secretKey']);
    expect(missingSecret(stripe, ['secretKey'])).toBe('webhookSecret');
    expect(badSecret(stripe, { secretKey: 'pk_test_x' })).toBe('secretKey');
    expect(badSecret(stripe, { secretKey: 'sk_test_abc', webhookSecret: '' })).toBeNull();
    expect(badSecret(stripe, { other: 'x' })).toBe('other');
    expect(secretFieldsSet(slip, ['*'])).toEqual(['apiKey']);
  });
});
