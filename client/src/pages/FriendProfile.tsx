import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { PageHeader } from '../components/PageHeader';
import { Icon, type IconName } from '../components/Icon';
import { api, ApiError } from '../lib/api';
import { formatDistance, formatDuration } from '../lib/geo';
import type { FriendProfile as FriendProfileData, CornerEvent } from '../lib/types';

const ratingColor: Record<CornerEvent['rating'], string> = {
  Bronze: '#cd7f32',
  Silber: '#c0c0c0',
  Gold: '#ffd60a',
  Platin: '#0a84ff',
};

export function FriendProfile() {
  const { id } = useParams();
  const [profile, setProfile] = useState<FriendProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<FriendProfileData>(`/friends/${id}/profile`)
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Profil konnte nicht geladen werden'));
  }, [id]);

  const chartData = (profile?.history ?? []).map((h, i) => ({
    name: `#${i + 1}`,
    speed: Math.round(h.maxSpeedKmh),
    lean: Math.round(h.maxLean),
  }));

  return (
    <div className="pb-24">
      <PageHeader
        title={profile?.user.displayName ?? 'Profil'}
        subtitle={profile ? `@${profile.user.username}` : undefined}
        backTo="/freunde"
      />

      {error && <p className="p-5 text-sm text-(--color-danger)">{error}</p>}

      {profile && (
        <div className="flex flex-col gap-4 p-5">
          <section className="ios-card flex items-center gap-3 p-4">
            <div className="relative">
              {profile.user.avatarPath ? (
                <img src={profile.user.avatarPath} alt={profile.user.displayName} className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-(--color-accent) text-lg font-bold text-white">
                  {profile.user.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              {profile.user.online && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-(--color-card) bg-(--color-success)" />
              )}
            </div>
            <div>
              <p className="text-lg font-bold">{profile.user.displayName}</p>
              <p className="text-sm text-(--color-text-secondary)">{profile.user.online ? 'Online' : 'Offline'}</p>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Fahrten" value={String(profile.totals.rides)} icon="flag" />
            <StatCard label="Gesamtdistanz" value={formatDistance(profile.totals.distanceM)} icon="ruler" />
            <StatCard label="Fahrzeit" value={formatDuration(profile.totals.durationS)} icon="clock" />
            <StatCard label="Top-Speed" value={`${profile.totals.maxSpeedKmh.toFixed(0)} km/h`} icon="gauge" />
            <StatCard
              label="Max. Schräglage"
              value={`${Math.max(profile.totals.maxLeanLeft, profile.totals.maxLeanRight).toFixed(0)}°`}
              icon="motorcycle"
            />
            <StatCard label="Blitzer-Punkte" value={String(profile.totals.points)} icon="star" />
          </div>

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
            <h2 className="mb-3 text-base font-semibold">Letzte Fahrten</h2>
            {profile.history.length === 0 ? (
              <p className="text-sm text-(--color-text-secondary)">Noch keine Fahrten aufgezeichnet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {profile.history
                  .slice()
                  .reverse()
                  .map((h) => (
                    <div key={h.id} className="flex items-center justify-between rounded-xl bg-(--color-bg) px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold">
                          {new Date(h.startedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </p>
                        <p className="text-xs text-(--color-text-secondary)">
                          {formatDistance(h.distanceM)} · {formatDuration(h.durationS)}
                        </p>
                      </div>
                      <span className="font-mono text-(--color-text-secondary)">{h.maxSpeedKmh.toFixed(0)} km/h</span>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section className="ios-card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <Icon name="trophy" size={18} className="text-(--color-warning)" /> Kurven-Bewertungen
            </h2>
            {profile.corners.length === 0 ? (
              <p className="text-sm text-(--color-text-secondary)">
                Noch keine ausgeprägten Kurven (ab 20° Schräglage) aufgezeichnet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {profile.corners.map((c, i) => (
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
        </div>
      )}
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
