import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Icon, Stars, type IconName } from '../components/Icon';
import { LeanIndicator } from '../components/LeanIndicator';
import { SwipePager } from '../components/SwipePager';
import { LiveMap } from '../components/LiveMap';
import { ConvoyPanel } from '../components/ConvoyPanel';
import { SafetyGate, SafetyNote } from '../components/SafetyDisclaimer';
import { type RideSummary } from '../hooks/useRideRecorder';
import { useRide } from '../context/RideContext';
import { formatDistance, formatDuration } from '../lib/geo';
import { savePending, uploadRide } from '../lib/pendingRides';
import { loadDraft, clearDraft, type RideDraft } from '../lib/rideDraft';

export function Fahren() {
  const recorder = useRide();
  const [savedSummary, setSavedSummary] = useState<RideSummary | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [draft, setDraft] = useState<RideDraft | null>(null);
  const [draftState, setDraftState] = useState<'prompt' | 'saving' | 'saved' | 'error'>('prompt');

  const permissionsGranted = recorder.motionPermission === 'granted' && recorder.geoPermission !== 'denied';
  const isCalibrated = recorder.calibrationOffset !== null;

  // Beim Öffnen prüfen, ob eine frühere Aufzeichnung abgebrochen wurde (Absturz,
  // Akku leer, Seite neu geladen). Nur anbieten, wenn gerade nicht aufgezeichnet
  // wird und tatsächlich Streckendaten vorliegen.
  useEffect(() => {
    if (recorder.status !== 'idle') return;
    let cancelled = false;
    loadDraft().then((d) => {
      if (!cancelled && d && d.track.length > 0) setDraft(d);
    });
    return () => {
      cancelled = true;
    };
  }, [recorder.status]);

  async function handleRecoverDraft() {
    if (!draft) return;
    const { updatedAt: _updatedAt, ...summary } = draft;
    savePending(summary);
    setDraftState('saving');
    try {
      await uploadRide(summary);
      setDraftState('saved');
    } catch {
      setDraftState('error'); // bleibt in der Pending-Queue und wird später erneut versucht
    }
    await clearDraft();
  }

  async function handleDiscardDraft() {
    await clearDraft();
    setDraft(null);
  }

  useEffect(() => {
    if (savedSummary && saveState === 'saving') {
      uploadRide(savedSummary)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }
  }, [savedSummary, saveState]);

  function handleStop() {
    const summary = recorder.stop();
    if (summary) {
      // Fahrt sofort lokal sichern, bevor der Upload versucht wird – so geht sie
      // nicht verloren, wenn das Speichern fehlschlägt (kein Netz, Server down).
      savePending(summary);
      setSavedSummary(summary);
      setSaveState('saving');
    }
  }

  function handleRetry() {
    if (savedSummary) setSaveState('saving');
  }

  function handleNewRide() {
    setSavedSummary(null);
    setSaveState('idle');
    recorder.reset();
  }

  if (recorder.status === 'finished' && savedSummary) {
    return (
      <div className="pb-24">
        <PageHeader title="Fahrt beendet" subtitle="Zusammenfassung" />
        <div className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Distanz" value={formatDistance(savedSummary.distanceM)} icon="ruler" />
            <StatCard label="Dauer" value={formatDuration(savedSummary.durationS)} icon="clock" />
            <StatCard label="Max. Speed" value={`${savedSummary.maxSpeedKmh.toFixed(0)} km/h`} icon="gauge" />
            <StatCard label="Ø Speed" value={`${savedSummary.avgSpeedKmh.toFixed(0)} km/h`} icon="chart" />
            <StatCard label="Max. Schräglage links" value={`${savedSummary.maxLeanLeft.toFixed(0)}°`} icon="lean-left" />
            <StatCard label="Max. Schräglage rechts" value={`${savedSummary.maxLeanRight.toFixed(0)}°`} icon="lean-right" />
            <StatCard label="Max. G-Kraft" value={`${savedSummary.maxG.toFixed(1)} G`} icon="zap" />
          </div>

          <div className="ios-card p-4 text-center text-sm text-(--color-text-secondary)">
            {saveState === 'saving' && 'Fahrt wird gespeichert…'}
            {saveState === 'saved' && (
              <span className="flex items-center justify-center gap-1.5 text-(--color-success)">
                <Icon name="check" size={16} /> Fahrt gespeichert
              </span>
            )}
            {saveState === 'error' && (
              <div className="flex flex-col items-center gap-2">
                <span className="flex items-center justify-center gap-1.5 text-(--color-danger)">
                  <Icon name="alert" size={16} /> Speichern fehlgeschlagen – Fahrt ist lokal gesichert
                </span>
                <button
                  onClick={handleRetry}
                  className="rounded-lg border border-(--color-border) px-4 py-1.5 text-sm font-medium transition active:scale-[0.98]"
                >
                  Erneut versuchen
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleNewRide}
            className="rounded-xl bg-(--color-accent) py-3 text-base font-semibold text-white transition active:scale-[0.98]"
          >
            Neue Fahrt
          </button>
        </div>
      </div>
    );
  }

  if (recorder.status === 'recording' || recorder.status === 'paused') {
    const paused = recorder.status === 'paused';
    const werte = (
      <div className="flex flex-col gap-3 p-4">
        {/* Tacho */}
        <div className="ios-card flex flex-col items-center gap-0.5 py-7">
          <p className="text-7xl font-bold tabular-nums leading-none">{recorder.currentSpeed.toFixed(0)}</p>
          <p className="mt-1 text-sm font-medium text-(--color-text-secondary)">km/h</p>
          <p className="text-xs text-(--color-text-secondary)">Max {recorder.maxSpeedKmh.toFixed(0)} km/h</p>
        </div>

        {/* Schräglage */}
        <div className="ios-card p-4">
          <LeanIndicator lean={recorder.currentLean} />
        </div>

        {/* Live-Kennzahlen inkl. G-Kraft */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon="ruler" label="Distanz" value={formatDistance(recorder.distanceM)} />
          <StatCard icon="clock" label="Dauer" value={formatDuration(recorder.durationS)} />
          <StatCard icon="gauge" label="Ø/Max Speed" value={`${recorder.maxSpeedKmh.toFixed(0)} km/h`} />
          <GForceCard current={recorder.currentG} max={recorder.maxG} />
        </div>

        {recorder.lastPass && (
          <div className="ios-card flex items-center justify-between p-4">
            <span className="flex items-center gap-2 font-semibold">
              <Icon name="camera" size={20} className="text-(--color-danger)" /> Geblitzt mit
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xl font-bold tabular-nums">{recorder.lastPass.speedKmh.toFixed(0)} km/h</span>
              <span className="text-sm text-(--color-text-secondary)">+{recorder.lastPass.points}</span>
              <Stars count={recorder.lastPass.stars} />
            </span>
          </div>
        )}

        {recorder.lastZonePass && (
          <div className="ios-card flex items-center justify-between p-4" style={{ borderColor: '#a855f7' }}>
            <span className="flex items-center gap-2 font-semibold" style={{ color: '#a855f7' }}>
              <Icon name="zap" size={20} /> Zonen-Schnitt
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xl font-bold tabular-nums">⌀ {recorder.lastZonePass.avgSpeedKmh.toFixed(0)} km/h</span>
              <span className="text-sm text-(--color-text-secondary)">+{recorder.lastZonePass.points}</span>
              <Stars count={recorder.lastZonePass.stars} />
            </span>
          </div>
        )}
      </div>
    );

    return (
      // Immersives Vollbild-Layout (Tab-Leiste ist während der Aufzeichnung
      // ausgeblendet): Statuszeile, wischbare Ansichten und Steuerung mit
      // Safe-Area-Abstand – nichts wird mehr überdeckt.
      <div className="flex h-dvh flex-col">
        <header className="safe-top flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <span className="flex items-center gap-2 text-base font-bold">
            <span
              className={`h-2.5 w-2.5 rounded-full ${paused ? 'bg-(--color-text-secondary)' : 'animate-pulse bg-(--color-danger)'}`}
            />
            {paused ? 'Pausiert' : 'Aufzeichnung'}
          </span>
          <span className="font-mono text-base font-semibold tabular-nums">{formatDuration(recorder.durationS)}</span>
        </header>

        <SwipePager
          className="flex-1"
          pages={[
            { key: 'werte', label: 'Werte', node: werte },
            { key: 'karte', label: 'Karte · Blitzer & Freunde', node: <LiveMap className="h-full" lockView /> },
            { key: 'konvoi', label: 'Konvoi', node: <ConvoyPanel /> },
          ]}
        />

        <div className="safe-bottom flex shrink-0 gap-3 border-t border-(--color-border) bg-(--color-card) px-5 pb-2 pt-3">
          {recorder.status === 'recording' ? (
            <button
              onClick={recorder.pause}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-(--color-border) bg-(--color-bg-elevated) py-3.5 text-base font-semibold transition active:scale-[0.98]"
            >
              <Icon name="pause" size={18} /> Pause
            </button>
          ) : (
            <button
              onClick={recorder.resume}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-(--color-accent) bg-(--color-bg-elevated) py-3.5 text-base font-semibold text-(--color-accent) transition active:scale-[0.98]"
            >
              <Icon name="play" size={18} /> Weiter
            </button>
          )}
          <button
            onClick={handleStop}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-(--color-danger) py-3.5 text-base font-semibold text-white shadow-lg transition active:scale-[0.98]"
          >
            <Icon name="stop" size={18} /> Beenden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <SafetyGate />
      <PageHeader title="Fahren" subtitle="Sensoren aktivieren, kalibrieren, los geht's" />
      <div className="flex flex-col gap-4 p-5">
        <SafetyNote />

        {recorder.activeRoute ? (
          <section className="ios-card border border-(--color-accent) p-4">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-(--color-accent)">
              <Icon name="map" size={14} /> Geführte Fahrt
            </p>
            <h2 className="text-base font-semibold">{recorder.activeRoute.name}</h2>
            <p className="mb-3 text-sm text-(--color-text-secondary)">
              {formatDistance(recorder.activeRoute.distanceM)} · ca. {formatDuration(recorder.activeRoute.durationS)} · Route
              & Navigation auf der Karte
            </p>
            <button
              onClick={() => recorder.setActiveRoute(null)}
              className="flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-medium transition active:scale-[0.98]"
            >
              <Icon name="x" size={15} /> Route entfernen (freie Fahrt)
            </button>
          </section>
        ) : (
          <p className="text-sm text-(--color-text-secondary)">
            Freie Fahrt – einfach losfahren und Blitzer-Punkte sammeln. Für eine geführte Tour wähle unter „Routen" eine
            Route aus.
          </p>
        )}
        {draft && (
          <section className="ios-card border border-(--color-accent) p-4">
            <h2 className="mb-1 flex items-center gap-1.5 text-base font-semibold">
              <Icon name="alert" size={18} className="text-(--color-accent)" /> Unterbrochene Fahrt
            </h2>
            <p className="mb-3 text-sm text-(--color-text-secondary)">
              Eine nicht beendete Aufzeichnung wurde gefunden:{' '}
              <span className="font-medium text-(--color-text)">
                {formatDistance(draft.distanceM)} · {formatDuration(draft.durationS)}
              </span>{' '}
              vom {new Date(draft.startedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}.
            </p>
            {draftState === 'saved' ? (
              <span className="flex items-center gap-1.5 text-sm text-(--color-success)">
                <Icon name="check" size={16} /> Fahrt wiederhergestellt und gespeichert
              </span>
            ) : draftState === 'error' ? (
              <span className="flex items-center gap-1.5 text-sm text-(--color-danger)">
                <Icon name="alert" size={16} /> Konnte nicht hochgeladen werden – lokal gesichert, Upload folgt später
              </span>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleRecoverDraft}
                  disabled={draftState === 'saving'}
                  className="flex-1 rounded-xl bg-(--color-accent) py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                >
                  {draftState === 'saving' ? 'Wird gespeichert…' : 'Wiederherstellen'}
                </button>
                <button
                  onClick={handleDiscardDraft}
                  disabled={draftState === 'saving'}
                  className="rounded-xl border border-(--color-border) px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50"
                >
                  Verwerfen
                </button>
              </div>
            )}
          </section>
        )}

        <section className="ios-card p-4">
          <h2 className="mb-1 text-base font-semibold">1. Sensoren aktivieren</h2>
          <p className="mb-3 text-sm text-(--color-text-secondary)">
            MotoTrack benötigt Zugriff auf Bewegungssensoren (Schräglage) und Standort (GPS).
          </p>
          <button
            onClick={recorder.requestPermissions}
            className="w-full rounded-xl bg-(--color-accent-2) py-3 text-base font-semibold text-white transition active:scale-[0.98]"
          >
            Zugriff erlauben
          </button>
          <div className="mt-3 flex gap-4 text-sm">
            <PermissionBadge label="Bewegung" state={recorder.motionPermission} />
            <PermissionBadge label="Standort" state={recorder.geoPermission} />
          </div>
        </section>

        <section className="ios-card p-4">
          <h2 className="mb-1 text-base font-semibold">2. Nullposition kalibrieren</h2>
          <p className="mb-3 text-sm text-(--color-text-secondary)">
            Lege dein Telefon so an seinen Platz am Motorrad, wie du fährst – aufrecht stehend – und kalibriere die
            Nullposition für eine präzise Schräglagen-Messung.
          </p>
          <LeanIndicator lean={recorder.currentLean} />
          <button
            onClick={recorder.calibrate}
            disabled={!permissionsGranted || recorder.rawGamma === null}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-(--color-accent) py-3 text-base font-semibold text-(--color-accent) transition active:scale-[0.98] disabled:opacity-40"
          >
            {isCalibrated && <Icon name="check" size={18} />}
            {isCalibrated ? 'Kalibriert – erneut kalibrieren' : 'Kalibrieren'}
          </button>
        </section>

        <button
          onClick={recorder.start}
          disabled={!permissionsGranted}
          className="flex items-center justify-center gap-2 rounded-xl bg-(--color-accent) py-4 text-lg font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-40"
        >
          <Icon name="motorcycle" size={24} strokeWidth={1.8} />{' '}
          {recorder.activeRoute ? 'Geführte Fahrt starten' : 'Aufzeichnung starten'}
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon?: IconName }) {
  return (
    <div className="ios-card flex flex-col items-center justify-center gap-1 p-3 text-center">
      {icon && <Icon name={icon} size={20} className="text-(--color-accent)" />}
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="text-xs text-(--color-text-secondary)">{label}</span>
    </div>
  );
}

// Live-G-Kraft mit farblicher Hervorhebung bei höheren Werten (Bremsen/Kurve).
function GForceCard({ current, max }: { current: number; max: number }) {
  const color = current >= 1.4 ? 'var(--color-danger)' : current >= 1.15 ? 'var(--color-warning)' : 'var(--color-accent)';
  return (
    <div className="ios-card flex flex-col items-center justify-center gap-1 p-3 text-center">
      <Icon name="zap" size={20} style={{ color }} />
      <span className="text-lg font-bold tabular-nums" style={{ color }}>
        {current.toFixed(1)} G
      </span>
      <span className="text-xs text-(--color-text-secondary)">G-Kraft · max {max.toFixed(1)}</span>
    </div>
  );
}

function PermissionBadge({ label, state }: { label: string; state: string }) {
  const color =
    state === 'granted' ? 'var(--color-success)' : state === 'denied' ? 'var(--color-danger)' : 'var(--color-text-secondary)';
  const text = state === 'granted' ? 'Erlaubt' : state === 'denied' ? 'Verweigert' : state === 'unsupported' ? 'Nicht verfügbar' : 'Ausstehend';
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="text-(--color-text-secondary)">
        {label}: <span style={{ color }}>{text}</span>
      </span>
    </span>
  );
}
