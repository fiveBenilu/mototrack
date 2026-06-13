import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Globale Statusleisten ganz oben:
 *  - roter „Offline“-Banner (wie bei Spotify), sobald keine Netzwerkverbindung
 *    besteht; verschwindet automatisch, wenn man wieder online ist.
 *  - Hinweis „Neue Version verfügbar“, sobald ein neuer Service Worker bereit
 *    ist; tippen lädt die neue Version (löst das Cache-Problem dauerhaft).
 */
export function StatusBanners() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (offline) {
    return <div className="status-banner status-banner--offline">Offline – keine Verbindung</div>;
  }

  if (needRefresh) {
    return (
      <button className="status-banner status-banner--update" onClick={() => updateServiceWorker(true)}>
        Neue Version verfügbar – tippen zum Aktualisieren
      </button>
    );
  }

  return null;
}
