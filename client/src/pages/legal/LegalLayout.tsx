import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';

// Gemeinsames Layout für die Rechtstexte (Impressum, Datenschutz, AGB).
// Eigener Header mit "Zurück" über die History, damit die Seiten sowohl
// eingeloggt (aus den Einstellungen) als auch ausgeloggt (vom Login) sauber
// funktionieren.
export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-24">
      <header className="safe-top sticky top-0 z-40 flex items-center gap-2 border-b border-(--color-border) bg-(--color-card) px-5 pb-3 pt-4 backdrop-blur-xl">
        <button
          onClick={() => navigate(-1)}
          aria-label="Zurück"
          className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full text-(--color-text-secondary)"
        >
          <Icon name="chevron-left" size={22} />
        </button>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </header>
      <div className="legal-prose flex flex-col gap-3 p-5 text-sm leading-relaxed text-(--color-text)">
        {children}
      </div>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="ios-card flex flex-col gap-2 p-4">
      <h2 className="text-base font-semibold">{heading}</h2>
      {children}
    </section>
  );
}

// Hervorhebung für noch auszufüllende Angaben des Betreibers.
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-(--color-accent)/15 px-1 font-mono text-xs text-(--color-accent)">
      [{children}]
    </span>
  );
}
