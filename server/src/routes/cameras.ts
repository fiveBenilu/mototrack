import { Router } from 'express';
import { db } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { generateCamerasForTile, computePassResult, COARSE_TILE_DEG } from '../lib/cameraGen';

export const camerasRouter = Router();

const MAX_BOUNDS_SPAN = 0.5; // ~55km, verhindert übermäßige Generierung
const MAX_TILES_PER_REQUEST = 9; // bei zu großem Ausschnitt wird nicht neu generiert

function publicCamera(c: any) {
  return { id: c.id, lat: c.lat, lng: c.lng };
}

const insertCamera = db.prepare('INSERT OR IGNORE INTO speed_cameras (geo_key, lat, lng) VALUES (?, ?, ?)');
const markRegion = db.prepare('INSERT OR IGNORE INTO generated_regions (tile_x, tile_y) VALUES (?, ?)');
const regionExists = db.prepare('SELECT 1 FROM generated_regions WHERE tile_x = ? AND tile_y = ?');

// Kacheln, die gerade (asynchron) generiert werden – verhindert doppelte Overpass-Abfragen.
const inProgress = new Set<string>();

/**
 * Stößt die Generierung straßenbasierter Blitzer für noch unbekannte Kacheln an.
 * Läuft im Hintergrund (blockiert die HTTP-Antwort nicht); neue Blitzer erscheinen,
 * sobald der Client erneut lädt.
 */
function ensureCamerasForBounds(minLat: number, minLng: number, maxLat: number, maxLng: number) {
  const txMin = Math.floor(minLng / COARSE_TILE_DEG);
  const txMax = Math.floor(maxLng / COARSE_TILE_DEG);
  const tyMin = Math.floor(minLat / COARSE_TILE_DEG);
  const tyMax = Math.floor(maxLat / COARSE_TILE_DEG);

  const pending: { tx: number; ty: number }[] = [];
  for (let tx = txMin; tx <= txMax; tx++) {
    for (let ty = tyMin; ty <= tyMax; ty++) {
      const key = `${tx},${ty}`;
      if (!inProgress.has(key) && !regionExists.get(tx, ty)) pending.push({ tx, ty });
    }
  }
  // Bei zu großem Ausschnitt keine (teuren) Overpass-Abfragen – vorhandene Blitzer reichen.
  if (pending.length === 0 || pending.length > MAX_TILES_PER_REQUEST) return;

  for (const { tx, ty } of pending) {
    const key = `${tx},${ty}`;
    inProgress.add(key);
    generateCamerasForTile(tx, ty)
      .then((cams) => {
        if (cams === null) return; // Overpass nicht erreichbar -> Kachel später erneut versuchen
        const persist = db.transaction(() => {
          for (const c of cams) insertCamera.run(c.geoKey, c.lat, c.lng);
          markRegion.run(tx, ty);
        });
        persist();
      })
      .catch(() => {})
      .finally(() => inProgress.delete(key));
  }
}

camerasRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const minLat = Number(req.query.minLat);
  const minLng = Number(req.query.minLng);
  const maxLat = Number(req.query.maxLat);
  const maxLng = Number(req.query.maxLng);

  if ([minLat, minLng, maxLat, maxLng].some((v) => Number.isNaN(v))) {
    return res.status(400).json({ error: 'Ungültige Bounding-Box' });
  }
  if (maxLat - minLat > MAX_BOUNDS_SPAN || maxLng - minLng > MAX_BOUNDS_SPAN) {
    return res.status(400).json({ error: 'Kartenausschnitt zu groß' });
  }

  ensureCamerasForBounds(minLat, minLng, maxLat, maxLng);

  const cameras = db
    .prepare('SELECT * FROM speed_cameras WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?')
    .all(minLat, maxLat, minLng, maxLng);

  res.json({ cameras: cameras.map(publicCamera) });
});

camerasRouter.get('/:id/leaderboard', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT cp.speed_kmh, cp.points, cp.stars, cp.created_at, u.id as user_id, u.display_name, u.avatar_path
       FROM camera_passes cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.camera_id = ?
       ORDER BY cp.speed_kmh DESC
       LIMIT 20`,
    )
    .all(req.params.id);

  res.json({
    entries: rows.map((r: any) => ({
      userId: r.user_id,
      displayName: r.display_name,
      avatarPath: r.avatar_path,
      speedKmh: r.speed_kmh,
      points: r.points,
      stars: r.stars,
      createdAt: r.created_at,
    })),
  });
});

camerasRouter.post('/:id/pass', requireAuth, (req: AuthedRequest, res) => {
  const camera = db.prepare('SELECT * FROM speed_cameras WHERE id = ?').get(req.params.id) as any;
  if (!camera) return res.status(404).json({ error: 'Blitzer nicht gefunden' });

  const { speedKmh, rideId } = req.body || {};
  if (typeof speedKmh !== 'number' || speedKmh < 0 || speedKmh > 400) {
    return res.status(400).json({ error: 'Ungültige Geschwindigkeit' });
  }

  const { points, stars } = computePassResult(speedKmh);

  const result = db
    .prepare('INSERT INTO camera_passes (camera_id, user_id, ride_id, speed_kmh, points, stars) VALUES (?, ?, ?, ?, ?, ?)')
    .run(camera.id, req.userId, rideId ?? null, speedKmh, points, stars);

  res.status(201).json({
    pass: {
      id: result.lastInsertRowid,
      cameraId: camera.id,
      speedKmh,
      points,
      stars,
    },
  });
});
