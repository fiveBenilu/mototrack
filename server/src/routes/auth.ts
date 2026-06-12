import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { signToken, requireAuth, AuthedRequest } from '../middleware/auth';
import { config } from '../config';

export const authRouter = Router();

function generateFriendCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const exists = db.prepare('SELECT id FROM users WHERE friend_code = ?').get(code);
    if (!exists) return code;
  }
  throw new Error('Konnte keinen eindeutigen Friend-Code generieren');
}

const cookieOptions = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: (config.isProd ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 90 * 24 * 60 * 60 * 1000,
  path: '/',
};

export function publicUser(u: any) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatarPath: u.avatar_path,
    friendCode: u.friend_code,
    themePref: u.theme_pref,
  };
}

authRouter.post('/register', (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  }
  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3 || cleanUsername.length > 20 || !/^[a-z0-9_]+$/.test(cleanUsername)) {
    return res.status(400).json({ error: 'Benutzername: 3-20 Zeichen, nur Buchstaben, Zahlen, Unterstrich' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
  if (existing) return res.status(409).json({ error: 'Benutzername bereits vergeben' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const friendCode = generateFriendCode();
  const name = (typeof displayName === 'string' && displayName.trim()) || cleanUsername;

  const result = db
    .prepare('INSERT INTO users (username, password_hash, display_name, friend_code) VALUES (?, ?, ?, ?)')
    .run(cleanUsername, passwordHash, name, friendCode);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = signToken(result.lastInsertRowid as number);
  res.cookie('token', token, cookieOptions);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  }
  const cleanUsername = username.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUsername) as any;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
  }
  const token = signToken(user.id);
  res.cookie('token', token, cookieOptions);
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie('token', { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  res.json({ user: publicUser(user) });
});
