import type { CreateBookingRequestDto } from '@/lib/contracts/booking';
import { EMAIL_RE } from '@/lib/contracts/common';
import { nameOf, type Model } from './model';

export interface ContactForm {
  name: string;
  contact: string;
  channel: 'line' | 'whatsapp' | 'phone' | 'email' | 'other';
  hotel: string;
  note: string;
  pushOptIn: boolean;
}

export const EMPTY_CONTACT: ContactForm = { name: '', contact: '', channel: 'line', hotel: '', note: '', pushOptIn: false };

export type ContactErrors = { name?: true; contact?: true | 'email' };

export function validateContact(c: ContactForm): ContactErrors {
  const e: ContactErrors = {};
  if (!c.name.trim()) e.name = true;
  if (c.channel === 'email') {
    if (!EMAIL_RE.test(c.contact.trim())) e.contact = 'email';
  } else if (c.contact.trim().length < 3) e.contact = true;
  return e;
}

/**
 * The request the server re-prices. In quote mode the customer asks for a quote
 * (mode null) and `expectedTotal` is the reference total of the cheapest valid mode,
 * which is what the server stores as the reference price.
 */
export function buildRequest(m: Model, c: ContactForm): CreateBookingRequestDto | null {
  const { res, mode, state, input, lang } = m;
  const chosen = m.quote ? res.best : mode;
  if (!chosen) return null;
  return {
    trip: {
      pickupId: input.pickupId,
      stops: input.stops.map((s) => ({ placeId: s.placeId, dwell: s.dwell })),
      date: input.date,
      time: input.time,
      pax: input.pax,
      vehicle: input.vehicle,
      roundTrip: input.roundTrip,
      langDriver: input.langDriver,
      festival: input.festival,
    },
    mode: m.quote ? null : chosen,
    customer: {
      name: c.name.trim(),
      contact: c.contact.trim(),
      channel: c.channel,
      lang,
      hotel: c.hotel.trim(),
      note: c.note.trim(),
      pushOptIn: m.quote ? c.pushOptIn : false,
    },
    ruleVersion: m.catalog.ruleVersion,
    expectedTotal: res.modes[chosen].total,
  };
}

/** short title for the "my trips" list: the stop names */
export function tripTitle(m: Model): string {
  return m.state.stops
    .map((s) => m.catalog.places.find((p) => p.id === s.placeId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => nameOf(p, m.lang))
    .join(' + ');
}
