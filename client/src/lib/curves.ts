import { haversineDistance, bearingDeg } from './geo';

// Erkennt schön lang gezogene Kurven (Motorrad-„Sweeper") in einer Route:
// gleichmäßiges, anhaltendes Einlenken in eine Richtung – keine 90°-Knicke
// (Kreuzungen) und keine Geraden. Aus dem dichten OSRM-Streckenverlauf.

export interface Curve {
  positions: [number, number][];
  lengthM: number;
  angleDeg: number; // gesamter Richtungswechsel
  radiusM: number; // mittlerer Radius (größer = weiter gezogen)
  direction: 'left' | 'right';
  quality: number; // 0..1 – wie „cool" für eine zügige Fahrt
}

const TURN_MIN_DEG = 2; // darunter gilt es als geradeaus (Rauschen)
const MAX_VERTEX_TURN_DEG = 35; // einzelner Knick darüber = Kreuzung/Spitzkehre, kein Sweeper
const MIN_LENGTH_M = 60; // kürzere Kurven sind kein Erlebnis
const MIN_ANGLE_DEG = 30; // muss spürbar einlenken
const MIN_RADIUS_M = 40; // enger = Spitzkehre statt gezogener Bogen
const MAX_RADIUS_M = 800; // weiter = praktisch gerade

// Vorzeichenbehaftete Richtungsänderung (-180..180); positiv = nach rechts.
function signedTurn(b1: number, b2: number): number {
  return ((b2 - b1 + 540) % 360) - 180;
}

// „Fun"-Bewertung: lange Kurven sind gut, der ideale Radius liegt bei ~120 m
// (genug zum Zügigfahren, nicht zu spitz). Beides multiplikativ.
function curveQuality(lengthM: number, radiusM: number): number {
  const lengthScore = Math.min(1, lengthM / 250);
  const radiusScore = Math.max(0, 1 - Math.abs(Math.log(radiusM / 120)) / Math.log(4));
  return Math.max(0.1, lengthScore * (0.4 + 0.6 * radiusScore));
}

export function detectCurves(geometry: [number, number][]): Curve[] {
  if (geometry.length < 4) return [];

  // Segment-Peilungen und -Längen (seg[i]: von Punkt i nach i+1).
  const seg: { b: number; len: number }[] = [];
  for (let i = 0; i < geometry.length - 1; i++) {
    seg.push({
      b: bearingDeg(geometry[i][0], geometry[i][1], geometry[i + 1][0], geometry[i + 1][1]),
      len: haversineDistance(geometry[i][0], geometry[i][1], geometry[i + 1][0], geometry[i + 1][1]),
    });
  }

  const curves: Curve[] = [];
  let i = 0;
  while (i < seg.length - 1) {
    const t0 = signedTurn(seg[i].b, seg[i + 1].b);
    const a0 = Math.abs(t0);
    if (a0 < TURN_MIN_DEG || a0 > MAX_VERTEX_TURN_DEG) {
      i++;
      continue;
    }
    const sign = Math.sign(t0);

    // Lauf in gleicher Drehrichtung mit moderaten Einzelwinkeln wachsen lassen.
    let j = i;
    let totalAngle = 0;
    let length = 0;
    while (j < seg.length - 1) {
      const t = signedTurn(seg[j].b, seg[j + 1].b);
      const a = Math.abs(t);
      if (Math.sign(t) !== sign || a < TURN_MIN_DEG || a > MAX_VERTEX_TURN_DEG) break;
      totalAngle += a;
      length += seg[j + 1].len;
      j++;
    }

    const radius = totalAngle > 0 ? length / ((totalAngle * Math.PI) / 180) : Infinity;
    if (length >= MIN_LENGTH_M && totalAngle >= MIN_ANGLE_DEG && radius >= MIN_RADIUS_M && radius <= MAX_RADIUS_M) {
      curves.push({
        positions: geometry.slice(i, j + 2),
        lengthM: length,
        angleDeg: totalAngle,
        radiusM: radius,
        direction: sign > 0 ? 'right' : 'left',
        quality: curveQuality(length, radius),
      });
    }
    i = j + 1;
  }

  return curves.sort((a, b) => b.quality - a.quality);
}

// Farbstufe für die Markierung (gelb → orange → pink für Top-Kurven).
export function curveColor(quality: number): string {
  if (quality >= 0.66) return '#ff2d55';
  if (quality >= 0.4) return '#ff9500';
  return '#ffd60a';
}

export function curveTier(quality: number): string {
  if (quality >= 0.66) return 'Top-Kurve';
  if (quality >= 0.4) return 'Schöne Kurve';
  return 'Kurve';
}
