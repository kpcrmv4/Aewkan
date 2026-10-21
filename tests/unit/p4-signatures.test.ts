import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { verifyBeamSignature, verifyLineSignature, verifyStripeSignature } from '@/lib/integrations/signatures';

describe('P4-30 Stripe-Signature', () => {
  const body = '{"id":"evt_1","type":"checkout.session.completed"}';
  const secret = 'whsec_test_secret';
  // computed independently: printf '1700000000.<body>' | openssl dgst -sha256 -hmac whsec_test_secret
  const v1 = 'a13d4b1f9003bc2fb6c06224e878b6056185eaa50d40e1e7dc05517f8af41d7b';

  it('accepts the openssl vector inside the tolerance', () => {
    expect(verifyStripeSignature(body, `t=1700000000,v1=${v1}`, secret, 1700000100)).toBe(true);
  });
  it('accepts when one of several v1 signatures matches (secret rotation)', () => {
    expect(verifyStripeSignature(body, `t=1700000000,v1=${'0'.repeat(64)},v1=${v1}`, secret, 1700000000)).toBe(true);
  });
  it('rejects outside the 5 minute window (replay)', () => {
    expect(verifyStripeSignature(body, `t=1700000000,v1=${v1}`, secret, 1700000301)).toBe(false);
  });
  it('rejects a changed body, a wrong secret, a missing header and v0-only headers', () => {
    expect(verifyStripeSignature(body.replace('evt_1', 'evt_2'), `t=1700000000,v1=${v1}`, secret, 1700000000)).toBe(false);
    expect(verifyStripeSignature(body, `t=1700000000,v1=${v1}`, 'whsec_other', 1700000000)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, 1700000000)).toBe(false);
    expect(verifyStripeSignature(body, `t=1700000000,v0=${v1}`, secret, 1700000000)).toBe(false);
  });
  it("agrees with the Stripe SDK's own test header", () => {
    const sdk = new Stripe('sk_test_unused');
    const now = Math.floor(Date.now() / 1000);
    const header = sdk.webhooks.generateTestHeaderString({ payload: body, secret, timestamp: now });
    expect(verifyStripeSignature(body, header, secret, now)).toBe(true);
    expect(verifyStripeSignature(`${body} `, header, secret, now)).toBe(false);
  });
});

describe('P4-31 X-Beam-Signature (vector published in Beam docs, webhook-authentication)', () => {
  const key = 'KOFELguf5L1ltuDlkDHGUkPPnQhrgYYijTR4Fqh7APc=';
  const sig = '1XzWtJHZ9Y1tmjkA/XZUIn1ZHrUQp1d0Ms0oDQfJBto=';
  const body =
    '{"chargeId":"ch_30GtUweMWec7r2hHIsV5xxQeJKp","merchantId":"m_2sHxsByPwESKYM4nMwdEBdhubPS","referenceId":"order#10001","status":"SUCCEEDED","currency":"THB","amount":3000000,"source":"PAYMENT_LINK","sourceId":"57Iot6c11o","transactionTime":"2025-07-23T10:16:12Z","paymentMethod":{"paymentMethodType":"CARD","card":{"last4":"1111","brand":"VISA"},"cardInstallments":null,"cardNetworkToken":null,"qrPromptPay":null,"alipay":null,"weChatPay":null,"trueMoney":null,"linePay":null,"shopeePay":null,"bangkokBankApp":null,"kPlus":null,"scbEasy":null,"krungsriApp":null},"failureCode":"","customer":{"primaryPhone":{"countryCode":"+66","number":"0958051075"},"email":"","deliveryAddress":{"contactName":"","phone":{"countryCode":"","number":""},"address":{"streetAddress":"","city":"","country":"","postCode":""}}},"createdAt":"2025-07-23T10:15:56.102401Z","updatedAt":"2025-07-23T10:16:17.418991Z"}';

  it('accepts the documented vector', () => {
    expect(verifyBeamSignature(body, sig, key)).toBe(true);
  });
  it('rejects a reformatted body, another key, garbage and a missing header', () => {
    expect(verifyBeamSignature(JSON.stringify(JSON.parse(body), null, 2), sig, key)).toBe(false);
    expect(verifyBeamSignature(body, sig, Buffer.from('another key').toString('base64'))).toBe(false);
    expect(verifyBeamSignature(body, 'not-base64!!', key)).toBe(false);
    expect(verifyBeamSignature(body, null, key)).toBe(false);
  });
});

describe('P4-32 x-line-signature', () => {
  const secret = '8c570fa6dd201bb328f1c1eac23a96d8';
  const body = '{"destination":"Uxxx","events":[]}';
  // printf '<body>' | openssl dgst -sha256 -hmac <secret> -binary | base64
  const sig = 'Ql/g2yAveC3phXoHjRgw2nvEqOCuoHsOo0NpgtbSSgQ=';

  it('accepts the openssl vector', () => {
    expect(verifyLineSignature(body, sig, secret)).toBe(true);
  });
  it('rejects a changed body, another secret and an empty header', () => {
    expect(verifyLineSignature(`${body}\n`, sig, secret)).toBe(false);
    expect(verifyLineSignature(body, sig, '0'.repeat(32))).toBe(false);
    expect(verifyLineSignature(body, '', secret)).toBe(false);
  });
});
