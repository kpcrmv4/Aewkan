import { describe, expect, it } from 'vitest';
import { decideSlip, matchMasked, receiverMatches, type DecideInput } from '@/lib/integrations/slip/decide';
import { parseEasySlip } from '@/lib/integrations/slip/easyslip';
import { parseSlipOk } from '@/lib/integrations/slip/slipok';
import fx from './p4-slip-fixtures.json';

const base: DecideInput = {
  due: 1500,
  promptpayId: '0812345678',
  receiverAccount: '1234590120',
  refUsedElsewhere: false,
  bookingCreatedAt: '2026-10-21T06:00:00.000Z',
};

describe('P4-11 SlipOK parsing (recorded fixtures)', () => {
  it('normalizes a success response', () => {
    const o = parseSlipOk(fx.slipok.success.status, fx.slipok.success.body);
    expect(o.kind).toBe('facts');
    if (o.kind !== 'facts') return;
    expect(o.facts).toMatchObject({
      transRef: '015294101345ATF07385',
      amount: 1500,
      receiverProxy: 'xxx-xxx-5678',
      receiverAccount: 'xxx-x-x9012-x',
      receiverName: 'บจก. แอ่วกัน',
      at: '2026-10-21T07:05:12.000Z',
      duplicate: false,
    });
  });
  it('maps 1012 to duplicate and keeps the facts it sent', () => {
    const o = parseSlipOk(fx.slipok.duplicate.status, fx.slipok.duplicate.body);
    expect(o).toMatchObject({ kind: 'error', code: 'duplicate' });
    expect(o.kind === 'error' && o.facts?.transRef).toBe('015294101345ATF07385');
  });
  it('maps 1010 bank delay and 1007 no QR; garbage → provider_bad_response', () => {
    expect(parseSlipOk(400, fx.slipok.bankDelay.body)).toMatchObject({ kind: 'error', code: 'bank_delay' });
    expect(parseSlipOk(400, fx.slipok.noQr.body)).toMatchObject({ kind: 'error', code: 'no_qr' });
    expect(parseSlipOk(502, '<html>')).toMatchObject({ kind: 'error', code: 'provider_bad_response' });
    expect(parseSlipOk(400, { code: 9999, message: 'x' })).toMatchObject({ kind: 'error', code: 'slipok_9999' });
  });
});

describe('P4-12 EasySlip v2 parsing (recorded fixtures)', () => {
  it('normalizes rawSlip', () => {
    const o = parseEasySlip(fx.easyslip.success.status, fx.easyslip.success.body);
    expect(o.kind).toBe('facts');
    if (o.kind !== 'facts') return;
    expect(o.facts).toMatchObject({
      transRef: '68370160657749I376388B35',
      amount: 900,
      receiverAccount: 'xxx-x-x9012-x',
      receiverProxy: '08xxxxxx78',
      receiverName: 'บริษัท แอ่วกัน จำกัด',
      at: '2026-10-21T07:30:00.000Z',
      duplicate: false,
    });
  });
  it('isDuplicate → duplicate error; SLIP_NOT_FOUND / SLIP_PENDING / QUOTA_EXCEEDED mapped', () => {
    expect(parseEasySlip(200, fx.easyslip.duplicate.body)).toMatchObject({ kind: 'error', code: 'duplicate' });
    expect(parseEasySlip(404, fx.easyslip.notFound.body)).toMatchObject({ kind: 'error', code: 'no_qr' });
    expect(parseEasySlip(404, fx.easyslip.pending.body)).toMatchObject({ kind: 'error', code: 'bank_delay' });
    expect(parseEasySlip(403, fx.easyslip.quota.body)).toMatchObject({ kind: 'error', code: 'provider_quota' });
    expect(parseEasySlip(500, null)).toMatchObject({ kind: 'error', code: 'provider_bad_response' });
  });
});

describe('P4-13 masked receiver matching', () => {
  it('compares visible digits by position when the lengths agree', () => {
    expect(matchMasked('xxx-xxx-5678', '0812345678')).toBe(true);
    expect(matchMasked('xxx-xxx-5679', '0812345678')).toBe(false);
    expect(matchMasked('xxx-x-x9012-x', '1234590120')).toBe(true);
  });
  it('falls back to leading/trailing runs when the lengths differ (EasySlip 08xxxxxx78)', () => {
    expect(matchMasked('08xxxxxxxx78', '0812345678')).toBe(true);
    expect(matchMasked('09xxxxxxxx78', '0812345678')).toBe(false);
  });
  it('too little to tell → null', () => {
    expect(matchMasked('xxx-xxx-xx78', '0812345678')).toBeNull();
    expect(matchMasked(null, '0812345678')).toBeNull();
    expect(matchMasked('บัญชี', '0812345678')).toBeNull();
  });
  it('a phone PromptPay ID also matches the 66… form a slip may print', () => {
    expect(receiverMatches({ transRef: 'x', amount: 1, receiverAccount: null, receiverProxy: 'xxxxxxx45678', receiverName: null, at: null, duplicate: false }, { promptpayId: '0812345678' })).toBe(true);
  });
});

describe('P4-13 decision', () => {
  const ok = parseSlipOk(fx.slipok.success.status, fx.slipok.success.body);
  it('paid only when amount, receiver, reference and age all check out', () => {
    expect(decideSlip(ok, base)).toEqual({ result: 'paid', reason: 'verified' });
  });
  it('amount below the deposit → review', () => {
    expect(decideSlip(ok, { ...base, due: 1501 })).toEqual({ result: 'review', reason: 'amount_low' });
  });
  it('receiver that disagrees → review; nothing configured to compare → review', () => {
    expect(decideSlip(ok, { ...base, promptpayId: '0899999999', receiverAccount: null })).toEqual({ result: 'review', reason: 'receiver_mismatch' });
    expect(decideSlip(ok, { ...base, promptpayId: null, receiverAccount: null })).toEqual({ result: 'review', reason: 'receiver_unknown' });
  });
  it('a transRef already on another payment → review', () => {
    expect(decideSlip(ok, { ...base, refUsedElsewhere: true })).toEqual({ result: 'review', reason: 'duplicate_ref' });
  });
  it('a transfer from before the booking existed → review', () => {
    expect(decideSlip(ok, { ...base, bookingCreatedAt: '2026-10-25T00:00:00.000Z' })).toEqual({ result: 'review', reason: 'slip_too_old' });
  });
  it('provider errors and duplicates never auto-confirm', () => {
    expect(decideSlip(parseSlipOk(400, fx.slipok.duplicate.body), base)).toEqual({ result: 'review', reason: 'duplicate' });
    expect(decideSlip(parseEasySlip(200, fx.easyslip.duplicate.body), base)).toEqual({ result: 'review', reason: 'duplicate' });
    expect(decideSlip(parseSlipOk(400, fx.slipok.bankDelay.body), base)).toEqual({ result: 'review', reason: 'bank_delay' });
  });
  it('EasySlip success with the matching account is paid for its own amount', () => {
    const e = parseEasySlip(200, fx.easyslip.success.body);
    expect(decideSlip(e, { ...base, due: 900 })).toEqual({ result: 'paid', reason: 'verified' });
    expect(decideSlip(e, { ...base, due: 901 })).toEqual({ result: 'review', reason: 'amount_low' });
  });
});
