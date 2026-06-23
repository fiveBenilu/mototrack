import { Router } from 'express';
import { db } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { isUserOnline, resolveFriendName } from '../ws';
import { sendPushToUser } from '../push';
import { friendAccepted } from '../notifications';
import { aggregateTotals, mapHistory, topCorners } from '../lib/corners';

export const friendsRouter = Router();

function publicFriend(row: any) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    online: isUserOnline(row.id),
    nickname: row.nickname ?? null,
  };
}

// Liste aller akzeptierten Freunde
friendsRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_path, fn.nickname FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
       LEFT JOIN friend_nicknames fn ON fn.owner_id = ? AND fn.friend_id = u.id
       WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'`,
    )
    .all(req.userId, req.userId, req.userId, req.userId);

  res.json({ friends: rows.map(publicFriend) });
});

// Offene Anfragen (eingehend und ausgehend)
friendsRouter.get('/requests', requireAuth, (req: AuthedRequest, res) => {
  const incoming = db
    .prepare(
      `SELECT f.id as request_id, u.id, u.username, u.display_name, u.avatar_path FROM friendships f
       JOIN users u ON u.id = f.user_id
       WHERE f.friend_id = ? AND f.status = 'pending'`,
    )
    .all(req.userId);

  const outgoing = db
    .prepare(
      `SELECT f.id as request_id, u.id, u.username, u.display_name, u.avatar_path FROM friendships f
       JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = ? AND f.status = 'pending'`,
    )
    .all(req.userId);

  res.json({
    incoming: incoming.map((r: any) => ({ requestId: r.request_id, ...publicFriend(r) })),
    outgoing: outgoing.map((r: any) => ({ requestId: r.request_id, ...publicFriend(r) })),
  });
});

// Freundschaftsanfrage per Code senden
friendsRouter.post('/request', requireAuth, (req: AuthedRequest, res) => {
  const { code } = req.body || {};
  if (typeof code !== 'string') return res.status(400).json({ error: 'Code erforderlich' });

  const target = db.prepare('SELECT * FROM users WHERE friend_code = ?').get(code.trim().toUpperCase()) as any;
  if (!target) return res.status(404).json({ error: 'Kein Nutzer mit diesem Code gefunden' });
  if (target.id === req.userId) return res.status(400).json({ error: 'Du kannst dich nicht selbst hinzufügen' });

  const existing = db
    .prepare(
      `SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
    )
    .get(req.userId, target.id, target.id, req.userId) as any;

  if (existing) {
    if (existing.status === 'accepted') return res.status(409).json({ error: 'Ihr seid bereits befreundet' });
    return res.status(409).json({ error: 'Es gibt bereits eine offene Anfrage' });
  }

  db.prepare('INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)').run(req.userId, target.id, 'pending');

  const sender = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.userId) as any;
  void sendPushToUser(target.id, {
    title: 'Neue Freundschaftsanfrage',
    body: `${sender?.display_name ?? 'Jemand'} möchte sich mit dir verbinden`,
    url: '/freunde',
    tag: 'friend-request',
  });

  res.status(201).json({ ok: true });
});

// Anfrage annehmen oder ablehnen
friendsRouter.post('/requests/:id/respond', requireAuth, (req: AuthedRequest, res) => {
  const { accept } = req.body || {};
  const request = db
    .prepare('SELECT * FROM friendships WHERE id = ? AND friend_id = ? AND status = ?')
    .get(req.params.id, req.userId, 'pending') as any;

  if (!request) return res.status(404).json({ error: 'Anfrage nicht gefunden' });

  if (accept) {
    db.prepare('UPDATE friendships SET status = ? WHERE id = ?').run('accepted', request.id);
    // Den ursprünglichen Anfragenden benachrichtigen – mit dessen Spitzname für uns.
    void sendPushToUser(request.user_id, friendAccepted(resolveFriendName(request.user_id, req.userId!)));
  } else {
    db.prepare('DELETE FROM friendships WHERE id = ?').run(request.id);
  }
  res.json({ ok: true });
});

// Profil eines Freundes mit Statistiken & Fahrtenverlauf
friendsRouter.get('/:id/profile', requireAuth, (req: AuthedRequest, res) => {
  const friendId = Number(req.params.id);

  const friendship = db
    .prepare(
      `SELECT 1 FROM friendships WHERE status = 'accepted' AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))`,
    )
    .get(req.userId, friendId, friendId, req.userId);
  if (!friendship) return res.status(404).json({ error: 'Nutzer nicht gefunden' });

  const user = db.prepare('SELECT id, username, display_name, avatar_path FROM users WHERE id = ?').get(friendId) as any;
  if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden' });

  const rides = db.prepare('SELECT * FROM rides WHERE user_id = ? ORDER BY started_at DESC').all(friendId) as any[];

  const pointsRow = db
    .prepare('SELECT COALESCE(SUM(points), 0) as total FROM camera_passes WHERE user_id = ?')
    .get(friendId) as { total: number };

  res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarPath: user.avatar_path,
      online: isUserOnline(user.id),
    },
    totals: aggregateTotals(rides, pointsRow.total),
    history: mapHistory(rides.slice(0, 30)).reverse(),
    corners: topCorners(rides),
  });
});

// Freundschaft entfernen
friendsRouter.delete('/:id', requireAuth, (req: AuthedRequest, res) => {
  const friendId = Number(req.params.id);
  db.prepare(
    `DELETE FROM friendships WHERE status = 'accepted' AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))`,
  ).run(req.userId, friendId, friendId, req.userId);
  db.prepare('DELETE FROM friend_nicknames WHERE owner_id = ? AND friend_id = ?').run(req.userId, friendId);
  res.json({ ok: true });
});

// Spitzname für einen Freund setzen (leer = entfernen). Nur für bestehende Freunde.
friendsRouter.put('/:id/nickname', requireAuth, (req: AuthedRequest, res) => {
  const friendId = Number(req.params.id);
  const friendship = db
    .prepare(
      `SELECT 1 FROM friendships WHERE status = 'accepted'
       AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))`,
    )
    .get(req.userId, friendId, friendId, req.userId);
  if (!friendship) return res.status(404).json({ error: 'Nutzer nicht gefunden' });

  const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.trim() : '';
  if (nickname.length > 30) return res.status(400).json({ error: 'Spitzname: max. 30 Zeichen' });

  if (nickname) {
    db.prepare(
      `INSERT INTO friend_nicknames (owner_id, friend_id, nickname) VALUES (?, ?, ?)
       ON CONFLICT(owner_id, friend_id) DO UPDATE SET nickname = excluded.nickname`,
    ).run(req.userId, friendId, nickname);
  } else {
    db.prepare('DELETE FROM friend_nicknames WHERE owner_id = ? AND friend_id = ?').run(req.userId, friendId);
  }
  res.json({ ok: true, nickname: nickname || null });
});
