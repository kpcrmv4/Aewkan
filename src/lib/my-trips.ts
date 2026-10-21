/**
 * "ทริปของฉัน" — customers have no account, so the device remembers the job
 * links it has seen. Browser storage only (may be empty or blocked); the link
 * itself stays the source of truth.
 */
export interface MyTrip {
  token: string;
  bookingNo: string;
  travelDate: string;
  title: string;
  savedAt: string;
}

const KEY = 'aewkan.trips';
const MAX = 20;

export function listTrips(): MyTrip[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is MyTrip => typeof t?.token === 'string' && typeof t?.bookingNo === 'string' && typeof t?.travelDate === 'string',
    );
  } catch {
    return [];
  }
}

export function rememberTrip(trip: Omit<MyTrip, 'savedAt'>): void {
  try {
    const rest = listTrips().filter((t) => t.token !== trip.token && t.bookingNo !== trip.bookingNo);
    const next = [{ ...trip, savedAt: new Date().toISOString() }, ...rest].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the customer still has the link in LINE/e-mail */
  }
}

export function forgetTrip(token: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(listTrips().filter((t) => t.token !== token)));
  } catch {
    /* ignore */
  }
}
