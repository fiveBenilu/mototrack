import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatDistance, formatDuration } from '../lib/geo';
import type { Ride, Friend } from '../lib/types';

export function Home() {
  const { user } = useAuth();
  const [lastRide, setLastRide] = useState<Ride | null>(null);
  const [onlineFriends, setOnlineFriends] = useState<Friend[]>([]);

  useEffect(() => {
    api
      .get<{ rides: Ride[] }>('/rides')
      .then((data) => setLastRide(data.rides[0] ?? null))
      .catch(() => setLastRide(null));

    api
      .get<{ friends: Friend[] }>('/friends')
      .then((data) => setOnlineFriends(data.friends.filter((f) => f.online)))
      .catch(() => setOnlineFriends([]));
  }, []);

  return (
    <div className="pb-24">
      <PageHeader title={`Hey, ${user?.displayName ?? ''}`} subtitle="Bereit für die nächste Tour?" />
      <div className="flex flex-col gap-4 p-5">
        <Link
          to="/fahren"
          className="ios-card flex items-center justify-between bg-(--color-accent) p-5 text-white shadow-lg"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), #5e9cff)' }}
        >
          <div>
            <p className="text-sm font-medium opacity-90">Neue Aufzeichnung</p>
            <p className="text-xl font-bold">Jetzt losfahren</p>
          </div>
          <Icon name="motorcycle" size={36} strokeWidth={1.6} />
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Link to="/karte" className="ios-card flex flex-col gap-1 p-4">
            <Icon name="map" size={26} className="text-(--color-accent)" />
            <span className="font-semibold">Karte</span>
            <span className="text-xs text-(--color-text-secondary)">Blitzer & Freunde live</span>
          </Link>
          <Link to="/statistik" className="ios-card flex flex-col gap-1 p-4">
            <Icon name="chart" size={26} className="text-(--color-accent)" />
            <span className="font-semibold">Statistik</span>
            <span className="text-xs text-(--color-text-secondary)">Deine Bestwerte</span>
          </Link>
        </div>

        <Link to="/freunde" className="ios-card p-4">
          <h2 className="mb-3 text-base font-semibold">Freunde online</h2>
          {onlineFriends.length === 0 ? (
            <p className="text-sm text-(--color-text-secondary)">
              Noch keine Freunde online. Füge Freunde über deinen Code hinzu.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {onlineFriends.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-sm">
                  <div className="relative">
                    {f.avatarPath ? (
                      <img src={f.avatarPath} alt={f.displayName} className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-(--color-accent) text-xs font-bold text-white">
                        {f.displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-(--color-card) bg-(--color-success)" />
                  </div>
                  <span className="font-semibold">{f.displayName}</span>
                </div>
              ))}
            </div>
          )}
        </Link>

        <section className="ios-card p-4">
          <h2 className="mb-3 text-base font-semibold">Letzte Fahrt</h2>
          {lastRide ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-(--color-text-secondary)">Distanz</p>
                <p className="text-lg font-bold">{formatDistance(lastRide.distanceM)}</p>
              </div>
              <div>
                <p className="text-(--color-text-secondary)">Dauer</p>
                <p className="text-lg font-bold">{formatDuration(lastRide.durationS)}</p>
              </div>
              <div>
                <p className="text-(--color-text-secondary)">Max. Speed</p>
                <p className="text-lg font-bold">{lastRide.maxSpeedKmh.toFixed(0)} km/h</p>
              </div>
              <div>
                <p className="text-(--color-text-secondary)">Max. Schräglage</p>
                <p className="text-lg font-bold">{Math.max(lastRide.maxLeanLeft, lastRide.maxLeanRight).toFixed(0)}°</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-(--color-text-secondary)">Noch keine Fahrten aufgezeichnet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
