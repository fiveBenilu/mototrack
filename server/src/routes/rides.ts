import { Router } from 'express';
import { db } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';

export const ridesRouter = Router();

interface TrackPoint {
  ts: number;
  lat: number;
  lng: number;
  speed: number;
  lean: number;
}

function publicRide(r: any) {
  return {
    id: r.id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationS: r.duration_s,
    distanceM: r.distance_m,
    maxSpeedKmh: r.max_speed_kmh,
    avgSpeedKmh: r.avg_speed_kmh,
    maxLeanLeft: r.max_lean_left,
    maxLeanRight: r.max_lean_right,
    points: r.points,
    track: r.track_data ? JSON.parse(r.track_data) : [],
  };
}

ridesRouter.post('/', requireAuth, (req: AuthedRequest, res) => {
  const body = req.body || {};
  const {
    startedAt,
    endedAt,
    durationS,
    distanceM,
    maxSpeedKmh,
    avgSpeedKmh,
    maxLeanLeft,
    maxLeanRight,
    track,
  } = body;

  if (
    typeof startedAt !== 'number' ||
    typeof endedAt !== 'number' ||
    typeof durationS !== 'number' ||
    typeof distanceM !== 'number'
  ) {
    return res.status(400).json({ error: 'Ungültige Fahrtdaten' });
  }

  const safeTrack: TrackPoint[] = Array.isArray(track) ? track.slice(0, 20000) : [];

  // Idempotenz: Der Client kann dieselbe Fahrt erneut senden (Retry nach
  // Verbindungsabbruch, paralleler Auto-Retry). Gleiche Fahrt (Nutzer +
  // Startzeit) → vorhandene zurückgeben statt ein Duplikat anzulegen.
  const existing = db
    .prepare('SELECT * FROM rides WHERE user_id = ? AND started_at = ?')
    .get(req.userId, startedAt);
  if (existing) {
    return res.status(200).json({ ride: publicRide(existing) });
  }

  const result = db
    .prepare(
      `INSERT INTO rides
        (user_id, started_at, ended_at, duration_s, distance_m, max_speed_kmh, avg_speed_kmh, max_lean_left, max_lean_right, track_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      req.userId,
      startedAt,
      endedAt,
      durationS,
      distanceM,
      maxSpeedKmh ?? 0,
      avgSpeedKmh ?? 0,
      maxLeanLeft ?? 0,
      maxLeanRight ?? 0,
      JSON.stringify(safeTrack),
    );

  const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ride: publicRide(ride) });
});

ridesRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const rides = db
    .prepare('SELECT * FROM rides WHERE user_id = ? ORDER BY started_at DESC LIMIT 100')
    .all(req.userId);
  res.json({ rides: rides.map(publicRide) });
});

ridesRouter.get('/:id', requireAuth, (req: AuthedRequest, res) => {
  const ride = db.prepare('SELECT * FROM rides WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!ride) return res.status(404).json({ error: 'Fahrt nicht gefunden' });
  res.json({ ride: publicRide(ride) });
});
