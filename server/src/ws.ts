import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { db } from './db';
import { sendPushToUser } from './push';
import { friendOnline, friendStartedRide } from './notifications';

// Push-Entprellung: nicht bei jedem Reconnect/Refresh erneut benachrichtigen.
const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;
const lastOnlineNotify = new Map<number, number>();
const lastRideNotify = new Map<number, number>();
const getDisplayName = db.prepare('SELECT display_name FROM users WHERE id = ?');
const getShareFlag = db.prepare('SELECT share_activity FROM users WHERE id = ?');
const getNickname = db.prepare('SELECT nickname FROM friend_nicknames WHERE owner_id = ? AND friend_id = ?');

function displayName(userId: number): string {
  return (getDisplayName.get(userId) as { display_name?: string } | undefined)?.display_name ?? 'Jemand';
}

/** Sendet dieser Nutzer Aktivitäts-Pushes an Freunde, oder fährt er „anonym"? */
export function sharesActivity(userId: number): boolean {
  return (getShareFlag.get(userId) as { share_activity?: number } | undefined)?.share_activity !== 0;
}

/** Name, den `ownerId` für `actorId` sieht: eigener Spitzname, sonst Anzeigename. */
export function resolveFriendName(ownerId: number, actorId: number): string {
  const nick = (getNickname.get(ownerId, actorId) as { nickname?: string } | undefined)?.nickname;
  return nick || displayName(actorId);
}

// Push an alle Freunde, sofern der Cooldown abgelaufen ist (verhindert Spam) und
// der Nutzer seine Aktivität teilt. Name pro Empfänger (deren Spitzname für uns).
function notifyFriendsThrottled(
  userId: number,
  cooldown: Map<number, number>,
  build: (name: string, id: number) => Parameters<typeof sendPushToUser>[1],
) {
  if (!sharesActivity(userId)) return;
  const now = Date.now();
  if (now - (cooldown.get(userId) ?? 0) < NOTIFY_COOLDOWN_MS) return;
  cooldown.set(userId, now);
  for (const friendId of getFriendIds(userId)) {
    void sendPushToUser(friendId, build(resolveFriendName(friendId, userId), userId));
  }
}

interface LiveLocation {
  lat: number;
  lng: number;
  speedKmh: number;
  ts: number;
  // Live-Telemetrie für den Konvoi (Schräglage, gefahrene Strecke, Topspeed).
  leanDeg: number;
  distanceM: number;
  maxSpeedKmh: number;
  recording: boolean;
}

// Zahl aus einer WS-Nachricht übernehmen, sonst 0 (Client könnte älter sein).
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const connections = new Map<number, Set<WebSocket>>();
export const liveLocations = new Map<number, LiveLocation>();

export function getFriendIds(userId: number): number[] {
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
    const wasOffline = (connections.get(uid)?.size ?? 0) === 0;
    if (!connections.has(uid)) connections.set(uid, new Set());
    connections.get(uid)!.add(ws);

    broadcastToFriends(uid, { type: 'presence', userId: uid, online: true });
    // Nur beim echten Offline→Online-Wechsel pushen (nicht beim 2. Gerät).
    if (wasOffline) notifyFriendsThrottled(uid, lastOnlineNotify, friendOnline);

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
      if (
        msg?.type === 'location' &&
        Number.isFinite(msg.lat) && msg.lat >= -90 && msg.lat <= 90 &&
        Number.isFinite(msg.lng) && msg.lng >= -180 && msg.lng <= 180
      ) {
        const startedRiding = !liveLocations.has(uid); // erste Position dieser Session
        const loc: LiveLocation = {
          lat: msg.lat,
          lng: msg.lng,
          speedKmh: num(msg.speedKmh),
          ts: Date.now(),
          leanDeg: num(msg.leanDeg),
          distanceM: num(msg.distanceM),
          maxSpeedKmh: num(msg.maxSpeedKmh),
          recording: msg.recording === true,
        };
        liveLocations.set(uid, loc);
        if (startedRiding) notifyFriendsThrottled(uid, lastRideNotify, friendStartedRide);
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

/**
 * Live-Ereignis (Blitzer/Zone geschafft) an alle Freunde schicken, die gerade
 * verbunden sind – der Konvoi soll sofort mitbekommen, wenn jemand abliefert.
 * Kein Push, nur der offene Socket: das ist Live-Geplänkel, keine Nachricht.
 * Der Name wird pro Empfänger aufgelöst (deren Spitzname für den Fahrer).
 */
export function broadcastEventToFriends(userId: number, event: Record<string, unknown>) {
  if (!sharesActivity(userId)) return;
  for (const friendId of getFriendIds(userId)) {
    const sockets = connections.get(friendId);
    if (!sockets) continue;
    for (const ws of sockets) send(ws, { ...event, userId, name: resolveFriendName(friendId, userId) });
  }
}

/** Sendet eine Nachricht an alle offenen Sockets der angegebenen Nutzer. */
export function broadcastToUsers(userIds: number[], data: unknown) {
  for (const userId of userIds) {
    const sockets = connections.get(userId);
    if (!sockets) continue;
    for (const ws of sockets) send(ws, data);
  }
}
