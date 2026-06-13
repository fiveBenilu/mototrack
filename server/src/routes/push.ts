import { Router } from 'express';
import { db } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { vapidPublicKey } from '../push';

export const pushRouter = Router();

// Öffentlicher VAPID-Schlüssel, den der Client zum Abonnieren braucht.
pushRouter.get('/key', (_req, res) => {
  res.json({ key: vapidPublicKey });
});

// Gerät/Browser für Push registrieren. Endpoint ist eindeutig → upsert.
pushRouter.post('/subscribe', requireAuth, (req: AuthedRequest, res) => {
  const sub = req.body || {};
  const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint : '';
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (!endpoint || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return res.status(400).json({ error: 'Ungültiges Abonnement' });
  }
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  ).run(endpoint, req.userId, p256dh, auth);
  res.status(201).json({ ok: true });
});

// Abonnement entfernen (Abmelden / Toggle aus).
pushRouter.post('/unsubscribe', requireAuth, (req: AuthedRequest, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  if (endpoint) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.userId);
  res.json({ ok: true });
});
