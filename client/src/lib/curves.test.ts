// Selbst-Check der Kurvenerkennung.
// Lauf: cd server && npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' ../client/src/lib/curves.test.ts
import assert from 'assert';
import { detectCurves } from './curves';

const LAT0 = 51;
const LNG0 = 10;
const M_PER_DEG_LAT = 111320;
const mPerDegLng = 111320 * Math.cos((LAT0 * Math.PI) / 180);

function pt(x: number, y: number): [number, number] {
  return [LAT0 + y / M_PER_DEG_LAT, LNG0 + x / mPerDegLng];
}

// Viertelkreis-Bogen, Radius R, n Segmente.
function arc(R: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const phi = (Math.PI / 2) * (k / n);
    out.push(pt(R * Math.sin(phi), R - R * Math.cos(phi)));
  }
  return out;
}

// 1) Gezogener Bogen R=120m -> genau eine Kurve mit ~120m Radius, ~90°.
const curves = detectCurves(arc(120, 30));
assert.strictEqual(curves.length, 1, `erwartet 1 Kurve, bekam ${curves.length}`);
const c = curves[0];
assert(Math.abs(c.radiusM - 120) < 30, `Radius ~120 erwartet, war ${c.radiusM.toFixed(0)}`);
assert(c.angleDeg > 70 && c.angleDeg < 100, `~90° erwartet, war ${c.angleDeg.toFixed(0)}`);
assert(c.lengthM > 150, `Länge >150m erwartet, war ${c.lengthM.toFixed(0)}`);

// 2) Gerade -> keine Kurve.
const straight: [number, number][] = [pt(0, 0), pt(0, 100), pt(0, 200), pt(0, 300), pt(0, 400)];
assert.strictEqual(detectCurves(straight).length, 0, 'Gerade darf keine Kurve liefern');

// 3) 90°-Knick (ein scharfer Vertex) -> keine coole Kurve.
const kink: [number, number][] = [pt(0, 0), pt(0, 100), pt(0, 200), pt(100, 200), pt(200, 200)];
assert.strictEqual(detectCurves(kink).length, 0, '90°-Knick darf nicht als Kurve gelten');

console.log('curves.test.ts OK');
