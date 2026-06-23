// Selbst-Check der Schräglagen-Mathematik.
// Lauf: npx ts-node client/src/lib/lean.test.ts  (oder via vitest, falls vorhanden)
import assert from 'assert';
import { gravityFromOrientation, computeBikeFrame, leanAngle, type Vec3 } from './lean';

// Rodrigues: Vektor v um Einheitsachse k um theta Grad drehen.
function rotate(v: Vec3, k: Vec3, deg: number): Vec3 {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cr: Vec3 = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [
    v[0] * c + cr[0] * s + k[0] * kv * (1 - c),
    v[1] * c + cr[1] * s + k[1] * kv * (1 - c),
    v[2] * c + cr[2] * s + k[2] * kv * (1 - c),
  ];
}

const near = (a: number, b: number, tol = 0.5) =>
  assert.ok(Math.abs(a - b) <= tol, `erwartet ${b}±${tol}, war ${a.toFixed(2)}`);

// 1) Flach montiert (beta=0): reine Gamma-Neigung von 20° → 20° Schräglage.
{
  const frame = computeBikeFrame(gravityFromOrientation(0, 0));
  near(leanAngle(frame, gravityFromOrientation(0, 20)), 20);
  near(leanAngle(frame, gravityFromOrientation(0, 0)), 0);
}

// 2) KERN-FALL: stark nach vorn geneigt montiert (beta=45°, wie an der
//    Lenker-Halterung). Echte Schräglage muss trotzdem stimmen – hier scheitert
//    die alte Gamma-Methode.
{
  const g0 = gravityFromOrientation(45, 0);
  const frame = computeBikeFrame(g0);
  for (const phi of [-40, -15, 10, 30, 50]) {
    const g = rotate(g0, frame.forward, phi); // echte Rolldrehung um die Längsachse
    near(leanAngle(frame, g), phi, 0.5);
  }
}

// 3) Steigung (Nicken um die Querachse) darf KEINE Schräglage erzeugen.
{
  const g0 = gravityFromOrientation(30, 0);
  const frame = computeBikeFrame(g0);
  const uphill = rotate(g0, frame.lateral, 20);
  near(leanAngle(frame, uphill), 0, 1.0);
}

console.log('lean.test.ts OK');
