import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon, Stars } from './Icon';
import { useRide } from '../context/RideContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../lib/api';
import { haversineDistance, bearingDeg, angleDiff } from '../lib/geo';
import type { Friend } from '../lib/types';

const CAMERA_WARN_RANGE_M = 600; // ab dieser Entfernung vor einem Blitzer warnen
const CAMERA_WARN_MIN_M = 60; // näher = praktisch erreicht, keine Warnung mehr
const AHEAD_CONE_DEG = 75; // nur Blitzer „voraus" (innerhalb dieses Winkels zur Fahrtrichtung)

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]; // Mitte Deutschland

// Muss unter dem Server-Limit MAX_BOUNDS_SPAN (0.5°) bleiben, sonst antwortet
// der Server mit 400 und es werden keine Blitzer geladen.
const MAX_FETCH_SPAN = 0.45;

interface GeoState {
  lat: number;
  lng: number;
  heading: number | null;
  speedKmh: number;
}

function clampBounds(b: { minLat: number; minLng: number; maxLat: number; maxLng: number }) {
  const centerLat = (b.minLat + b.maxLat) / 2;
  const centerLng = (b.minLng + b.maxLng) / 2;
  const halfLat = Math.min((b.maxLat - b.minLat) / 2, MAX_FETCH_SPAN / 2);
  const halfLng = Math.min((b.maxLng - b.minLng) / 2, MAX_FETCH_SPAN / 2);
  return {
    minLat: centerLat - halfLat,
    maxLat: centerLat + halfLat,
    minLng: centerLng - halfLng,
    maxLng: centerLng + halfLng,
  };
}

const CAMERA_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/></svg>';

