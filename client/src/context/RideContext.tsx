import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRideRecorder, type PositionUpdate } from '../hooks/useRideRecorder';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';
import { flushPendingRides } from '../lib/pendingRides';
import { savePendingPass, flushPendingPasses } from '../lib/pendingPasses';
import { haversineDistance } from '../lib/geo';
import type { SpeedCamera, SpeedZone, FriendLocation, FriendEvent, PlannedRoute } from '../lib/types';

const ACTIVE_ROUTE_KEY = 'mototrack.activeRoute';

const CAMERA_PASS_RADIUS_M = 75;
const ZONE_TRIGGER_RADIUS_M = 80; // Nähe zu Ein-/Ausfahrt, um die Messung zu starten/beenden (großzügig, da GPS bei High-Speed nur ~1 Punkt/s liefert)
const ZONE_MAX_DURATION_MS = 15 * 60 * 1000; // länger = abgebrochen (umgekehrt, abgebogen …)
const EVENT_FEED_LIMIT = 20; // mehr braucht während der Fahrt niemand

export interface CameraPassResult {
  cameraId: number;
  speedKmh: number;
  points: number;
  stars: number;
}

export interface ZonePassResult {
  zoneId: number;
  avgSpeedKmh: number;
  durationS: number;
  points: number;
  stars: number;
}

// Live-Fortschritt, während man sich in einer Zone befindet.
export interface ZoneProgress {
  zoneId: number;
  avgSpeedKmh: number;
  remainingM: number;
  stars: number; // projizierte Medaille beim aktuellen Schnitt
}

// Projizierte Sterne aus dem Schnitt – spiegelt computeZonePassResult auf dem Server.
function projectedZoneStars(avgSpeedKmh: number): number {
  if (avgSpeedKmh >= 140) return 3;
  if (avgSpeedKmh >= 110) return 2;
  if (avgSpeedKmh >= 80) return 1;
  return 0;
}

export interface MyLocation {
  lat: number;
  lng: number;
  heading: number | null;
  speedKmh: number;
}

export type GroupEvent =
  | { type: 'group-message'; groupId: number; message: import('../lib/types').GroupMessage }
  | { type: 'group-update'; groupId: number }
  | { type: 'group-removed'; groupId: number }
  | { type: 'group-route'; groupId: number; routeId: number | null };

