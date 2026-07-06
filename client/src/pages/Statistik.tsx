import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { PageHeader } from '../components/PageHeader';
import { Icon, type IconName } from '../components/Icon';
import { api } from '../lib/api';
import { formatDistance, formatDuration } from '../lib/geo';
import type { StatsTotals, RideHistoryEntry, CornerEvent, FriendStats } from '../lib/types';

const ratingColor: Record<CornerEvent['rating'], string> = {
  Bronze: '#cd7f32',
  Silber: '#c0c0c0',
  Gold: '#ffd60a',
  Platin: '#0a84ff',
};

export function Statistik() {
  const [totals, setTotals] = useState<StatsTotals | null>(null);
  const [history, setHistory] = useState<RideHistoryEntry[]>([]);
  const [corners, setCorners] = useState<CornerEvent[]>([]);
  const [friends, setFriends] = useState<FriendStats[]>([]);

  useEffect(() => {
    api
      .get<{ totals: StatsTotals; history: RideHistoryEntry[]; corners: CornerEvent[] }>('/stats/me')
      .then((data) => {
        setTotals(data.totals);
        setHistory(data.history);
        setCorners(data.corners);
      })
      .catch(() => {});

    api
      .get<{ friends: FriendStats[] }>('/stats/friends')
      .then((data) => setFriends(data.friends))
      .catch(() => {});
  }, []);

  const chartData = history.map((h, i) => ({
    name: `#${i + 1}`,
    speed: Math.round(h.maxSpeedKmh),
    lean: Math.round(h.maxLean),
  }));

  return (
    <div className="pb-24">
      <PageHeader title="Statistik" subtitle="Deine Bestwerte & Kurven-Bewertungen" backTo="/" />
      <div className="flex flex-col gap-4 p-5">
        {totals && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Fahrten" value={String(totals.rides)} icon="flag" />
            <StatCard label="Gesamtdistanz" value={formatDistance(totals.distanceM)} icon="ruler" />
            <StatCard label="Fahrzeit" value={formatDuration(totals.durationS)} icon="clock" />
            <StatCard label="Top-Speed" value={`${totals.maxSpeedKmh.toFixed(0)} km/h`} icon="gauge" />
            <StatCard label="Max. Schräglage" value={`${Math.max(totals.maxLeanLeft, totals.maxLeanRight).toFixed(0)}°`} icon="motorcycle" />
            <StatCard label="Max. G-Kraft" value={`${(totals.maxG ?? 0).toFixed(1)} G`} icon="zap" />
            <StatCard label="Blitzer-Punkte" value={String(totals.points)} icon="star" />
          </div>
        )}

        {chartData.length > 1 && (
          <section className="ios-card p-4">
            <h2 className="mb-3 text-base font-semibold">Verlauf</h2>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-text-secondary)" fontSize={12} />
                <YAxis stroke="var(--color-text-secondary)" fontSize={12} />
                <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 12 }} />
                <Line type="monotone" dataKey="speed" name="Max. Speed (km/h)" stroke="var(--color-accent)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="lean" name="Max. Schräglage (°)" stroke="var(--color-accent-2)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </section>
        )}

        <section className="ios-card p-4">
          <h2 className="mb-3 text-base font-semibold">Fahrten</h2>
          {history.length === 0 ? (
            <p className="text-sm text-(--color-text-secondary)">Noch keine Fahrten aufgezeichnet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {history
                .slice()
                .reverse()
                .map((h) => (
                  <Link
                    key={h.id}
                    to={`/fahrten/${h.id}`}
                    className="flex items-center justify-between rounded-xl bg-(--color-bg) px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold">
                        {new Date(h.startedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-(--color-text-secondary)">
                        {formatDistance(h.distanceM)} · {formatDuration(h.durationS)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-(--color-text-secondary)">{h.maxSpeedKmh.toFixed(0)} km/h</span>
                      <Icon name="chevron-right" size={18} className="text-(--color-text-secondary)" />
                    </div>
                  </Link>
                ))}
            </div>
          )}
        </section>

        <section className="ios-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <Icon name="trophy" size={18} className="text-(--color-warning)" /> Kurven-Bewertungen
          </h2>
          {corners.length === 0 ? (
            <p className="text-sm text-(--color-text-secondary)">
              Noch keine ausgeprägten Kurven (ab 20° Schräglage) aufgezeichnet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {corners.map((c, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-(--color-bg) px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: ratingColor[c.rating] }}
                    >
                      {c.rating[0]}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{c.rating}</p>
                      <p className="text-xs text-(--color-text-secondary)">Kurve nach {c.side}</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold tabular-nums">{c.lean.toFixed(0)}°</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="ios-card p-4">
          <h2 className="mb-3 text-base font-semibold">Freunde im Vergleich</h2>
          {friends.length === 0 ? (
            <p className="text-sm text-(--color-text-secondary)">
              Füge Freunde hinzu, um eure Statistiken zu vergleichen.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {friends
                .slice()
                .sort((a, b) => b.points - a.points)
                .map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-xl bg-(--color-bg) px-3 py-2 text-sm">
                    <span className="font-semibold">{f.displayName}</span>
                    <span className="font-mono text-(--color-text-secondary)">
                      {f.maxSpeedKmh.toFixed(0)} km/h · {f.maxLean.toFixed(0)}° · {f.points} Pkt
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon?: IconName }) {
  return (
    <div className="ios-card flex flex-col items-center justify-center gap-1 p-4 text-center">
      {icon && <Icon name={icon} size={24} className="text-(--color-accent)" />}
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-(--color-text-secondary)">{label}</span>
    </div>
  );
}
