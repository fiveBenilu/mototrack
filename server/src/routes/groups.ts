import { Router } from 'express';
import { db } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { isUserOnline, broadcastToUsers } from '../ws';
import { sendPushToUser } from '../push';

export const groupsRouter = Router();

const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 60;

function isMember(groupId: number, userId: number): boolean {
  return !!db
    .prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId);
}

function memberIds(groupId: number): number[] {
  const rows = db.prepare('SELECT user_id as id FROM group_members WHERE group_id = ?').all(groupId) as {
    id: number;
  }[];
  return rows.map((r) => r.id);
}

function areFriends(a: number, b: number): boolean {
  return !!db
    .prepare(
      `SELECT 1 FROM friendships WHERE status = 'accepted'
       AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))`,
    )
    .get(a, b, b, a);
}

function publicMember(row: any) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    online: isUserOnline(row.id),
  };
}

function publicMessage(row: any) {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    body: row.body,
    createdAt: row.created_at,
  };
}

// Alle Gruppen des Nutzers inkl. Mitgliederzahl und letzter Nachricht.
groupsRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT g.id, g.name, g.owner_id, g.created_at,
              (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) as member_count
       FROM ride_groups g
       JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
       ORDER BY g.created_at DESC`,
    )
    .all(req.userId) as any[];

  const groups = rows.map((g) => {
    const last = db
      .prepare(
        `SELECT m.body, m.created_at, u.display_name FROM group_messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.group_id = ? ORDER BY m.id DESC LIMIT 1`,
      )
      .get(g.id) as any;
    return {
      id: g.id,
      name: g.name,
      ownerId: g.owner_id,
      createdAt: g.created_at,
      memberCount: g.member_count,
      lastMessage: last ? { body: last.body, createdAt: last.created_at, displayName: last.display_name } : null,
    };
  });

  res.json({ groups });
});

// Gruppe erstellen. Optionale memberIds müssen Freunde des Erstellers sein.
groupsRouter.post('/', requireAuth, (req: AuthedRequest, res) => {
  const { name, memberIds: requestedIds } = req.body || {};
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: 'Ungültiger Gruppenname' });
  }
  const ownerId = req.userId!;
  const ids: number[] = Array.isArray(requestedIds) ? requestedIds.filter((x) => typeof x === 'number') : [];

  const create = db.transaction(() => {
    const info = db.prepare('INSERT INTO ride_groups (name, owner_id) VALUES (?, ?)').run(trimmed, ownerId);
    const groupId = Number(info.lastInsertRowid);
    const addMember = db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)');
    addMember.run(groupId, ownerId);
    for (const id of ids) {
      if (id !== ownerId && areFriends(ownerId, id)) addMember.run(groupId, id);
    }
    return groupId;
  });
  const groupId = create();

  // Neue Mitglieder live benachrichtigen, damit ihre Gruppenliste aktualisiert wird.
  broadcastToUsers(memberIds(groupId), { type: 'group-update', groupId });
  res.status(201).json({ group: groupDetail(groupId) });
});

function groupDetail(groupId: number) {
  const g = db.prepare('SELECT * FROM ride_groups WHERE id = ?').get(groupId) as any;
  if (!g) return null;
  const members = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_path FROM group_members m
       JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.joined_at ASC`,
    )
    .all(groupId) as any[];
  return {
    id: g.id,
    name: g.name,
    ownerId: g.owner_id,
    createdAt: g.created_at,
    members: members.map(publicMember),
  };
}

// Gruppendetails (nur für Mitglieder).
groupsRouter.get('/:id', requireAuth, (req: AuthedRequest, res) => {
  const groupId = Number(req.params.id);
  if (!isMember(groupId, req.userId!)) return res.status(404).json({ error: 'Gruppe nicht gefunden' });
  res.json({ group: groupDetail(groupId) });
});

// Gruppe umbenennen (nur Eigentümer).
groupsRouter.put('/:id', requireAuth, (req: AuthedRequest, res) => {
  const groupId = Number(req.params.id);
  const g = db.prepare('SELECT * FROM ride_groups WHERE id = ?').get(groupId) as any;
  if (!g || g.owner_id !== req.userId) return res.status(403).json({ error: 'Nicht berechtigt' });
  const trimmed = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return res.status(400).json({ error: 'Ungültiger Gruppenname' });
  db.prepare('UPDATE ride_groups SET name = ? WHERE id = ?').run(trimmed, groupId);
  broadcastToUsers(memberIds(groupId), { type: 'group-update', groupId });
  res.json({ group: groupDetail(groupId) });
});

// Gruppe löschen (nur Eigentümer).
groupsRouter.delete('/:id', requireAuth, (req: AuthedRequest, res) => {
  const groupId = Number(req.params.id);
  const g = db.prepare('SELECT * FROM ride_groups WHERE id = ?').get(groupId) as any;
  if (!g || g.owner_id !== req.userId) return res.status(403).json({ error: 'Nicht berechtigt' });
  const recipients = memberIds(groupId);
  db.prepare('DELETE FROM ride_groups WHERE id = ?').run(groupId);
  broadcastToUsers(recipients, { type: 'group-removed', groupId });
  res.json({ ok: true });
});

