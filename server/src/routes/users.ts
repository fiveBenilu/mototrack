import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { publicUser } from './auth';

export const usersRouter = Router();

const uploadsDir = path.join(__dirname, '../../uploads/avatars');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req: AuthedRequest, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.jpg';
    cb(null, `${req.userId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('Nur Bilddateien erlaubt'));
    }
    cb(null, true);
  },
});

usersRouter.put('/me', requireAuth, (req: AuthedRequest, res) => {
  const { displayName, themePref } = req.body || {};
  const updates: string[] = [];
  const values: unknown[] = [];

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

usersRouter.put('/me/password', requireAuth, (req: AuthedRequest, res) => {
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

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  if (user.avatar_path) {
    const oldPath = path.join(__dirname, '../..', user.avatar_path);
    fs.unlink(oldPath, () => {});
  }

  const avatarPath = `/uploads/avatars/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(avatarPath, req.userId);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: publicUser(updated) });
});

