import 'server-only';
import webpush from 'web-push';

/** VAPID web push (R-010: one stable key pair from push_keys, private half in Vault) */
export interface PushKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** what public/sw.js expects — no job-link token ever travels in a push */
export interface PushPayload {
  title: string;
  body: string;
  /** one notification per booking + kind; a newer one replaces the older */
  tag: string;
  bookingNo: string;
}

export function generateVapid(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}

/** throws when the stored keys are not a valid VAPID pair */
export function checkVapid(keys: PushKeys): void {
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
}

/** 'gone' = the browser dropped this subscription (or it was made with an older key) → delete it */
export async function sendPush(keys: PushKeys, target: PushTarget, payload: PushPayload): Promise<'sent' | 'gone' | 'failed'> {
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 24 * 3600, urgency: 'high', timeout: 10_000 },
    );
    return 'sent';
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410 || status === 403) return 'gone';
    return 'failed';
  }
}
