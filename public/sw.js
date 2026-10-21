/* Aewkan service worker — web push only (P4).
 *
 * There is deliberately NO fetch handler: nothing is cached and no request is
 * intercepted, so admin pages, the job links and the API always go to the network.
 * A push payload carries { title, body, tag, bookingNo } and never a job-link token;
 * tapping a notification opens the job link this device subscribed from (remembered
 * here per booking number), or "my trips" as the fallback.
 */
const LINKS = 'aewkan-links-v1';
const linkKey = (no) => `/__aewkan/link/${encodeURIComponent(String(no))}`;
const safePath = (p) => (typeof p === 'string' && /^\/j\/[A-Za-z0-9_-]{40,60}$/.test(p) ? p : null);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// the job-link page tells us which link belongs to which booking
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type !== 'aewkan-link' || !d.bookingNo) return;
  const path = safePath(d.url);
  if (!path) return;
  event.waitUntil(caches.open(LINKS).then((c) => c.put(linkKey(d.bookingNo), new Response(path))));
});

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: 'แอ่วกัน', body: event.data ? event.data.text() : '' };
  }
  const title = typeof d.title === 'string' && d.title ? d.title : 'แอ่วกัน · Aewkan';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof d.body === 'string' ? d.body : '',
      tag: typeof d.tag === 'string' ? d.tag : undefined,
      renotify: true,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { bookingNo: d.bookingNo || null },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const no = event.notification.data && event.notification.data.bookingNo;
  event.waitUntil(
    (async () => {
      let path = '/trips';
      if (no) {
        const hit = await caches.open(LINKS).then((c) => c.match(linkKey(no)));
        const stored = hit ? safePath(await hit.text()) : null;
        if (stored) path = stored;
      }
      const url = new URL(path, self.location.origin).href;
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (w.url === url && 'focus' in w) return w.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
