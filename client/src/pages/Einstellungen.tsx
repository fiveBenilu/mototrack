import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useTheme, type ThemePref } from '../context/ThemeContext';
import { api, ApiError } from '../lib/api';

const themeOptions: { value: ThemePref; label: string }[] = [
  { value: 'auto', label: 'Automatisch (Tageszeit)' },
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
          <div className="flex flex-col gap-2">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPref(opt.value)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                  pref === opt.value
                    ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)'
                    : 'border-(--color-border) bg-(--color-bg)'
                }`}
              >
                {opt.label}
                {pref === opt.value && <Icon name="check" size={18} />}
              </button>
            ))}
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
