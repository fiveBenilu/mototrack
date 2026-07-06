import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useTheme, type ThemePref } from '../context/ThemeContext';
import { api, ApiError } from '../lib/api';
import { getPushState, subscribePush, unsubscribePush, type PushState } from '../lib/push';

const themeOptions: { value: ThemePref; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

export function Einstellungen() {
  const { user, logout, setUser } = useAuth();
  const { pref, setPref } = useTheme();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [pushState, setPushState] = useState<PushState>('unsubscribed');
  const [pushBusy, setPushBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getPushState().then(setPushState);
  }, []);

  async function onExportData() {
    setDataError(null);
    setExporting(true);
    try {
      const res = await fetch('/api/users/me/export', { credentials: 'include' });
      if (!res.ok) {
        // Echte Server-Fehlermeldung durchreichen statt eines generischen Texts.
        let msg = `Export fehlgeschlagen (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* keine JSON-Antwort (z. B. veraltete Server-Version → bitte neu starten) */
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      const filename = `mototrack-export-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);

      // Standard-Download per <a download>. Funktioniert auf Desktop und
      // modernem mobilem Safari.
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Fallback für installierte iOS-PWAs (standalone), in denen der
      // <a download>-Klick oft ignoriert wird: Datei in einem neuen Tab öffnen,
      // sodass sie über das Teilen-Menü gesichert werden kann.
      const isStandalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (isStandalone) window.open(url, '_blank');

      // URL erst verzögert freigeben, damit Download/Tab sie noch laden können.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Export fehlgeschlagen. Bitte später erneut versuchen.');
    } finally {
      setExporting(false);
    }
  }

  async function onDeleteAccount() {
    setDataError(null);
    setDeleting(true);
    try {
      await api.del('/users/me', { password: deletePassword });
      await logout();
      navigate('/login');
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setDeleting(false);
    }
  }

  async function onTogglePush() {
    setPushBusy(true);
    try {
      setPushState(pushState === 'subscribed' ? await unsubscribePush() : await subscribePush());
    } catch {
      setPushState(await getPushState());
    } finally {
      setPushBusy(false);
    }
  }

  async function onToggleShareActivity() {
    if (!user) return;
    setShareBusy(true);
    try {
      const data = await api.put<{ user: typeof user }>('/users/me', {
        shareActivity: !(user.shareActivity ?? true),
      });
      if (data.user) setUser(data.user);
    } finally {
      setShareBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    navigate('/login');
  }

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMessage(null);
    setProfileError(null);
    setSavingProfile(true);
    try {
      const data = await api.put<{ user: typeof user }>('/users/me', { displayName: displayName.trim() });
      if (data.user) setUser(data.user);
      setProfileMessage('Gespeichert!');
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSavingProfile(false);
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);
    setSavingPassword(true);
    try {
      await api.put('/users/me/password', { currentPassword, newPassword });
      setPasswordMessage('Passwort geändert!');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Ändern fehlgeschlagen');
    } finally {
      setSavingPassword(false);
    }
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const data = await api.upload<{ user: typeof user }>('/users/me/avatar', formData);
      if (data.user) setUser(data.user);
    } catch (err) {
      setAvatarError(err instanceof ApiError ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="pb-24">
      <PageHeader title="Einstellungen" />
      <div className="flex flex-col gap-4 p-5">
        <section className="ios-card flex items-center gap-4 p-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-(--color-accent) text-xl font-bold text-white"
          >
            {user?.avatarPath ? (
              <img src={user.avatarPath} alt="Profilbild" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                {(user?.displayName ?? '?').slice(0, 1).toUpperCase()}
              </span>
            )}
            {avatarUploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              </span>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />
          <div>
            <p className="text-base font-semibold">{user?.displayName}</p>
            <p className="text-sm text-(--color-text-secondary)">@{user?.username}</p>
            <button onClick={() => fileInputRef.current?.click()} className="mt-1 text-xs font-semibold text-(--color-accent)">
              Profilbild ändern
            </button>
          </div>
        </section>
        {avatarError && <p className="text-sm text-(--color-danger)">{avatarError}</p>}

        <Link to="/freunde" className="ios-card flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Icon name="users" size={24} className="text-(--color-accent)" />
            <span className="font-semibold">Freunde verwalten</span>
          </div>
          <Icon name="chevron-right" size={20} className="text-(--color-text-secondary)" />
        </Link>

        {user?.isAdmin && (
          <Link to="/admin" className="ios-card flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <Icon name="gauge" size={24} className="text-(--color-accent)" />
              <span className="font-semibold">Admin-Dashboard</span>
            </div>
            <Icon name="chevron-right" size={20} className="text-(--color-text-secondary)" />
          </Link>
        )}

        <section className="ios-card p-4">
          <h2 className="mb-2 text-base font-semibold">Profil</h2>
          <form onSubmit={onSaveProfile} className="flex flex-col gap-2">
            <label className="text-xs text-(--color-text-secondary)">Anzeigename</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
              className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={savingProfile || displayName.trim().length === 0}
              className="mt-1 rounded-xl bg-(--color-accent) py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {savingProfile ? 'Speichern…' : 'Speichern'}
            </button>
            {profileMessage && <p className="text-sm text-(--color-success)">{profileMessage}</p>}
            {profileError && <p className="text-sm text-(--color-danger)">{profileError}</p>}
          </form>
        </section>

        <section className="ios-card p-4">
          <h2 className="mb-2 text-base font-semibold">Dein Freunde-Code</h2>
          <p className="rounded-xl bg-(--color-bg) px-4 py-3 text-center text-lg font-mono font-bold tracking-widest">
            {user?.friendCode}
          </p>
          <p className="mt-2 text-xs text-(--color-text-secondary)">
            Teile diesen Code, damit dich Freunde hinzufügen können.
          </p>
        </section>

        <section className="ios-card p-4">
          <h2 className="mb-2 text-base font-semibold">Passwort ändern</h2>
          <form onSubmit={onChangePassword} className="flex flex-col gap-2">
            <label className="text-xs text-(--color-text-secondary)">Aktuelles Passwort</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3 text-sm outline-none"
            />
            <label className="text-xs text-(--color-text-secondary)">Neues Passwort (min. 6 Zeichen)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={savingPassword || currentPassword.length === 0 || newPassword.length < 6}
              className="mt-1 rounded-xl bg-(--color-accent) py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {savingPassword ? 'Ändern…' : 'Passwort ändern'}
            </button>
            {passwordMessage && <p className="text-sm text-(--color-success)">{passwordMessage}</p>}
            {passwordError && <p className="text-sm text-(--color-danger)">{passwordError}</p>}
          </form>
        </section>

        <section className="ios-card p-4">
          <h2 className="mb-2 text-base font-semibold">Darstellung</h2>
          <div className="ios-segment">
            {themeOptions.map((opt) => (
              <button key={opt.value} aria-pressed={pref === opt.value} onClick={() => setPref(opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-(--color-text-secondary)">Auto wechselt nach Tageszeit.</p>
        </section>

        <section className="ios-card p-4">
          <h2 className="mb-1 text-base font-semibold">Benachrichtigungen</h2>
          <p className="mb-3 text-sm text-(--color-text-secondary)">
            Push-Benachrichtigungen für Freundschaftsanfragen und neue Gruppennachrichten – auch wenn die App geschlossen ist.
          </p>
          {pushState === 'unsupported' ? (
            <p className="text-sm text-(--color-text-secondary)">
              Dieses Gerät/dieser Browser unterstützt keine Push-Benachrichtigungen.
            </p>
          ) : pushState === 'denied' ? (
            <p className="text-sm text-(--color-danger)">
              Benachrichtigungen sind im Browser blockiert. Bitte in den Website-Einstellungen erlauben.
            </p>
          ) : (
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium">Push-Benachrichtigungen</span>
              <input
                type="checkbox"
                className="ios-switch"
                checked={pushState === 'subscribed'}
                disabled={pushBusy}
                onChange={onTogglePush}
              />
            </label>
          )}
        </section>

        <section className="ios-card p-4">
          <h2 className="mb-1 text-base font-semibold">Aktivität teilen</h2>
          <p className="mb-3 text-sm text-(--color-text-secondary)">
            Wenn aktiv, bekommen deine Freunde eine Benachrichtigung, wenn du online gehst, losfährst
            oder eine Tour beendest. Aus = du fährst anonym.
          </p>
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {(user?.shareActivity ?? true) ? 'Aktivität wird geteilt' : 'Anonym – nichts wird geteilt'}
            </span>
            <input
              type="checkbox"
              className="ios-switch"
              checked={user?.shareActivity ?? true}
              disabled={shareBusy}
              onChange={onToggleShareActivity}
            />
          </label>
        </section>

        <section className="ios-card p-4">
          <h2 className="mb-1 text-base font-semibold">Daten & Datenschutz</h2>
          <p className="mb-3 text-sm text-(--color-text-secondary)">
            Lade alle zu dir gespeicherten Daten herunter (DSGVO Art. 20) oder lösche dein Konto
            endgültig (Art. 17).
          </p>
          <button
            onClick={onExportData}
            disabled={exporting}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-(--color-border) bg-(--color-bg) py-3 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50"
          >
            <Icon name="download" size={18} />
            {exporting ? 'Wird vorbereitet…' : 'Meine Daten exportieren'}
          </button>

          {!showDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              className="mt-3 w-full rounded-xl border border-(--color-danger) py-3 text-sm font-semibold text-(--color-danger) transition active:scale-[0.98]"
            >
              Konto löschen
            </button>
          ) : (
            <div className="mt-3 rounded-xl border border-(--color-danger) p-3">
              <p className="mb-2 text-sm font-semibold text-(--color-danger)">
                Konto und alle Daten unwiderruflich löschen?
              </p>
              <p className="mb-3 text-xs text-(--color-text-secondary)">
                Alle Fahrten, Freundschaften, Gruppen und Nachrichten werden sofort gelöscht. Gib zur
                Bestätigung dein Passwort ein.
              </p>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Passwort"
                className="mb-2 w-full rounded-xl border border-(--color-border) bg-(--color-bg) px-4 py-3 text-sm outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={onDeleteAccount}
                  disabled={deleting || deletePassword.length === 0}
                  className="flex-1 rounded-xl bg-(--color-danger) py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                >
                  {deleting ? 'Wird gelöscht…' : 'Endgültig löschen'}
                </button>
                <button
                  onClick={() => {
                    setShowDelete(false);
                    setDeletePassword('');
                    setDataError(null);
                  }}
                  className="rounded-xl border border-(--color-border) px-4 py-3 text-sm font-medium transition active:scale-[0.98]"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
          {dataError && <p className="mt-2 text-sm text-(--color-danger)">{dataError}</p>}
        </section>

        <section className="ios-card p-4">
          <h2 className="mb-2 text-base font-semibold">Rechtliches</h2>
          <div className="flex flex-col divide-y divide-(--color-border)">
            <Link to="/impressum" className="flex items-center justify-between py-2.5 text-sm font-medium">
              Impressum
              <Icon name="chevron-right" size={18} className="text-(--color-text-secondary)" />
            </Link>
            <Link to="/datenschutz" className="flex items-center justify-between py-2.5 text-sm font-medium">
              Datenschutzerklärung
              <Icon name="chevron-right" size={18} className="text-(--color-text-secondary)" />
            </Link>
            <Link to="/nutzungsbedingungen" className="flex items-center justify-between py-2.5 text-sm font-medium">
              Nutzungsbedingungen
              <Icon name="chevron-right" size={18} className="text-(--color-text-secondary)" />
            </Link>
          </div>
        </section>

        <button
          onClick={onLogout}
          className="rounded-xl border border-(--color-danger) py-3 text-base font-semibold text-(--color-danger) transition active:scale-[0.98]"
        >
          Abmelden
        </button>
      </div>
    </div>
  );
}
