CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_path TEXT,
  friend_code TEXT NOT NULL UNIQUE,
  theme_pref TEXT NOT NULL DEFAULT 'auto',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS rides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  duration_s INTEGER NOT NULL,
  distance_m REAL NOT NULL DEFAULT 0,
  max_speed_kmh REAL NOT NULL DEFAULT 0,
  avg_speed_kmh REAL NOT NULL DEFAULT 0,
  max_lean_left REAL NOT NULL DEFAULT 0,
  max_lean_right REAL NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  track_data TEXT, -- JSON array of {ts, lat, lng, speed, lean}
  share_token TEXT, -- gesetzt = Fahrt ist über einen öffentlichen Link einsehbar
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- Index auf share_token wird in db/index.ts NACH der Spalten-Migration angelegt
-- (auf Bestands-DBs existiert die Spalte hier noch nicht).

CREATE TABLE IF NOT EXISTS speed_cameras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  geo_key TEXT NOT NULL UNIQUE,
  lat REAL NOT NULL,
  lng REAL NOT NULL
);

-- Merkt sich, für welche groben Kacheln bereits Blitzer aus Straßendaten generiert wurden,
-- damit Overpass nicht bei jedem Karten-Schwenk erneut abgefragt wird.
CREATE TABLE IF NOT EXISTS generated_regions (
  tile_x INTEGER NOT NULL,
  tile_y INTEGER NOT NULL,
  PRIMARY KEY (tile_x, tile_y)
);

CREATE TABLE IF NOT EXISTS camera_passes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id INTEGER NOT NULL REFERENCES speed_cameras(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id INTEGER REFERENCES rides(id) ON DELETE CASCADE,
  speed_kmh REAL NOT NULL,
  points INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Blitzer-Zonen (Forza-Stil): Mess-Strecke zwischen Ein- und Ausfahrt entlang
-- einer echten Straße. Ziel ist die höchste Durchschnittsgeschwindigkeit dazwischen.
-- path_data = JSON [[lat,lng],…] des Straßenverlaufs zwischen den beiden Punkten.
CREATE TABLE IF NOT EXISTS speed_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  geo_key TEXT NOT NULL UNIQUE,
  entry_lat REAL NOT NULL,
  entry_lng REAL NOT NULL,
  exit_lat REAL NOT NULL,
  exit_lng REAL NOT NULL,
  length_m REAL NOT NULL,
  path_data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zone_passes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER NOT NULL REFERENCES speed_zones(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id INTEGER REFERENCES rides(id) ON DELETE CASCADE,
  avg_speed_kmh REAL NOT NULL,
  duration_s REAL NOT NULL,
  points INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_zone_passes_zone ON zone_passes(zone_id);
CREATE INDEX IF NOT EXISTS idx_zone_passes_user ON zone_passes(user_id);

-- Gruppen für gemeinsame Ausfahrten inkl. Gruppenchat.
-- "groups"/"GROUPS" sind in SQLite Schlüsselwörter → Tabelle heißt ride_groups.
CREATE TABLE IF NOT EXISTS ride_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL REFERENCES ride_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES ride_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Web-Push-Abonnements (ein Nutzer kann mehrere Geräte/Browser haben).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id, id);

CREATE INDEX IF NOT EXISTS idx_rides_user ON rides(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_camera_passes_camera ON camera_passes(camera_id);
CREATE INDEX IF NOT EXISTS idx_camera_passes_user ON camera_passes(user_id);
