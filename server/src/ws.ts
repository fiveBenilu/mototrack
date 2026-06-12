import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { db } from './db';

interface LiveLocation {
  lat: number;
  lng: number;
  speedKmh: number;
  ts: number;
}

const connections = new Map<number, Set<WebSocket>>();
export const liveLocations = new Map<number, LiveLocation>();

function getFriendIds(userId: number): number[] {
  const rows = db
    .prepare(
      `SELECT friend_id as id FROM friendships WHERE user_id = ? AND status = 'accepted'
       UNION
       SELECT user_id as id FROM friendships WHERE friend_id = ? AND status = 'accepted'`,
    )
    .all(userId, userId) as { id: number }[];
  return rows.map((r) => r.id);
}

function send(ws: WebSocket, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcastToFriends(userId: number, data: unknown) {
  for (const friendId of getFriendIds(userId)) {
    const sockets = connections.get(friendId);
    if (!sockets) continue;
    for (const ws of sockets) send(ws, data);
  }
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const token = parseCookie(req.headers.cookie, 'token');
    let userId: number | null = null;
    if (token) {
      try {
        const payload = jwt.verify(token, config.jwtSecret) as { userId: number };
        userId = payload.userId;
      } catch {
        userId = null;
      }
    }
    if (!userId) {
      ws.close(1008, 'unauthorized');
      return;
    }

    const uid = userId;
    if (!connections.has(uid)) connections.set(uid, new Set());
    connections.get(uid)!.add(ws);

    broadcastToFriends(uid, { type: 'presence', userId: uid, online: true });

    // Bereits bekannte Standorte von Freunden direkt nach Verbindungsaufbau senden
    for (const friendId of getFriendIds(uid)) {
      const loc = liveLocations.get(friendId);
      if (loc) send(ws, { type: 'friend-location', userId: friendId, ...loc });
    }

    ws.on('message', (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg?.type === 'location' && typeof msg.lat === 'number' && typeof msg.lng === 'number') {
        const loc: LiveLocation = {
          lat: msg.lat,
          lng: msg.lng,
          speedKmh: typeof msg.speedKmh === 'number' ? msg.speedKmh : 0,
          ts: Date.now(),
        };
        liveLocations.set(uid, loc);
        broadcastToFriends(uid, { type: 'friend-location', userId: uid, ...loc });
      } else if (msg?.type === 'stop-sharing') {
        liveLocations.delete(uid);
        broadcastToFriends(uid, { type: 'friend-offline', userId: uid });
      }
    });

    ws.on('close', () => {
      connections.get(uid)?.delete(ws);
      if (connections.get(uid)?.size === 0) {
        connections.delete(uid);
        liveLocations.delete(uid);
        broadcastToFriends(uid, { type: 'presence', userId: uid, online: false });
        broadcastToFriends(uid, { type: 'friend-offline', userId: uid });
      }
    });
  });

  return wss;
}

export function isUserOnline(userId: number): boolean {
  return connections.has(userId);
}

/** Sendet eine Nachricht an alle offenen Sockets der angegebenen Nutzer. */
export function broadcastToUsers(userIds: number[], data: unknown) {
  for (const userId of userIds) {
    const sockets = connections.get(userId);
    if (!sockets) continue;
    for (const ws of sockets) send(ws, data);
  }
}
