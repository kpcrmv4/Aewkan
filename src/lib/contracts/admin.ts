/**
 * Staff API (P2 implements unless noted). All routes use staffRoute():
 * session first (401), permission (403), then body (422).
 *
 *   POST /api/admin/quotes/send        SendQuoteRequest            quotes.manage
 *   POST /api/admin/assign             AssignDriverRequest         jobs.manage   → returns message text + links
 *   POST /api/admin/bookings/status    SetStatusRequest            jobs.manage
 *   POST /api/admin/payments/confirm   ConfirmPaymentRequest       jobs.manage   (P4)
 *   POST /api/admin/pricing/publish    PublishRulesRequest         pricing.manage
 *   POST /api/admin/places             UpsertPlaceRequest          places.manage
 *   POST /api/admin/segments           UpsertSegmentRequest        places.manage
 *   POST /api/admin/segments/delete    DeleteSegmentRequest        places.manage
 *   POST /api/admin/commission         UpsertCommissionRequest     commission.manage
 *   POST /api/admin/commission/delete  { placeId }                 commission.manage
 *   POST /api/admin/drivers            UpsertDriverRequest         drivers.manage
 *   POST /api/admin/integrations       UpdateIntegrationRequest    integrations.manage (P4)
 *   POST /api/admin/team/invite        InviteRequest               team.manage (P5)
 *   POST /api/admin/team/staff         UpdateStaffRequest          team.manage (P5)
 *   POST /api/admin/team/roles         UpsertRoleRequest           team.manage (P5)
 *   POST /api/admin/team/transfer      { newOwnerId }              owner only  (P5)
 *   POST /api/admin/team/invite/revoke { inviteId }                team.manage (P5, schema in the route)
 *   POST /api/admin/team/roles/archive { key }                     team.manage (P5, schema in the route)
 *   POST /api/invite/accept            { token, fullName }         invitee session (P5, schema in the route)
 */
import { z } from 'zod';
import { baht, uuid, BOOKING_STATUSES } from './common';

export const SendQuoteRequest = z.object({
  bookingId: uuid,
  price: baht.refine((n) => n > 0, 'ราคาต้องมากกว่า 0'),
  deposit: baht,
  hours: z.number().int().min(1).max(72),
  message: z.string().trim().max(1000),
});

export const AssignDriverRequest = z.object({
  bookingId: uuid,
  driverId: uuid,
  channel: z.enum(['line', 'whatsapp', 'email', 'copy']),
  /** false (default): keep the customer's live link so saved links keep working */
  reissueCustomerLink: z.boolean().default(false),
});

export const SetStatusRequest = z.object({
  bookingId: uuid,
  status: z.enum(BOOKING_STATUSES),
  reason: z.string().trim().max(300).default(''),
});

export const ConfirmPaymentRequest = z.object({ paymentId: uuid, approve: z.boolean() });

export const PublishRulesRequest = z.object({
  rules: z.record(z.string(), z.unknown()),
  note: z.string().trim().max(200).default(''),
});

export const PLACE_CATEGORIES = ['pickup', 'city', 'temple', 'nature', 'craft', 'province'] as const;

export const UpsertPlaceRequest = z.object({
  id: uuid.optional(),
  nameTh: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  lat: z.number().min(5).max(21),
  lng: z.number().min(97).max(106),
  category: z.enum(PLACE_CATEGORIES),
  isPickup: z.boolean(),
  isMountain: z.boolean(),
  defaultDwellMin: z.number().int().min(0).max(600),
  isHidden: z.boolean().default(false),
});

export const UpsertSegmentRequest = z.object({
  fromId: uuid,
  toId: uuid,
  km: z.number().positive().max(2000),
  minutes: z.number().int().positive().max(2000),
  source: z.enum(['driven', 'checkins', 'routing']),
  note: z.string().trim().max(200).default(''),
});
export const DeleteSegmentRequest = z.object({ fromId: uuid, toId: uuid, source: z.enum(['driven', 'checkins', 'routing']) });

export const UpsertCommissionRequest = z.object({
  placeId: uuid,
  type: z.enum(['head', 'booking', 'sale']),
  amount: z.number().int().min(0).max(100_000),
  splitKey: z.string().regex(/^[a-z_]{2,30}$/),
  note: z.string().trim().max(300).default(''),
});

export const UpsertDriverRequest = z.object({
  id: uuid.optional(),
  fullName: z.string().trim().min(1).max(120),
  nickname: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().max(60).default(''),
  phone: z.string().trim().max(30).default(''),
  lineId: z.string().trim().max(60).default(''),
  langs: z.array(z.string().trim().min(1).max(30)).max(6),
  langsEn: z.array(z.string().trim().min(1).max(30)).max(6),
  vehicleKey: z.string().min(2).max(20),
  carTh: z.string().trim().max(120).default(''),
  carEn: z.string().trim().max(120).default(''),
  plate: z.string().trim().max(20).default(''),
  years: z.number().int().min(0).max(60).default(0),
  note: z.string().trim().max(300).default(''),
  isActive: z.boolean().default(true),
});

export const INTEGRATION_KEYS = ['line', 'stripe', 'beam', 'slip', 'routing', 'promptpay', 'email'] as const;
export const UpdateIntegrationRequest = z.object({
  key: z.enum(INTEGRATION_KEYS),
  isEnabled: z.boolean(),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  /** undefined = keep the stored secret · '' = clear it */
  secret: z.string().max(4000).optional(),
});

export const InviteRequest = z.object({ email: z.string().trim().email().max(200), roleKey: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/) });
export const UpdateStaffRequest = z.object({ staffId: uuid, roleKey: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/).optional(), isActive: z.boolean().optional() });
export const UpsertRoleRequest = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
  nameTh: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).default(''),
  permissions: z.array(z.string()).max(20),
});
export const TransferOwnershipRequest = z.object({ newOwnerId: uuid });
