import { Link } from 'react-router-dom';

// Footer mit den Pflicht-Rechtslinks. Auf den Auth-Seiten eingebunden, damit
// Impressum & Datenschutz auch ohne Anmeldung leicht erreichbar sind.
export function LegalFooter() {
  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-(--color-text-secondary)">
      <Link to="/impressum" className="hover:text-(--color-accent)">
        Impressum
      </Link>
      <Link to="/datenschutz" className="hover:text-(--color-accent)">
        Datenschutz
      </Link>
      <Link to="/nutzungsbedingungen" className="hover:text-(--color-accent)">
        Nutzungsbedingungen
      </Link>
    </nav>
  );
}
