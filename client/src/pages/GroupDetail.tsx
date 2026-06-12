import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { useRide } from '../context/RideContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { Friend, GroupDetail as GroupDetailType, GroupMessage } from '../lib/types';

export function GroupDetail() {
  const { id } = useParams();
  const groupId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscribeGroupEvents } = useRide();

  const [group, setGroup] = useState<GroupDetailType | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const loadGroup = useCallback(async () => {
    try {
      const data = await api.get<{ group: GroupDetailType }>(`/groups/${groupId}`);
      setGroup(data.group);
    } catch {
      setNotFound(true);
    }
  }, [groupId]);

  const loadMessages = useCallback(async () => {
    try {
      const data = await api.get<{ messages: GroupMessage[] }>(`/groups/${groupId}/messages`);
      setMessages(data.messages);
    } catch {
      /* ignore */
    }
  }, [groupId]);

  useEffect(() => {
    loadGroup();
    loadMessages();
  }, [loadGroup, loadMessages]);

  // Live-Updates für genau diese Gruppe.
  useEffect(
    () =>
      subscribeGroupEvents((event) => {
        if (event.groupId !== groupId) return;
        if (event.type === 'group-message') {
          setMessages((prev) => (prev.some((m) => m.id === event.message.id) ? prev : [...prev, event.message]));
        } else if (event.type === 'group-update') {
          loadGroup();
        } else if (event.type === 'group-removed') {
          navigate('/gruppen', { replace: true });
        }
      }),
    [subscribeGroupEvents, groupId, loadGroup, navigate],
  );

  // Bei neuen Nachrichten ans Ende scrollen.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft('');
    try {
      const data = await api.post<{ message: GroupMessage }>(`/groups/${groupId}/messages`, { body });
      // Optimistisch einfügen (WS-Echo wird per id dedupliziert).
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
    } catch {
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  if (notFound) {
    return (
      <div className="pb-24">
        <PageHeader title="Gruppe" backTo="/gruppen" />
        <p className="p-5 text-sm text-(--color-text-secondary)">Gruppe nicht gefunden.</p>
      </div>
    );
  }

  const isOwner = group?.ownerId === user?.id;

  return (
    <div className="flex h-[100dvh] flex-col">
      <PageHeader
        title={group?.name ?? 'Gruppe'}
        subtitle={group ? `${group.members.length} ${group.members.length === 1 ? 'Mitglied' : 'Mitglieder'}` : undefined}
        backTo="/gruppen"
      />

      {/* Mitglieder-Leiste / Verwaltung */}
      <div className="shrink-0 border-b border-(--color-border) px-4 py-2">
        <button
          onClick={() => setShowMembers((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium text-(--color-text-secondary)"
        >
          <span className="flex items-center gap-1.5">
            <Icon name="users" size={16} /> Mitglieder
          </span>
          <Icon name={showMembers ? 'chevron-left' : 'chevron-right'} size={16} />
        </button>
        {showMembers && group && (
          <MemberPanel group={group} isOwner={!!isOwner} selfId={user?.id ?? -1} onChanged={loadGroup} />
        )}
      </div>

      {/* Nachrichten */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-(--color-text-secondary)">
            Noch keine Nachrichten. Schreib die erste!
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m, i) => {
              const mine = m.userId === user?.id;
              const showName = !mine && messages[i - 1]?.userId !== m.userId;
              return (
                <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {showName && <span className="mb-0.5 px-1 text-xs text-(--color-text-secondary)">{m.displayName}</span>}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? 'bg-(--color-accent) text-white' : 'bg-(--color-bg-elevated)'
                    }`}
                  >
                    <span className="whitespace-pre-wrap break-words">{m.body}</span>
                  </div>
                  <span className="mt-0.5 px-1 text-[10px] text-(--color-text-secondary)">
                    {new Date(m.createdAt * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Eingabe – sitzt oberhalb der Tab-Leiste */}
      <div className="safe-bottom mb-[60px] shrink-0 border-t border-(--color-border) bg-(--color-card) px-3 py-2 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Nachricht…"
            className="flex-1 rounded-full border border-(--color-border) bg-(--color-bg) px-4 py-2.5 text-sm outline-none"
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            aria-label="Senden"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--color-accent) text-white transition active:scale-95 disabled:opacity-40"
          >
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberPanel({
  group,
  isOwner,
  selfId,
  onChanged,
}: {
  group: GroupDetailType;
  isOwner: boolean;
  selfId: number;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api
      .get<{ friends: Friend[] }>('/friends')
      .then((d) => setFriends(d.friends))
      .catch(() => {});
  }, []);

  const memberIds = new Set(group.members.map((m) => m.id));
  const addable = friends.filter((f) => !memberIds.has(f.id));

  async function addMember(userId: number) {
    try {
      await api.post(`/groups/${group.id}/members`, { userId });
      onChanged();
    } catch {
      /* ignore */
    }
  }

  async function removeMember(userId: number) {
    try {
      await api.del(`/groups/${group.id}/members/${userId}`);
      onChanged();
    } catch {
      /* ignore */
    }
  }

  async function leaveGroup() {
    if (!confirm('Gruppe wirklich verlassen?')) return;
    try {
      await api.del(`/groups/${group.id}/members/${selfId}`);
      navigate('/gruppen', { replace: true });
    } catch {
      /* ignore */
    }
  }

  async function deleteGroup() {
    if (!confirm('Gruppe wirklich löschen? Alle Nachrichten gehen verloren.')) return;
    try {
      await api.del(`/groups/${group.id}`);
      navigate('/gruppen', { replace: true });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {group.members.map((m) => (
        <div key={m.id} className="flex items-center justify-between rounded-xl bg-(--color-bg) px-3 py-2">
          <div className="flex items-center gap-2">
            <Avatar name={m.displayName} src={m.avatarPath} online={m.online} />
            <div>
              <p className="text-sm font-medium">
                {m.displayName}
                {m.id === group.ownerId && <span className="ml-1.5 text-xs text-(--color-text-secondary)">· Admin</span>}
              </p>
              <p className="text-xs text-(--color-text-secondary)">{m.online ? 'Online' : 'Offline'}</p>
            </div>
          </div>
          {isOwner && m.id !== group.ownerId && (
            <button onClick={() => removeMember(m.id)} aria-label="Entfernen" className="text-(--color-text-secondary)">
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      ))}

      {adding ? (
        <div className="rounded-xl border border-(--color-border) p-2">
          {addable.length === 0 ? (
            <p className="px-1 py-1 text-xs text-(--color-text-secondary)">Alle deine Freunde sind bereits in der Gruppe.</p>
          ) : (
            addable.map((f) => (
              <button
                key={f.id}
                onClick={() => addMember(f.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-(--color-bg)"
              >
                <Icon name="plus" size={15} className="text-(--color-accent)" /> {f.displayName}
              </button>
            ))
          )}
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-sm font-medium text-(--color-accent)"
        >
          <Icon name="plus" size={16} /> Freund hinzufügen
        </button>
      )}

      <div className="mt-1 flex gap-2">
        {isOwner ? (
          <button
            onClick={deleteGroup}
            className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold text-(--color-danger)"
          >
            <Icon name="trash" size={14} /> Gruppe löschen
          </button>
        ) : (
          <button
            onClick={leaveGroup}
            className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold text-(--color-danger)"
          >
            <Icon name="log-out" size={14} /> Verlassen
          </button>
        )}
      </div>
    </div>
  );
}

function Avatar({ name, src, online }: { name: string; src: string | null; online: boolean }) {
  return (
    <div className="relative">
      {src ? (
        <img src={src} alt={name} className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-(--color-accent) text-sm font-bold text-white">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-(--color-bg) bg-(--color-success)" />
      )}
    </div>
  );
}
