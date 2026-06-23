// Zentrale Stelle für Push-Texte. Reine Funktionen (kein Versand) → leicht testbar.
// Etwas Humor, kurzes Format: Titel mit Emoji + ein Satz. Deutsch, wie die App.
import type { PushPayload } from './push';

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function formatKm(distanceM: number): string {
  return (distanceM / 1000).toFixed(distanceM < 10000 ? 1 : 0) + ' km';
}

function formatDuration(durationS: number): string {
  const h = Math.floor(durationS / 3600);
  const m = Math.round((durationS % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`;
}

export function friendOnline(name: string, friendId: number): PushPayload {
  return {
    title: `🟢 ${name} ist online`,
    body: pick([
      'Helm auf, Seitenständer hoch – wer fährt mit?',
      `${name} hat gerade die Garage geöffnet. 👀`,
      'Das Wetter checkt sich nicht von selbst. 🏍️',
      'Sieht nach Kurvenhunger aus.',
      `${name} ist wach. Die Reifen werden nervös.`,
      'Kettenfett duftet. Jemand plant was. 🛢️',
      `${name} starrt aus dem Fenster. Klassisches Anzeichen.`,
      'Der Tank ist voll, die Ausreden sind leer.',
      `${name} sucht angeblich nur „kurz" die Handschuhe.`,
      `Oh super, ${name} ist online. Was für eine Ehre. 🙄`,
      `${name} ist da. Bestimmt wieder „nur kurz Reifen anschauen".`,
      'Achtung, ein Profi betritt die App. Angeblich.',
    ]),
    url: '/freunde',
    tag: `friend-online-${friendId}`,
  };
}

export function friendStartedRide(name: string, friendId: number): PushPayload {
  return {
    title: `🏍️ ${name} ist losgefahren`,
    body: pick([
      'Gerade live auf der Karte. Mitverfolgen?',
      `${name} brennt gerade Gummi ab. 🔥`,
      'Erster auf der Strecke. Hinterher!',
      'Schräglage lädt … Live dabei sein?',
      `${name} grüßt jetzt jede Kuh am Straßenrand. 🐄`,
      'Knieschleifer-Alarm. Standort wird geteilt.',
      `${name} fährt – und du sitzt noch auf der Couch.`,
      'Mücken-Buffet ist eröffnet. 🦟',
      `${name} testet, wie gut die Bremsen wirklich sind.`,
      `${name} fährt los. Diesmal bestimmt unter dem Tempolimit. Klar.`,
      'Wow, Schräglage. Echt mutig bei 30 km/h. 🙄',
      `${name} ist unterwegs. Die Nachbarn freuen sich über den Sound. Sicher.`,
    ]),
    url: '/fahren',
    tag: `friend-riding-${friendId}`,
  };
}

export function friendFinishedRide(
  name: string,
  distanceM: number,
  durationS: number,
  friendId: number,
): PushPayload {
  return {
    title: `🏁 ${name} ist angekommen`,
    body: pick([
      `${formatKm(distanceM)} in ${formatDuration(durationS)} – und alle Kurven überlebt.`,
      `${formatKm(distanceM)} abgespult. Ab in die Statistik damit.`,
      `Tour beendet: ${formatKm(distanceM)}, ${formatDuration(durationS)}. Stark!`,
      `${formatKm(distanceM)} weiter weg vom Alltag. Verdient.`,
      `Helm ab, Grinsen drauf. ${formatKm(distanceM)} in ${formatDuration(durationS)}.`,
      `${name} ist heil zurück. Die Leitplanken auch. 🙌`,
      `${formatKm(distanceM)} geschafft – jetzt erstmal Kette ölen und angeben.`,
      `${formatKm(distanceM)} in ${formatDuration(durationS)}. Beeindruckend. Fast. 🙄`,
      `${name} ist zurück. Ganz ohne sich zu verfahren? Glückwunsch.`,
      `Sagenhafte ${formatKm(distanceM)}. Da wird der Tank ja kaum warm geworden sein.`,
    ]),
    url: '/freunde',
    tag: `friend-finished-${friendId}`,
  };
}

export function friendAccepted(name: string): PushPayload {
  return {
    title: `🤝 ${name} fährt jetzt mit dir`,
    body: pick([
      'Freundschaftsanfrage angenommen. Zeit für eine gemeinsame Ausfahrt!',
      `${name} ist jetzt dein Fahrkumpel.`,
      `${name} fährt jetzt mit dir. Wer bremst, zahlt das Eis. 🍦`,
      'Neue Fahrt-Connection freigeschaltet. 🤝',
      `${name} ist im Rudel. Formation fahren kann beginnen.`,
      `${name} hat „Ja" gesagt. Mutige Entscheidung. 🙄`,
      `Glückwunsch, jetzt seid ihr befreundet. Wird schon gutgehen.`,
    ]),
    url: '/freunde',
    tag: 'friend-accepted',
  };
}

// ponytail: simple self-check, run with `npx ts-node src/notifications.ts`
if (require.main === module) {
  const assert = require('assert');
  for (const p of [
    friendOnline('Max', 1),
    friendStartedRide('Max', 1),
    friendFinishedRide('Max', 42300, 4500, 1),
    friendAccepted('Max'),
  ]) {
    assert.ok(p.title && p.body && p.url && p.tag, 'Payload-Felder fehlen');
    assert.ok(p.title.includes('Max') || p.body.includes('Max'), 'Name fehlt');
  }
  // Formatierung deterministisch prüfen (Body-Varianten sind zufällig, aber alle enthalten die km).
  assert.strictEqual(formatKm(5300), '5.3 km'); // < 10 km → eine Nachkommastelle
  assert.strictEqual(formatKm(42300), '42 km'); // >= 10 km → gerundet
  assert.strictEqual(formatDuration(4500), '1:15 h');
  assert.strictEqual(formatDuration(900), '15 min');
  assert.ok(friendFinishedRide('M', 5300, 900, 1).body.includes('5.3 km'));
  console.log('notifications.ts OK');
}
