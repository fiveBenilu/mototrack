// Wandelt Wegpunkte über öffentliche OSM-Routing-Server in eine straßenfolgende
// Route mit Strecke, Dauer und Abbiege-Anweisungen um. Gleiches Muster wie die
// Overpass-Abfrage der Blitzer (externer, kostenloser Dienst, serverseitig).
// ponytail: öffentliche Demo-Server (OSRM/Valhalla/Nominatim); bei Drosselung selbst hosten.
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
// Valhalla (FOSSGIS) für kurvige Motorrad-Routen: Motorrad-Profil, Autobahnen
// gemieden → bevorzugt Land-/Bergstraßen wie bei calimoto.
const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const UA = 'MotoTrack/1.0 (https://mototrack.app)';

export type RouteProfile = 'fast' | 'curvy';

export interface RouteStep {
  lat: number;
  lng: number;
  instruction: string;
  distanceM: number;
}

export interface RoutedPath {
  distanceM: number;
  durationS: number;
  geometry: [number, number][]; // [[lat,lng],…]
  steps: RouteStep[];
}

interface OsrmManeuver {
  location: [number, number]; // [lng, lat]
  type: string;
  modifier?: string;
}
interface OsrmStep {
  maneuver: OsrmManeuver;
  name: string;
  distance: number;
}

const MODIFIER_DE: Record<string, string> = {
  left: 'links',
  right: 'rechts',
  'slight left': 'leicht links',
  'slight right': 'leicht rechts',
  'sharp left': 'scharf links',
  'sharp right': 'scharf rechts',
  straight: 'geradeaus',
  uturn: 'wenden',
};

function instructionFor(step: OsrmStep): string {
  const { type, modifier } = step.maneuver;
  const onto = step.name ? ` auf ${step.name}` : '';
  switch (type) {
    case 'depart':
      return step.name ? `Losfahren auf ${step.name}` : 'Losfahren';
    case 'arrive':
      return 'Ziel erreicht';
    case 'roundabout':
    case 'rotary':
      return `Im Kreisverkehr${onto}`;
    case 'merge':
      return `Einfädeln${modifier ? ' ' + (MODIFIER_DE[modifier] ?? modifier) : ''}${onto}`;
    case 'on ramp':
      return `Auffahrt${onto}`;
    case 'off ramp':
      return `Abfahrt${modifier ? ' ' + (MODIFIER_DE[modifier] ?? modifier) : ''}${onto}`;
    case 'fork':
      return `${modifier ? MODIFIER_DE[modifier] ?? modifier : 'geradeaus'} halten${onto}`;
    case 'end of road':
    case 'turn':
    case 'new name':
    case 'continue':
    default: {
      const dir = modifier ? MODIFIER_DE[modifier] ?? modifier : 'geradeaus';
      if (dir === 'geradeaus') return `Geradeaus${onto}`;
      if (dir === 'wenden') return `Wenden${onto}`;
      return `${dir.charAt(0).toUpperCase()}${dir.slice(1)} abbiegen${onto}`;
    }
  }
}

/** Berechnet eine Route durch die gegebenen Wegpunkte ([lat,lng]). */
export async function routeWaypoints(
  waypoints: [number, number][],
  profile: RouteProfile = 'fast',
): Promise<RoutedPath> {
  return profile === 'curvy' ? routeValhalla(waypoints) : routeOsrm(waypoints);
}

async function routeOsrm(waypoints: [number, number][]): Promise<RoutedPath> {
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `${OSRM_URL}/${coords}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MotoTrack/1.0 (https://mototrack.app)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Routing fehlgeschlagen (${res.status})`);
  const data = (await res.json()) as any;
  const route = data?.routes?.[0];
  if (!route) throw new Error('Keine Route gefunden');

  const geometry: [number, number][] = (route.geometry?.coordinates ?? []).map(
    ([lng, lat]: [number, number]) => [lat, lng],
  );

  const steps: RouteStep[] = [];
  for (const leg of route.legs ?? []) {
    for (const s of (leg.steps ?? []) as OsrmStep[]) {
      const [lng, lat] = s.maneuver.location;
      steps.push({ lat, lng, instruction: instructionFor(s), distanceM: s.distance });
    }
  }

  return {
    distanceM: route.distance,
    durationS: route.duration,
    geometry,
    steps,
  };
}

