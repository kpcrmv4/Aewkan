/**
 * What each integration stores (pure — used by the integrations page and its API route).
 * Non-secret settings live in `integrations.config`; secrets in Vault:
 *   one secret field  → stored as the plain string (routing, slip — worker D's routing adapter
 *                       reads `get_integration_secret('routing')` as the raw API key)
 *   several fields    → one JSON object `{ field: value }` (LINE, Stripe, Beam), merged in SQL
 */
import type { IntegrationKey } from '@/lib/contracts/payment';
import { EMAIL_RE } from './email';

export interface ConfigField {
  name: string;
  label: string;
  hint?: string;
  kind: 'text' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** required before the integration can be switched on */
  required?: boolean | ((config: Record<string, unknown>) => boolean);
  pattern?: RegExp;
  patternHint?: string;
  defaultValue?: string;
}

export interface SecretField {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  /** shape check before saving (never echoed back) */
  pattern?: RegExp;
  patternHint?: string;
}

export interface IntegrationDef {
  key: IntegrationKey;
  title: string;
  sub: string;
  config: ConfigField[];
  secrets: SecretField[];
  /** path of the webhook this provider calls */
  webhookPath?: string;
  webhookHint?: string;
}

export const INTEGRATIONS: IntegrationDef[] = [
  {
    key: 'promptpay',
    title: 'PromptPay',
    sub: 'QR รับมัดจำในลิงก์งาน · ลูกค้าแนบสลิป แล้วระบบหรือทีมงานตรวจ',
    config: [
      {
        name: 'id',
        label: 'พร้อมเพย์ (เบอร์โทร / เลขผู้เสียภาษี / e-wallet)',
        kind: 'text',
        placeholder: '0812345678',
        required: true,
        pattern: /^(\d{10}|\d{13}|\d{15})$/,
        patternHint: 'ตัวเลข 10 หลัก (เบอร์) 13 หลัก (เลขประจำตัว) หรือ 15 หลัก (e-wallet) ไม่มีขีด',
      },
      { name: 'name', label: 'ชื่อบัญชีที่ลูกค้าเห็น', kind: 'text', placeholder: 'บจก. แอ่วกัน', required: true },
    ],
    secrets: [],
  },
  {
    key: 'slip',
    title: 'ตรวจสลิปอัตโนมัติ',
    sub: 'ยืนยันมัดจำทันทีเมื่อสลิปถูกต้อง · ไม่แน่ใจ = ส่งให้ทีมงานตรวจ',
    config: [
      {
        name: 'provider',
        label: 'ผู้ให้บริการ',
        kind: 'select',
        options: [
          { value: 'slipok', label: 'SlipOK' },
          { value: 'easyslip', label: 'EasySlip' },
        ],
        defaultValue: 'slipok',
        required: true,
      },
      {
        name: 'branchId',
        label: 'SlipOK Branch ID',
        kind: 'text',
        placeholder: '12345',
        hint: 'เฉพาะ SlipOK (ตัวเลขใน URL ของ API)',
        required: (c) => (c.provider ?? 'slipok') === 'slipok',
        pattern: /^[0-9A-Za-z_-]{1,40}$/,
      },
      {
        name: 'receiverAccount',
        label: 'เลขบัญชีรับเงิน (ถ้าโอนเข้าบัญชีธนาคาร)',
        kind: 'text',
        placeholder: '1234567890',
        hint: 'ใช้เทียบผู้รับเงินในสลิปเพิ่มจากพร้อมเพย์',
        pattern: /^\d{10,15}$/,
        patternHint: 'ตัวเลข 10–15 หลัก ไม่มีขีด',
      },
    ],
    secrets: [{ name: 'apiKey', label: 'API key', required: true }],
  },
  {
    key: 'stripe',
    title: 'Stripe',
    sub: 'บัตรเครดิต/เดบิต ต่างประเทศ · Checkout ของ Stripe',
    config: [],
    secrets: [
      { name: 'secretKey', label: 'Secret key', required: true, pattern: /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/, patternHint: 'ขึ้นต้นด้วย sk_test_ / sk_live_ / rk_…' },
      { name: 'webhookSecret', label: 'Webhook signing secret', required: true, pattern: /^whsec_[A-Za-z0-9]+$/, patternHint: 'ขึ้นต้นด้วย whsec_' },
    ],
    webhookPath: '/api/webhooks/stripe',
    webhookHint: 'อีเวนต์: checkout.session.completed · checkout.session.async_payment_succeeded · checkout.session.async_payment_failed · checkout.session.expired',
  },
  {
    key: 'beam',
    title: 'Beam',
    sub: 'บัตรไทย e-wallet โมบายแบงก์กิ้ง และ PromptPay ผ่านหน้าชำระของ Beam',
    config: [
      { name: 'merchantId', label: 'Merchant ID', kind: 'text', required: true, pattern: /^[A-Za-z0-9_-]{2,60}$/ },
      {
        name: 'environment',
        label: 'สภาพแวดล้อม',
        kind: 'select',
        options: [
          { value: 'playground', label: 'Playground (ทดสอบ)' },
          { value: 'production', label: 'Production (เงินจริง)' },
        ],
        defaultValue: 'playground',
        required: true,
      },
    ],
    secrets: [
      { name: 'apiKey', label: 'API key', required: true },
      { name: 'webhookKey', label: 'Webhook HMAC key (base64)', required: true, pattern: /^[A-Za-z0-9+/=]{16,200}$/, patternHint: 'คีย์ base64 จากหน้า Webhook ของ Beam Lighthouse' },
    ],
    webhookPath: '/api/webhooks/beam',
    webhookHint: 'อีเวนต์: payment_link.paid และ charge.succeeded',
  },
  {
    key: 'line',
    title: 'LINE OA',
    sub: 'ส่งราคา การยืนยัน และคนขับให้ลูกค้าทาง LINE · แจ้งทีมงานเมื่อมีงานใหม่',
    config: [
      { name: 'basicId', label: 'Basic ID ของ OA', kind: 'text', placeholder: '@aewkan', required: true, pattern: /^@[A-Za-z0-9._-]{3,30}$/, patternHint: 'ขึ้นต้นด้วย @' },
      {
        name: 'staffTo',
        label: 'ส่งแจ้งเตือนทีมงานไปที่ (User ID หรือ Group ID)',
        kind: 'text',
        placeholder: 'Cxxxxxxxx… หรือ Uxxxxxxxx…',
        hint: 'เชิญ OA เข้ากลุ่มทีมงาน แล้ว OA จะตอบ Group ID ให้คัดลอกมาใส่',
        pattern: /^[UCR][0-9a-f]{32}$/,
      },
    ],
    secrets: [
      { name: 'channelSecret', label: 'Channel secret', required: true, pattern: /^[0-9a-f]{32}$/, patternHint: 'ตัวอักษร 32 ตัว (0-9 a-f)' },
      { name: 'channelAccessToken', label: 'Channel access token (long-lived)', required: true },
    ],
    webhookPath: '/api/webhooks/line',
    webhookHint: 'เปิด "Use webhook" ใน LINE Developers และปิดข้อความตอบกลับอัตโนมัติถ้าไม่ต้องการให้ตอบซ้ำ',
  },
  {
    key: 'email',
    title: 'อีเมลลูกค้า (Resend)',
    sub: 'ส่งยืนยันการจอง ราคา คนขับ และข้อเสนอขากลับ ให้ลูกค้าที่เลือกติดต่อทางอีเมล',
    config: [
      {
        name: 'fromEmail',
        label: 'อีเมลผู้ส่ง',
        kind: 'text',
        placeholder: 'booking@yourdomain.com',
        hint: 'ต้องอยู่บนโดเมนที่ยืนยันแล้วใน Resend',
        required: true,
        pattern: EMAIL_RE,
        patternHint: 'รูปแบบอีเมลไม่ถูกต้อง',
      },
      { name: 'fromName', label: 'ชื่อผู้ส่ง', kind: 'text', placeholder: 'แอ่วกัน', defaultValue: 'แอ่วกัน' },
      {
        name: 'replyTo',
        label: 'อีเมลรับการตอบกลับ (ถ้ามี)',
        kind: 'text',
        placeholder: 'hello@yourdomain.com',
        hint: 'ลูกค้ากดตอบกลับแล้วจะส่งมาที่นี่',
        pattern: EMAIL_RE,
        patternHint: 'รูปแบบอีเมลไม่ถูกต้อง',
      },
    ],
    secrets: [{ name: 'apiKey', label: 'Resend API key', required: true, pattern: /^re_[A-Za-z0-9_]{8,}$/, patternHint: 'ขึ้นต้นด้วย re_' }],
  },
  {
    key: 'routing',
    title: 'ระยะทางถนน (routing)',
    sub: 'ใช้คำนวณระยะทางและเวลาจริงตามถนน แทนการประมาณจากเส้นตรง',
    config: [
      {
        name: 'provider',
        label: 'ผู้ให้บริการ',
        kind: 'select',
        options: [
          { value: 'ors', label: 'OpenRouteService' },
          { value: 'google', label: 'Google Routes' },
        ],
        defaultValue: 'ors',
        required: true,
      },
    ],
    secrets: [{ name: 'apiKey', label: 'API key', required: true }],
  },
];

