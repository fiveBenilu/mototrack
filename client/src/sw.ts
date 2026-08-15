/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision: string | null }[] };

// Von vite-plugin-pwa (injectManifest) eingefügte Precache-Liste → Offline-Fähigkeit.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Karten-Kacheln dauerhaft cachen: im Funkloch (Tal, Tunnel, Landstraße) bleibt
// die Karte sonst weiß – inklusive der geführten Route. Kacheln ändern sich
// praktisch nie, darum CacheFirst.
// ponytail: cacht nur, was schon einmal angezeigt wurde. Wer offline fahren
// will, zoomt die Strecke vorher einmal durch. Echtes Vorab-Herunterladen der
// Route erst, wenn das im Alltag nicht reicht.
registerRoute(
  ({ url }) => url.hostname.endsWith('basemaps.cartocdn.com'),
  new CacheFirst({
    cacheName: 'map-tiles',
    plugins: [
      // Kachel-CDN antwortet opaque (no-cors) → Status 0 mit zulassen.
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 2500, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true }),
    ],
  }),
);

// Neue Version sofort aktivieren.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

interface PushData {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

// Eingehende Push-Nachricht als System-Benachrichtigung anzeigen.
self.addEventListener('push', (event) => {
  let data: PushData = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    /* keine/ungültige Payload */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'MotoTrack', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

// Klick auf die Benachrichtigung: vorhandenes Fenster fokussieren/navigieren,
// sonst neues öffnen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
