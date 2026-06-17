import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatDistance } from '../lib/geo';

interface Overview {
  users: number;
  admins: number;
  rides: number;
  totalDistanceM: number;
  groups: number;
  messages: number;
  pushSubscriptions: number;
  storage: { dbBytes: number; trackDataBytes: number; uploadsBytes: number; totalBytes: number };
}

interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  friendCode: string;
  isAdmin: boolean;
  createdAt: number;
  hasAvatar: boolean;
  rides: number;
  totalDistanceM: number;
  lastRideAt: number | null;
  friends: number;
  groups: number;
  pushSubscriptions: number;
  storageBytes: number;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(ts: number | null): string {
  if (!ts) return '–';
  return new Date(ts * 1000).toLocaleDateString('de-DE', { dateStyle: 'medium' });
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="ios-card flex flex-col gap-0.5 p-3">
      <span className="text-xs text-(--color-text-secondary)">{label}</span>
      <span className="text-lg font-bold tabular-nums">{value}</span>
    </div>
  );
}

export function Admin() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pro-Zeile aktive Aktion (Passwort setzen / löschen bestätigen).
  const [action, setAction] = useState<{ id: number; type: 'password' | 'delete' } | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const [ov, us] = await Promise.all([
        api.get<Overview>('/admin/overview'),
        api.get<{ users: AdminUser[] }>('/admin/users'),
      ]);
      setOverview(ov);
      setUsers(us.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetAction() {
    setAction(null);
    setPwValue('');
  }

  async function onSetPassword(id: number) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/users/${id}/password`, { password: pwValue });
      resetAction();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Passwort konnte nicht gesetzt werden');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number) {
    setBusy(true);
    setError(null);
    try {
      await api.del(`/admin/users/${id}`);
      resetAction();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  async function onToggleAdmin(u: AdminUser) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/users/${u.id}/admin`, { isAdmin: !u.isAdmin });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Änderung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-24">
      <PageHeader title="Admin" subtitle="Konten & Speichernutzung" backTo="/einstellungen" />
      <div className="flex flex-col gap-4 p-5">
        {error && (
          <p className="rounded-xl border border-(--color-danger) p-3 text-sm text-(--color-danger)">{error}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-accent)" />
          </div>
        ) : (
          <>
            {overview && (
              <section>
                <h2 className="mb-2 text-base font-semibold">Übersicht</h2>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Konten" value={String(overview.users)} />
                  <StatCard label="Admins" value={String(overview.admins)} />
                  <StatCard label="Fahrten" value={String(overview.rides)} />
                  <StatCard label="Gesamtdistanz" value={formatDistance(overview.totalDistanceM)} />
                  <StatCard label="Gruppen" value={String(overview.groups)} />
                  <StatCard label="Nachrichten" value={String(overview.messages)} />
                  <StatCard label="Push-Abos" value={String(overview.pushSubscriptions)} />
                  <StatCard label="Speicher gesamt" value={formatBytes(overview.storage.totalBytes)} />
                  <StatCard label="Datenbank" value={formatBytes(overview.storage.dbBytes)} />
                  <StatCard label="Profilbilder" value={formatBytes(overview.storage.uploadsBytes)} />
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-2 text-base font-semibold">Konten ({users.length})</h2>
              <div className="flex flex-col gap-3">
                {users.map((u) => (
                  <div key={u.id} className="ios-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-2 font-semibold">
                          {u.displayName}
                          {u.isAdmin && (
                            <span className="rounded bg-(--color-accent)/15 px-1.5 py-0.5 text-xs font-semibold text-(--color-accent)">
                              Admin
                            </span>
                          )}
                          {u.id === user?.id && (
                            <span className="rounded bg-(--color-bg-elevated) px-1.5 py-0.5 text-xs text-(--color-text-secondary)">
                              du
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-(--color-text-secondary)">
                          @{u.username} · Code {u.friendCode}
                        </p>
                        <p className="text-xs text-(--color-text-secondary)">
                          Registriert {formatDate(u.createdAt)} · letzte Fahrt {formatDate(u.lastRideAt)}
                        </p>
                      </div>
                      <span className="shrink-0 text-right text-xs text-(--color-text-secondary)">
                        {formatBytes(u.storageBytes)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--color-text-secondary)">
                      <span>{u.rides} Fahrten</span>
                      <span>{formatDistance(u.totalDistanceM)}</span>
                      <span>{u.friends} Freunde</span>
                      <span>{u.groups} Gruppen</span>
                      <span>{u.pushSubscriptions} Push</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setPwValue('');
                          setAction(action?.id === u.id && action.type === 'password' ? null : { id: u.id, type: 'password' });
                        }}
                        className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98]"
                      >
                        Passwort setzen
                      </button>
                      <button
                        onClick={() => onToggleAdmin(u)}
                        disabled={busy}
                        className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-50"
                      >
                        {u.isAdmin ? 'Admin entziehen' : 'Zum Admin machen'}
                      </button>
                      {u.id !== user?.id && (
                        <button
                          onClick={() => setAction(action?.id === u.id && action.type === 'delete' ? null : { id: u.id, type: 'delete' })}
                          className="rounded-lg border border-(--color-danger) px-3 py-1.5 text-xs font-semibold text-(--color-danger) transition active:scale-[0.98]"
                        >
                          Löschen
                        </button>
                      )}
                    </div>

                    {action?.id === u.id && action.type === 'password' && (
                      <div className="mt-3 flex gap-2">
                        <input
                          type="text"
                          value={pwValue}
                          onChange={(e) => setPwValue(e.target.value)}
                          placeholder="Neues Passwort (min. 6)"
                          className="flex-1 rounded-xl border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none"
                        />
                        <button
                          onClick={() => onSetPassword(u.id)}
                          disabled={busy || pwValue.length < 6}
                          className="rounded-xl bg-(--color-accent) px-4 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                        >
                          {busy ? '…' : 'Setzen'}
                        </button>
                      </div>
                    )}

                    {action?.id === u.id && action.type === 'delete' && (
                      <div className="mt-3 rounded-xl border border-(--color-danger) p-3">
                        <p className="mb-2 text-sm text-(--color-danger)">
                          Konto „{u.displayName}" und alle Daten unwiderruflich löschen?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => onDelete(u.id)}
                            disabled={busy}
                            className="flex-1 rounded-xl bg-(--color-danger) py-2 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                          >
                            {busy ? 'Wird gelöscht…' : 'Endgültig löschen'}
                          </button>
                          <button
                            onClick={resetAction}
                            className="rounded-xl border border-(--color-border) px-4 py-2 text-sm font-medium transition active:scale-[0.98]"
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <div className="flex items-start gap-2 rounded-xl border border-(--color-border) bg-(--color-bg-elevated) p-3 text-xs text-(--color-text-secondary)">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-(--color-accent)" />
              <span>
                Dein eigenes Admin-Passwort änderst du über die Einstellungen. Den Admin-Login auf dem
                Server verwaltest du mit <span className="font-mono">npm run admin -- set &lt;user&gt; &lt;pw&gt;</span>.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
