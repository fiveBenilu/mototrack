import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PageHeader } from '../components/PageHeader';
import { Icon, Stars } from '../components/Icon';
import { useRide } from '../context/RideContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../lib/api';
import type { Friend } from '../lib/types';

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

/** Begrenzt den Kartenausschnitt auf einen vom Server akzeptierten Bereich um die Mitte. */
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

// Blitzer-Marker: leuchtende rote Kamera
const CAMERA_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/></svg>';

// Eine einzige, stabile Icon-Instanz für alle Blitzer-Marker. Ein bei jedem
// Render neu erzeugtes Icon würde react-leaflet dazu bringen, das Marker-DOM
// neu aufzubauen – dabei „verliert“ ein offenes Popup seinen Anker und lässt
// sich nicht mehr schließen.
const cameraIcon = L.divIcon({
  className: '',
  html: `<div class="cam-marker">${CAMERA_SVG}</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const MOTORCYCLE_SVG =
  '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.4" cy="16.6" r="3.4"/><circle cx="18.6" cy="16.6" r="3.4"/><path d="M5.4 16.6 8.5 11h6.5l3.6 5.6"/><path d="M8.5 11 7 7.4H4.6"/><path d="M15 11l1.1-2.6h3.3"/><path d="M15.6 8.4h4.2"/><path d="M11 13.4h3.2"/></svg>';

// Fallback-Marker (Motorrad), falls zu einem Live-Standort (noch) keine
// Freundes-Infos geladen sind.
const friendIcon = L.divIcon({
  className: '',
  html: `<div class="friend-marker">${MOTORCYCLE_SVG}</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// Marker mit Avatar (Bild oder Initiale) für einen identifizierten Freund.
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

// Eigener Standort: Heading-Pfeil mit pulsierendem Glow (Forza-Stil)
const NAV_ARROW_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="#0a84ff" stroke="white" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2 L19 21 L12 16.5 L5 21 Z"/></svg>';

const selfIcon = (heading: number | null) =>
  L.divIcon({
    className: '',
    html: `<div class="self-marker"><div class="self-marker__pulse"></div><div class="self-marker__arrow" style="transform:rotate(${heading ?? 0}deg)">${NAV_ARROW_SVG}</div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

function BoundsWatcher() {
  const { fetchCamerasForBounds } = useRide();
  const timersRef = useRef<number[]>([]);

  const refresh = (map: L.Map) => {
    const b = map.getBounds();
    const bounds = clampBounds({
      minLat: b.getSouth(),
      minLng: b.getWest(),
      maxLat: b.getNorth(),
      maxLng: b.getEast(),
    });
    // Sofort vorhandene Blitzer laden …
    fetchCamerasForBounds(bounds);
    // … und kurz danach erneut, um serverseitig im Hintergrund (Overpass)
    // neu generierte Blitzer einzusammeln.
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [
      window.setTimeout(() => fetchCamerasForBounds(bounds), 3000),
      window.setTimeout(() => fetchCamerasForBounds(bounds), 8000),
    ];
  };

  const map = useMapEvents({
    moveend: () => refresh(map),
  });

  useEffect(() => {
    refresh(map);
    return () => timersRef.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/**
 * Folge-Kamera im Forza-Stil: zentriert die Karte beim ersten Fix und folgt
 * danach – solange `follow` aktiv ist – sanft der eigenen Position. Sobald der
 * Nutzer die Karte selbst verschiebt, wird `follow` deaktiviert.
 */
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

export function MapPage() {
  const { cameras, friendLocations, myLocation, lastPass, dismissLastPass } = useRide();
  const { resolved } = useTheme();
  const [follow, setFollow] = useState(true);
  const [friends, setFriends] = useState<Map<number, Friend>>(new Map());

  // Eigener Standort kommt zentral aus dem RideContext (eine einzige GPS-Quelle,
  // die zugleich den Live-Standort an Freunde sendet).
  const position = myLocation;

  // Freundes-Infos (Name/Avatar) laden, um Live-Marker zu beschriften.
  useEffect(() => {
    api
      .get<{ friends: Friend[] }>('/friends')
      .then((d) => setFriends(new Map(d.friends.map((f) => [f.id, f]))))
      .catch(() => {});
  }, []);

  // Avatar-Icons pro Freund stabil halten (nur neu bauen, wenn sich die Liste ändert) –
  // verhindert Marker-/Popup-Flackern bei Positions-Updates.
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

  // Eigenes Icon nur neu erzeugen, wenn sich die Blickrichtung (gerundet) ändert –
  // sonst würde der Marker bei jedem GPS-Tick neu aufgebaut.
  const heading = position?.heading ?? null;
  const selfMarkerIcon = useMemo(() => selfIcon(heading), [heading == null ? null : Math.round(heading)]);

  return (
    <div className="pb-24">
      <PageHeader title="Karte" subtitle="Blitzer & Freunde live" />
      <div className="relative isolate h-[calc(100vh-180px)] w-full overflow-hidden">
        <MapContainer
          center={position ? [position.lat, position.lng] : DEFAULT_CENTER}
          zoom={position ? 15 : 6}
          className="h-full w-full"
          zoomControl={false}
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

        <FollowButton follow={follow} onToggle={() => setFollow((v) => !v)} />

        {/* Speed-HUD im Forza-Stil */}
        {position && position.speedKmh >= 1 && (
          <div className="map-hud">
            <span className="text-3xl font-bold tabular-nums leading-none">{position.speedKmh.toFixed(0)}</span>
            <span className="text-xs font-medium text-(--color-text-secondary)">km/h</span>
          </div>
        )}

        {lastPass && (
          <div className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-2xl bg-(--color-bg-elevated) px-4 py-3 text-center shadow-lg" style={{ border: '1px solid var(--color-border)' }}>
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
      </div>
    </div>
  );
}
