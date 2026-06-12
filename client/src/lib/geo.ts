const EARTH_RADIUS_M = 6371000;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distanz zwischen zwei Koordinaten in Metern (Haversine-Formel) */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export function msToKmh(ms: number): number {
  return ms * 3.6;
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)} km`;
}

/** Farbskala für die Routenanzeige nach Geschwindigkeit (km/h) */
export const SPEED_COLOR_STOPS: { max: number; color: string; label: string }[] = [
  { max: 30, color: '#34c759', label: '0–30' },
  { max: 60, color: '#a3e635', label: '30–60' },
  { max: 90, color: '#ffd60a', label: '60–90' },
  { max: 120, color: '#ff9500', label: '90–120' },
  { max: 150, color: '#ff3b30', label: '120–150' },
  { max: Infinity, color: '#af52de', label: '150+' },
];

export function speedColor(kmh: number): string {
  return (SPEED_COLOR_STOPS.find((s) => kmh <= s.max) ?? SPEED_COLOR_STOPS[SPEED_COLOR_STOPS.length - 1]).color;
}

/**
 * Zerlegt eine Route in Abschnitte, die jeweils nach der gefahrenen
 * Geschwindigkeit eingefärbt sind (für die mehrfarbige Anzeige auf der Karte).
 */
export function buildSpeedSegments(
  track: { lat: number; lng: number; speed: number }[],
): { positions: [number, number][]; color: string }[] {
  if (track.length < 2) return [];

  const segments: { positions: [number, number][]; color: string }[] = [];
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    const color = speedColor((a.speed + b.speed) / 2);
    const last = segments[segments.length - 1];
    if (last && last.color === color) {
      last.positions.push([b.lat, b.lng]);
    } else {
      segments.push({ positions: [[a.lat, a.lng], [b.lat, b.lng]], color });
    }
  }
  return segments;
}
