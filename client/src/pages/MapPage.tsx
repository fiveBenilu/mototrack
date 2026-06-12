import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PageHeader } from '../components/PageHeader';
import { Icon, Stars } from '../components/Icon';
import { useRide } from '../context/RideContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../lib/api';

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515]; // Mitte Deutschland

// Muss unter dem Server-Limit MAX_BOUNDS_SPAN (0.5°) bleiben, sonst antwortet
// der Server mit 400 und es werden keine Blitzer geladen.
const MAX_FETCH_SPAN = 0.45;

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

// Blitzer-Marker: rote Kamera, kein Tempolimit
const CAMERA_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/></svg>';

const cameraIcon = () =>
  L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#ff3b30;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)">${CAMERA_SVG}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

const MOTORCYCLE_SVG =
  '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.4" cy="16.6" r="3.4"/><circle cx="18.6" cy="16.6" r="3.4"/><path d="M5.4 16.6 8.5 11h6.5l3.6 5.6"/><path d="M8.5 11 7 7.4H4.6"/><path d="M15 11l1.1-2.6h3.3"/><path d="M15.6 8.4h4.2"/><path d="M11 13.4h3.2"/></svg>';

const friendIcon = () =>
  L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#0a84ff;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${MOTORCYCLE_SVG}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

const selfIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#34c759;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
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

/** Bewegt die Karte einmalig zur GPS-Position, sobald diese verfügbar ist. */
function FlyToPosition({ position }: { position: [number, number] | null }) {
  const map = useMap();
  const flownRef = useRef(false);

  useEffect(() => {
    if (position && !flownRef.current) {
      flownRef.current = true;
      map.setView(position, 14);
    }
  }, [position, map]);

  return null;
}

function RecenterButton({ position }: { position: [number, number] | null }) {
  const map = useMap();
  if (!position) return null;
  return (
    <button
      onClick={() => map.setView(position, 14)}
      className="absolute bottom-4 right-4 z-[1000] flex h-11 w-11 items-center justify-center rounded-full bg-(--color-bg-elevated) text-(--color-accent) shadow-lg"
      style={{ border: '1px solid var(--color-border)' }}
      aria-label="Auf meinen Standort zentrieren"
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

export function MapPage() {
  const { cameras, friendLocations, lastPass, dismissLastPass } = useRide();
  const { resolved } = useTheme();
  const [position, setPosition] = useState<[number, number] | null>(null);

  // Live-Standort verfolgen: eigener Marker bewegt sich mit, Karte lädt Blitzer der Umgebung
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!lastPass) return;
    const timer = setTimeout(dismissLastPass, 5000);
    return () => clearTimeout(timer);
  }, [lastPass, dismissLastPass]);

  return (
    <div className="pb-24">
      <PageHeader title="Karte" subtitle="Blitzer & Freunde live" />
      <div className="relative h-[calc(100vh-180px)] w-full overflow-hidden">
        <MapContainer center={position ?? DEFAULT_CENTER} zoom={position ? 14 : 6} className="h-full w-full" zoomControl={false}>
          <TileLayer
            key={resolved}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url={
              resolved === 'dark'
                ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png'
            }
            subdomains="abcd"
            maxZoom={20}
          />
          <BoundsWatcher />
          <FlyToPosition position={position} />
          <RecenterButton position={position} />

          {position && (
            <Marker position={position} icon={selfIcon}>
              <Popup>Du bist hier</Popup>
            </Marker>
          )}

          {cameras.map((cam) => (
            <Marker key={cam.id} position={[cam.lat, cam.lng]} icon={cameraIcon()}>
              <Popup>
                <CameraPopup cameraId={cam.id} />
              </Popup>
            </Marker>
          ))}

          {Array.from(friendLocations.values()).map((f) => (
            <Marker key={f.userId} position={[f.lat, f.lng]} icon={friendIcon()}>
              <Popup>
                {f.speedKmh.toFixed(0)} km/h
              </Popup>
            </Marker>
          ))}
        </MapContainer>

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
