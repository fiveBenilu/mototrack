// Blitzer werden aus echten Straßendaten (OpenStreetMap via Overpass) generiert:
// pro grober Kachel werden deterministisch einige wenige Straßen ausgewählt und
// jeweils ein Punkt auf der Straßengeometrie als Blitzer-Standort gesetzt.

export const COARSE_TILE_DEG = 0.05; // ~5,5 km Kantenlänge pro Kachel
const CAMERAS_PER_TILE = 8; // mehr Blitzer, aber weiterhin auf Straßen verteilt
const MIN_CAMERA_DISTANCE_KM = 2; // Mindestabstand zwischen zwei Blitzern (auch auf derselben Straße)
const SAMPLE_INTERVAL_KM = MIN_CAMERA_DISTANCE_KM; // Abstand der Kandidatenpunkte entlang einer Straße

// Blitzer-Zonen (Forza-Stil): Mess-Strecke entlang einer Straße.
const ZONES_PER_TILE = 2;
const ZONE_TARGET_KM = 1.2; // angestrebte Länge der Mess-Strecke
const ZONE_MIN_KM = 0.6; // kürzere Abschnitte werden verworfen
const MIN_ZONE_GAP_KM = 2.5; // Mindestabstand zwischen zwei Zonen-Einfahrten
const HIGHWAY_FILTER = 'motorway|trunk|primary|secondary|tertiary';
// Fällt eine Kachel komplett ohne Treffer aus (z. B. reine Wohngebiete), wird
// mit dieser breiteren Auswahl noch einmal gesucht, statt die Kachel leer zu lassen.
const FALLBACK_HIGHWAY_FILTER = 'unclassified|residential|living_street';
// Mehrere Overpass-Mirror: bei Ausfall/Drosselung wird der nächste versucht.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export interface GeneratedCamera {
  geoKey: string;
  lat: number;
  lng: number;
}

export interface GeneratedZone {
  geoKey: string;
  entryLat: number;
  entryLng: number;
  exitLat: number;
  exitLng: number;
  lengthM: number;
  path: [number, number][]; // Straßenverlauf [[lat,lng],…] zwischen Ein- und Ausfahrt
}

/** Deterministische Hash-Funktion für (großen) Integer + Salt -> [0, 1) */
function hashNum(n: number, salt: number): number {
  let h = 2166136261 ^ salt;
  let v = Math.abs(Math.floor(n));
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (v & 0xffff), 16777619);
    v = Math.floor(v / 0x10000);
  }
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Abstand zweier Koordinaten in km (Haversine) */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface OverpassWay {
  type: string;
  id: number;
  geometry?: { lat: number; lon: number }[];
}

/** Fragt Straßen innerhalb der Bounding-Box mit dem gegebenen highway-Filter ab. */
async function queryWays(filter: string, minLat: number, minLng: number, maxLat: number, maxLng: number): Promise<OverpassWay[] | null> {
  const query = `[out:json][timeout:25];way["highway"~"${filter}"](${minLat},${minLng},${maxLat},${maxLng});out geom;`;

  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Overpass weist Anfragen ohne User-Agent mit 406 ab
          'User-Agent': 'MotoTrack/1.0 (https://mototrack.app)',
        },
        body: 'data=' + encodeURIComponent(query),
        // Hängt ein Mirror, brechen wir ab und versuchen den nächsten
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { elements: OverpassWay[] };
      return data.elements ?? [];
    } catch {
      // nächsten Mirror versuchen
    }
  }
  // Kein Mirror erreichbar -> Kachel später erneut versuchen
  return null;
}

/**
 * Fragt Straßen innerhalb einer groben Kachel ab und wählt deterministisch
 * Punkte auf der Straßengeometrie als Blitzer aus. Entlang jeder Straße werden
 * Kandidaten alle `SAMPLE_INTERVAL_KM` gesetzt, damit auch lange Straßen mehrere
 * gleichmäßig verteilte Blitzer bekommen können; zwei ausgewählte Blitzer
 * liegen aber nie näher als `MIN_CAMERA_DISTANCE_KM` zusammen.
 * Gibt `null` zurück, wenn Overpass nicht erreichbar war (damit die Kachel
 * später erneut versucht wird), sonst die – ggf. leere – Liste der Blitzer.
 */
