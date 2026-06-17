#!/usr/bin/env node
//
// Admin-Verwaltung für MotoTrack (direkt auf der Datenbank).
//
// Damit erstellst du den Admin-Login und kannst ihn jederzeit ändern:
//
//   node scripts/admin.mjs set <username> <password>   # Admin anlegen ODER
//                                                       # Passwort setzen + zum Admin machen
//   node scripts/admin.mjs demote <username>           # Admin-Rechte entziehen
//   node scripts/admin.mjs list                        # alle Admins anzeigen
//
// Respektiert DB_PATH (sonst ../data/mototrack.db relativ zu diesem Skript).
// Muss bei laufendem Server nicht gestoppt werden (WAL erlaubt parallelen Zugriff).
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/mototrack.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Die Tabellen werden vom Server beim ersten Start angelegt. Existiert sie noch
// nicht, ist die DB nicht initialisiert.
const cols = db.prepare('PRAGMA table_info(users)').all();
if (cols.length === 0) {
  console.error(
    `Datenbank '${dbPath}' ist nicht initialisiert (Tabelle 'users' fehlt).\n` +
      'Bitte starte den Server einmal, damit die Datenbank angelegt wird, und führe das Skript danach erneut aus.',
  );
  process.exit(1);
}
// is_admin-Spalte sicherstellen, falls dieses Skript vor dem ersten Serverstart
// mit neuem Code läuft.
if (!cols.some((c) => c.name === 'is_admin')) {
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
}

function generateFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (!db.prepare('SELECT 1 FROM users WHERE friend_code = ?').get(code)) return code;
  }
  throw new Error('Konnte keinen eindeutigen Friend-Code erzeugen');
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'list') {
  const admins = db.prepare('SELECT id, username, display_name FROM users WHERE is_admin = 1 ORDER BY id').all();
  if (admins.length === 0) console.log('Keine Admins vorhanden.');
  else for (const a of admins) console.log(`#${a.id}  ${a.username}  (${a.display_name})`);
  process.exit(0);
}

if (cmd === 'set') {
  const [usernameRaw, password] = args;
  if (!usernameRaw || !password) die('Verwendung: node scripts/admin.mjs set <username> <password>');
  const username = usernameRaw.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    die('Benutzername: 3-20 Zeichen, nur a-z, 0-9, Unterstrich.');
  }
  if (password.length < 6) die('Passwort muss mindestens 6 Zeichen haben.');

  const hash = bcrypt.hashSync(password, 10);
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?').run(hash, existing.id);
    console.log(`Aktualisiert: '${username}' ist jetzt Admin, Passwort gesetzt.`);
  } else {
    db.prepare(
      'INSERT INTO users (username, password_hash, display_name, friend_code, is_admin) VALUES (?, ?, ?, ?, 1)',
    ).run(username, hash, username, generateFriendCode());
    console.log(`Angelegt: Admin-Konto '${username}' erstellt.`);
  }
  process.exit(0);
}

if (cmd === 'promote') {
  const username = (args[0] || '').trim().toLowerCase();
  if (!username) die('Verwendung: node scripts/admin.mjs promote <username>');
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) die(`Nutzer '${username}' nicht gefunden.`);
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
  console.log(`'${username}' ist jetzt Admin (Passwort unverändert).`);
  process.exit(0);
}

if (cmd === 'demote') {
  const username = (args[0] || '').trim().toLowerCase();
  if (!username) die('Verwendung: node scripts/admin.mjs demote <username>');
  const user = db.prepare('SELECT id, is_admin FROM users WHERE username = ?').get(username);
  if (!user) die(`Nutzer '${username}' nicht gefunden.`);
  const adminCount = db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 1').get().c;
  if (user.is_admin && adminCount <= 1) die('Der letzte Admin kann nicht entzogen werden.');
  db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(user.id);
  console.log(`'${username}' ist kein Admin mehr.`);
  process.exit(0);
}

die(
  [
    'Unbekannter Befehl. Verfügbar:',
    '  node scripts/admin.mjs set <username> <password>',
    '  node scripts/admin.mjs demote <username>',
    '  node scripts/admin.mjs list',
  ].join('\n'),
);
