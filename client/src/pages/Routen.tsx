import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { RouteEditorMap } from '../components/RouteEditorMap';
import { RoutePreviewMap } from '../components/RoutePreviewMap';
import { useRide } from '../context/RideContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatDistance, formatDuration } from '../lib/geo';
import { detectCurves, curveColor, curveTier } from '../lib/curves';
import type { Friend, PlannedRoute, RoutePreview } from '../lib/types';

type View =
  | { mode: 'list' }
  | { mode: 'plan'; initial?: PlannedRoute }
  | { mode: 'view'; route: PlannedRoute };

export function Routen() {
  const [view, setView] = useState<View>({ mode: 'list' });

  if (view.mode === 'plan') return <Planner initial={view.initial} onDone={() => setView({ mode: 'list' })} />;
  if (view.mode === 'view')
    return (
      <RouteDetail
        route={view.route}
        onBack={() => setView({ mode: 'list' })}
        onEdit={(r) => setView({ mode: 'plan', initial: r })}
      />
    );
  return <RouteList onPlan={() => setView({ mode: 'plan' })} onView={(r) => setView({ mode: 'view', route: r })} />;
}

function RouteList({ onPlan, onView }: { onPlan: () => void; onView: (r: PlannedRoute) => void }) {
  const { user } = useAuth();
  const { setActiveRoute } = useRide();
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<PlannedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareFor, setShareFor] = useState<PlannedRoute | null>(null);

  const load = useCallback(() => {
    api
      .get<{ routes: PlannedRoute[] }>('/routes')
      .then((d) => setRoutes(d.routes))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  function startRide(route: PlannedRoute) {
    setActiveRoute(route);
    navigate('/fahren');
  }

  async function remove(route: PlannedRoute) {
    if (!confirm(`Route „${route.name}" löschen?`)) return;
    try {
      await api.del(`/routes/${route.id}`);
      setRoutes((prev) => prev.filter((r) => r.id !== route.id));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="pb-24">
      <PageHeader title="Routen" subtitle="Touren planen, speichern & teilen" />
      <div className="flex flex-col gap-4 p-5">
        <button
          onClick={onPlan}
          className="flex items-center justify-center gap-2 rounded-xl bg-(--color-accent) py-3.5 text-base font-semibold text-white transition active:scale-[0.98]"
        >
          <Icon name="plus" size={20} /> Neue Route planen
        </button>

        {loading ? (
          <p className="p-4 text-center text-sm text-(--color-text-secondary)">Lade…</p>
        ) : routes.length === 0 ? (
          <div className="ios-card flex flex-col items-center gap-2 p-6 text-center">
            <Icon name="map" size={28} className="text-(--color-text-secondary)" />
            <p className="text-sm text-(--color-text-secondary)">
              Noch keine Routen. Plane deine erste Tour und teile sie mit Freunden.
            </p>
          </div>
        ) : (
          routes.map((r) => {
            const mine = r.ownerId === user?.id;
            return (
              <div key={r.id} className="ios-card flex flex-col gap-3 p-4">
                <button onClick={() => onView(r)} className="flex flex-col gap-3 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold">{r.name}</h3>
                      {!mine && r.ownerName && (
                        <p className="text-xs text-(--color-text-secondary)">von {r.ownerName}</p>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-(--color-accent)">
                      Details <Icon name="chevron-right" size={16} />
                    </span>
                  </div>

                  <div className="flex gap-4 text-sm">
                    <span className="flex items-center gap-1.5">
                      <Icon name="ruler" size={16} className="text-(--color-accent)" /> {formatDistance(r.distanceM)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Icon name="clock" size={16} className="text-(--color-accent)" /> ca. {formatDuration(r.durationS)}
                    </span>
                  </div>
                </button>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => startRide(r)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-(--color-accent) py-2 text-sm font-semibold text-white transition active:scale-[0.98]"
                  >
                    <Icon name="motorcycle" size={16} /> Fahrt starten
                  </button>
                  {mine && (
                    <>
                      <button
                        onClick={() => setShareFor(r)}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-2 text-sm font-medium transition active:scale-[0.98]"
                      >
                        <Icon name="share" size={16} /> Teilen
                      </button>
                      <button
                        onClick={() => remove(r)}
                        aria-label="Löschen"
                        className="flex items-center justify-center rounded-lg border border-(--color-border) px-3 py-2 text-(--color-danger) transition active:scale-[0.98]"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {shareFor && <ShareSheet route={shareFor} onClose={() => setShareFor(null)} />}
    </div>
  );
}

function ShareSheet({ route, onClose }: { route: PlannedRoute; onClose: () => void }) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ friends: Friend[] }>('/friends'),
      api.get<{ sharedWith: number[] }>(`/routes/${route.id}/shares`),
    ])
      .then(([f, s]) => {
        setFriends(f.friends);
        setSelected(new Set(s.sharedWith));
      })
      .catch(() => {});
  }, [route.id]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api.put(`/routes/${route.id}/shares`, { userIds: Array.from(selected) });
      onClose();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[560px] rounded-t-3xl bg-(--color-card) p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-lg font-bold">Route teilen</h3>
        <p className="mb-3 text-sm text-(--color-text-secondary)">Wähle Freunde, die „{route.name}" sehen dürfen.</p>
        {friends.length === 0 ? (
          <p className="py-4 text-sm text-(--color-text-secondary)">Du hast noch keine Freunde.</p>
        ) : (
          <ul className="mb-4 flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
            {friends.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => toggle(f.id)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition active:scale-[0.99] hover:bg-(--color-bg)"
                >
                  <span className="font-medium">{f.displayName}</span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                      selected.has(f.id) ? 'border-(--color-accent) bg-(--color-accent) text-white' : 'border-(--color-border)'
                    }`}
                  >
                    {selected.has(f.id) && <Icon name="check" size={13} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl bg-(--color-accent) py-3 text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? 'Speichere…' : 'Freigabe speichern'}
        </button>
      </div>
    </div>
  );
}

function RouteDetail({
  route,
  onBack,
  onEdit,
}: {
  route: PlannedRoute;
  onBack: () => void;
  onEdit: (r: PlannedRoute) => void;
}) {
  const { user } = useAuth();
  const { setActiveRoute } = useRide();
  const navigate = useNavigate();
  const [shareFor, setShareFor] = useState<PlannedRoute | null>(null);

  const curves = useMemo(() => detectCurves(route.geometry), [route.geometry]);
  const mine = route.ownerId === user?.id;

  function startRide() {
    setActiveRoute(route);
    navigate('/fahren');
  }

  async function remove() {
    if (!confirm(`Route „${route.name}" löschen?`)) return;
    try {
      await api.del(`/routes/${route.id}`);
      onBack();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="pb-24">
      <PageHeader
        title={route.name}
        subtitle={!mine && route.ownerName ? `von ${route.ownerName}` : undefined}
        onBack={onBack}
      />
      <div className="flex flex-col gap-4 p-5">
        <RoutePreviewMap geometry={route.geometry} curves={curves} className="ios-card h-64 rounded-2xl" />

        <div className="flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <Icon name="ruler" size={16} className="text-(--color-accent)" /> {formatDistance(route.distanceM)}
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="clock" size={16} className="text-(--color-accent)" /> ca. {formatDuration(route.durationS)}
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="map" size={16} className="text-(--color-accent)" /> {route.waypoints.length} Wegpunkte
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={startRide}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-(--color-accent) py-2.5 text-sm font-semibold text-white transition active:scale-[0.98]"
          >
            <Icon name="motorcycle" size={16} /> Fahrt starten
          </button>
          {mine && (
            <>
              <button
                onClick={() => onEdit(route)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-2.5 text-sm font-medium transition active:scale-[0.98]"
              >
                <Icon name="ruler" size={16} /> Bearbeiten
              </button>
              <button
                onClick={() => setShareFor(route)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-2.5 text-sm font-medium transition active:scale-[0.98]"
              >
                <Icon name="share" size={16} /> Teilen
              </button>
              <button
                onClick={remove}
                aria-label="Löschen"
                className="flex items-center justify-center rounded-lg border border-(--color-border) px-3 py-2.5 text-(--color-danger) transition active:scale-[0.98]"
              >
                <Icon name="trash" size={16} />
              </button>
            </>
          )}
        </div>

        {/* Schöne Kurven */}
        <section className="ios-card p-4">
          <h2 className="mb-1 flex items-center gap-1.5 text-base font-semibold">
            <Icon name="zap" size={18} className="text-(--color-accent)" /> Schöne Kurven
            <span className="text-sm font-normal text-(--color-text-secondary)">({curves.length})</span>
          </h2>
          {curves.length === 0 ? (
            <p className="text-sm text-(--color-text-secondary)">
              Keine ausgeprägten Kurven gefunden – diese Tour verläuft eher gerade.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {curves.map((c, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: curveColor(c.quality) }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{curveTier(c.quality)}</p>
                    <p className="text-xs text-(--color-text-secondary)">
                      {Math.round(c.lengthM)} m lang · Radius ca. {Math.round(c.radiusM)} m ·{' '}
                      {c.direction === 'left' ? 'Linkskurve' : 'Rechtskurve'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {shareFor && <ShareSheet route={shareFor} onClose={() => setShareFor(null)} />}
    </div>
  );
}

function Planner({ initial, onDone }: { initial?: PlannedRoute; onDone: () => void }) {
  const [waypoints, setWaypoints] = useState<[number, number][]>(initial?.waypoints ?? []);
  const [preview, setPreview] = useState<RoutePreview | null>(
    initial ? { distanceM: initial.distanceM, durationS: initial.durationS, geometry: initial.geometry, steps: initial.steps } : null,
  );
  const [routing, setRouting] = useState(false);
  const [name, setName] = useState(initial?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Route bei jeder Wegpunkt-Änderung (entprellt) neu berechnen.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (waypoints.length < 2) {
      setPreview(null);
      return;
    }
    setRouting(true);
    setError(null);
    debounceRef.current = setTimeout(() => {
      api
        .post<RoutePreview>('/routes/preview', { waypoints })
        .then(setPreview)
        .catch((e) => {
          setPreview(null);
          setError(e?.message ?? 'Routing fehlgeschlagen');
        })
        .finally(() => setRouting(false));
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [waypoints]);

  const add = (p: [number, number]) => setWaypoints((prev) => [...prev, p]);
  const move = (i: number, p: [number, number]) => setWaypoints((prev) => prev.map((w, idx) => (idx === i ? p : w)));
  const remove = (i: number) => setWaypoints((prev) => prev.filter((_, idx) => idx !== i));

  async function save() {
    if (!name.trim() || !preview) return;
    setSaving(true);
    setError(null);
    try {
      if (initial) await api.put(`/routes/${initial.id}`, { name: name.trim(), waypoints });
      else await api.post('/routes', { name: name.trim(), waypoints });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
      setSaving(false);
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col">
      <PageHeader title={initial ? 'Route bearbeiten' : 'Route planen'} onBack={onDone} />

      <RouteEditorMap
        className="flex-1"
        waypoints={waypoints}
        geometry={preview?.geometry ?? []}
        onAdd={add}
        onMove={move}
        onRemove={remove}
      />

      <div className="safe-bottom mb-[60px] shrink-0 border-t border-(--color-border) bg-(--color-card) p-4">
        <p className="mb-2 text-xs text-(--color-text-secondary)">
          Tippe auf die Karte, um Wegpunkte zu setzen · Pin ziehen zum Verschieben · Pin antippen zum Entfernen
        </p>

        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <Icon name="ruler" size={16} className="text-(--color-accent)" />
              {preview ? formatDistance(preview.distanceM) : '–'}
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="clock" size={16} className="text-(--color-accent)" />
              {preview ? `ca. ${formatDuration(preview.durationS)}` : '–'}
            </span>
          </span>
          <span className="text-(--color-text-secondary)">
            {routing ? 'berechne…' : `${waypoints.length} Wegpunkte`}
          </span>
        </div>

        {error && <p className="mb-2 text-sm text-(--color-danger)">{error}</p>}

        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name der Route"
            maxLength={80}
            className="flex-1 rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-2.5 text-sm outline-none"
          />
          <button
            onClick={save}
            disabled={saving || !name.trim() || !preview}
            className="rounded-xl bg-(--color-accent) px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? '…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
