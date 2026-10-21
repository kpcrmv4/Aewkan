import type { BookingStatus } from '@/lib/contracts/common';

/**
 * Manual status changes a staff member with jobs.manage may make from the
 * booking detail page. Moves that carry side effects have their own screens:
 * quoting (→ quoted) lives in /admin/quotes, assigning (→ assigned) in
 * /admin/assign, and deposits (→ confirmed) arrive with payments (P4).
 */
export const STATUS_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  quote_requested: ['cancelled'],
  quoted: ['quote_expired', 'cancelled'],
  quote_expired: ['cancelled'],
  awaiting_deposit: ['cancelled'],
  deposit_review: ['cancelled'],
  confirmed: ['cancelled'],
  assigned: ['traveling', 'cancelled'],
  traveling: ['done'],
  done: [],
  cancelled: [],
};

export const nextStatuses = (from: BookingStatus): readonly BookingStatus[] => STATUS_TRANSITIONS[from] ?? [];

export const canTransition = (from: BookingStatus, to: BookingStatus): boolean => nextStatuses(from).includes(to);

/** statuses the quotes screen lists */
export const QUOTE_STATUSES = ['quote_requested', 'quoted', 'quote_expired'] as const;
/** statuses the assign screen lists (assigned = reassign) */
export const ASSIGN_STATUSES = ['confirmed', 'assigned'] as const;
