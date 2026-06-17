import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db } from '../db';

export interface AuthedRequest extends Request {
  userId?: number;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { userId: number };
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Ungültige Session' });
  }
}

// Muss NACH requireAuth in der Kette stehen (nutzt req.userId). Prüft bei jeder
// Anfrage frisch in der DB, ob der Nutzer Admin ist – so wirkt ein Entzug der
// Admin-Rechte sofort, ohne auf ein neues Token zu warten.
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ error: 'Nicht angemeldet' });
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId) as
    | { is_admin: number }
    | undefined;
  if (!user || !user.is_admin) return res.status(403).json({ error: 'Kein Admin-Zugriff' });
  next();
}

export function signToken(userId: number): string {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '90d' });
}
