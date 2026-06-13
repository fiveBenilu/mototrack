import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useRide } from '../context/RideContext';
import { api } from '../lib/api';
import { haversineDistance } from '../lib/geo';
import type { Friend } from '../lib/types';

// Ab dieser Entfernung gilt ein Mitfahrer als „fällt zurück".
const FALLBACK_WARN_M = 600;
// Live-Standort älter als das → als veraltet markieren (Verbindung weg/Tunnel).
const STALE_MS = 30_000;

function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

/**
 * Konvoi-Übersicht für Gruppenausfahrten: zeigt alle Freunde, die ihren Standort
 * gerade live teilen, mit Entfernung zu dir, Tempo und einer Warnung, wenn jemand
 * zurückfällt oder die Verbindung abreißt. Daten kommen live aus dem RideContext.
 */
export function ConvoyPanel() {
  const { friendLocations, myLocation } = useRide();
  const [friends, setFriends] = useState<Map<number, Friend>>(new Map());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api
      .get<{ friends: Friend[] }>('/friends')
      .then((d) => setFriends(new Map(d.friends.map((f) => [f.id, f]))))
      .catch(() => {});
  }, []);

  // Tickt, damit „veraltet"-Status und Entfernungen aktuell bleiben.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);

  const riders = useMemo(() => {
    return Array.from(friendLocations.values())
      .map((loc) => {
        const info = friends.get(loc.userId);
        const distance =
          myLocation != null ? haversineDistance(myLocation.lat, myLocation.lng, loc.lat, loc.lng) : null;
        return {
          userId: loc.userId,
          name: info?.displayName ?? 'Freund',
          avatarPath: info?.avatarPath ?? null,
          speedKmh: loc.speedKmh,
          distance,
          stale: now - loc.ts > STALE_MS,
        };
      })
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }, [friendLocations, friends, myLocation, now]);

  return (
    <div className="flex h-full flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Icon name="users" size={22} className="text-(--color-accent)" /> Konvoi
        </h2>
        <span className="text-sm text-(--color-text-secondary)">{riders.length} live</span>
      </div>

      {riders.length === 0 ? (
        <div className="ios-card flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <Icon name="users" size={28} className="text-(--color-text-secondary)" />
          <p className="text-sm text-(--color-text-secondary)">
            Gerade teilt niemand seinen Standort. Sobald Freunde fahren und ihren Standort freigeben, erscheinen sie hier.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {riders.map((r) => {
            const fallingBehind = r.distance != null && r.distance > FALLBACK_WARN_M && !r.stale;
            return (
              <li
                key={r.userId}
                className="ios-card flex items-center gap-3 p-3"
                style={fallingBehind ? { borderColor: 'var(--color-warning)' } : undefined}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-(--color-accent) text-sm font-bold text-white">
                  {r.avatarPath ? (
                    <img src={r.avatarPath} alt="" className="h-full w-full object-cover" />
                  ) : (
                    r.name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="text-xs text-(--color-text-secondary)">
                    {r.stale ? 'Verbindung verloren…' : `${r.speedKmh.toFixed(0)} km/h`}
                  </p>
                </div>
                <div className="text-right">
                  {r.distance != null && (
                    <p className={`font-mono text-sm font-semibold ${fallingBehind ? 'text-(--color-warning)' : ''}`}>
                      {fmtDistance(r.distance)}
                    </p>
                  )}
                  {fallingBehind && (
                    <p className="flex items-center justify-end gap-1 text-xs text-(--color-warning)">
                      <Icon name="alert" size={12} /> fällt zurück
                    </p>
                  )}
                  {r.stale && <p className="text-xs text-(--color-text-secondary)">veraltet</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
