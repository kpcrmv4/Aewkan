/**
 * Customer e-mail through Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Pure builders (HTML/text) + one POST; unit-tested with a fake fetch in tests/unit/email.test.ts.
 * The API key comes from Vault (integration `email`, single secret) — R-001.
 */
import { EMAIL_RE } from '@/lib/contracts/common';

export { EMAIL_RE };

export interface EmailMessage {
  lang: 'th' | 'en';
  title: string;
  body: string;
  bookingNo: string;
  /** the raw job link when the caller holds it (booking created / link re-issued) */
  url?: string | null;
  /** absolute URL of the wordmark (public/brand) — omitted = text brand */
  logoUrl?: string | null;
}

export interface EmailSender {
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** brand colours from docs/design/demo.html (palette A); e-mail clients need inline styles */
const C = { canvas: '#F3F6F1', surface: '#FFFFFF', ink: '#0F1F1A', muted: '#5E6D66', brand: '#D2421D', line: '#E3E8E2' };

export function emailText(m: EmailMessage): string {
  const th = m.lang === 'th';
  const link = m.url
    ? `\n\n${th ? 'ดูรายละเอียดทริป' : 'Your trip'}: ${m.url}`
    : `\n\n${th ? 'ดูรายละเอียดได้ที่ลิงก์ทริปในอีเมลยืนยันการจองฉบับแรก' : 'Details are in the trip link from our first booking e-mail.'}`;
  const foot = th ? `\n\nเลขที่การจอง ${m.bookingNo} · ตอบกลับอีเมลนี้เพื่อติดต่อทีมงาน` : `\n\nBooking ${m.bookingNo} · reply to this e-mail to reach us`;
  return `${m.title}\n\n${m.body}${link}${foot}`;
}

export function emailHtml(m: EmailMessage): string {
  const th = m.lang === 'th';
  const button = m.url
    ? `<p style="margin:24px 0 8px"><a href="${esc(m.url)}" style="display:inline-block;background:${C.brand};color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${th ? 'เปิดรายละเอียดทริป' : 'Open your trip'}</a></p>`
    : `<p style="margin:20px 0 0;color:${C.muted};font-size:14px">${th ? 'ดูรายละเอียดได้ที่ลิงก์ทริปในอีเมลยืนยันการจองฉบับแรก' : 'Details are in the trip link from our first booking e-mail.'}</p>`;
  return `<!doctype html><html lang="${m.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.title)}</title></head>
<body style="margin:0;background:${C.canvas};font-family:-apple-system,'Segoe UI',Tahoma,'Noto Sans Thai',sans-serif;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${C.surface};border:1px solid ${C.line};border-radius:16px">
<tr><td style="padding:20px 24px 8px">${m.logoUrl ? `<img src="${esc(m.logoUrl)}" width="150" height="52" alt="${th ? 'แอ่วกัน AewKan' : 'AewKan แอ่วกัน'}" style="display:block;border:0;height:52px;width:150px">` : `<span style="font-size:15px;font-weight:700;color:${C.brand}">${th ? 'แอ่วกัน' : 'AewKan'}</span>`}</td></tr>
<tr><td style="padding:0 24px 24px">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.35">${esc(m.title)}</h1>
<p style="margin:0;font-size:15px;line-height:1.6">${esc(m.body)}</p>
${button}
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${C.line};color:${C.muted};font-size:13px">${th ? `เลขที่การจอง ${esc(m.bookingNo)} · ตอบกลับอีเมลนี้เพื่อติดต่อทีมงาน` : `Booking ${esc(m.bookingNo)} · reply to this e-mail to reach us`}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export interface ResendRequest {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
}

export function resendRequest(sender: EmailSender, to: string, m: EmailMessage): ResendRequest {
  const name = sender.fromName.replace(/["<>\r\n]/g, '').trim();
  return {
    from: name ? `${name} <${sender.fromEmail}>` : sender.fromEmail,
    to: [to],
    subject: m.title,
    html: emailHtml(m),
    text: emailText(m),
    ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
  };
}

/**
 * Send one e-mail. `idempotencyKey` (booking + kind) makes a retried notify a no-op at
 * Resend for 24 h. Throws on any non-2xx with Resend's message.
 */
export async function resendSend(apiKey: string, req: ResendRequest, idempotencyKey?: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
  if (!res.ok) throw new Error(`resend: HTTP ${res.status} ${body?.name ?? ''} ${body?.message ?? ''}`.trim().slice(0, 300));
  return body?.id ?? '';
}
