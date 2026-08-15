import { useEffect, useMemo, useState } from 'react';
import { Icon, Stars } from './Icon';
import { useRide } from '../context/RideContext';
import { api } from '../lib/api';
import { haversineDistance, bearingDeg, angleDiff, formatDistance } from '../lib/geo';
import type { Friend } from '../lib/types';

// Ab dieser Entfernung gilt ein Mitfahrer als „fällt zurück".
const FALLBACK_WARN_M = 600;
// Live-Standort älter als das → als veraltet markieren (Verbindung weg/Tunnel).
const STALE_MS = 30_000;
// Innerhalb dieses Winkels zur eigenen Fahrtrichtung liegt jemand „voraus".
const AHEAD_CONE_DEG = 90;
// Schräglage, ab der die Anzeige rot wird (der macht gerade ernst).
const HOT_LEAN_DEG = 35;

function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

function fmtAge(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `vor ${s}s` : `vor ${Math.round(s / 60)} min`;
}

/**
 * Konvoi-Übersicht für Gruppenausfahrten: wer ist voraus, wer hängt hinten, wie
 * schnell und wie schräg fährt gerade wer – plus ein Live-Ticker der Blitzer- und
 * Zonen-Erfolge der anderen. Alles kommt aus dem WebSocket im RideContext.
 */
export function ConvoyPanel() {
  const { friendLocations, myLocation, friendEvents } = useRide();
  const [friends, setFriends] = useState<Map<number, Friend>>(new Map());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api
      .get<{ friends: Friend[] }>('/friends')
      .then((d) => setFriends(new Map(d.friends.map((f) => [f.id, f]))))
      .catch(() => {});
  }, []);

  // Tickt, damit „veraltet"-Status, Alter der Events und Entfernungen aktuell bleiben.
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
        // Voraus oder hinter mir? Nur sinnvoll, wenn der eigene Kurs bekannt ist
        // (GPS liefert `heading` erst ab ein paar km/h).
        let ahead: boolean | null = null;
        if (myLocation?.heading != null && distance != null && distance > 30) {
          const bearing = bearingDeg(myLocation.lat, myLocation.lng, loc.lat, loc.lng);
          ahead = angleDiff(bearing, myLocation.heading) <= AHEAD_CONE_DEG;
        }
        return {
          userId: loc.userId,
          name: info?.nickname || info?.displayName || 'Freund',
          avatarPath: info?.avatarPath ?? null,
          speedKmh: loc.speedKmh,
          leanDeg: loc.leanDeg ?? 0,
          rideDistanceM: loc.distanceM ?? 0,
          maxSpeedKmh: loc.maxSpeedKmh ?? 0,
          recording: loc.recording === true,
          distance,
          ahead,
          stale: now - loc.ts > STALE_MS,
          age: now - loc.ts,
        };
      })
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }, [friendLocations, friends, myLocation, now]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Icon name="users" size={22} className="text-(--color-accent)" /> Konvoi
        </h2>
        <span className="text-sm text-(--color-text-secondary)">{riders.length} live</span>
      </div>

      {riders.length === 0 ? (
        <div className="ios-card flex flex-col items-center justify-center gap-2 p-6 text-center">
          <Icon name="users" size={28} className="text-(--color-text-secondary)" />
          <p className="text-sm text-(--color-text-secondary)">
            Gerade teilt niemand seinen Standort. Sobald Freunde fahren und ihren Standort freigeben, erscheinen sie hier.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {riders.map((r) => {
            const fallingBehind = r.distance != null && r.distance > FALLBACK_WARN_M && !r.stale;
            const hotLean = Math.abs(r.leanDeg) >= HOT_LEAN_DEG;
            return (
              <li
                key={r.userId}
                className="ios-card flex flex-col gap-2 p-3"
                style={fallingBehind ? { borderColor: 'var(--color-warning)' } : undefined}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-(--color-accent) text-sm font-bold text-white">
                      {r.avatarPath ? (
                        <img src={r.avatarPath} alt="" className="h-full w-full object-cover" />
                      ) : (
                        r.name.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    {/* Roter Punkt: zeichnet gerade eine Fahrt auf (nicht nur online). */}
                    {r.recording && !r.stale && (
                      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-(--color-card) bg-(--color-danger)" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="flex items-center gap-1 text-xs text-(--color-text-secondary)">
                      {r.stale ? (
                        <>Verbindung weg · {fmtAge(r.age)}</>
                      ) : r.ahead === null ? (
                        <>{r.speedKmh.toFixed(0)} km/h</>
                      ) : (
                        <>
                          {/* ponytail: vorhandenes Chevron gedreht statt zwei neuer Icons. */}
                          <Icon
                            name="chevron-right"
                            size={12}
                            style={{ transform: r.ahead ? 'rotate(-90deg)' : 'rotate(90deg)' }}
                          />
                          {r.ahead ? 'voraus' : 'zurück'} · {r.speedKmh.toFixed(0)} km/h
                        </>
                      )}
                    </p>
                  </div>

                  <div className="text-right">
                    {r.distance != null && (
                      <p
                        className={`font-mono text-sm font-semibold ${fallingBehind ? 'text-(--color-warning)' : ''} ${r.stale ? 'opacity-50' : ''}`}
                      >
                        {fmtDistance(r.distance)}
                      </p>
                    )}
                    {fallingBehind && (
                      <p className="flex items-center justify-end gap-1 text-xs text-(--color-warning)">
                        <Icon name="alert" size={12} /> fällt zurück
                      </p>
                    )}
                  </div>
                </div>

                {/* Live-Telemetrie – nur während einer laufenden Aufzeichnung sinnvoll. */}
                {r.recording && !r.stale && (
                  <div className="flex items-center justify-between gap-2 border-t border-(--color-border) pt-2 text-xs">
                    <Telemetry
                      icon="lean-right"
                      value={`${Math.abs(r.leanDeg).toFixed(0)}°`}
                      color={hotLean ? 'var(--color-danger)' : undefined}
                    />
                    <Telemetry icon="ruler" value={formatDistance(r.rideDistanceM)} />
                    <Telemetry icon="gauge" value={`${r.maxSpeedKmh.toFixed(0)} km/h`} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Live-Ticker: was die anderen gerade abgeräumt haben. */}
      {friendEvents.length > 0 && (
        <>
          <h3 className="mt-1 flex items-center gap-2 text-sm font-semibold text-(--color-text-secondary)">
            <Icon name="zap" size={16} /> Live-Ticker
          </h3>
          <ul className="flex flex-col gap-1.5">
            {friendEvents.map((e) => (
              <li key={e.id} className="ios-card flex items-center gap-2 p-2.5 text-sm">
                <Icon
                  name={e.kind === 'zone' ? 'zap' : 'camera'}
                  size={16}
                  className="shrink-0"
                  style={{ color: e.kind === 'zone' ? '#a855f7' : 'var(--color-danger)' }}
                />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold">{e.name}</span>{' '}
                  {e.kind === 'zone' ? 'Zone mit ⌀' : 'geblitzt mit'}{' '}
                  <span className="font-mono font-semibold">{e.speedKmh.toFixed(0)}</span> km/h
                </span>
                <Stars count={e.stars} />
                <span className="shrink-0 text-xs text-(--color-text-secondary)">{fmtAge(now - e.ts)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Telemetry({ icon, value, color }: { icon: 'lean-right' | 'ruler' | 'gauge'; value: string; color?: string }) {
  return (
    <span className="flex items-center gap-1.5" style={color ? { color } : undefined}>
      <Icon name={icon} size={14} className={color ? undefined : 'text-(--color-text-secondary)'} />
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </span>
  );
}
