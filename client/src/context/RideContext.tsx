import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRideRecorder } from '../hooks/useRideRecorder';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';
import { haversineDistance } from '../lib/geo';
import type { SpeedCamera, FriendLocation } from '../lib/types';

const CAMERA_PASS_RADIUS_M = 75;

export interface CameraPassResult {
  cameraId: number;
  speedKmh: number;
  points: number;
  stars: number;
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
  | { type: 'group-removed'; groupId: number };

interface RideContextValue extends ReturnType<typeof useRideRecorder> {
  cameras: SpeedCamera[];
  fetchCamerasForBounds: (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => Promise<void>;
  friendLocations: Map<number, FriendLocation>;
  myLocation: MyLocation | null;
  lastPass: CameraPassResult | null;
  dismissLastPass: () => void;
  subscribeGroupEvents: (cb: (event: GroupEvent) => void) => () => void;
}

const RideContext = createContext<RideContextValue | undefined>(undefined);

export function RideProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cameras, setCameras] = useState<SpeedCamera[]>([]);
  const [friendLocations, setFriendLocations] = useState<Map<number, FriendLocation>>(new Map());
  const [myLocation, setMyLocation] = useState<MyLocation | null>(null);
  const [lastPass, setLastPass] = useState<CameraPassResult | null>(null);

  const camerasRef = useRef<SpeedCamera[]>([]);
  const passedCameraIdsRef = useRef<Set<number>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<'idle' | 'recording' | 'paused' | 'finished'>('idle');
  const rideIdRef = useRef<number | null>(null);
  const groupListenersRef = useRef<Set<(event: GroupEvent) => void>>(new Set());
  const lastLocationRef = useRef<{ lat: number; lng: number; speedKmh: number } | null>(null);

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

  const fetchCamerasForBounds = useCallback(
    async (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => {
      try {
        const params = new URLSearchParams({
          minLat: String(bounds.minLat),
          minLng: String(bounds.minLng),
          maxLat: String(bounds.maxLat),
          maxLng: String(bounds.maxLng),
        });
        const data = await api.get<{ cameras: SpeedCamera[] }>(`/cameras?${params.toString()}`);
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
      } catch {
        /* Karten-Daten optional, Fehler ignorieren */
      }
    },
    [],
  );

  const handlePosition = useCallback((pos: { lat: number; lng: number; speedKmh: number }) => {
    if (statusRef.current === 'recording' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'location', lat: pos.lat, lng: pos.lng, speedKmh: pos.speedKmh }));
    }

    if (statusRef.current !== 'recording') return;

    for (const camera of camerasRef.current) {
      if (passedCameraIdsRef.current.has(camera.id)) continue;
      const dist = haversineDistance(pos.lat, pos.lng, camera.lat, camera.lng);
      if (dist <= CAMERA_PASS_RADIUS_M) {
        passedCameraIdsRef.current.add(camera.id);
        api
          .post<{ pass: CameraPassResult }>(`/cameras/${camera.id}/pass`, {
            speedKmh: pos.speedKmh,
            rideId: rideIdRef.current,
          })
          .then((data) => setLastPass(data.pass))
          .catch(() => {});
      }
    }
  }, []);

  const recorder = useRideRecorder({ onPosition: handlePosition });

  useEffect(() => {
    statusRef.current = recorder.status;
    if (recorder.status === 'recording' && passedCameraIdsRef.current.size === 0) {
      // neue Fahrt: sicherstellen, dass die Pass-Liste frisch ist (wird auch bei start() geleert)
    }
  }, [recorder.status]);

  const wrappedStart = useCallback(() => {
    passedCameraIdsRef.current = new Set();
    rideIdRef.current = null;
    recorder.start();
  }, [recorder]);

  // WebSocket-Verbindung für Live-Standorte aufbauen, solange der Nutzer angemeldet ist
  useEffect(() => {
    if (!user) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    // Sobald die Verbindung steht, die letzte bekannte Position sofort senden
    // (der erste GPS-Fix kommt oft, bevor der Socket offen ist).
    ws.onopen = () => broadcastMyLocation();

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
        } else if (typeof msg.type === 'string' && msg.type.startsWith('group')) {
          groupListenersRef.current.forEach((cb) => cb(msg as GroupEvent));
        }
      } catch {
        /* ignore */
      }
    };

    return () => {
      ws.close();
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
        lastLocationRef.current = { lat: latitude, lng: longitude, speedKmh };
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

  const dismissLastPass = useCallback(() => setLastPass(null), []);

  const value: RideContextValue = {
    ...recorder,
    start: wrappedStart,
    cameras,
    fetchCamerasForBounds,
    friendLocations,
    myLocation,
    lastPass,
    dismissLastPass,
    subscribeGroupEvents,
  };

  return <RideContext.Provider value={value}>{children}</RideContext.Provider>;
}

export function useRide() {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error('useRide muss innerhalb von RideProvider verwendet werden');
  return ctx;
}
