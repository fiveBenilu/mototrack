// Selbst-Check: Spitznamen-Auflösung + „anonym"-Schalter.
// Lauf: DB_PATH=$(mktemp -u) npx ts-node src/routes/nicknames.test.ts
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

process.env.DB_PATH = path.join(os.tmpdir(), `mototrack-nick-${Date.now()}.db`);
import { db } from '../db';
import { resolveFriendName, sharesActivity } from '../ws';

const mk = db.prepare("INSERT INTO users (username, password_hash, display_name, friend_code) VALUES (?,'h',?,?)");
const owner = mk.run('o', 'Owner', 'fc-o').lastInsertRowid as number;
const actor = mk.run('a', 'Anzeigename', 'fc-a').lastInsertRowid as number;

// Ohne Spitzname → Anzeigename.
assert.strictEqual(resolveFriendName(owner, actor), 'Anzeigename');

// Mit Spitzname → Spitzname (nur aus Sicht des Owners).
db.prepare('INSERT INTO friend_nicknames (owner_id, friend_id, nickname) VALUES (?, ?, ?)').run(owner, actor, 'Speedy');
assert.strictEqual(resolveFriendName(owner, actor), 'Speedy');
assert.strictEqual(resolveFriendName(actor, owner), 'Owner'); // andere Richtung unberührt

// share_activity: Default an, nach Abschalten aus.
assert.strictEqual(sharesActivity(actor), true);
db.prepare('UPDATE users SET share_activity = 0 WHERE id = ?').run(actor);
assert.strictEqual(sharesActivity(actor), false);

db.close();
for (const f of [process.env.DB_PATH, `${process.env.DB_PATH}-wal`, `${process.env.DB_PATH}-shm`]) {
  if (fs.existsSync(f!)) fs.unlinkSync(f!);
}
console.log('nicknames.test.ts OK');