// Eine stabile Icon-Instanz pro Marker-Typ – sonst baut react-leaflet bei jedem
// Render das Marker-DOM neu auf und offene Popups verlieren ihren Anker.
const cameraIcon = L.divIcon({
  className: '',
  html: `<div class="cam-marker">${CAMERA_SVG}</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const MOTORCYCLE_SVG =
  '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.4" cy="16.6" r="3.4"/><circle cx="18.6" cy="16.6" r="3.4"/><path d="M5.4 16.6 8.5 11h6.5l3.6 5.6"/><path d="M8.5 11 7 7.4H4.6"/><path d="M15 11l1.1-2.6h3.3"/><path d="M15.6 8.4h4.2"/><path d="M11 13.4h3.2"/></svg>';

const friendIcon = L.divIcon({
  className: '',
  html: `<div class="friend-marker">${MOTORCYCLE_SVG}</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function friendIconFor(displayName: string, avatarPath: string | null) {
  const inner = avatarPath
    ? `<img src="${avatarPath}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
    : `<span style="font-size:15px;font-weight:700;color:#fff">${escapeHtml(displayName.slice(0, 1).toUpperCase())}</span>`;
  return L.divIcon({
    className: '',
    html: `<div class="friend-marker">${inner}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function fmtMeters(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

// Zonen-Tore: andersfarbig (violett) als die roten Einzel-Blitzer. Einfahrt mit
// Pfeil hinein, Ausfahrt mit Zielflagge (Forza-Stil).
const ZONE_COLOR = '#a855f7';
const ZONE_ENTRY_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
const ZONE_EXIT_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';

const zoneEntryIcon = L.divIcon({
  className: '',
  html: `<div class="zone-marker zone-marker--entry">${ZONE_ENTRY_SVG}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});
const zoneExitIcon = L.divIcon({
  className: '',
  html: `<div class="zone-marker">${ZONE_EXIT_SVG}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const NAV_ARROW_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="#0a84ff" stroke="white" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2 L19 21 L12 16.5 L5 21 Z"/></svg>';

const selfIcon = (heading: number | null) =>
  L.divIcon({
    className: '',
    html: `<div class="self-marker"><div class="self-marker__pulse"></div><div class="self-marker__arrow" style="transform:rotate(${heading ?? 0}deg)">${NAV_ARROW_SVG}</div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

// Mindestbewegung des Kartenmittelpunkts bzw. Mindestzeit, bevor erneut Blitzer
// geladen werden. Verhindert, dass das ständige Nachführen während der Fahrt
// (panTo bei jedem GPS-Tick → moveend) den Server/Tile-Dienst mit Requests flutet.
const REFETCH_MIN_MOVE_M = 400;
const REFETCH_MIN_INTERVAL_MS = 10000;

function BoundsWatcher() {
  const { fetchCamerasForBounds } = useRide();
  const followupRef = useRef<number | null>(null);
  const lastCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastFetchRef = useRef(0);

  const refresh = (map: L.Map, force = false) => {
    const c = map.getCenter();
    const now = Date.now();
    const movedFar =
      !lastCenterRef.current || haversineDistance(c.lat, c.lng, lastCenterRef.current.lat, lastCenterRef.current.lng) > REFETCH_MIN_MOVE_M;
    if (!force && !movedFar && now - lastFetchRef.current < REFETCH_MIN_INTERVAL_MS) return;

    lastCenterRef.current = { lat: c.lat, lng: c.lng };
    lastFetchRef.current = now;

    const b = map.getBounds();
    const bounds = clampBounds({ minLat: b.getSouth(), minLng: b.getWest(), maxLat: b.getNorth(), maxLng: b.getEast() });
    fetchCamerasForBounds(bounds);
    // Eine einzelne, verzögerte Nachladung fängt serverseitig (Overpass) frisch
    // generierte Blitzer/Zonen ein, ohne den Request-Takt hochzutreiben.
    if (followupRef.current) clearTimeout(followupRef.current);
    followupRef.current = window.setTimeout(() => fetchCamerasForBounds(bounds), 6000);
  };

  const map = useMapEvents({ moveend: () => refresh(map) });

  useEffect(() => {
    refresh(map, true);
    return () => {
      if (followupRef.current) clearTimeout(followupRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function FollowCamera({
  position,
  follow,
  setFollow,
}: {
  position: GeoState | null;
  follow: boolean;
  setFollow: (v: boolean) => void;
}) {
  const map = useMap();
  const flownRef = useRef(false);
  const programmaticRef = useRef(false);

  useMapEvents({
    dragstart: () => setFollow(false),
    zoomstart: () => {
      if (!programmaticRef.current) setFollow(false);
    },
  });

  useEffect(() => {
    if (!position) return;
    const target: [number, number] = [position.lat, position.lng];
    if (!flownRef.current) {
      flownRef.current = true;
      programmaticRef.current = true;
      map.setView(target, 15, { animate: true });
      setTimeout(() => (programmaticRef.current = false), 600);
    } else if (follow) {
      map.panTo(target, { animate: true, duration: 0.6 });
    }
  }, [position, follow, map]);

  return null;
}

function FollowButton({ follow, onToggle }: { follow: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="absolute bottom-4 right-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition active:scale-95"
      style={{
        border: '1px solid var(--color-border)',
        background: follow ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
        color: follow ? '#fff' : 'var(--color-accent)',
      }}
      aria-label={follow ? 'Folgen aktiv' : 'Mir folgen'}
    >
      <Icon name="locate" size={22} />
    </button>
  );
}

interface LeaderboardEntry {
  userId: number;
  displayName: string;
  speedKmh: number;
  points: number;
  stars: number;
}

function CameraPopup({ cameraId }: { cameraId: number }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    api
      .get<{ entries: LeaderboardEntry[] }>(`/cameras/${cameraId}/leaderboard`)
      .then((data) => setEntries(data.entries))
      .catch(() => setEntries([]));
  }, [cameraId]);

  return (
    <div className="min-w-[180px] text-sm">
      <p className="mb-1 flex items-center gap-1.5 font-semibold">
        <Icon name="camera" size={16} className="text-(--color-danger)" />
        Blitzer · Bestenliste
      </p>
      {entries === null && <p className="text-(--color-text-secondary)">Lade…</p>}
      {entries?.length === 0 && <p className="text-(--color-text-secondary)">Noch keine Durchfahrten</p>}
      <ul className="flex flex-col gap-1">
        {entries?.slice(0, 5).map((e, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span>{e.displayName}</span>
            <span className="flex items-center gap-1 font-mono">
              {e.speedKmh.toFixed(0)} km/h <Stars count={e.stars} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ZoneEntry {
  userId: number;
  displayName: string;
  avgSpeedKmh: number;
  stars: number;
}

function ZonePopup({ zoneId, lengthM }: { zoneId: number; lengthM: number }) {
  const [entries, setEntries] = useState<ZoneEntry[] | null>(null);

  useEffect(() => {
    api
      .get<{ entries: ZoneEntry[] }>(`/cameras/zones/${zoneId}/leaderboard`)
      .then((data) => setEntries(data.entries))
      .catch(() => setEntries([]));
  }, [zoneId]);

  return (
    <div className="min-w-[190px] text-sm">
      <p className="mb-0.5 flex items-center gap-1.5 font-semibold" style={{ color: ZONE_COLOR }}>
        <Icon name="zap" size={16} /> Blitzer-Zone
      </p>
      <p className="mb-1 text-(--color-text-secondary)">
        {(lengthM / 1000).toFixed(1)} km · höchster Schnitt zählt
      </p>
      {entries === null && <p className="text-(--color-text-secondary)">Lade…</p>}
      {entries?.length === 0 && <p className="text-(--color-text-secondary)">Noch keine Durchfahrten</p>}
      <ul className="flex flex-col gap-1">
        {entries?.slice(0, 5).map((e, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span>{e.displayName}</span>
            <span className="flex items-center gap-1 font-mono">
              ⌀ {e.avgSpeedKmh.toFixed(0)} km/h <Stars count={e.stars} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FriendPopup({
  name,
  userId,
  speedKmh,
  hasProfile,
}: {
  name: string;
  userId: number;
  speedKmh: number;
  hasProfile: boolean;
}) {
  return (
    <div className="min-w-[150px] text-sm">
      <p className="mb-0.5 flex items-center gap-1.5 font-semibold">
        <Icon name="motorcycle" size={16} className="text-(--color-accent)" />
        {name}
      </p>
      <p className="text-(--color-text-secondary)">{speedKmh.toFixed(0)} km/h</p>
      {hasProfile && (
        <Link to={`/freunde/${userId}`} className="mt-1.5 inline-flex items-center gap-1 font-medium text-(--color-accent)">
          Profil ansehen <Icon name="chevron-right" size={14} />
        </Link>
      )}
    </div>
  );
}

/**
 * Live-Karte mit eigenem Standort (Heading-Pfeil), Blitzern und den Live-Positionen
 * der Freunde. Daten kommen zentral aus dem RideContext (eine GPS-Quelle, die den
 * eigenen Standort zugleich an Freunde sendet). Wird auf der Karten-Seite und im
 * Konvoi-Modus der Aufzeichnung verwendet.
 */
const ROUTE_COLOR = '#0a84ff';
const STEP_REACHED_M = 30; // Manöverpunkt als erreicht werten
const ANNOUNCE_RANGE_M = 250; // ab hier die nächste Anweisung ansagen

// Sprachausgabe der nächsten Abbiege-Anweisung (best effort, ohne Abhängigkeit).
function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* Sprachausgabe optional */
  }
}

export function LiveMap({ className, lockView = false }: { className?: string; lockView?: boolean }) {
  const { cameras, zones, friendLocations, myLocation, lastPass, dismissLastPass, lastZonePass, dismissLastZonePass, activeZoneProgress, activeRoute } =
    useRide();
  const { resolved } = useTheme();
  const [follow, setFollow] = useState(true);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [friends, setFriends] = useState<Map<number, Friend>>(new Map());

  const position = myLocation;

  useEffect(() => {
    api
      .get<{ friends: Friend[] }>('/friends')
      .then((d) => setFriends(new Map(d.friends.map((f) => [f.id, f]))))
      .catch(() => {});
  }, []);

  const friendIcons = useMemo(() => {
    const m = new Map<number, L.DivIcon>();
    for (const f of friends.values()) m.set(f.id, friendIconFor(f.displayName, f.avatarPath));
    return m;
  }, [friends]);

  useEffect(() => {
    if (!lastPass) return;
    const timer = setTimeout(dismissLastPass, 5000);
    return () => clearTimeout(timer);
  }, [lastPass, dismissLastPass]);

  useEffect(() => {
    if (!lastZonePass) return;
    const timer = setTimeout(dismissLastZonePass, 6000);
    return () => clearTimeout(timer);
  }, [lastZonePass, dismissLastZonePass]);

  const heading = position?.heading ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selfMarkerIcon = useMemo(() => selfIcon(heading), [heading == null ? null : Math.round(heading)]);

  // Nächster Blitzer voraus (innerhalb der Reichweite und – falls Kurs bekannt –
  // im Fahrtrichtungs-Kegel). Liefert die Entfernung für die Warn-Einblendung.
  const cameraAhead = useMemo(() => {
    if (!position) return null;
    let best: number | null = null;
    for (const cam of cameras) {
      const d = haversineDistance(position.lat, position.lng, cam.lat, cam.lng);
      if (d > CAMERA_WARN_RANGE_M || d < CAMERA_WARN_MIN_M) continue;
      if (heading != null && angleDiff(bearingDeg(position.lat, position.lng, cam.lat, cam.lng), heading) > AHEAD_CONE_DEG)
        continue;
      if (best == null || d < best) best = d;
    }
    return best;
  }, [cameras, position, heading]);

  // Turn-by-turn entlang der aktiven Route: Index zeigt auf das nächste Manöver,
  // rückt nur vorwärts (sobald der aktuelle Manöverpunkt erreicht ist). Distanz
  // & Anweisung werden für die Einblendung berechnet, plus einmalige Ansage.
  const stepIdxRef = useRef(0);
  const announcedRef = useRef(-1);
  const [nav, setNav] = useState<{ instruction: string; distanceM: number; final: boolean } | null>(null);

  useEffect(() => {
    stepIdxRef.current = 0;
    announcedRef.current = -1;
    setNav(null);
  }, [activeRoute?.id]);

  useEffect(() => {
    const steps = activeRoute?.steps;
    if (!steps || steps.length === 0 || !position) {
      setNav(null);
      return;
    }
    let idx = stepIdxRef.current;
    // Erreichte Manöver überspringen (Index nur vorwärts).
    while (idx < steps.length - 1 && haversineDistance(position.lat, position.lng, steps[idx].lat, steps[idx].lng) < STEP_REACHED_M) {
      idx++;
    }
    stepIdxRef.current = idx;
    const step = steps[idx];
    const dist = haversineDistance(position.lat, position.lng, step.lat, step.lng);
    const final = idx === steps.length - 1;
    setNav({ instruction: step.instruction, distanceM: dist, final });

    if (dist <= ANNOUNCE_RANGE_M && announcedRef.current !== idx) {
      announcedRef.current = idx;
      speak(dist > 60 ? `In ${Math.round(dist / 10) * 10} Metern: ${step.instruction}` : step.instruction);
    }
  }, [activeRoute, position]);

  return (
    // `lockView` (HUD in der Aufzeichnung): Leaflet darf die Touch-Geste nicht
    // abfangen, sonst lässt sich nicht zur nächsten Pager-Seite wischen. Karte
    // folgt dann automatisch der eigenen Position (kein manuelles Verschieben).
    <div className={`relative isolate w-full overflow-hidden ${lockView ? 'leaflet-locked' : ''} ${className ?? ''}`}>
      <MapContainer
        ref={setMapInstance}
        center={position ? [position.lat, position.lng] : DEFAULT_CENTER}
        zoom={position ? 15 : 6}
        className="h-full w-full"
        zoomControl={false}
        dragging={!lockView}
        touchZoom={!lockView}
        scrollWheelZoom={!lockView}
        doubleClickZoom={!lockView}
        boxZoom={!lockView}
        keyboard={!lockView}
      >
        <TileLayer
          key={resolved}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={
            resolved === 'dark'
              ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
              : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
          }
          subdomains="abcd"
          maxZoom={20}
        />
        <BoundsWatcher />
        <FollowCamera position={position} follow={follow} setFollow={setFollow} />

        {position && (
          <Marker position={[position.lat, position.lng]} icon={selfMarkerIcon}>
            <Popup>Du bist hier</Popup>
          </Marker>
        )}

        {/* Aktive geführte Route */}
        {activeRoute && activeRoute.geometry.length > 1 && (
          <Polyline
            positions={activeRoute.geometry}
            pathOptions={{ color: ROUTE_COLOR, weight: 6, opacity: 0.8, lineCap: 'round', lineJoin: 'round' }}
          />
        )}

        {/* Blitzer-Zonen: hervorgehobener Straßenabschnitt + Tore an Ein-/Ausfahrt */}
        {zones.map((zone) => (
          <Fragment key={`zone-${zone.id}`}>
            {zone.path.length > 1 && (
              <Polyline
                positions={zone.path}
                pathOptions={{ color: ZONE_COLOR, weight: 9, opacity: 0.45, lineCap: 'round', lineJoin: 'round' }}
              />
            )}
            <Marker position={[zone.entryLat, zone.entryLng]} icon={zoneEntryIcon}>
              <Popup>
                <ZonePopup zoneId={zone.id} lengthM={zone.lengthM} />
              </Popup>
            </Marker>
            <Marker position={[zone.exitLat, zone.exitLng]} icon={zoneExitIcon}>
              <Popup>
                <ZonePopup zoneId={zone.id} lengthM={zone.lengthM} />
              </Popup>
            </Marker>
          </Fragment>
        ))}

        {cameras.map((cam) => (
          <Marker key={cam.id} position={[cam.lat, cam.lng]} icon={cameraIcon}>
            <Popup>
              <CameraPopup cameraId={cam.id} />
            </Popup>
          </Marker>
        ))}

        {Array.from(friendLocations.values()).map((f) => {
          const info = friends.get(f.userId);
          return (
            <Marker key={f.userId} position={[f.lat, f.lng]} icon={friendIcons.get(f.userId) ?? friendIcon}>
              <Popup>
                <FriendPopup name={info?.displayName ?? 'Freund'} userId={f.userId} speedKmh={f.speedKmh} hasProfile={!!info} />
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {!lockView && <FollowButton follow={follow} onToggle={() => setFollow((v) => !v)} />}

      {/* Im HUD ist Pinch/Drag deaktiviert (damit das Wischen funktioniert) →
          Zoom über Buttons ermöglichen. */}
      {lockView && (
        <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-2">
          {(['in', 'out'] as const).map((dir) => (
            <button
              key={dir}
              onClick={() => (dir === 'in' ? mapInstance?.zoomIn() : mapInstance?.zoomOut())}
              className="flex h-11 w-11 items-center justify-center rounded-full text-xl font-bold shadow-lg transition active:scale-95"
              style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)', color: 'var(--color-accent)' }}
              aria-label={dir === 'in' ? 'Vergrößern' : 'Verkleinern'}
            >
              {dir === 'in' ? '+' : '−'}
            </button>
          ))}
        </div>
      )}

      {position && position.speedKmh >= 1 && (
        <div className="map-hud">
          <span className="text-3xl font-bold tabular-nums leading-none">{position.speedKmh.toFixed(0)}</span>
          <span className="text-xs font-medium text-(--color-text-secondary)">km/h</span>
        </div>
      )}

      {/* Blitzer-Warnung voraus (oben links, kollidiert nicht mit den Toasts). */}
      {cameraAhead != null && !lastPass && (
        <div
          className="absolute left-3 top-3 z-[1000] flex items-center gap-2 rounded-full bg-(--color-bg-elevated) px-3 py-1.5 shadow-lg"
          style={{ border: '1px solid var(--color-danger)' }}
        >
          <Icon name="camera" size={16} className="text-(--color-danger)" />
          <span className="text-sm font-semibold tabular-nums">Blitzer in {fmtMeters(cameraAhead)}</span>
        </div>
      )}

      {/* Turn-by-turn-Anweisung der aktiven Route (oben Mitte). */}
      {nav && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] flex -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-2.5 text-white shadow-lg" style={{ background: ROUTE_COLOR }}>
          <Icon name={nav.final ? 'flag' : 'chevron-right'} size={26} />
          <div className="leading-tight">
            <p className="text-2xl font-bold tabular-nums">{nav.final && nav.distanceM < STEP_REACHED_M ? 'Ziel' : fmtMeters(nav.distanceM)}</p>
            <p className="text-sm font-medium">{nav.instruction}</p>
          </div>
        </div>
      )}

      {/* Live-Anzeige, während man sich in einer Blitzer-Zone befindet. */}
      {activeZoneProgress && (
        <div
          className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-2xl px-4 py-2.5 text-center text-white shadow-lg"
          style={{ background: ZONE_COLOR }}
        >
          <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Icon name="zap" size={14} /> Zone läuft
          </p>
          <p className="text-2xl font-bold tabular-nums leading-tight">⌀ {activeZoneProgress.avgSpeedKmh.toFixed(0)} km/h</p>
          <p className="flex items-center justify-center gap-2 text-xs">
            <span>noch {fmtMeters(activeZoneProgress.remainingM)}</span>
            <Stars count={activeZoneProgress.stars} />
          </p>
        </div>
      )}

      {lastPass && (
        <div
          className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-2xl bg-(--color-bg-elevated) px-4 py-3 text-center shadow-lg"
          style={{ border: '1px solid var(--color-border)' }}
        >
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
            <Icon name="camera" size={16} className="text-(--color-accent)" />
            Blitzer erfasst!
          </p>
          <p className="text-lg font-bold tabular-nums">{lastPass.speedKmh.toFixed(0)} km/h</p>
          <p className="flex items-center justify-center gap-1 text-sm">
            +{lastPass.points} Punkte <Stars count={lastPass.stars} />
          </p>
        </div>
      )}

      {lastZonePass && (
        <div
          className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-2xl bg-(--color-bg-elevated) px-4 py-3 text-center shadow-lg"
          style={{ border: `1px solid ${ZONE_COLOR}` }}
        >
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold" style={{ color: ZONE_COLOR }}>
            <Icon name="zap" size={16} />
            Zone geschafft!
          </p>
          <p className="text-lg font-bold tabular-nums">⌀ {lastZonePass.avgSpeedKmh.toFixed(0)} km/h</p>
          <p className="flex items-center justify-center gap-1 text-sm">
            +{lastZonePass.points} Punkte <Stars count={lastZonePass.stars} />
          </p>
        </div>
      )}
    </div>
  );
}
