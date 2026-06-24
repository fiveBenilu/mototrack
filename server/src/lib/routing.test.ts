// Selbst-Check: OSRM-Antwort wird korrekt in Geometrie, Dauer und deutsche
// Abbiege-Anweisungen übersetzt. Lauf: npx ts-node src/lib/routing.test.ts
import assert from 'assert';
import { routeWaypoints } from './routing';

const fakeOsrm = {
  routes: [
    {
      distance: 1234.5,
      duration: 99,
      geometry: { coordinates: [[10.0, 51.0], [10.1, 51.1]] }, // [lng,lat]
      legs: [
        {
          steps: [
            { maneuver: { location: [10.0, 51.0], type: 'depart' }, name: 'Hauptstraße', distance: 100 },
            { maneuver: { location: [10.05, 51.05], type: 'turn', modifier: 'left' }, name: 'Bergweg', distance: 800 },
            { maneuver: { location: [10.08, 51.08], type: 'turn', modifier: 'slight right' }, name: '', distance: 300 },
            { maneuver: { location: [10.1, 51.1], type: 'arrive' }, name: '', distance: 0 },
          ],
        },
      ],
    },
  ],
};

(globalThis as any).fetch = async () => ({ ok: true, json: async () => fakeOsrm });

async function main() {
  const r = await routeWaypoints([
    [51.0, 10.0],
    [51.1, 10.1],
  ]);

  assert.strictEqual(r.distanceM, 1234.5);
  assert.strictEqual(r.durationS, 99);
  // Geometrie wird von [lng,lat] auf [lat,lng] gedreht.
  assert.deepStrictEqual(r.geometry[0], [51.0, 10.0]);
  assert.strictEqual(r.steps.length, 4);
  assert.strictEqual(r.steps[0].instruction, 'Losfahren auf Hauptstraße');
  assert.strictEqual(r.steps[1].instruction, 'Links abbiegen auf Bergweg');
  assert.strictEqual(r.steps[2].instruction, 'Leicht rechts abbiegen');
  assert.strictEqual(r.steps[3].instruction, 'Ziel erreicht');
  // Manöverpunkt wird von [lng,lat] auf lat/lng gemappt.
  assert.deepStrictEqual([r.steps[1].lat, r.steps[1].lng], [51.05, 10.05]);

  console.log('routing.test.ts OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
