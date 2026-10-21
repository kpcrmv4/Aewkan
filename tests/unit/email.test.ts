import { describe, expect, it } from 'vitest';
import { CustomerSchema } from '@/lib/contracts/booking';
import { badSecret, checkConfig, integrationDef } from '@/lib/integrations/catalog';
import { EMAIL_RE, emailHtml, emailText, resendRequest, resendSend, type EmailMessage } from '@/lib/integrations/email';
import { customerMessage, type MessageInput } from '@/lib/notify/messages';

const msg: EmailMessage = { lang: 'en', title: 'Aewkan · Booking received', body: 'Booking 202611001 · <b>Sat</b> & more', bookingNo: '202611001', url: 'https://aewkan.example/j/abc' };

describe('customer e-mail (Resend)', () => {
  it('EMAIL-U1 escapes the message in HTML and links the trip', () => {
    const html = emailHtml(msg);
    expect(html).toContain('&lt;b&gt;Sat&lt;/b&gt; &amp; more');
    expect(html).not.toContain('<b>Sat</b>');
    expect(html).toContain('href="https://aewkan.example/j/abc"');
    expect(html).toContain('lang="en"');
  });

  it('EMAIL-U2 without a link points to the first e-mail (th and en)', () => {
    expect(emailText({ ...msg, url: null })).toContain('trip link from our first booking e-mail');
    expect(emailText({ ...msg, lang: 'th', url: null })).toContain('อีเมลยืนยันการจองฉบับแรก');
    expect(emailHtml({ ...msg, url: null })).not.toContain('href=');
  });

  it('EMAIL-U3 builds the Resend request: display name, reply-to, html + text', () => {
    const r = resendRequest({ fromEmail: 'booking@aewkan.example', fromName: 'แอ่วกัน "x"', replyTo: 'hi@aewkan.example' }, 'guest@example.org', msg);
    expect(r.from).toBe('แอ่วกัน x <booking@aewkan.example>');
    expect(r.to).toEqual(['guest@example.org']);
    expect(r.subject).toBe(msg.title);
    expect(r.reply_to).toBe('hi@aewkan.example');
    expect(r.text).toContain('Booking 202611001');
    expect(resendRequest({ fromEmail: 'a@b.co', fromName: '' }, 'c@d.co', msg)).not.toHaveProperty('reply_to');
  });

  it('EMAIL-U4 sends with bearer key + idempotency key, throws on an API error', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const okFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 });
    }) as unknown as typeof fetch;
    const req = resendRequest({ fromEmail: 'a@b.co', fromName: 'A' }, 'c@d.co', msg);
    await expect(resendSend('re_test_123456789', req, 'b1:quote_ready:abc', okFetch)).resolves.toBe('em_1');
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.authorization).toBe('Bearer re_test_123456789');
    expect(h['idempotency-key']).toBe('b1:quote_ready:abc');
    expect(JSON.parse(String(calls[0].init.body)).to).toEqual(['c@d.co']);

    const badFetch = (async () => new Response(JSON.stringify({ name: 'validation_error', message: 'domain not verified' }), { status: 403 })) as unknown as typeof fetch;
    await expect(resendSend('re_x', req, undefined, badFetch)).rejects.toThrow(/403 validation_error domain not verified/);
  });

  it('EMAIL-U5 the integrations page validates the sender and the key', () => {
    const def = integrationDef('email')!;
    expect(checkConfig(def, { fromEmail: 'not-an-email' }, false)).toMatchObject({ ok: false, code: 'bad_config', field: 'fromEmail' });
    expect(checkConfig(def, {}, true)).toMatchObject({ ok: false, code: 'config_incomplete', field: 'fromEmail' });
    expect(checkConfig(def, { fromEmail: 'booking@aewkan.example' }, true)).toMatchObject({ ok: true, config: { fromEmail: 'booking@aewkan.example', fromName: 'แอ่วกัน' } });
    expect(badSecret(def, { apiKey: 'sk_live_nope' })).toBe('apiKey');
    expect(badSecret(def, { apiKey: 're_AbC123_xyz789' })).toBeNull();
    expect(EMAIL_RE.test('LINE @someone')).toBe(false);
  });

  it('EMAIL-U6 booking_received words a booking and a quote request differently', () => {
    const base: MessageInput = {
      lang: 'th', bookingNo: '202611001', travelDate: '2026-11-10', pickupTime: '09:00:00', pickupName: 'ประตูท่าแพ', customerName: 'ก้อย',
      total: 3200, deposit: 1000, quote: null, driver: null, returnOffer: null, status: 'awaiting_deposit',
    };
    expect(customerMessage('booking_received', base)?.body).toContain('โอนมัดจำ ฿1,000');
    expect(customerMessage('booking_received', { ...base, status: 'quote_requested' })?.title).toContain('ได้รับคำขอราคาแล้ว');
    expect(customerMessage('booking_received', { ...base, lang: 'en' })?.title).toBe('Aewkan · Booking received');
  });

  it('EMAIL-U7 a booking with the e-mail channel must give a valid address', () => {
    const base = { name: 'Ann', lang: 'en' as const };
    expect(CustomerSchema.safeParse({ ...base, contact: 'not an email', channel: 'email' }).success).toBe(false);
    expect(CustomerSchema.safeParse({ ...base, contact: 'ann@example.org', channel: 'email' }).success).toBe(true);
    expect(CustomerSchema.safeParse({ ...base, contact: '@ann_line', channel: 'line' }).success).toBe(true);
  });
});
