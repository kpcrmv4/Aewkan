/**
 * Job-link API (P3 implements). Every route resolves `[token]` to one
 * job_links row first (404 when unknown or revoked), then checks audience.
 *
 *   GET  /api/jobs/[token]                       → JobView (shape depends on audience)
 *   POST /api/jobs/[token]/push                  PushSubscribeRequest (customer + driver)
 *   POST /api/jobs/[token]/photo-url             PhotoUploadUrlRequest → { uploadUrl, path }   (driver)
 *   POST /api/jobs/[token]/photo                 PhotoConfirmRequest                           (driver)
 *   POST /api/jobs/[token]/start                 {}  requires a pickup photo                   (driver)
 *   POST /api/jobs/[token]/checkin               CheckinRequest                                (driver)
 *   POST /api/jobs/[token]/commission            CommissionReportRequest                       (driver)
 *   POST /api/jobs/[token]/finish                FinishRequest  requires a drop-off photo       (driver)
 *   POST /api/jobs/[token]/return                ReturnOfferRequest → CreateBookingResponse    (customer)
 *   POST /api/jobs/[token]/return/dismiss        {}                                            (customer)
 */
import { z } from 'zod';
import { baht, hhmm, isoDate, uuid } from './common';

export const PushSubscribeRequest = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

export const PhotoKind = z.enum(['pickup', 'dropoff']);
export const PhotoUploadUrlRequest = z.object({ kind: PhotoKind, contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) });
export const PhotoConfirmRequest = z.object({ kind: PhotoKind, path: z.string().min(10).max(300) });

export const CheckinRequest = z.object({ seq: z.number().int().min(1).max(30) });

export const CommissionReportRequest = z.object({
  seq: z.number().int().min(1).max(30),
  saleAmount: baht.nullable(),
});

export const FinishRequest = z.object({ cashCollected: baht });

export const ReturnOfferRequest = z.object({
  toId: uuid,
  date: isoDate,
  time: hhmm,
});

export type Audience = 'customer' | 'driver';

export interface JobStopView {
  seq: number;
  placeId: string;
  nameTh: string;
  nameEn: string;
  dwell: number;
  plannedMinutes: number;
  plannedKm: number;
  measured: boolean;
  checkedInAt: string | null;
  /** driver audience only */
  commission?: { type: 'head' | 'booking' | 'sale'; amount: number; splitKey: string; note: string } | null;
}

export interface JobView {
  audience: Audience;
  bookingNo: string;
  status: string;
  lang: 'th' | 'en';
  travelDate: string;
  pickupTime: string;
  pickup: { id: string; nameTh: string; nameEn: string };
  vehicleKey: string;
  pax: number;
  roundTrip: boolean;
  mode: string;
  ruleVersion: number;
  price: { lines: unknown[]; total: number; deposit: number; paid: number } | null;
  quote: { price: number; deposit: number; deadline: string; message: string | null } | null;
  stops: JobStopView[];
  driver: { nickname: string; nameEn: string; fullName: string; carTh: string; carEn: string; plate: string; phone: string; lineId: string; langs: string[]; langsEn: string[]; rating: number; years: number } | null;
  photos: { kind: 'pickup' | 'dropoff'; takenAt: string; url?: string }[];
  /** driver audience only */
  customer?: { name: string; contact: string; hotel: string; note: string; langDriver: boolean };
  returnOffer: { fromId: string; discountPct: number; validUntil: string; returnBookingNo: string | null } | null;
}
