/**
 * Public booking API (P1 builds the UI, P0 owns the contract, P1/P4 implement).
 *
 *   POST /api/bookings          CreateBookingRequest → CreateBookingResponse
 *        server re-plans and re-prices with src/lib/pricing and the CURRENT rule
 *        set; `expectedTotal` lets it refuse (409 price_changed) instead of
 *        silently charging a different number than the customer saw.
 *        Quote-mode dates create status 'quote_requested' (no price charged).
 */
import { z } from 'zod';
import { baht, contactChannel, EMAIL_RE, hhmm, isoDate, lang, uuid, PRICED_MODES } from './common';

export const StopSchema = z.object({
  placeId: uuid,
  dwell: z.number().int().min(0).max(600),
});

export const TripInputSchema = z.object({
  pickupId: uuid,
  stops: z.array(StopSchema).min(1).max(12),
  date: isoDate,
  time: hhmm,
  pax: z.number().int().min(1).max(15),
  vehicle: z.string().min(2).max(20),
  roundTrip: z.boolean(),
  langDriver: z.boolean(),
  festival: z.boolean(),
});
export type TripInputDto = z.infer<typeof TripInputSchema>;

export const CustomerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contact: z.string().trim().min(3).max(120),
  channel: contactChannel,
  lang,
  hotel: z.string().trim().max(200).default(''),
  note: z.string().trim().max(500).default(''),
  pushOptIn: z.boolean().default(false),
}).refine((c) => c.channel !== 'email' || EMAIL_RE.test(c.contact), { path: ['contact'], message: 'อีเมลไม่ถูกต้อง / invalid e-mail' });
export type CustomerDto = z.infer<typeof CustomerSchema>;

export const CreateBookingRequest = z.object({
  trip: TripInputSchema,
  /** null = request a quote (quote-mode dates only) */
  mode: z.enum(PRICED_MODES).nullable(),
  customer: CustomerSchema,
  ruleVersion: z.number().int().positive(),
  expectedTotal: baht.nullable(),
  /** set when booking the return leg from a return offer */
  returnOf: z.object({ token: z.string().min(40).max(60) }).optional(),
});
export type CreateBookingRequestDto = z.infer<typeof CreateBookingRequest>;

export interface CreateBookingResponse {
  bookingNo: string;
  status: 'quote_requested' | 'awaiting_deposit';
  total: number | null;
  deposit: number | null;
  /** path of the customer job link, e.g. /j/<token> — the token is shown once */
  customerPath: string;
}
