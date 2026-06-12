export const CORNER_MIN_LEAN = 20; // ab dieser Schräglage zählt ein Abschnitt als "Kurve"

export interface TrackPoint {
  ts: number;
  lat: number;
  lng: number;
  speed: number;
  lean: number;
}

export interface CornerEvent {
  rideId: number;
  ts: number;
  lean: number;
  side: 'links' | 'rechts';
  rating: 'Bronze' | 'Silber' | 'Gold' | 'Platin';
}

export function rateLean(absLean: number): CornerEvent['rating'] {
  if (absLean >= 50) return 'Platin';
  if (absLean >= 40) return 'Gold';
  if (absLean >= 30) return 'Silber';
  return 'Bronze';
}

function peakToCorner(rideId: number, segment: TrackPoint[]): CornerEvent {
  const peak = segment.reduce((max, p) => (Math.abs(p.lean) > Math.abs(max.lean) ? p : max));
  return {
    rideId,
    ts: peak.ts,
    lean: Math.abs(peak.lean),
    side: peak.lean < 0 ? 'links' : 'rechts',
    rating: rateLean(Math.abs(peak.lean)),
  };
}

export function extractCorners(rideId: number, track: TrackPoint[]): CornerEvent[] {
  const corners: CornerEvent[] = [];
  let segment: TrackPoint[] = [];

  for (const point of track) {
    if (Math.abs(point.lean) >= CORNER_MIN_LEAN) {
      segment.push(point);
    } else if (segment.length > 0) {
      corners.push(peakToCorner(rideId, segment));
      segment = [];
    }
  }
  if (segment.length > 0) corners.push(peakToCorner(rideId, segment));
  return corners;
}

/** Aggregiert Bestwerte und Punkte für eine Liste von Ride-Rows. */
export function aggregateTotals(rides: any[], points: number) {
  const totals = rides.reduce(
    (acc, r) => {
      acc.rides += 1;
      acc.distanceM += r.distance_m;
      acc.durationS += r.duration_s;
      acc.maxSpeedKmh = Math.max(acc.maxSpeedKmh, r.max_speed_kmh);
      acc.maxLeanLeft = Math.max(acc.maxLeanLeft, r.max_lean_left);
      acc.maxLeanRight = Math.max(acc.maxLeanRight, r.max_lean_right);
      return acc;
    },
    { rides: 0, distanceM: 0, durationS: 0, maxSpeedKmh: 0, maxLeanLeft: 0, maxLeanRight: 0 },
  );
  return { ...totals, points };
}

export function mapHistory(rides: any[]) {
  return rides.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    distanceM: r.distance_m,
    durationS: r.duration_s,
    maxSpeedKmh: r.max_speed_kmh,
    avgSpeedKmh: r.avg_speed_kmh,
    maxLean: Math.max(r.max_lean_left, r.max_lean_right),
  }));
}

export function topCorners(rides: any[]): CornerEvent[] {
  return rides
    .slice(0, 10)
    .flatMap((r) => extractCorners(r.id, r.track_data ? JSON.parse(r.track_data) : []))
    .sort((a, b) => b.lean - a.lean)
    .slice(0, 25);
}
