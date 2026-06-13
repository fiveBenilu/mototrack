import type { Ride } from './types';

// Wandelt eine Fahrt in eine GPX-Datei (GPS Exchange Format) um. GPX wird von
// nahezu allen Karten-/Tracking-Tools gelesen (Komoot, Strava, Garmin, …), sodass
// Nutzer ihre Strecken exportieren und weiterverwenden können.

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}

export function rideToGpx(ride: Ride): string {
  const name = `MotoTrack-Fahrt ${new Date(ride.startedAt).toLocaleString('de-DE')}`;
  const points = ride.track
    .map(
      (p) =>
        `      <trkpt lat="${p.lat}" lon="${p.lng}">\n` +
        `        <time>${new Date(p.ts).toISOString()}</time>\n` +
        `        <extensions><speed>${(p.speed / 3.6).toFixed(2)}</speed></extensions>\n` +
        `      </trkpt>`,
    )
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="MotoTrack" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    '  <metadata>\n' +
    `    <name>${escapeXml(name)}</name>\n` +
    `    <time>${new Date(ride.startedAt).toISOString()}</time>\n` +
    '  </metadata>\n' +
    '  <trk>\n' +
    `    <name>${escapeXml(name)}</name>\n` +
    '    <trkseg>\n' +
    points +
    '\n    </trkseg>\n' +
    '  </trk>\n' +
    '</gpx>\n'
  );
}

/** Löst im Browser den Download der Fahrt als .gpx-Datei aus. */
export function downloadRideGpx(ride: Ride) {
  const blob = new Blob([rideToGpx(ride)], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date(ride.startedAt).toISOString().slice(0, 10);
  a.href = url;
  a.download = `mototrack-${date}-${ride.id}.gpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
