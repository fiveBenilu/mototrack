import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import type { Friend, FriendRequest } from '../lib/types';

export function Freunde() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    try {
      const [f, r] = await Promise.all([
        api.get<{ friends: Friend[] }>('/friends'),
        api.get<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('/friends/requests'),
      ]);
      setFriends(f.friends);
      setIncoming(r.incoming);
      setOutgoing(r.outgoing);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function onAddFriend(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await api.post('/friends/request', { code: code.trim().toUpperCase() });
      setMessage('Anfrage gesendet!');
      setCode('');
      loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Anfrage fehlgeschlagen');
    }
  }

  async function onRespond(requestId: number, accept: boolean) {
    try {
      await api.post(`/friends/requests/${requestId}/respond`, { accept });
      loadAll();
    } catch {
      /* ignore */
    }
  }

  async function onRemove(friendId: number) {
    try {
      await api.del(`/friends/${friendId}`);
      loadAll();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="pb-24">
      <PageHeader title="Freunde" subtitle="Verbinde dich mit anderen Fahrer:innen" />
      <div className="flex flex-col gap-4 p-5">
        <Link
          to="/gruppen"
          className="ios-card flex items-center gap-3 p-4 transition active:scale-[0.99]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-(--color-accent-2) text-white">
            <Icon name="users" size={22} />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Gruppen</p>
            <p className="text-xs text-(--color-text-secondary)">Gemeinsame Ausfahrten & Gruppenchat</p>
          </div>
          <Icon name="chevron-right" size={18} className="text-(--color-text-secondary)" />
        </Link>

        <section className="ios-card p-4">
          <h2 className="mb-2 text-base font-semibold">Dein Freunde-Code</h2>
          <p className="rounded-xl bg-(--color-bg) px-4 py-3 text-center text-lg font-mono font-bold tracking-widest">
            {user?.friendCode}
          </p>
          <p className="mt-2 text-xs text-(--color-text-secondary)">
            Teile diesen Code, damit dich andere hinzufügen können.
          </p>
        </section>

        <section className="ios-card p-4">
          <h2 className="mb-2 text-base font-semibold">Freund hinzufügen</h2>
          <form onSubmit={onAddFriend} className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code eingeben"
              maxLength={6}
              className="flex-1 rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3 text-sm font-mono uppercase tracking-widest outline-none"
            />
            <button
              type="submit"
              className="rounded-xl bg-(--color-accent) px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
            >
              Hinzufügen
            </button>
          </form>
          {message && <p className="mt-2 text-sm text-(--color-success)">{message}</p>}
          {error && <p className="mt-2 text-sm text-(--color-danger)">{error}</p>}
        </section>

        {incoming.length > 0 && (
          <section className="ios-card p-4">
            <h2 className="mb-2 text-base font-semibold">Eingehende Anfragen</h2>
            <div className="flex flex-col gap-2">
              {incoming.map((r) => (
                <div key={r.requestId} className="flex items-center justify-between rounded-xl bg-(--color-bg) px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={r.displayName} src={r.avatarPath} />
                    <div>
                      <p className="text-sm font-semibold">{r.displayName}</p>
                      <p className="text-xs text-(--color-text-secondary)">@{r.username}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onRespond(r.requestId, true)}
                      className="rounded-lg bg-(--color-success) px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Annehmen
                    </button>
                    <button
                      onClick={() => onRespond(r.requestId, false)}
                      className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold"
                    >
                      Ablehnen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {outgoing.length > 0 && (
          <section className="ios-card p-4">
            <h2 className="mb-2 text-base font-semibold">Gesendete Anfragen</h2>
            <div className="flex flex-col gap-2">
              {outgoing.map((r) => (
                <div key={r.requestId} className="flex items-center justify-between rounded-xl bg-(--color-bg) px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={r.displayName} src={r.avatarPath} />
                    <p className="text-sm font-semibold">{r.displayName}</p>
                  </div>
                  <span className="text-xs text-(--color-text-secondary)">Ausstehend</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="ios-card p-4">
          <h2 className="mb-2 text-base font-semibold">Deine Freunde</h2>
          {friends.length === 0 ? (
            <p className="text-sm text-(--color-text-secondary)">Noch keine Freunde hinzugefügt.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {friends.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-xl bg-(--color-bg) px-3 py-2">
                  <Link to={`/freunde/${f.id}`} className="flex flex-1 items-center gap-2">
                    <div className="relative">
                      <Avatar name={f.displayName} src={f.avatarPath} />
                      {f.online && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-(--color-card) bg-(--color-success)" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{f.displayName}</p>
                      <p className="text-xs text-(--color-text-secondary)">{f.online ? 'Online' : 'Offline'}</p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/freunde/${f.id}`}
                      aria-label={`Profil von ${f.displayName}`}
                      className="flex h-8 w-8 items-center justify-center text-(--color-text-secondary)"
                    >
                      <Icon name="chevron-right" size={18} />
                    </Link>
                    <button
                      onClick={() => onRemove(f.id)}
                      className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold text-(--color-text-secondary)"
                    >
                      Entfernen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    return <img src={src} alt={name} className="h-9 w-9 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-(--color-accent) text-sm font-bold text-white">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
