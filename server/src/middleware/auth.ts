import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

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

export function signToken(userId: number): string {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '90d' });
}
