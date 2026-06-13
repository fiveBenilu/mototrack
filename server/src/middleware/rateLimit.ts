import rateLimit from 'express-rate-limit';

// Begrenzt Anmelde-/Registrierungs-/Passwort-Versuche, um Brute-Force- und
// Credential-Stuffing-Angriffe zu bremsen. `app.set('trust proxy', 1)` ist in
// index.ts gesetzt, daher wird die echte Client-IP (hinter dem Reverse-Proxy)
// für die Zählung verwendet.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  limit: 10, // max. 10 Versuche pro IP und Fenster
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Erfolgreiche Anmeldungen nicht mitzählen – nur fehlgeschlagene Versuche
  // zählen gegen das Limit (Schutz zielt auf Rateversuche, nicht auf legitime Logins).
  skipSuccessfulRequests: true,
  message: { error: 'Zu viele Versuche. Bitte später erneut versuchen.' },
});
