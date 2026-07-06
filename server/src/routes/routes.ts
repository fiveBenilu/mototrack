import { Router } from 'express';
import { db } from '../db';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { routeWaypoints, generateRoundTrip, geocode, type RouteProfile } from '../lib/routing';

export const routesRouter = Router();

const MAX_NAME_LENGTH = 80;
const MAX_WAYPOINTS = 25;

function areFriends(a: number, b: number): boolean {
  return !!db
    .prepare(
      `SELECT 1 FROM friendships WHERE status = 'accepted'
       AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))`,
    )
    .get(a, b, b, a);
}

// Validiert ein Wegpunkt-Array aus dem Request-Body.
function parseWaypoints(input: unknown): [number, number][] | null {
  if (!Array.isArray(input) || input.length < 2 || input.length > MAX_WAYPOINTS) return null;
  const out: [number, number][] = [];
  for (const p of input) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [lat, lng] = p;
    if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    out.push([lat, lng]);
  }
  return out;
}

function parseProfile(input: unknown): RouteProfile {
  return input === 'curvy' ? 'curvy' : 'fast';
}

function publicRoute(r: any, ownerName?: string) {
  return {
    id: r.id,
    ownerId: r.owner_id,
    ownerName: ownerName ?? null,
    name: r.name,
    profile: r.profile ?? 'fast',
    distanceM: r.distance_m,
    durationS: r.duration_s,
    waypoints: JSON.parse(r.waypoints),
    geometry: JSON.parse(r.geometry),
    steps: JSON.parse(r.steps),
    createdAt: r.created_at,
  };
}

function canAccess(routeId: number, userId: number): boolean {
  const r = db.prepare('SELECT owner_id FROM routes WHERE id = ?').get(routeId) as { owner_id: number } | undefined;
  if (!r) return false;
  if (r.owner_id === userId) return true;
  return !!db.prepare('SELECT 1 FROM route_shares WHERE route_id = ? AND user_id = ?').get(routeId, userId);
}

// Live-Vorschau beim Planen: berechnet die Route, ohne sie zu speichern.
routesRouter.post('/preview', requireAuth, async (req: AuthedRequest, res) => {
  const waypoints = parseWaypoints(req.body?.waypoints);
  if (!waypoints) return res.status(400).json({ error: 'Mindestens 2 gültige Wegpunkte nötig' });
  try {
    const routed = await routeWaypoints(waypoints, parseProfile(req.body?.profile));
    res.json(routed);
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Routing fehlgeschlagen' });
  }
});

// Rundtour generieren (calimoto-Stil): Startpunkt + Wunschdistanz → Schleife.
routesRouter.post('/roundtrip', requireAuth, async (req: AuthedRequest, res) => {
  const start = parseWaypoints([req.body?.start, req.body?.start]); // wiederverwendete Validierung
  const distanceM = Number(req.body?.distanceM);
  if (!start || !Number.isFinite(distanceM) || distanceM < 10_000 || distanceM > 500_000)
    return res.status(400).json({ error: 'Startpunkt und Distanz (10–500 km) nötig' });
  try {
    const trip = await generateRoundTrip(start[0], distanceM, parseProfile(req.body?.profile ?? 'curvy'));
    res.json(trip);
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Rundtour fehlgeschlagen' });
  }
});

// Ortssuche für Wegpunkte (Nominatim-Proxy).
routesRouter.get('/geocode', requireAuth, async (req: AuthedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) return res.status(400).json({ error: 'Suchbegriff zu kurz' });
  try {
    res.json({ results: await geocode(q) });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Suche fehlgeschlagen' });
  }
});

