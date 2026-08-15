// Selbst-Check des Karten-Rasters.
// Lauf: npx tsx client/src/lib/cluster.test.ts
import assert from 'assert';
import { clusterPoints } from './cluster';

// 1) Keine Punkte → keine Blasen.
assert.deepStrictEqual(clusterPoints([], 10), []);

// 2) Die Summe der Zähler ist immer die Anzahl der Punkte (nichts verschwindet).
const scattered = Array.from({ length: 200 }, (_, i) => ({ lat: 48 + i * 0.01, lng: 9 + (i % 13) * 0.02 }));
for (const zoom of [6, 9, 12, 15]) {
  const total = clusterPoints(scattered, zoom).reduce((s, c) => s + c.count, 0);
  assert.strictEqual(total, scattered.length, `Zoom ${zoom}: Punkte verloren`);
}

// 3) Rauszoomen fasst zusammen, Reinzoomen trennt auf.
const weit = clusterPoints(scattered, 6).length;
const nah = clusterPoints(scattered, 15).length;
assert.ok(weit < nah, `Zoom 6 (${weit}) muss weniger Blasen liefern als Zoom 15 (${nah})`);
assert.strictEqual(nah, scattered.length, 'bei hohem Zoom ist jeder Punkt eine eigene Blase');

// 4) Dicht beieinander liegende Punkte werden zu einer Blase in ihrem Schwerpunkt.
const one = clusterPoints(
  [
    { lat: 48.0, lng: 9.0 },
    { lat: 48.0002, lng: 9.0002 },
  ],
  10,
);
assert.strictEqual(one.length, 1);
assert.strictEqual(one[0].count, 2);
assert.ok(Math.abs(one[0].lat - 48.0001) < 1e-9, 'Blase sitzt im Schwerpunkt');

console.log('cluster.test.ts OK');