interface RideContextValue extends ReturnType<typeof useRideRecorder> {
  cameras: SpeedCamera[];
  zones: SpeedZone[];
  fetchCamerasForBounds: (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => Promise<void>;
  friendLocations: Map<number, FriendLocation>;
  myLocation: MyLocation | null;
  lastPass: CameraPassResult | null;
  dismissLastPass: () => void;
  lastZonePass: ZonePassResult | null;
  dismissLastZonePass: () => void;
  activeZoneProgress: ZoneProgress | null;
  friendEvents: FriendEvent[];
  subscribeGroupEvents: (cb: (event: GroupEvent) => void) => () => void;
  activeRoute: PlannedRoute | null;
  setActiveRoute: (route: PlannedRoute | null) => void;
}

const RideContext = createContext<RideContextValue | undefined>(undefined);

export function RideProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cameras, setCameras] = useState<SpeedCamera[]>([]);
  const [zones, setZones] = useState<SpeedZone[]>([]);
  const [friendLocations, setFriendLocations] = useState<Map<number, FriendLocation>>(new Map());
  const [myLocation, setMyLocation] = useState<MyLocation | null>(null);
  const [lastPass, setLastPass] = useState<CameraPassResult | null>(null);
  const [lastZonePass, setLastZonePass] = useState<ZonePassResult | null>(null);
  const [activeZoneProgress, setActiveZoneProgress] = useState<ZoneProgress | null>(null);
  // Live-Ticker: die letzten Aktionen der Freunde (Blitzer/Zonen), neueste zuerst.
  const [friendEvents, setFriendEvents] = useState<FriendEvent[]>([]);
  // Aktive geführte Route (überlebt Tab-Wechsel/Reload via localStorage).
  const [activeRoute, setActiveRouteState] = useState<PlannedRoute | null>(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_ROUTE_KEY);
      return raw ? (JSON.parse(raw) as PlannedRoute) : null;
    } catch {
      return null;
    }
  });

  const camerasRef = useRef<SpeedCamera[]>([]);
  const zonesRef = useRef<SpeedZone[]>([]);
  const passedCameraIdsRef = useRef<Set<number>>(new Set());
  // Laufende Zonen-Messungen: zoneId -> Start-Zeit, Start-Endpunkt und mitlaufende
  // Strecke (für den Live-Schnitt und die Restdistanz).
  const activeZonesRef = useRef<Map<number, { startTs: number; from: 'entry' | 'exit'; lastLat: number; lastLng: number; distM: number }>>(
    new Map(),
  );
  const passedZoneIdsRef = useRef<Set<number>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<'idle' | 'recording' | 'paused' | 'finished'>('idle');
  const rideIdRef = useRef<number | null>(null);
  const groupListenersRef = useRef<Set<(event: GroupEvent) => void>>(new Set());
  const lastLocationRef = useRef<{
    lat: number;
    lng: number;
    speedKmh: number;
    leanDeg?: number;
    distanceM?: number;
    maxSpeedKmh?: number;
  } | null>(null);

  // Letzte bekannte Position an Freunde senden (sofern verbunden und keine
  // Aufzeichnung läuft – dann sendet der Recorder). Wird vom Watcher, beim
  // WS-Open (Flush) und per Heartbeat aufgerufen, damit Freunde auch im Stand
  // und nach Reconnects sichtbar bleiben.
  const broadcastMyLocation = useCallback(() => {
    const loc = lastLocationRef.current;
    if (loc && statusRef.current !== 'recording' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'location', ...loc }));
    }
  }, []);

  const subscribeGroupEvents = useCallback((cb: (event: GroupEvent) => void) => {
    groupListenersRef.current.add(cb);
    return () => groupListenersRef.current.delete(cb);
  }, []);

  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  const fetchCamerasForBounds = useCallback(
    async (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => {
      try {
        const params = new URLSearchParams({
          minLat: String(bounds.minLat),
          minLng: String(bounds.minLng),
          maxLat: String(bounds.maxLat),
          maxLng: String(bounds.maxLng),
        });
        const data = await api.get<{ cameras: SpeedCamera[]; zones: SpeedZone[] }>(`/cameras?${params.toString()}`);
        setCameras((prev) => {
          const merged = new Map(prev.map((c) => [c.id, c]));
          let changed = false;
          for (const c of data.cameras) {
            if (!merged.has(c.id)) changed = true;
            merged.set(c.id, c);
          }
          // Unveränderte Referenz beibehalten, damit die Karte nicht bei jedem
          // (auch ergebnislosen) Polling-Durchlauf neu rendert.
          return changed ? Array.from(merged.values()) : prev;
        });
        setZones((prev) => {
          const merged = new Map(prev.map((z) => [z.id, z]));
          let changed = false;
          for (const z of data.zones ?? []) {
            if (!merged.has(z.id)) changed = true;
            merged.set(z.id, z);
          }
          return changed ? Array.from(merged.values()) : prev;
        });
      } catch {
        /* Karten-Daten optional, Fehler ignorieren */
      }
    },
    [],
  );

  const handlePosition = useCallback((pos: PositionUpdate) => {
    if (statusRef.current === 'recording') {
      // Telemetrie für den Konvoi der Freunde mitsenden – auch für den Heartbeat
      // merken, damit nach einem Reconnect nicht nur ein nackter Punkt ankommt.
      lastLocationRef.current = {
        lat: pos.lat,
        lng: pos.lng,
        speedKmh: pos.speedKmh,
        leanDeg: pos.leanDeg,
        distanceM: pos.distanceM,
        maxSpeedKmh: pos.maxSpeedKmh,
      };
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'location', ...lastLocationRef.current, recording: true }));
      }
    }

    if (statusRef.current !== 'recording') return;

    for (const camera of camerasRef.current) {
      if (passedCameraIdsRef.current.has(camera.id)) continue;
      const dist = haversineDistance(pos.lat, pos.lng, camera.lat, camera.lng);
      if (dist <= CAMERA_PASS_RADIUS_M) {
        passedCameraIdsRef.current.add(camera.id);
        const body = { speedKmh: pos.speedKmh, rideId: rideIdRef.current };
        api
          .post<{ pass: CameraPassResult }>(`/cameras/${camera.id}/pass`, body)
          .then((data) => setLastPass(data.pass))
          .catch(() => savePendingPass(`/cameras/${camera.id}/pass`, body));
      }
    }

    // Blitzer-Zonen: an einem Endpunkt startet die Messung, am anderen endet sie.
    // Die Durchschnittsgeschwindigkeit ergibt sich aus der bekannten Streckenlänge
    // der Zone geteilt durch die gemessene Zeit (klassische Section-Control-Logik).
    const now = Date.now();
    for (const zone of zonesRef.current) {
      if (passedZoneIdsRef.current.has(zone.id)) continue;
      const dEntry = haversineDistance(pos.lat, pos.lng, zone.entryLat, zone.entryLng);
      const dExit = haversineDistance(pos.lat, pos.lng, zone.exitLat, zone.exitLng);
      const active = activeZonesRef.current.get(zone.id);

      if (!active) {
        if (dEntry <= ZONE_TRIGGER_RADIUS_M)
          activeZonesRef.current.set(zone.id, { startTs: now, from: 'entry', lastLat: pos.lat, lastLng: pos.lng, distM: 0 });
        else if (dExit <= ZONE_TRIGGER_RADIUS_M)
          activeZonesRef.current.set(zone.id, { startTs: now, from: 'exit', lastLat: pos.lat, lastLng: pos.lng, distM: 0 });
        continue;
      }

      // Zurückgelegte Strecke in der Zone mitführen (für Live-Schnitt & Restweg).
      active.distM += haversineDistance(active.lastLat, active.lastLng, pos.lat, pos.lng);
      active.lastLat = pos.lat;
      active.lastLng = pos.lng;

      const reachedOtherEnd = active.from === 'entry' ? dExit <= ZONE_TRIGGER_RADIUS_M : dEntry <= ZONE_TRIGGER_RADIUS_M;
      if (reachedOtherEnd) {
        const durationS = (now - active.startTs) / 1000;
        activeZonesRef.current.delete(zone.id);
        passedZoneIdsRef.current.add(zone.id);
        setActiveZoneProgress(null);
        if (durationS >= 1) {
          const avgSpeedKmh = (zone.lengthM / durationS) * 3.6;
          const body = { avgSpeedKmh, durationS, rideId: rideIdRef.current };
          api
            .post<{ pass: ZonePassResult }>(`/cameras/zones/${zone.id}/pass`, body)
            .then((data) => setLastZonePass(data.pass))
            .catch(() => savePendingPass(`/cameras/zones/${zone.id}/pass`, body));
        }
      } else if (now - active.startTs > ZONE_MAX_DURATION_MS) {
        activeZonesRef.current.delete(zone.id); // Messung abgebrochen
        setActiveZoneProgress(null);
      } else {
        const elapsedS = (now - active.startTs) / 1000;
        const avgSpeedKmh = elapsedS > 0 ? (active.distM / elapsedS) * 3.6 : 0;
        setActiveZoneProgress({
          zoneId: zone.id,
          avgSpeedKmh,
          remainingM: Math.max(0, zone.lengthM - active.distM),
          stars: projectedZoneStars(avgSpeedKmh),
        });
      }
    }
  }, []);

  const recorder = useRideRecorder({ onPosition: handlePosition });

  useEffect(() => {
    statusRef.current = recorder.status;
    // Aufzeichnung beendet/pausiert → laufende Zonen-Messung und Live-Anzeige verwerfen.
    if (recorder.status !== 'recording') {
      activeZonesRef.current.clear();
      setActiveZoneProgress(null);
    }
  }, [recorder.status]);

  const wrappedStart = useCallback(() => {
    passedCameraIdsRef.current = new Set();
    passedZoneIdsRef.current = new Set();
    activeZonesRef.current = new Map();
    setActiveZoneProgress(null);
    rideIdRef.current = null;
    recorder.start();
  }, [recorder]);

  // WebSocket-Verbindung für Live-Standorte & Gruppenchat – mit automatischem
  // Reconnect (exponentielles Backoff), damit Standortfreigabe und Chat nach
  // Verbindungsabbrüchen (Tunnel, App im Hintergrund, Serverneustart) wieder
  // anspringen, solange der Nutzer angemeldet ist.
  useEffect(() => {
    if (!user) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    let stopped = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        // Sobald die Verbindung steht, die letzte bekannte Position sofort senden
        // (der erste GPS-Fix kommt oft, bevor der Socket offen ist).
        broadcastMyLocation();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'friend-location') {
            setFriendLocations((prev) => {
              const next = new Map(prev);
              next.set(msg.userId, { userId: msg.userId, lat: msg.lat, lng: msg.lng, speedKmh: msg.speedKmh, ts: msg.ts });
              return next;
            });
          } else if (msg.type === 'friend-offline') {
            setFriendLocations((prev) => {
              const next = new Map(prev);
              next.delete(msg.userId);
              return next;
            });
          } else if (msg.type === 'friend-pass') {
            setFriendEvents((prev) =>
              [
                {
                  id: `${msg.userId}-${msg.ts}`,
                  userId: msg.userId,
                  name: msg.name,
                  kind: msg.kind,
                  speedKmh: msg.speedKmh,
                  points: msg.points,
                  stars: msg.stars,
                  ts: msg.ts,
                } as FriendEvent,
                ...prev,
              ].slice(0, EVENT_FEED_LIMIT),
            );
          } else if (typeof msg.type === 'string' && msg.type.startsWith('group')) {
            groupListenersRef.current.forEach((cb) => cb(msg as GroupEvent));
          }
        } catch {
          /* ignore */
        }
      };

      // Bei Fehler schließen → onclose plant den Reconnect.
      ws.onerror = () => ws.close();

      ws.onclose = () => {
        if (stopped) return;
        const delay = Math.min(1000 * 2 ** attempt, 15000); // 1s, 2s, 4s … max 15s
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null; // absichtliches Schließen darf keinen Reconnect auslösen
        ws.close();
      }
      wsRef.current = null;
    };
  }, [user, broadcastMyLocation]);

  // App-weiter Standort-Watcher: solange der Nutzer eingeloggt ist, wird die
  // eigene Position erfasst und – sofern keine Aufzeichnung läuft (dann sendet
  // der Recorder mit der genaueren Fahrt-Geschwindigkeit) – live an Freunde
  // gesendet. So sind Freunde gegenseitig auf der Karte sichtbar.
  useEffect(() => {
    if (!user || !navigator.geolocation) {
      setMyLocation(null);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, heading, speed } = pos.coords;
        const speedKmh = speed !== null && speed >= 0 ? speed * 3.6 : 0;
        setMyLocation({
          lat: latitude,
          lng: longitude,
          heading: heading !== null && !Number.isNaN(heading) ? heading : null,
          speedKmh,
        });
        if (statusRef.current !== 'recording') lastLocationRef.current = { lat: latitude, lng: longitude, speedKmh };
        broadcastMyLocation();
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
    );
    // Heartbeat: auch im Stand / nach Reconnects regelmäßig die Position senden,
    // damit Freunde dauerhaft sichtbar bleiben (Server verwirft Live-Standorte
    // beim Verbindungsabbruch).
    const heartbeat = setInterval(broadcastMyLocation, 12000);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(heartbeat);
    };
  }, [user, broadcastMyLocation]);

  // Zuvor fehlgeschlagene Fahrten und Blitzer-Durchfahrten (kein Netz / Server
  // down) erneut senden: sobald der Nutzer angemeldet ist, wenn die Verbindung
  // zurückkehrt und wenn die App wieder in den Vordergrund kommt – iOS feuert
  // `online` nach einem Funkloch nicht zuverlässig.
  useEffect(() => {
    if (!user) return;
    const flush = () => {
      flushPendingRides();
      flushPendingPasses();
    };
    flush();
    const onVisible = () => document.visibilityState === 'visible' && flush();
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  const dismissLastPass = useCallback(() => setLastPass(null), []);
  const dismissLastZonePass = useCallback(() => setLastZonePass(null), []);

  const setActiveRoute = useCallback((route: PlannedRoute | null) => {
    setActiveRouteState(route);
    try {
      if (route) localStorage.setItem(ACTIVE_ROUTE_KEY, JSON.stringify(route));
      else localStorage.removeItem(ACTIVE_ROUTE_KEY);
    } catch {
      /* localStorage optional */
    }
  }, []);

  const value: RideContextValue = {
    ...recorder,
    start: wrappedStart,
    cameras,
    zones,
    fetchCamerasForBounds,
    friendLocations,
    myLocation,
    lastPass,
    dismissLastPass,
    lastZonePass,
    dismissLastZonePass,
    activeZoneProgress,
    friendEvents,
    subscribeGroupEvents,
    activeRoute,
    setActiveRoute,
  };

  return <RideContext.Provider value={value}>{children}</RideContext.Provider>;
}

export function useRide() {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error('useRide muss innerhalb von RideProvider verwendet werden');
  return ctx;
}
