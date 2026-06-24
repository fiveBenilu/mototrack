// Wandelt Wegpunkte über den öffentlichen OSRM-Server in eine straßenfolgende
// Route mit Strecke, Dauer und Abbiege-Anweisungen um. Gleiches Muster wie die
// Overpass-Abfrage der Blitzer (externer, kostenloser Dienst, serverseitig).
// ponytail: öffentlicher OSRM-Demo-Server; bei Drosselung eigenen OSRM hosten.
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

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
export async function routeWaypoints(waypoints: [number, number][]): Promise<RoutedPath> {
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
