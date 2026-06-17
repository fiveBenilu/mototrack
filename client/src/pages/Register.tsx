import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import { LegalFooter } from '../components/LegalFooter';
import { ApiError } from '../lib/api';

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accepted) {
      setError('Bitte stimme den Nutzungsbedingungen und der Datenschutzerklärung zu.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await register(username, password, displayName || undefined);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registrierung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="safe-top flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-(--color-accent) text-white shadow-lg">
          <Icon name="motorcycle" size={34} strokeWidth={1.6} />
        </div>
        <h1 className="text-2xl font-bold">Account erstellen</h1>
        <p className="mt-1 text-sm text-(--color-text-secondary)">Nur Benutzername & Passwort nötig</p>
      </div>
      <form onSubmit={onSubmit} className="ios-card flex flex-col gap-3 p-5">
        <input
          className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3 text-base outline-none focus:border-(--color-accent)"
          placeholder="Benutzername"
          autoCapitalize="none"
          autoCorrect="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3 text-base outline-none focus:border-(--color-accent)"
          placeholder="Anzeigename (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <input
          className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3 text-base outline-none focus:border-(--color-accent)"
          placeholder="Passwort (min. 6 Zeichen)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <label className="flex items-start gap-2 text-xs text-(--color-text-secondary)">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-(--color-accent)"
          />
          <span>
            Ich akzeptiere die{' '}
            <Link to="/nutzungsbedingungen" className="font-semibold text-(--color-accent)">
              Nutzungsbedingungen
            </Link>{' '}
            und habe die{' '}
            <Link to="/datenschutz" className="font-semibold text-(--color-accent)">
              Datenschutzerklärung
            </Link>{' '}
            gelesen.
          </span>
        </label>
        {error && <p className="text-sm text-(--color-danger)">{error}</p>}
        <button
          type="submit"
          disabled={busy || !accepted}
          className="mt-1 rounded-xl bg-(--color-accent) py-3 text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Erstellen…' : 'Account erstellen'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-(--color-text-secondary)">
        Schon registriert?{' '}
        <Link to="/login" className="font-semibold text-(--color-accent)">
          Anmelden
        </Link>
      </p>
      <LegalFooter />
    </div>
  );
}
