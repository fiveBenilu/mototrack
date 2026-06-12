import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { PageHeader } from '../components/PageHeader';
import { useTheme } from '../context/ThemeContext';
import { api } from '../lib/api';
import { formatDistance, formatDuration, buildSpeedSegments, SPEED_COLOR_STOPS } from '../lib/geo';
import type { Ride } from '../lib/types';

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(positions, { padding: [24, 24] });
    }
  }, [positions, map]);
  return null;
}

export function RideDetail() {
  const { id } = useParams();
  const { resolved } = useTheme();
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<{ ride: Ride }>(`/rides/${id}`)
      .then((data) => setRide(data.ride))
      .catch(() => setError(true));
  }, [id]);

  const track = ride?.track ?? [];
  const positions = track.map((p) => [p.lat, p.lng] as [number, number]);
  const segments = buildSpeedSegments(track);

  return (
    <div className="pb-24">
      <PageHeader
        title="Fahrt"
        subtitle={ride ? new Date(ride.startedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : undefined}
        backTo="/statistik"
      />

      {error && (
        <p className="p-5 text-sm text-(--color-text-secondary)">Fahrt konnte nicht geladen werden.</p>
      )}

      {ride && (
        <div className="flex flex-col gap-4 p-5">
          <div className="relative h-[45vh] w-full overflow-hidden rounded-2xl" style={{ border: '1px solid var(--color-border)' }}>
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
                  <Polyline key={i} positions={seg.positions} pathOptions={{ color: seg.color, weight: 4, lineCap: 'round', lineJoin: 'round' }} />
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

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Distanz" value={formatDistance(ride.distanceM)} />
            <StatCard label="Dauer" value={formatDuration(ride.durationS)} />
            <StatCard label="Max. Speed" value={`${ride.maxSpeedKmh.toFixed(0)} km/h`} />
            <StatCard label="Ø Speed" value={`${ride.avgSpeedKmh.toFixed(0)} km/h`} />
            <StatCard label="Schräglage links" value={`${ride.maxLeanLeft.toFixed(0)}°`} />
            <StatCard label="Schräglage rechts" value={`${ride.maxLeanRight.toFixed(0)}°`} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="ios-card flex flex-col items-center justify-center gap-1 p-4 text-center">
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-(--color-text-secondary)">{label}</span>
    </div>
  );
}
