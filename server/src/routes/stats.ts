import { Router } from 'express';
import { db } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { aggregateTotals, mapHistory, topCorners } from '../lib/corners';

export const statsRouter = Router();

statsRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  const rides = db.prepare('SELECT * FROM rides WHERE user_id = ? ORDER BY started_at DESC').all(req.userId) as any[];

  const pointsRow = db
    .prepare('SELECT COALESCE(SUM(points), 0) as total FROM camera_passes WHERE user_id = ?')
    .get(req.userId) as { total: number };

  res.json({
    totals: aggregateTotals(rides, pointsRow.total),
    history: mapHistory(rides.slice(0, 30)).reverse(),
    corners: topCorners(rides),
  });
});

statsRouter.get('/friends', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.display_name, u.avatar_path,
              COALESCE(SUM(r.distance_m), 0) as distance_m,
              COALESCE(MAX(r.max_speed_kmh), 0) as max_speed_kmh,
              COALESCE(MAX(MAX(r.max_lean_left, r.max_lean_right)), 0) as max_lean,
              COALESCE((SELECT SUM(cp.points) FROM camera_passes cp WHERE cp.user_id = u.id), 0) as points
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
       LEFT JOIN rides r ON r.user_id = u.id
       WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
       GROUP BY u.id`,
    )
    .all(req.userId, req.userId, req.userId);

  res.json({
    friends: rows.map((r: any) => ({
      id: r.id,
      displayName: r.display_name,
      avatarPath: r.avatar_path,
      distanceM: r.distance_m,
      maxSpeedKmh: r.max_speed_kmh,
      maxLean: r.max_lean,
      points: r.points,
    })),
  });
});