// Eigene + mit mir geteilte Routen.
routesRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, u.display_name AS owner_name FROM routes r
       JOIN users u ON u.id = r.owner_id
       WHERE r.owner_id = ? OR r.id IN (SELECT route_id FROM route_shares WHERE user_id = ?)
       ORDER BY r.created_at DESC`,
    )
    .all(req.userId, req.userId) as any[];
  res.json({ routes: rows.map((r) => publicRoute(r, r.owner_name)) });
});

// Einzelne Route (Eigentümer oder geteilt).
routesRouter.get('/:id', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!canAccess(id, req.userId!)) return res.status(404).json({ error: 'Route nicht gefunden' });
  const r = db
    .prepare(`SELECT r.*, u.display_name AS owner_name FROM routes r JOIN users u ON u.id = r.owner_id WHERE r.id = ?`)
    .get(id) as any;
  res.json({ route: publicRoute(r, r.owner_name) });
});

// Route speichern: Wegpunkte werden serverseitig geroutet und mit Strecke/Dauer
// gespeichert.
routesRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) return res.status(400).json({ error: 'Ungültiger Name' });
  const waypoints = parseWaypoints(req.body?.waypoints);
  if (!waypoints) return res.status(400).json({ error: 'Mindestens 2 gültige Wegpunkte nötig' });
  const profile = parseProfile(req.body?.profile);

  let routed;
  try {
    routed = await routeWaypoints(waypoints, profile);
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : 'Routing fehlgeschlagen' });
  }

  const info = db
    .prepare(
      `INSERT INTO routes (owner_id, name, distance_m, duration_s, waypoints, geometry, steps, profile)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      req.userId,
      name,
      routed.distanceM,
      routed.durationS,
      JSON.stringify(waypoints),
      JSON.stringify(routed.geometry),
      JSON.stringify(routed.steps),
      profile,
    );
  const r = db.prepare('SELECT * FROM routes WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json({ route: publicRoute(r) });
});

// Route bearbeiten (nur Eigentümer): Name und/oder Wegpunkte. Bei geänderten
// Wegpunkten wird neu geroutet und Strecke/Dauer/Geometrie aktualisiert.
routesRouter.put('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM routes WHERE id = ?').get(id) as any;
  if (!existing || existing.owner_id !== req.userId) return res.status(403).json({ error: 'Nicht berechtigt' });

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) return res.status(400).json({ error: 'Ungültiger Name' });
  const waypoints = parseWaypoints(req.body?.waypoints);
  if (!waypoints) return res.status(400).json({ error: 'Mindestens 2 gültige Wegpunkte nötig' });
  const profile = parseProfile(req.body?.profile ?? existing.profile);

  let routed;
  try {
    routed = await routeWaypoints(waypoints, profile);
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : 'Routing fehlgeschlagen' });
  }

  db.prepare(
    `UPDATE routes SET name = ?, distance_m = ?, duration_s = ?, waypoints = ?, geometry = ?, steps = ?, profile = ? WHERE id = ?`,
  ).run(
    name,
    routed.distanceM,
    routed.durationS,
    JSON.stringify(waypoints),
    JSON.stringify(routed.geometry),
    JSON.stringify(routed.steps),
    profile,
    id,
  );
  const r = db.prepare('SELECT * FROM routes WHERE id = ?').get(id);
  res.json({ route: publicRoute(r) });
});

// Route löschen (nur Eigentümer).
routesRouter.delete('/:id', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('SELECT owner_id FROM routes WHERE id = ?').get(id) as { owner_id: number } | undefined;
  if (!r || r.owner_id !== req.userId) return res.status(403).json({ error: 'Nicht berechtigt' });
  db.prepare('DELETE FROM routes WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Mit Freunden teilen: ersetzt die Freigabeliste (nur Freunde des Eigentümers).
routesRouter.put('/:id/shares', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const userId = req.userId!;
  const r = db.prepare('SELECT owner_id FROM routes WHERE id = ?').get(id) as { owner_id: number } | undefined;
  if (!r || r.owner_id !== userId) return res.status(403).json({ error: 'Nicht berechtigt' });
  const ids: number[] = Array.isArray(req.body?.userIds) ? req.body.userIds.filter((x: unknown) => typeof x === 'number') : [];

  const replace = db.transaction(() => {
    db.prepare('DELETE FROM route_shares WHERE route_id = ?').run(id);
    const add = db.prepare('INSERT OR IGNORE INTO route_shares (route_id, user_id) VALUES (?, ?)');
    for (const fid of ids) if (fid !== userId && areFriends(userId, fid)) add.run(id, fid);
  });
  replace();

  const shared = db.prepare('SELECT user_id FROM route_shares WHERE route_id = ?').all(id) as { user_id: number }[];
  res.json({ sharedWith: shared.map((s) => s.user_id) });
});

// Aktuelle Freigaben einer Route (nur Eigentümer).
routesRouter.get('/:id/shares', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('SELECT owner_id FROM routes WHERE id = ?').get(id) as { owner_id: number } | undefined;
  if (!r || r.owner_id !== req.userId) return res.status(403).json({ error: 'Nicht berechtigt' });
  const shared = db.prepare('SELECT user_id FROM route_shares WHERE route_id = ?').all(id) as { user_id: number }[];
  res.json({ sharedWith: shared.map((s) => s.user_id) });
});
