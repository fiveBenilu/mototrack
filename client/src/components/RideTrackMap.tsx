import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../context/ThemeContext';
import { buildSpeedSegments, SPEED_COLOR_STOPS } from '../lib/geo';
import type { RideTrackPoint } from '../lib/types';

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) map.fitBounds(positions, { padding: [24, 24] });
  }, [positions, map]);
  return null;
}

/** Karte mit nach Geschwindigkeit eingefärbtem Streckenverlauf + Legende. */
export function RideTrackMap({ track }: { track: RideTrackPoint[] }) {
  const { resolved } = useTheme();
  const positions = track.map((p) => [p.lat, p.lng] as [number, number]);
  const segments = buildSpeedSegments(track);

  return (
    <>
      <div
        className="relative isolate h-[45vh] w-full overflow-hidden rounded-2xl"
        style={{ border: '1px solid var(--color-border)' }}
      >
        {positions.length > 1 ? (
          <MapContainer center={positions[0]} zoom={13} className="h-full w-full" zoomControl={false}>
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
            <FitBounds positions={positions} />
            {segments.map((seg, i) => (
              <Polyline
                key={i}
                positions={seg.positions}
                pathOptions={{ color: seg.color, weight: 4, lineCap: 'round', lineJoin: 'round' }}
              />
            ))}
          </MapContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-(--color-text-secondary)">
            Keine Routendaten für diese Fahrt vorhanden.
          </div>
        )}
      </div>

      {segments.length > 0 && (
        <section className="ios-card flex flex-wrap items-center gap-3 p-4">
          <span className="text-sm font-semibold">Geschwindigkeit</span>
          {SPEED_COLOR_STOPS.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-xs text-(--color-text-secondary)">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.label} km/h
            </span>
          ))}
        </section>
      )}
    </>
  );
}

/** Einheitliche Statistik-Kachel für Fahrt-Ansichten. */
export function RideStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="ios-card flex flex-col items-center justify-center gap-1 p-4 text-center">
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-(--color-text-secondary)">{label}</span>
    </div>
  );
}
