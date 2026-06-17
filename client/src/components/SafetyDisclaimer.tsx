import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

const SAFETY_KEY = 'mototrack-safety-ack-v1';

// Kurzer, dauerhaft sichtbarer Sicherheitshinweis. Wird auf der Fahren- und der
// Kartenseite eingebunden, um klarzustellen, dass die App keine
// Geschwindigkeitsüberschreitungen unterstützt.
//
// Optional schließbar: Mit `storageKey` wird der Schließzustand dauerhaft im
// localStorage gemerkt. Die verpflichtende Erstnutzungs-Bestätigung
// (SafetyGate) bleibt davon unberührt.
export function SafetyNote({
  className = '',
  storageKey,
}: {
  className?: string;
  storageKey?: string;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      setHidden(!!localStorage.getItem(storageKey));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  if (hidden) return null;

  function dismiss() {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, '1');
      } catch {
        /* ignore */
      }
    }
    setHidden(true);
  }

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border border-(--color-border) bg-(--color-bg-elevated) p-3 text-xs leading-relaxed text-(--color-text-secondary) ${className}`}
    >
      <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-(--color-danger)" />
      <span className="flex-1">
        MotoTrack unterstützt kein Schnellfahren. Fahre stets verantwortungsbewusst und im Rahmen der
        zulässigen Höchstgeschwindigkeit. Punkte und Zonen sind reine Unterhaltung – bediene das Gerät
        nie während der Fahrt.{' '}
        <Link to="/nutzungsbedingungen" className="font-semibold text-(--color-accent)">
          Mehr
        </Link>
      </span>
      {storageKey && (
        <button
          onClick={dismiss}
          aria-label="Hinweis schließen"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-(--color-text-secondary) transition active:scale-90"
        >
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}

// Einmalige, verpflichtende Sicherheits-Bestätigung vor der ersten Nutzung der
// Aufzeichnung. Überlagert die Seite, bis der Nutzer aktiv zustimmt.
export function SafetyGate() {
  const [acknowledged, setAcknowledged] = useState(true);

  useEffect(() => {
    try {
      setAcknowledged(!!localStorage.getItem(SAFETY_KEY));
    } catch {
      setAcknowledged(true);
    }
  }, []);

  if (acknowledged) return null;

  function accept() {
    try {
      localStorage.setItem(SAFETY_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setAcknowledged(true);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm">
      <div className="ios-card max-h-[85dvh] w-full max-w-md overflow-y-auto border border-(--color-danger) p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-(--color-danger)">
          <Icon name="alert" size={22} /> Sicherheit zuerst
        </h2>
        <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed">
          <p>
            MotoTrack ist ein Werkzeug zur privaten Aufzeichnung von Fahrten.{' '}
            <strong>Die App fordert nicht zum Schnellfahren auf und belohnt keine
            Geschwindigkeitsüberschreitungen.</strong>
          </p>
          <p>
            Spielerische Elemente (Punkte, Schräglage, Zonen) sind reine Unterhaltung. Fahre stets
            verantwortungsbewusst, vorausschauend und ausschließlich im Rahmen der geltenden Gesetze und
            der zulässigen Höchstgeschwindigkeit.
          </p>
          <p>
            Richte die App vor Fahrtantritt ein und bediene sie niemals während der Fahrt. Die Nutzung
            erfolgt auf eigenes Risiko. Es gelten die{' '}
            <Link to="/nutzungsbedingungen" className="font-semibold text-(--color-accent)">
              Nutzungsbedingungen
            </Link>
            .
          </p>
        </div>
        <button
          onClick={accept}
          className="mt-4 w-full rounded-xl bg-(--color-accent) py-3 text-base font-semibold text-white transition active:scale-[0.98]"
        >
          Ich fahre verantwortungsbewusst
        </button>
      </div>
    </div>
  );
}
