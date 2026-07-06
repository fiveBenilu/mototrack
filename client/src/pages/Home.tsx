import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatDistance, formatDuration } from '../lib/geo';
import type { Ride, Friend, StatsTotals, FriendStats, RideTrackPoint } from '../lib/types';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Noch wach';
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Letzte 7 Tage als Tages-Buckets (Distanz pro Tag) für das Aktivitäts-Diagramm.
function buildWeek(rides: Ride[]) {
  const today = startOfDay(Date.now());
  const days = Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY_MS);
  const recent = rides.filter((r) => r.startedAt >= today - 6 * DAY_MS);
  const perDay = days.map((d) => ({
    label: WEEKDAYS[new Date(d).getDay()],
    distanceM: recent.filter((r) => startOfDay(r.startedAt) === d).reduce((s, r) => s + r.distanceM, 0),
  }));
  return {
    perDay,
    distanceM: recent.reduce((s, r) => s + r.distanceM, 0),
    durationS: recent.reduce((s, r) => s + r.durationS, 0),
    rides: recent.length,
  };
}

export function Home() {
  const { user } = useAuth();
  const [rides, setRides] = useState<Ride[]>([]);
  const [totals, setTotals] = useState<StatsTotals | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [leaderboard, setLeaderboard] = useState<FriendStats[]>([]);

  useEffect(() => {
    api.get<{ rides: Ride[] }>('/rides').then((d) => setRides(d.rides)).catch(() => {});
    api.get<{ totals: StatsTotals }>('/stats/me').then((d) => setTotals(d.totals)).catch(() => {});
    api.get<{ friends: Friend[] }>('/friends').then((d) => setFriends(d.friends)).catch(() => {});
    api.get<{ friends: FriendStats[] }>('/stats/friends').then((d) => setLeaderboard(d.friends)).catch(() => {});
  }, []);

  const lastRide = rides[0] ?? null;
  const week = useMemo(() => buildWeek(rides), [rides]);
  const onlineFriends = friends.filter((f) => f.online);

  // Bestenliste inkl. eigener Person, nach Distanz – Top 3.
  const ranked = useMemo(() => {
    const mine: FriendStats = {
      id: user?.id ?? -1,
      displayName: user?.displayName ?? 'Du',
      avatarPath: user?.avatarPath ?? null,
      distanceM: totals?.distanceM ?? 0,
      maxSpeedKmh: totals?.maxSpeedKmh ?? 0,
      maxLean: Math.max(totals?.maxLeanLeft ?? 0, totals?.maxLeanRight ?? 0),
      points: totals?.points ?? 0,
    };
    return [mine, ...leaderboard].sort((a, b) => b.distanceM - a.distanceM).slice(0, 3);
  }, [leaderboard, totals, user]);

  return (
    <div className="pb-28">
      {/* Hero */}
      <header className="safe-top px-5 pb-2 pt-5">
        <p className="text-sm font-medium text-(--color-text-secondary)">{greeting()},</p>
        <h1 className="text-3xl font-bold tracking-tight">{user?.displayName ?? 'Fahrer'} 🏍️</h1>
      </header>

      <div className="flex flex-col gap-4 p-5 pt-3">
        {/* Primärer CTA */}
        <Link
          to="/fahren"
          className="relative overflow-hidden rounded-3xl p-6 text-white shadow-lg transition active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))' }}
        >
          <div className="relative z-10">
            <p className="text-sm font-medium opacity-90">Bereit für die nächste Tour?</p>
            <p className="mt-1 text-2xl font-bold">Jetzt losfahren</p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-sm font-semibold backdrop-blur">
              <Icon name="play" size={14} /> Aufzeichnung starten
            </span>
          </div>
          <Icon
            name="motorcycle"
            size={150}
            strokeWidth={1.2}
            className="pointer-events-none absolute -bottom-8 -right-6 opacity-20"
          />
        </Link>

        {/* Diese Woche */}
        <section className="ios-card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Diese Woche</h2>
            <span className="text-xs text-(--color-text-secondary)">letzte 7 Tage</span>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <MiniStat label="Fahrten" value={String(week.rides)} />
            <MiniStat label="Distanz" value={formatDistance(week.distanceM)} />
            <MiniStat label="Zeit" value={formatDuration(week.durationS)} />
          </div>
          <WeekBars data={week.perDay} />
        </section>

        {/* Letzte Fahrt */}
        <section className="ios-card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="text-base font-semibold">Letzte Fahrt</h2>
            {lastRide && (
              <Link to={`/fahrten/${lastRide.id}`} className="text-xs font-semibold text-(--color-accent)">
                Details
              </Link>
            )}
          </div>
          {lastRide ? (
            <Link to={`/fahrten/${lastRide.id}`} className="block">
              <RoutePreview track={lastRide.track} />
              <div className="grid grid-cols-4 gap-2 px-5 pb-4 pt-1 text-center">
                <RideStat label="km" value={formatDistance(lastRide.distanceM)} />
                <RideStat label="Dauer" value={formatDuration(lastRide.durationS)} />
                <RideStat label="Top" value={`${lastRide.maxSpeedKmh.toFixed(0)}`} unit="km/h" />
                <RideStat
                  label="Schräglage"
                  value={`${Math.max(lastRide.maxLeanLeft, lastRide.maxLeanRight).toFixed(0)}°`}
                />
              </div>
            </Link>
          ) : (
            <p className="px-5 pb-5 pt-2 text-sm text-(--color-text-secondary)">
              Noch keine Fahrten – starte deine erste Aufzeichnung!
            </p>
          )}
        </section>

        {/* Lifetime-Statistik */}
        <section className="ios-card p-5">
          <h2 className="mb-3 text-base font-semibold">Insgesamt</h2>
          <div className="grid grid-cols-2 gap-3">
            <BigStat icon="ruler" label="Gefahren" value={formatDistance(totals?.distanceM ?? 0)} />
            <BigStat icon="motorcycle" label="Fahrten" value={String(totals?.rides ?? 0)} />
            <BigStat icon="clock" label="Zeit im Sattel" value={formatDuration(totals?.durationS ?? 0)} />
            <BigStat icon="zap" label="Punkte" value={String(totals?.points ?? 0)} />
          </div>
        </section>

        {/* Freunde online */}
        {onlineFriends.length > 0 && (
          <section className="ios-card p-5">
            <h2 className="mb-3 text-base font-semibold">
              Online <span className="text-(--color-success)">·</span> {onlineFriends.length}
            </h2>
            <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-1">
              {onlineFriends.map((f) => (
                <Link key={f.id} to={`/freunde/${f.id}`} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                  <div className="relative">
                    <AvatarRing src={f.avatarPath} name={f.displayName} />
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-(--color-card) bg-(--color-success)" />
                  </div>
                  <span className="w-full truncate text-center text-xs font-medium">{f.nickname || f.displayName}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Bestenliste */}
        {ranked.length > 1 && (
          <Link to="/statistik" className="ios-card block p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Bestenliste · Distanz</h2>
              <Icon name="trophy" size={18} className="text-(--color-warning)" />
            </div>
            <div className="flex flex-col gap-2.5">
              {ranked.map((r, i) => {
                const isMe = r.id === user?.id;
                return (
                  <div key={r.id} className="flex items-center gap-3">
                    <span className="w-5 text-center text-sm font-bold text-(--color-text-secondary)">
                      {['🥇', '🥈', '🥉'][i] ?? i + 1}
                    </span>
                    <AvatarRing src={r.avatarPath} name={r.displayName} small />
                    <span className={`flex-1 truncate text-sm ${isMe ? 'font-bold' : 'font-medium'}`}>
                      {r.displayName}
                      {isMe && <span className="ml-1 text-xs text-(--color-accent)">(Du)</span>}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{formatDistance(r.distanceM)}</span>
                  </div>
                );
              })}
            </div>
          </Link>
        )}

        {/* Schnellzugriff */}
        <div className="grid grid-cols-2 gap-3">
          <QuickTile to="/statistik" icon="chart" label="Statistik" hint="Bestwerte & Verlauf" />
          <QuickTile to="/freunde" icon="users" label="Freunde" hint="Anfragen & Profile" />
          <QuickTile to="/gruppen" icon="users" label="Gruppen" hint="Gemeinsam fahren" />
          <QuickTile to="/routen" icon="flag" label="Routen" hint="Touren planen" />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-(--color-bg) py-2.5 text-center">
      <p className="text-base font-bold leading-tight">{value}</p>
      <p className="text-[11px] text-(--color-text-secondary)">{label}</p>
    </div>
  );
}

// 7-Tage-Balkendiagramm der Tagesdistanz (reines CSS, keine Lib).
// Balkenhöhen in Pixeln statt Prozent – Prozent-Höhen in verschachtelten
// Flex-Items lösen nicht zuverlässig auf (Balken blieben unsichtbar).
const CHART_H = 80;
function WeekBars({ data }: { data: { label: string; distanceM: number }[] }) {
  const max = Math.max(...data.map((d) => d.distanceM), 1);
  const todayIdx = data.length - 1;
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: CHART_H }}>
        {data.map((d, i) => (
          <div
            key={i}
            className={`flex-1 rounded-md transition-all ${i === todayIdx ? 'bg-(--color-accent)' : 'bg-(--color-accent)/35'}`}
            style={{ height: d.distanceM > 0 ? Math.max((d.distanceM / max) * CHART_H, 6) : 3 }}
            title={formatDistance(d.distanceM)}
          />
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[10px] text-(--color-text-secondary)">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Leichtgewichtige Streckenvorschau: GPS-Track als normalisierte SVG-Linie
// (kein Leaflet auf der Startseite). Längengrad wird per cos(lat) entzerrt.
function RoutePreview({ track }: { track: RideTrackPoint[] }) {
  const path = useMemo(() => {
    const pts = track.filter((_, i) => i % 2 === 0); // jeder 2. Punkt reicht für die Vorschau
    if (pts.length < 2) return null;
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const w = (maxLng - minLng) * k || 1e-6;
    const h = maxLat - minLat || 1e-6;
    const scale = 100 / Math.max(w, h);
    const vw = w * scale;
    const vh = h * scale;
    const d = pts
      .map((p, i) => {
        const x = (p.lng - minLng) * k * scale;
        const y = (maxLat - p.lat) * scale; // y invertieren (Norden oben)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
    return { d, vw, vh };
  }, [track]);

  if (!path) {
    return <div className="mx-5 my-3 h-28 rounded-2xl bg-(--color-bg)" />;
  }
  return (
    <div className="mx-5 my-3 h-28 overflow-hidden rounded-2xl bg-(--color-bg) p-3">
      <svg
        viewBox={`-4 -4 ${path.vw + 8} ${path.vh + 8}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <path
          d={path.d}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function RideStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <p className="text-base font-bold leading-tight">
        {value}
        {unit && <span className="text-[10px] font-medium text-(--color-text-secondary)"> {unit}</span>}
      </p>
      <p className="text-[11px] text-(--color-text-secondary)">{label}</p>
    </div>
  );
}

function BigStat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-(--color-bg) p-3">
      <Icon name={icon} size={22} className="shrink-0 text-(--color-accent)" />
      <div className="min-w-0">
        <p className="truncate text-lg font-bold leading-tight">{value}</p>
        <p className="truncate text-xs text-(--color-text-secondary)">{label}</p>
      </div>
    </div>
  );
}

function QuickTile({ to, icon, label, hint }: { to: string; icon: IconName; label: string; hint: string }) {
  return (
    <Link to={to} className="ios-card flex flex-col gap-1 p-4 transition active:scale-[0.98]">
      <Icon name={icon} size={26} className="text-(--color-accent)" />
      <span className="font-semibold">{label}</span>
      <span className="text-xs text-(--color-text-secondary)">{hint}</span>
    </Link>
  );
}

function AvatarRing({ src, name, small }: { src: string | null; name: string; small?: boolean }) {
  const size = small ? 'h-8 w-8' : 'h-14 w-14';
  if (src) {
    return <img src={src} alt={name} className={`${size} rounded-full object-cover`} />;
  }
  return (
    <div
      className={`${size} flex items-center justify-center rounded-full bg-(--color-accent) font-bold text-white`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
