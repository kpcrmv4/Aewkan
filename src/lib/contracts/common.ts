import { z } from 'zod';

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');
export const baht = z.number().int().min(0).max(1_000_000);

export const BOOKING_STATUSES = [
  'quote_requested',
  'quoted',
  'quote_expired',
  'awaiting_deposit',
  'deposit_review',
  'confirmed',
  'assigned',
  'traveling',
  'done',
  'cancelled',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PRICED_MODES = ['hourly', 'daily', 'trip', 'oneway'] as const;
export const contactChannel = z.enum(['line', 'whatsapp', 'phone', 'email', 'other']);
export const lang = z.enum(['th', 'en']);

/** the error body every route returns: { error: { code, message } } */
export interface ApiErrorBody {
  error: { code: string; message: string };
}