// Google-Polyline mit Präzision 1e6 dekodieren (Valhalla-Shape-Format).
function decodePolyline6(encoded: string): [number, number][] {
  const out: [number, number][] = [];
  let lat = 0;
  let lng = 0;
  for (let i = 0; i < encoded.length; ) {
    for (const which of [0, 1]) {
      let shift = 0;
      let result = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(i++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lat / 1e6, lng / 1e6]);
  }
  return out;
}

// Kurvige Route über Valhalla: Motorrad-Profil, Autobahnen/Maut stark gemieden.
async function routeValhalla(waypoints: [number, number][]): Promise<RoutedPath> {
  const body = {
    locations: waypoints.map(([lat, lon]) => ({ lat, lon })),
    costing: 'motorcycle',
    costing_options: { motorcycle: { use_highways: 0.05, use_tolls: 0, use_trails: 0 } },
    directions_options: { language: 'de-DE', units: 'kilometers' },
  };
  const res = await fetch(VALHALLA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Routing fehlgeschlagen (${res.status})`);
  const data = (await res.json()) as any;
  const trip = data?.trip;
  if (!trip?.legs?.length) throw new Error('Keine Route gefunden');

  const geometry: [number, number][] = [];
  const steps: RouteStep[] = [];
  for (const leg of trip.legs) {
    const shape = decodePolyline6(leg.shape ?? '');
    for (const m of leg.maneuvers ?? []) {
      const pt = shape[m.begin_shape_index] ?? shape[0];
      if (!pt) continue;
      steps.push({ lat: pt[0], lng: pt[1], instruction: m.instruction ?? '', distanceM: (m.length ?? 0) * 1000 });
    }
    geometry.push(...shape);
  }

  return {
    distanceM: (trip.summary?.length ?? 0) * 1000,
    durationS: trip.summary?.time ?? 0,
    geometry,
    steps,
  };
}

// Zielpunkt von start aus: distanceM Meter in Richtung bearing (Grad).
function destPoint([lat, lng]: [number, number], distanceM: number, bearingDeg: number): [number, number] {
  const R = 6371000;
  const δ = distanceM / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [(φ2 * 180) / Math.PI, (((λ2 * 180) / Math.PI + 540) % 360) - 180];
}

export interface RoundTrip extends RoutedPath {
  waypoints: [number, number][];
}

/**
 * Rundtour wie bei calimoto: Start + Wunschdistanz → Schleife zurück zum Start.
 * Wegpunkte liegen auf einem Kreis; der Radius wird nach dem ersten Routing
 * einmal an die tatsächliche Straßendistanz angepasst.
 */
export async function generateRoundTrip(
  start: [number, number],
  targetM: number,
  profile: RouteProfile = 'curvy',
): Promise<RoundTrip> {
  const heading = Math.random() * 360; // jede Generierung ergibt eine andere Tour
  // Straßen sind länger als Luftlinie (~Faktor 1.3) → Kreis entsprechend kleiner.
  let radius = targetM / (2 * Math.PI * 1.3);

  const attempt = async (r: number): Promise<RoundTrip> => {
    const center = destPoint(start, r, heading);
    // Winkel des Starts auf dem Kreis + 3 weitere Punkte (90°-Schritte).
    const startAngle = heading + 180;
    const mids: [number, number][] = [90, 180, 270].map((a) => destPoint(center, r, startAngle + a));
    const waypoints: [number, number][] = [start, ...mids, start];
    const routed = await routeWaypoints(waypoints, profile);
    return { ...routed, waypoints };
  };

  let trip = await attempt(radius);
  // Eine Korrektur-Iteration reicht: Radius proportional nachziehen.
  if (Math.abs(trip.distanceM - targetM) / targetM > 0.2 && trip.distanceM > 0) {
    radius = Math.max(500, radius * (targetM / trip.distanceM));
    trip = await attempt(radius);
  }
  return trip;
}

export interface GeocodeResult {
  name: string;
  lat: number;
  lng: number;
}

/** Ortssuche über Nominatim (für Wegpunkte per Adresse/Ortsname). */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const url = `${NOMINATIM_URL}?format=jsonv2&limit=5&accept-language=de&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Suche fehlgeschlagen (${res.status})`);
  const data = (await res.json()) as any[];
  return data.map((d) => ({ name: d.display_name as string, lat: Number(d.lat), lng: Number(d.lon) }));
}
