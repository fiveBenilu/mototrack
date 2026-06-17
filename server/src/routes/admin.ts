import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { db, dbPath } from '../db';
import { requireAuth, requireAdmin, AuthedRequest } from '../middleware/auth';

export const adminRouter = Router();

// Alle Admin-Endpunkte erfordern Anmeldung UND Admin-Rechte.
adminRouter.use(requireAuth, requireAdmin);

const uploadsDir = path.join(__dirname, '../../uploads/avatars');

// Summe der Dateigrößen in einem Verzeichnis (flach), 0 wenn nicht vorhanden.
function dirSize(dir: string): number {
  let total = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      try {
        total += fs.statSync(path.join(dir, name)).size;
      } catch {
        /* Datei verschwunden – ignorieren */
      }
    }
  } catch {
    /* Verzeichnis existiert nicht */
  }
  return total;
}

function fileSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

// Globale Kennzahlen + Speichernutzung auf der Platte.
adminRouter.get('/overview', (_req, res) => {
  const userCount = (db.prepare('SELECT COUNT(*) c FROM users').get() as { c: number }).c;
  const adminCount = (db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 1').get() as { c: number }).c;
  const rideAgg = db
    .prepare('SELECT COUNT(*) c, COALESCE(SUM(distance_m),0) dist, COALESCE(SUM(LENGTH(track_data)),0) bytes FROM rides')
    .get() as { c: number; dist: number; bytes: number };
  const groupCount = (db.prepare('SELECT COUNT(*) c FROM ride_groups').get() as { c: number }).c;
  const messageCount = (db.prepare('SELECT COUNT(*) c FROM group_messages').get() as { c: number }).c;
  const pushCount = (db.prepare('SELECT COUNT(*) c FROM push_subscriptions').get() as { c: number }).c;

  // SQLite-Dateien: Haupt-DB + WAL + SHM.
  const dbBytes = fileSize(dbPath) + fileSize(`${dbPath}-wal`) + fileSize(`${dbPath}-shm`);
  const uploadsBytes = dirSize(uploadsDir);

  res.json({
    users: userCount,
    admins: adminCount,
    rides: rideAgg.c,
    totalDistanceM: rideAgg.dist,
    groups: groupCount,
    messages: messageCount,
    pushSubscriptions: pushCount,
    storage: {
      dbBytes,
      trackDataBytes: rideAgg.bytes,
      uploadsBytes,
      totalBytes: dbBytes + uploadsBytes,
    },
  });
});

// Alle Konten inkl. pro Nutzer aggregierter Kennzahlen und Speichernutzung.
adminRouter.get('/users', (_req, res) => {
  const users = db
    .prepare('SELECT id, username, display_name, avatar_path, friend_code, is_admin, created_at FROM users ORDER BY created_at')
    .all() as any[];

  // Aggregate je Nutzer in einem Rutsch holen und per Map zuordnen.
  const rideRows = db
    .prepare(
      `SELECT user_id, COUNT(*) c, COALESCE(SUM(distance_m),0) dist,
              COALESCE(SUM(LENGTH(track_data)),0) bytes, MAX(started_at) last
       FROM rides GROUP BY user_id`,
    )
    .all() as { user_id: number; c: number; dist: number; bytes: number; last: number }[];
  const rideMap = new Map(rideRows.map((r) => [r.user_id, r]));

  const friendRows = db
    .prepare("SELECT user_id, COUNT(*) c FROM friendships WHERE status = 'accepted' GROUP BY user_id")
    .all() as { user_id: number; c: number }[];
  const friendMap = new Map(friendRows.map((r) => [r.user_id, r.c]));

  const groupRows = db.prepare('SELECT user_id, COUNT(*) c FROM group_members GROUP BY user_id').all() as {
    user_id: number;
    c: number;
  }[];
  const groupMap = new Map(groupRows.map((r) => [r.user_id, r.c]));

  const pushRows = db.prepare('SELECT user_id, COUNT(*) c FROM push_subscriptions GROUP BY user_id').all() as {
    user_id: number;
    c: number;
  }[];
  const pushMap = new Map(pushRows.map((r) => [r.user_id, r.c]));

  const result = users.map((u) => {
    const ride = rideMap.get(u.id);
    const avatarBytes = u.avatar_path ? fileSize(path.join(uploadsDir, path.basename(u.avatar_path))) : 0;
    const trackBytes = ride?.bytes ?? 0;
    return {
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      friendCode: u.friend_code,
      isAdmin: !!u.is_admin,
      createdAt: u.created_at,
      hasAvatar: !!u.avatar_path,
      rides: ride?.c ?? 0,
      totalDistanceM: ride?.dist ?? 0,
      lastRideAt: ride?.last ?? null,
      friends: friendMap.get(u.id) ?? 0,
      groups: groupMap.get(u.id) ?? 0,
      pushSubscriptions: pushMap.get(u.id) ?? 0,
      storageBytes: trackBytes + avatarBytes,
    };
  });

  res.json({ users: result });
});

// Passwort eines beliebigen Kontos setzen (Admin-Override, kein altes Passwort nötig).
adminRouter.post('/users/:id/password', (req: AuthedRequest, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
  }
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden' });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  res.json({ ok: true });
});

// Admin-Rechte vergeben/entziehen. Schutz: der letzte Admin darf nicht entzogen werden.
adminRouter.post('/users/:id/admin', (req: AuthedRequest, res) => {
  const { isAdmin } = req.body || {};
  if (typeof isAdmin !== 'boolean') return res.status(400).json({ error: 'isAdmin (boolean) erforderlich' });
  const target = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(req.params.id) as
    | { id: number; is_admin: number }
    | undefined;
  if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden' });

  if (!isAdmin && target.is_admin) {
    const adminCount = (db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 1').get() as { c: number }).c;
    if (adminCount <= 1) return res.status(400).json({ error: 'Der letzte Admin kann nicht entfernt werden' });
  }

  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// Konto löschen (cascade über Fremdschlüssel). Eigenes Konto und letzter Admin
// sind geschützt, damit man sich nicht selbst aussperrt.
adminRouter.delete('/users/:id', (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    return res.status(400).json({ error: 'Eigenes Admin-Konto kann hier nicht gelöscht werden' });
  }
  const target = db.prepare('SELECT id, avatar_path, is_admin FROM users WHERE id = ?').get(targetId) as
    | { id: number; avatar_path: string | null; is_admin: number }
    | undefined;
  if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden' });

  if (target.is_admin) {
    const adminCount = (db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 1').get() as { c: number }).c;
    if (adminCount <= 1) return res.status(400).json({ error: 'Der letzte Admin kann nicht gelöscht werden' });
  }

  if (target.avatar_path) {
    fs.unlink(path.join(uploadsDir, path.basename(target.avatar_path)), () => {});
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  res.json({ ok: true });
});
