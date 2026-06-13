import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { RideTrackMap, RideStatCard } from '../components/RideTrackMap';
import { api } from '../lib/api';
import { formatDistance, formatDuration } from '../lib/geo';
import type { SharedRide } from '../lib/types';

// Öffentliche, read-only Ansicht einer geteilten Fahrt – ohne Anmeldung erreichbar.
export function PublicRide() {
  const { token } = useParams();
  const [ride, setRide] = useState<SharedRide | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<{ ride: SharedRide }>(`/public/rides/${token}`)
      .then((data) => setRide(data.ride))
      .catch(() => setError(true));
  }, [token]);

  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-12">
      <header className="flex items-center justify-between p-5">
        <span className="flex items-center gap-2 text-lg font-bold">
          <Icon name="motorcycle" size={26} strokeWidth={1.8} /> MotoTrack
        </span>
        <Link to="/" className="text-sm font-medium text-(--color-accent)">
          App öffnen
        </Link>
      </header>

      {error && (
        <p className="p-5 text-sm text-(--color-text-secondary)">
          Diese Fahrt ist nicht (mehr) öffentlich verfügbar.
        </p>
      )}

      {ride && (
        <div className="flex flex-col gap-4 p-5 pt-0">
          <div>
            <h1 className="text-xl font-bold">Fahrt von {ride.riderName}</h1>
            <p className="text-sm text-(--color-text-secondary)">
              {new Date(ride.startedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>

          <RideTrackMap track={ride.track} />

          <div className="grid grid-cols-2 gap-3">
            <RideStatCard label="Distanz" value={formatDistance(ride.distanceM)} />
            <RideStatCard label="Dauer" value={formatDuration(ride.durationS)} />
            <RideStatCard label="Max. Speed" value={`${ride.maxSpeedKmh.toFixed(0)} km/h`} />
            <RideStatCard label="Ø Speed" value={`${ride.avgSpeedKmh.toFixed(0)} km/h`} />
            <RideStatCard label="Schräglage links" value={`${ride.maxLeanLeft.toFixed(0)}°`} />
            <RideStatCard label="Schräglage rechts" value={`${ride.maxLeanRight.toFixed(0)}°`} />
          </div>
        </div>
      )}
    </div>
  );
}