export const integrationDef = (key: string) => INTEGRATIONS.find((d) => d.key === key);

/** a single secret field is stored as the plain value; several as one JSON object */
export const isSingleSecret = (def: IntegrationDef) => def.secrets.length === 1;

/** the set field names as the page shows them ('*' from SQL = the one plain secret) */
export function secretFieldsSet(def: IntegrationDef, fromDb: string[]): string[] {
  if (isSingleSecret(def)) return fromDb.length ? [def.secrets[0].name] : [];
  return fromDb.filter((f) => def.secrets.some((s) => s.name === f));
}

const isRequired = (f: ConfigField, config: Record<string, unknown>) => (typeof f.required === 'function' ? f.required(config) : Boolean(f.required));

export type ConfigCheck =
  | { ok: true; config: Record<string, string> }
  | { ok: false; code: 'bad_config' | 'config_incomplete'; field: string };

/** keep only the known fields, trimmed; check patterns; required fields only when switching on */
export function checkConfig(def: IntegrationDef, raw: Record<string, unknown>, enabling: boolean): ConfigCheck {
  const out: Record<string, string> = {};
  for (const f of def.config) {
    const v = raw[f.name];
    const s = v === undefined || v === null ? '' : String(v).trim();
    const value = s || f.defaultValue || '';
    if (f.options && value && !f.options.some((o) => o.value === value)) return { ok: false, code: 'bad_config', field: f.name };
    if (value && f.pattern && !f.pattern.test(value)) return { ok: false, code: 'bad_config', field: f.name };
    if (value) out[f.name] = value;
  }
  if (enabling) {
    for (const f of def.config) {
      if (isRequired(f, out) && !out[f.name]) return { ok: false, code: 'config_incomplete', field: f.name };
    }
  }
  return { ok: true, config: out };
}

/** secrets that will be set after applying a patch on top of what is stored */
export function secretsAfter(def: IntegrationDef, stored: string[], patch: Record<string, string>): string[] {
  const set = new Set(secretFieldsSet(def, stored));
  for (const [k, v] of Object.entries(patch)) {
    if (v === '') set.delete(k);
    else set.add(k);
  }
  return [...set];
}

export function missingSecret(def: IntegrationDef, after: string[]): string | null {
  const miss = def.secrets.find((s) => s.required && !after.includes(s.name));
  return miss ? miss.name : null;
}

export function badSecret(def: IntegrationDef, patch: Record<string, string>): string | null {
  for (const [k, v] of Object.entries(patch)) {
    const f = def.secrets.find((s) => s.name === k);
    if (!f) return k;
    if (v !== '' && f.pattern && !f.pattern.test(v.trim())) return k;
  }
  return null;
}