export async function generateCamerasForTile(
  tileX: number,
  tileY: number,
): Promise<{ cameras: GeneratedCamera[]; zones: GeneratedZone[] } | null> {
  const minLng = tileX * COARSE_TILE_DEG;
  const minLat = tileY * COARSE_TILE_DEG;
  const maxLng = minLng + COARSE_TILE_DEG;
  const maxLat = minLat + COARSE_TILE_DEG;

  let elements = await queryWays(HIGHWAY_FILTER, minLat, minLng, maxLat, maxLng);
  if (elements === null) return null;

  // Reine Wohngebiete ohne übergeordnete Straßen -> mit breiterem Filter erneut suchen,
  // statt die Kachel ganz ohne Blitzer zu lassen.
  if (elements.length === 0) {
    elements = await queryWays(FALLBACK_HIGHWAY_FILTER, minLat, minLng, maxLat, maxLng);
    if (elements === null) return null;
  }

  // Kandidatenpunkte entlang jeder Straßengeometrie, im Abstand von ca. SAMPLE_INTERVAL_KM
  const candidates: { wayId: number; seq: number; lat: number; lng: number }[] = [];
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length === 0) continue;

    let seq = 0;
    let acc = 0;
    let prev = el.geometry[0];
    candidates.push({ wayId: el.id, seq: seq++, lat: prev.lat, lng: prev.lon });

    for (let i = 1; i < el.geometry.length; i++) {
      const pt = el.geometry[i];
      acc += distanceKm(prev.lat, prev.lon, pt.lat, pt.lon);
      if (acc >= SAMPLE_INTERVAL_KM) {
        candidates.push({ wayId: el.id, seq: seq++, lat: pt.lat, lng: pt.lon });
        acc = 0;
      }
      prev = pt;
    }
  }

  // Deterministisch "mischen"
  candidates.sort((a, b) => hashNum(a.wayId * 1000 + a.seq, 11) - hashNum(b.wayId * 1000 + b.seq, 11));

  // Gleichmäßig verteilt auswählen: nur Kandidaten mit Mindestabstand zu bereits gewählten
  const selected: { lat: number; lng: number }[] = [];
  for (const c of candidates) {
    if (selected.length >= CAMERAS_PER_TILE) break;
    if (selected.every((s) => distanceKm(s.lat, s.lng, c.lat, c.lng) >= MIN_CAMERA_DISTANCE_KM)) {
      selected.push({ lat: c.lat, lng: c.lng });
    }
  }

  const cameras = selected.map((c) => ({
    lat: c.lat,
    lng: c.lng,
    geoKey: `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`,
  }));

  return { cameras, zones: buildZonesFromElements(elements) };
}

/**
 * Wählt deterministisch einige längere Straßen aus und schneidet daraus
 * Mess-Strecken (Zonen) von ~ZONE_TARGET_KM Länge entlang der echten Geometrie.
 * Dadurch liegen Ein-/Ausfahrt und der Verlauf dazwischen zwingend auf einer Straße.
 */
function buildZonesFromElements(elements: OverpassWay[]): GeneratedZone[] {
  const ways = elements.filter((el) => el.type === 'way' && el.geometry && el.geometry.length >= 2);
  ways.sort((a, b) => hashNum(a.id, 23) - hashNum(b.id, 23));

  const zones: GeneratedZone[] = [];
  for (const w of ways) {
    if (zones.length >= ZONES_PER_TILE) break;
    const geom = w.geometry!;

    let total = 0;
    for (let i = 1; i < geom.length; i++) total += distanceKm(geom[i - 1].lat, geom[i - 1].lon, geom[i].lat, geom[i].lon);
    if (total < ZONE_MIN_KM) continue;

    // Deterministischer Startversatz, sodass die Zielstrecke noch in die Straße passt.
    const startKm = Math.max(0, total - ZONE_TARGET_KM) * hashNum(w.id, 47);
    let acc = 0;
    let startIdx = 0;
    for (let i = 1; i < geom.length; i++) {
      const seg = distanceKm(geom[i - 1].lat, geom[i - 1].lon, geom[i].lat, geom[i].lon);
      if (acc + seg >= startKm) {
        startIdx = i - 1;
        break;
      }
      acc += seg;
    }

    const path: [number, number][] = [[geom[startIdx].lat, geom[startIdx].lon]];
    let zoneLen = 0;
    for (let j = startIdx + 1; j < geom.length; j++) {
      zoneLen += distanceKm(geom[j - 1].lat, geom[j - 1].lon, geom[j].lat, geom[j].lon);
      path.push([geom[j].lat, geom[j].lon]);
      if (zoneLen >= ZONE_TARGET_KM) break;
    }
    if (zoneLen < ZONE_MIN_KM) continue;

    const entry = path[0];
    const exit = path[path.length - 1];
    if (!zones.every((z) => distanceKm(z.entryLat, z.entryLng, entry[0], entry[1]) >= MIN_ZONE_GAP_KM)) continue;

    zones.push({
      entryLat: entry[0],
      entryLng: entry[1],
      exitLat: exit[0],
      exitLng: exit[1],
      lengthM: zoneLen * 1000,
      path,
      geoKey: `${entry[0].toFixed(5)},${entry[1].toFixed(5)}-${exit[0].toFixed(5)},${exit[1].toFixed(5)}`,
    });
  }

  return zones;
}

/**
 * Punkte & Sterne (0–3) allein anhand der gefahrenen Geschwindigkeit am Blitzer.
 * Schneller = mehr Punkte und Sterne.
 */
export function computePassResult(speedKmh: number): { points: number; stars: number } {
  let stars = 0;
  if (speedKmh >= 180) stars = 3;
  else if (speedKmh >= 130) stars = 2;
  else if (speedKmh >= 90) stars = 1;

  const points = Math.max(0, Math.round(speedKmh));
  return { points, stars };
}

/**
 * Punkte & Sterne (0–3) für eine Zonen-Durchfahrt anhand der gehaltenen
 * Durchschnittsgeschwindigkeit. Zonen belohnen konstant hohes Tempo stärker als
 * ein einzelner Blitzer (Faktor 1,5), weil es schwerer ist, den Schnitt zu halten.
 */
export function computeZonePassResult(avgSpeedKmh: number): { points: number; stars: number } {
  let stars = 0;
  if (avgSpeedKmh >= 140) stars = 3;
  else if (avgSpeedKmh >= 110) stars = 2;
  else if (avgSpeedKmh >= 80) stars = 1;

  const points = Math.max(0, Math.round(avgSpeedKmh * 1.5));
  return { points, stars };
}
