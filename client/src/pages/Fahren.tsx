import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Icon, type IconName } from '../components/Icon';
import { LeanIndicator } from '../components/LeanIndicator';
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
    return (
      <div className="pb-24">
        <PageHeader title={recorder.status === 'paused' ? 'Pausiert' : 'Aufzeichnung läuft'} />
        <div className="flex flex-col gap-4 p-5">
          <div className="ios-card flex flex-col items-center gap-1 p-6">
            <p className="text-6xl font-bold tabular-nums">{recorder.currentSpeed.toFixed(0)}</p>
            <p className="text-sm font-medium text-(--color-text-secondary)">km/h</p>
          </div>

          <div className="ios-card p-4">
            <LeanIndicator lean={recorder.currentLean} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Distanz" value={formatDistance(recorder.distanceM)} />
            <StatCard label="Dauer" value={formatDuration(recorder.durationS)} />
            <StatCard label="Max" value={`${recorder.maxSpeedKmh.toFixed(0)} km/h`} />
          </div>

          <div className="flex gap-3">
            {recorder.status === 'recording' ? (
              <button
                onClick={recorder.pause}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-(--color-border) bg-(--color-bg-elevated) py-3 text-base font-semibold transition active:scale-[0.98]"
              >
                <Icon name="pause" size={18} /> Pause
              </button>
            ) : (
              <button
                onClick={recorder.resume}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-(--color-border) bg-(--color-bg-elevated) py-3 text-base font-semibold transition active:scale-[0.98]"
              >
                <Icon name="play" size={18} /> Weiter
              </button>
            )}
            <button
              onClick={handleStop}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-(--color-danger) py-3 text-base font-semibold text-white transition active:scale-[0.98]"
            >
              <Icon name="stop" size={18} /> Beenden
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <PageHeader title="Fahren" subtitle="Sensoren aktivieren, kalibrieren, los geht's" />
      <div className="flex flex-col gap-4 p-5">
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
          <Icon name="motorcycle" size={24} strokeWidth={1.8} /> Aufzeichnung starten
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
