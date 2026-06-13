import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import { db } from './db';

// Web-Push braucht ein stabiles VAPID-Schlüsselpaar. Reihenfolge der Quellen:
//   1. Umgebungsvariablen VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (Produktion)
//   2. data/vapid.json (lokal generiert, gitignored, überlebt Neustarts)
//   3. Einmal generieren und nach data/vapid.json schreiben
// So bleiben bestehende Abonnements über Serverneustarts hinweg gültig.
const vapidFile = path.join(__dirname, '../data', 'vapid.json');

function loadKeys(): { publicKey: string; privateKey: string } {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  try {
    return JSON.parse(fs.readFileSync(vapidFile, 'utf-8'));
  } catch {
    const keys = webpush.generateVAPIDKeys();
    try {
      fs.mkdirSync(path.dirname(vapidFile), { recursive: true });
      fs.writeFileSync(vapidFile, JSON.stringify(keys));
    } catch {
      /* nicht persistierbar – Schlüssel gelten dann nur bis zum Neustart */
    }
    return keys;
  }
}

const keys = loadKeys();
// Apple (Web Push auf iOS) verlangt im VAPID-JWT eine gültige mailto:- oder
// https:-Adresse mit echter Domain. Eine .local-Adresse kann dazu führen, dass
// Apple Pushes stillschweigend ablehnt → per Env überschreibbar, sinnvoller Default.
const contact = process.env.VAPID_SUBJECT || 'mailto:bennet@bgriese.de';
webpush.setVapidDetails(contact, keys.publicKey, keys.privateKey);

export const vapidPublicKey = keys.publicKey;

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

const selectSubs = db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?');
const deleteSub = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');

/**
 * Schickt eine Push-Nachricht an alle Geräte eines Nutzers. Läuft im Hintergrund
 * (nicht awaited beim Aufrufer nötig) und entfernt abgelaufene Abos (404/410).
 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  const subs = selectSubs.all(userId) as { endpoint: string; p256dh: string; auth: string }[];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
      } catch (err: any) {
        // Abgelaufene/abbestellte Abos entfernen.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          deleteSub.run(s.endpoint);
          return;
        }
        // Andere Fehler (z. B. Apple lehnt das VAPID-JWT ab → 400/403) sichtbar
        // machen, statt sie zu verschlucken – sonst „kommt einfach nichts an".
        console.error(
          `[push] Senden fehlgeschlagen (user ${userId}, status ${err?.statusCode}): ${err?.body || err?.message}`,
        );
      }
    }),
  );
}

export function sendPushToUsers(userIds: number[], payload: PushPayload): void {
  for (const id of userIds) void sendPushToUser(id, payload);
}
