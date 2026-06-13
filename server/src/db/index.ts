import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// DB-Pfad per Env überschreibbar (z. B. für isolierte Tests), sonst Standard ../../data.
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data', 'mototrack.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migration: altes speed_cameras-Schema (mit Tempolimit/Tiles) auf das neue umstellen.
// Die generierten Blitzer-Positionen ändern sich dabei ohnehin (jetzt straßenbasiert),
// daher werden alte Blitzer & deren Durchfahrten verworfen.
const camCols = db.prepare(`PRAGMA table_info(speed_cameras)`).all() as { name: string }[];
if (camCols.some((c) => c.name === 'speed_limit_kmh' || c.name === 'tile_x')) {
  db.exec('DROP TABLE IF EXISTS camera_passes; DROP TABLE IF EXISTS speed_cameras; DROP TABLE IF EXISTS generated_regions;');
}

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Migration: share_token-Spalte zu bestehenden rides-Tabellen ergänzen
// (Schema oben legt sie nur bei einer frisch erstellten Tabelle an).
const rideCols = db.prepare(`PRAGMA table_info(rides)`).all() as { name: string }[];
if (!rideCols.some((c) => c.name === 'share_token')) {
  db.exec('ALTER TABLE rides ADD COLUMN share_token TEXT');
}
// Erst jetzt anlegen – Spalte existiert hier sowohl bei frischer als auch bei
// migrierter DB. IF NOT EXISTS macht den Aufruf idempotent.
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_rides_share_token ON rides(share_token) WHERE share_token IS NOT NULL',
);

// Einmalige Migration für Blitzer-Zonen: bereits generierte Kacheln einmal
// zurücksetzen, damit für schon erkundete Gebiete auch Zonen erzeugt werden
// (Blitzer werden über geo_key dedupliziert → keine Duplikate, nur eine erneute
// Overpass-Abfrage beim nächsten Betrachten der Kachel).
db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
if (!db.prepare("SELECT 1 FROM meta WHERE key = 'zones_migrated'").get()) {
  db.exec('DELETE FROM generated_regions');
  db.prepare("INSERT INTO meta (key, value) VALUES ('zones_migrated', '1')").run();
}
