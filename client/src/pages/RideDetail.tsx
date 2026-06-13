import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { RideTrackMap, RideStatCard } from '../components/RideTrackMap';
import { api, ApiError } from '../lib/api';
import { formatDistance, formatDuration } from '../lib/geo';
import { downloadRideGpx } from '../lib/gpx';
import type { Ride } from '../lib/types';

export function RideDetail() {
  const { id } = useParams();
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get<{ ride: Ride }>(`/rides/${id}`)
      .then((data) => {
        setRide(data.ride);
        setShareToken(data.ride.shareToken);
      })
      .catch(() => setError(true));
  }, [id]);

  const shareUrl = shareToken ? `${window.location.origin}/r/${shareToken}` : null;

  async function handleShare() {
    setShareBusy(true);
    try {
      let url = shareUrl;
      if (!url) {
        const { shareToken: token } = await api.post<{ shareToken: string }>(`/rides/${id}/share`);
        setShareToken(token);
        url = `${window.location.origin}/r/${token}`;
      }
      // Web Share API (mobil) bevorzugen, sonst in die Zwischenablage kopieren.
      if (navigator.share) {
        await navigator.share({ title: 'MotoTrack-Fahrt', url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e) {
      // Abbruch des Share-Dialogs ist kein Fehler.
      if (e instanceof ApiError) setError(true);
    } finally {
      setShareBusy(false);
    }
  }

  async function handleUnshare() {
    setShareBusy(true);
    try {
      await api.del(`/rides/${id}/share`);
      setShareToken(null);
    } finally {
      setShareBusy(false);
    }
  }

  const track = ride?.track ?? [];

  return (
    <div className="pb-24">
      <PageHeader
        title="Fahrt"
        subtitle={ride ? new Date(ride.startedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : undefined}
        backTo="/statistik"
      />

      {error && <p className="p-5 text-sm text-(--color-text-secondary)">Fahrt konnte nicht geladen werden.</p>}

      {ride && (
        <div className="flex flex-col gap-4 p-5">
          <RideTrackMap track={track} />

          <div className="grid grid-cols-2 gap-3">
            <RideStatCard label="Distanz" value={formatDistance(ride.distanceM)} />
            <RideStatCard label="Dauer" value={formatDuration(ride.durationS)} />
            <RideStatCard label="Max. Speed" value={`${ride.maxSpeedKmh.toFixed(0)} km/h`} />
            <RideStatCard label="Ø Speed" value={`${ride.avgSpeedKmh.toFixed(0)} km/h`} />
            <RideStatCard label="Schräglage links" value={`${ride.maxLeanLeft.toFixed(0)}°`} />
            <RideStatCard label="Schräglage rechts" value={`${ride.maxLeanRight.toFixed(0)}°`} />
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleShare}
              disabled={shareBusy}
              className="flex items-center justify-center gap-2 rounded-xl bg-(--color-accent) py-3 text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              <Icon name="share" size={18} /> {copied ? 'Link kopiert!' : shareToken ? 'Link teilen' : 'Öffentlich teilen'}
            </button>

            {shareToken && (
              <div className="ios-card flex flex-col gap-2 p-3">
                <p className="text-xs text-(--color-text-secondary)">Öffentlicher Link aktiv – jeder mit dem Link kann diese Fahrt sehen:</p>
                <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-(--color-bg) px-3 py-2 text-xs">{shareUrl}</code>
                <button
                  onClick={handleUnshare}
                  disabled={shareBusy}
                  className="self-start text-xs font-medium text-(--color-danger) disabled:opacity-50"
                >
                  Link deaktivieren
                </button>
              </div>
            )}

            {track.length > 0 && (
              <button
                onClick={() => downloadRideGpx(ride)}
                className="flex items-center justify-center gap-2 rounded-xl border border-(--color-border) bg-(--color-bg-elevated) py-3 text-base font-semibold transition active:scale-[0.98]"
              >
                <Icon name="download" size={18} /> Als GPX exportieren
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