// Mitglied (Freund) hinzufügen. Jedes Mitglied darf eigene Freunde einladen.
groupsRouter.post('/:id/members', requireAuth, (req: AuthedRequest, res) => {
  const groupId = Number(req.params.id);
  const userId = req.userId!;
  if (!isMember(groupId, userId)) return res.status(404).json({ error: 'Gruppe nicht gefunden' });
  const targetId = Number(req.body?.userId);
  if (!Number.isInteger(targetId)) return res.status(400).json({ error: 'Ungültige Nutzer-ID' });
  if (!areFriends(userId, targetId)) return res.status(400).json({ error: 'Nur Freunde können hinzugefügt werden' });
  db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, targetId);
  broadcastToUsers(memberIds(groupId), { type: 'group-update', groupId });
  res.status(201).json({ group: groupDetail(groupId) });
});

// Mitglied entfernen: Eigentümer kann jeden entfernen, jeder kann sich selbst entfernen (verlassen).
groupsRouter.delete('/:id/members/:userId', requireAuth, (req: AuthedRequest, res) => {
  const groupId = Number(req.params.id);
  const targetId = Number(req.params.userId);
  const userId = req.userId!;
  const g = db.prepare('SELECT * FROM ride_groups WHERE id = ?').get(groupId) as any;
  if (!g || !isMember(groupId, userId)) return res.status(404).json({ error: 'Gruppe nicht gefunden' });

  const isOwner = g.owner_id === userId;
  if (!isOwner && targetId !== userId) return res.status(403).json({ error: 'Nicht berechtigt' });
  if (targetId === g.owner_id) {
    return res.status(400).json({ error: 'Der Eigentümer kann die Gruppe nur löschen, nicht verlassen' });
  }

  const recipients = memberIds(groupId);
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, targetId);
  broadcastToUsers(recipients, { type: 'group-update', groupId });
  res.json({ ok: true });
});

// Nachrichtenverlauf (neueste zuerst aus der DB, im Client chronologisch sortiert).
groupsRouter.get('/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const groupId = Number(req.params.id);
  if (!isMember(groupId, req.userId!)) return res.status(404).json({ error: 'Gruppe nicht gefunden' });
  const before = req.query.before ? Number(req.query.before) : null;
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  const rows = (
    before
      ? db.prepare(
          `SELECT m.*, u.display_name, u.avatar_path FROM group_messages m
           JOIN users u ON u.id = m.user_id
           WHERE m.group_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`,
        ).all(groupId, before, limit)
      : db.prepare(
          `SELECT m.*, u.display_name, u.avatar_path FROM group_messages m
           JOIN users u ON u.id = m.user_id
           WHERE m.group_id = ? ORDER BY m.id DESC LIMIT ?`,
        ).all(groupId, limit)
  ) as any[];

  res.json({ messages: rows.map(publicMessage).reverse() });
});

// Nachricht senden: persistieren + an alle Online-Mitglieder broadcasten.
groupsRouter.post('/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const groupId = Number(req.params.id);
  const userId = req.userId!;
  if (!isMember(groupId, userId)) return res.status(404).json({ error: 'Gruppe nicht gefunden' });
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body) return res.status(400).json({ error: 'Leere Nachricht' });
  if (body.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: 'Nachricht zu lang' });

  const info = db.prepare('INSERT INTO group_messages (group_id, user_id, body) VALUES (?, ?, ?)').run(groupId, userId, body);
  const row = db
    .prepare(
      `SELECT m.*, u.display_name, u.avatar_path FROM group_messages m
       JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
    )
    .get(Number(info.lastInsertRowid));
  const message = publicMessage(row);

  const recipients = memberIds(groupId);
  broadcastToUsers(recipients, { type: 'group-message', groupId, message });

  // Push an alle Mitglieder außer den Absender. Bewusst NICHT auf `isUserOnline`
  // filtern: Eine im Hintergrund laufende PWA (v. a. iOS) hält ihre WebSocket-
  // Verbindung oft noch offen und gilt damit fälschlich als „online", obwohl der
  // Nutzer die Live-Nachricht nicht sieht. Der Service Worker des Empfängers
  // unterdrückt die Einblendung selbst, wenn die App gerade im Vordergrund ist.
  const group = db.prepare('SELECT name FROM ride_groups WHERE id = ?').get(groupId) as any;
  for (const memberId of recipients) {
    if (memberId === userId) continue;
    void sendPushToUser(memberId, {
      title: group?.name ?? 'Gruppe',
      body: `${message.displayName}: ${body.slice(0, 120)}`,
      url: `/gruppen/${groupId}`,
      tag: `group-${groupId}`,
    });
  }

  res.status(201).json({ message });
});
