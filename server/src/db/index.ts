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
