// Selbst-Check für das Löschen einzelner Fahrten: Besitzprüfung + Cascade.
// Lauf: DB_PATH=$(mktemp -u) npx ts-node src/routes/rides.test.ts
// ponytail: testet die DELETE-SQL direkt (kein supertest installiert);
// HTTP-Wrapper bei Bedarf später mit supertest abdecken.
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

process.env.DB_PATH = path.join(os.tmpdir(), `mototrack-test-${Date.now()}.db`);
import { db } from '../db';

const mkUser = db.prepare("INSERT INTO users (username, password_hash, display_name, friend_code) VALUES (?,'h',?,?)");
const u1 = mkUser.run('a', 'A', 'fc-a').lastInsertRowid;
const u2 = mkUser.run('b', 'B', 'fc-b').lastInsertRowid;

const ins = db.prepare(
  `INSERT INTO rides (user_id, started_at, ended_at, duration_s, distance_m) VALUES (?, ?, ?, ?, ?)`,
);
const ride = ins.run(u1, 1, 2, 1, 0).lastInsertRowid;

// Cascade-Abhängigkeit: ein camera_pass an dieser Fahrt.
db.prepare("INSERT INTO speed_cameras (id, geo_key, lat, lng) VALUES (1, 'k', 0, 0)").run();
db.prepare('INSERT INTO camera_passes (camera_id, user_id, ride_id, speed_kmh, points, stars) VALUES (1, ?, ?, 80, 10, 3)').run(u1, ride);

const del = db.prepare('DELETE FROM rides WHERE id = ? AND user_id = ?');

// Fremder Nutzer darf nicht löschen.
assert.strictEqual(del.run(ride, u2).changes, 0, 'fremder Nutzer sollte 0 Zeilen löschen');
assert.ok(db.prepare('SELECT 1 FROM rides WHERE id = ?').get(ride), 'Fahrt sollte noch existieren');

// Besitzer löscht → Cascade räumt camera_passes mit ab.
assert.strictEqual(del.run(ride, u1).changes, 1, 'Besitzer sollte 1 Zeile löschen');
assert.strictEqual(db.prepare('SELECT 1 FROM rides WHERE id = ?').get(ride), undefined);
assert.strictEqual(db.prepare('SELECT 1 FROM camera_passes WHERE ride_id = ?').get(ride), undefined, 'camera_pass sollte per Cascade weg sein');

db.close();
for (const f of [process.env.DB_PATH, `${process.env.DB_PATH}-wal`, `${process.env.DB_PATH}-shm`]) {
  if (fs.existsSync(f!)) fs.unlinkSync(f!);
}
console.log('rides.test.ts OK');
