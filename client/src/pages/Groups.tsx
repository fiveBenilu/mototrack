import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { useRide } from '../context/RideContext';
import { api, ApiError } from '../lib/api';
import type { Friend, GroupSummary } from '../lib/types';

export function Groups() {
  const { subscribeGroupEvents } = useRide();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ groups: GroupSummary[] }>('/groups');
      setGroups(data.groups);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Liste live aktualisieren, wenn sich Gruppen oder Nachrichten ändern.
  useEffect(() => subscribeGroupEvents(() => load()), [subscribeGroupEvents, load]);

  return (
    <div className="pb-24">
      <PageHeader title="Gruppen" subtitle="Gemeinsame Ausfahrten & Chat" backTo="/freunde" />
      <div className="flex flex-col gap-4 p-5">
        <button
          onClick={() => setCreating(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-(--color-accent) py-3 text-base font-semibold text-white transition active:scale-[0.98]"
        >
          <Icon name="plus" size={18} /> Neue Gruppe
        </button>

        {groups.length === 0 ? (
          <p className="ios-card p-4 text-sm text-(--color-text-secondary)">
            Noch keine Gruppen. Erstelle eine und lade deine Freunde ein.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g) => (
              <Link
                key={g.id}
                to={`/gruppen/${g.id}`}
                className="ios-card flex items-center gap-3 p-4 transition active:scale-[0.99]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-(--color-accent-2) text-white">
                  <Icon name="users" size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{g.name}</p>
                  <p className="truncate text-xs text-(--color-text-secondary)">
                    {g.lastMessage
                      ? `${g.lastMessage.displayName}: ${g.lastMessage.body}`
                      : `${g.memberCount} ${g.memberCount === 1 ? 'Mitglied' : 'Mitglieder'}`}
                  </p>
                </div>
                <Icon name="chevron-right" size={18} className="text-(--color-text-secondary)" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <CreateGroupModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ friends: Friend[] }>('/friends')
      .then((d) => setFriends(d.friends))
      .catch(() => {});
  }, []);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!name.trim()) {
      setError('Bitte einen Namen eingeben');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/groups', { name: name.trim(), memberIds: Array.from(selected) });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erstellen fehlgeschlagen');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 p-0 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl bg-(--color-bg-elevated) p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-bold">Neue Gruppe</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Gruppenname"
          maxLength={60}
          className="mb-4 w-full rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3 text-sm outline-none"
        />

        <p className="mb-2 text-sm font-semibold">Freunde einladen</p>
        {friends.length === 0 ? (
          <p className="text-sm text-(--color-text-secondary)">Du hast noch keine Freunde zum Einladen.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {friends.map((f) => (
              <button
                key={f.id}
                onClick={() => toggle(f.id)}
                className="flex items-center gap-2 rounded-xl bg-(--color-bg) px-3 py-2 text-left"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                    selected.has(f.id) ? 'border-(--color-accent) bg-(--color-accent) text-white' : 'border-(--color-border)'
                  }`}
                >
                  {selected.has(f.id) && <Icon name="check" size={14} />}
                </span>
                <span className="text-sm font-medium">{f.displayName}</span>
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-(--color-danger)">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-(--color-border) py-3 text-sm font-semibold transition active:scale-[0.98]"
          >
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 rounded-xl bg-(--color-accent) py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Erstellen…' : 'Erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
