import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const CONSENT_KEY = 'mototrack-consent-v1';

// Einmaliger Hinweis zur Datenverarbeitung. Es werden nur technisch notwendige
// Cookies gesetzt (kein Tracking), daher ist dies ein Informations-/
// Bestätigungs-Banner, kein Tracking-Consent. Standort und Push werden separat
// per ausdrücklicher Opt-in-Berechtigung am Nutzungsort eingeholt.
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
    } catch {
      /* localStorage nicht verfügbar – Banner einfach nicht zeigen */
    }
  }, []);

  if (!visible) return null;

  function accept() {
    try {
      localStorage.setItem(CONSENT_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3">
      <div className="ios-card mx-auto max-w-md border border-(--color-border) p-4 shadow-xl">
        <p className="text-sm leading-relaxed">
          MotoTrack verwendet nur ein technisch notwendiges Cookie für die Anmeldung – kein Tracking,
          keine Werbung. Standort- und Sensordaten werden nur mit deiner ausdrücklichen Zustimmung und
          nur während einer Aufzeichnung verarbeitet. Mehr dazu in der{' '}
          <Link to="/datenschutz" className="font-semibold text-(--color-accent)">
            Datenschutzerklärung
          </Link>
          .
        </p>
        <button
          onClick={accept}
          className="mt-3 w-full rounded-xl bg-(--color-accent) py-2.5 text-sm font-semibold text-white transition active:scale-[0.98]"
        >
          Verstanden
        </button>
      </div>
    </div>
  );
}
