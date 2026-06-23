import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { publicUser, cookieOptions } from './auth';

export const usersRouter = Router();

const uploadsDir = path.join(__dirname, '../../uploads/avatars');
fs.mkdirSync(uploadsDir, { recursive: true });

// Avatare werden zunächst im Speicher entgegengenommen und erst nach Prüfung
// der echten Dateisignatur (Magic Bytes) auf die Platte geschrieben. Der vom
// Client gesendete `mimetype` und der Originaldateiname sind manipulierbar und
// dürfen NICHT darüber entscheiden, welche Endung die Datei bekommt – sonst
// ließe sich z. B. eine SVG/HTML-Datei als Bild hochladen und würde beim Abruf
// über /uploads als Skript im Origin der App ausgeführt (Stored XSS).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
});

// Erkennt das Bildformat anhand der Magic Bytes und liefert die passende
// Dateiendung – oder null, wenn es kein unterstütztes Rasterbild ist.
function detectImageExt(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return '.png';
  if (buf.length >= 6 && buf.toString('ascii', 0, 6).match(/^GIF8[79]a$/)) return '.gif';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) return '.webp';
  return null;
}

usersRouter.put('/me', requireAuth, (req: AuthedRequest, res) => {
  const { displayName, themePref, shareActivity } = req.body || {};
  const updates: string[] = [];
  const values: unknown[] = [];

  if (typeof shareActivity === 'boolean') {
    updates.push('share_activity = ?');
    values.push(shareActivity ? 1 : 0);
  }

  if (typeof displayName === 'string') {
    const trimmed = displayName.trim();
    if (trimmed.length < 1 || trimmed.length > 30) {
      return res.status(400).json({ error: 'Anzeigename: 1-30 Zeichen' });
    }
    updates.push('display_name = ?');
    values.push(trimmed);
  }

  if (typeof themePref === 'string') {
    if (!['auto', 'light', 'dark'].includes(themePref)) {
      return res.status(400).json({ error: 'Ungültiger Theme-Wert' });
    }
    updates.push('theme_pref = ?');
    values.push(themePref);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'Keine Änderungen übergeben' });

  values.push(req.userId);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: publicUser(user) });
});

usersRouter.put('/me/password', authLimiter, requireAuth, (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Aktuelles und neues Passwort erforderlich' });
  }
  if (newPassword.length < 6) return res.status(400).json({ error: 'Neues Passwort muss mindestens 6 Zeichen haben' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.userId);
  res.json({ ok: true });
});

usersRouter.post('/me/avatar', requireAuth, upload.single('avatar'), (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei erhalten' });

  const ext = detectImageExt(req.file.buffer);
  if (!ext) return res.status(400).json({ error: 'Nur Bilddateien erlaubt (JPEG, PNG, WebP, GIF)' });

  // Serverseitig generierter Dateiname; weder Originalname noch Endung des
  // Clients fließen ein. Zufallsanteil verhindert Erraten/Überschreiben.
  const filename = `${req.userId}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  if (user.avatar_path) {
    // Nur Dateien innerhalb des Avatar-Verzeichnisses löschen (Schutz vor
    // manipulierten Pfaden in der DB), den Basename verwenden.
    const oldPath = path.join(uploadsDir, path.basename(user.avatar_path));
    fs.unlink(oldPath, () => {});
  }

  const avatarPath = `/uploads/avatars/${filename}`;
  db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(avatarPath, req.userId);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: publicUser(updated) });
});

// DSGVO Art. 20 (Datenübertragbarkeit): vollständiger Export aller zu diesem
// Nutzer gespeicherten personenbezogenen Daten als JSON-Download. Passwort-Hash
// und Push-Schlüssel (auth/p256dh) werden bewusst NICHT exportiert – sie sind
// reine Sicherheitsartefakte ohne Auskunftswert.
usersRouter.get('/me/export', requireAuth, (req: AuthedRequest, res) => {
  const uid = req.userId;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as any;
  if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  delete user.password_hash;

  const data = {
    exportedAt: new Date().toISOString(),
    note: 'Vollständiger Export deiner bei MotoTrack gespeicherten personenbezogenen Daten (DSGVO Art. 20).',
    profile: user,
    rides: db.prepare('SELECT * FROM rides WHERE user_id = ? ORDER BY started_at').all(uid),
    friendships: db.prepare('SELECT * FROM friendships WHERE user_id = ? OR friend_id = ?').all(uid, uid),
    ownedGroups: db.prepare('SELECT * FROM ride_groups WHERE owner_id = ?').all(uid),
    groupMemberships: db.prepare('SELECT * FROM group_members WHERE user_id = ?').all(uid),
    groupMessages: db.prepare('SELECT * FROM group_messages WHERE user_id = ? ORDER BY created_at').all(uid),
    cameraPasses: db.prepare('SELECT * FROM camera_passes WHERE user_id = ?').all(uid),
    zonePasses: db.prepare('SELECT * FROM zone_passes WHERE user_id = ?').all(uid),
    pushSubscriptions: db.prepare('SELECT endpoint, created_at FROM push_subscriptions WHERE user_id = ?').all(uid),
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="mototrack-export-${uid}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

// DSGVO Art. 17 (Recht auf Löschung): löscht das Konto und – über die
// ON DELETE CASCADE-Fremdschlüssel im Schema – sämtliche damit verknüpften
// Daten (Fahrten, Freundschaften, eigene Gruppen samt Mitgliedern/Nachrichten,
// Durchfahrten, Push-Abos). Zur Sicherheit ist das aktuelle Passwort nötig.
usersRouter.delete('/me', authLimiter, requireAuth, (req: AuthedRequest, res) => {
  const { password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  if (typeof password !== 'string' || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Passwort ist falsch' });
  }

  // Profilbild von der Platte entfernen (nur innerhalb des Avatar-Verzeichnisses).
  if (user.avatar_path) {
    fs.unlink(path.join(uploadsDir, path.basename(user.avatar_path)), () => {});
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);
  res.clearCookie('token', { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

