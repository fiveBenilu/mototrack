/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision: string | null }[] };

// Von vite-plugin-pwa (injectManifest) eingefügte Precache-Liste → Offline-Fähigkeit.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

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
