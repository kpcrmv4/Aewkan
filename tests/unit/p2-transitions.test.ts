import { describe, expect, it } from 'vitest';
import { BOOKING_STATUSES } from '@/lib/contracts/common';
import { canTransition, nextStatuses } from '@/features/admin-ops/transitions';

describe('P2-01-U1 status transitions', () => {
  it('allows the documented moves', () => {
    expect(nextStatuses('quote_requested')).toEqual(['cancelled']);
    expect(nextStatuses('quoted')).toEqual(['quote_expired', 'cancelled']);
    expect(nextStatuses('quote_expired')).toEqual(['cancelled']);
    expect(nextStatuses('awaiting_deposit')).toEqual(['cancelled']);
    expect(nextStatuses('deposit_review')).toEqual(['cancelled']);
    expect(nextStatuses('confirmed')).toEqual(['cancelled']);
    expect(nextStatuses('assigned')).toEqual(['traveling', 'cancelled']);
    expect(nextStatuses('traveling')).toEqual(['done']);
  });

  it('done and cancelled are terminal', () => {
    expect(nextStatuses('done')).toEqual([]);
    expect(nextStatuses('cancelled')).toEqual([]);
  });

  it('never allows a move to itself or backwards out of a terminal state', () => {
    for (const s of BOOKING_STATUSES) expect(canTransition(s, s)).toBe(false);
    for (const s of BOOKING_STATUSES) {
      expect(canTransition('done', s)).toBe(false);
      expect(canTransition('cancelled', s)).toBe(false);
    }
  });

  it('keeps side-effect moves out of the generic route', () => {
    expect(canTransition('confirmed', 'assigned')).toBe(false);
    expect(canTransition('quote_requested', 'quoted')).toBe(false);
    expect(canTransition('deposit_review', 'confirmed')).toBe(false);
    expect(canTransition('confirmed', 'done')).toBe(false);
  });
});
