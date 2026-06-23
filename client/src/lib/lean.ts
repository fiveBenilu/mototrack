// Mount-unabhängige Schräglagen-Berechnung aus der Geräteorientierung.
//
// Warum nicht `event.gamma` direkt (wie bisher)? Gamma ist ein Euler-Winkel und
// wird unbrauchbar, sobald das Telefon nach vorn/hinten geneigt montiert ist –
// genau der typische Fall an der Lenker-Halterung mit Neigung zum Fahrer. Dann
// vermischen sich Nick- und Roll-Anteil und es kommen Fantasiewerte heraus
// (z. B. 51°, wo das Motorrad kaum geneigt war).
//
// Stattdessen: aus beta/gamma den Schwerkraftvektor im Geräte-Koordinatensystem
// rekonstruieren und bei der Kalibrierung (Motorrad aufrecht) ein festes
// Fahrzeug-Koordinatensystem ableiten. Die Schräglage ist dann die reine
// Drehung der Schwerkraft um die Fahrzeug-Längsachse. Montage-Neigung und
// Steigungen (Nicken um die Querachse) werden herausgerechnet.

export type Vec3 = [number, number, number];
export interface BikeFrame {
  forward: Vec3; // Fahrzeug-Längsachse (Roll-Achse)
  lateral: Vec3; // Querachse (für das Vorzeichen: + = rechts)
  down: Vec3; // Schwerkraftrichtung bei aufrechtem Stand
}

const DEG = Math.PI / 180;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const m = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / m, a[1] / m, a[2] / m];
};

// Einheits-Schwerkraftvektor im Geräte-Koordinatensystem aus beta/gamma (Grad).
// Hängt nicht von alpha (Gier) ab – die Schwerkraft zeigt entlang der Welt-Z-Achse.
export function gravityFromOrientation(beta: number, gamma: number): Vec3 {
  const b = beta * DEG;
  const g = gamma * DEG;
  return [-Math.cos(b) * Math.sin(g), -Math.sin(b), -Math.cos(b) * Math.cos(g)];
}

// Aus der aufrechten Schwerkraft (Kalibrierung) ein orthonormales Fahrzeug-
// Koordinatensystem ableiten. Als Hinweis auf „vorn" dient die Geräte-Oberkante
// (Geräte-Y); nur deren zur Schwerkraft senkrechte Komponente zählt.
export function computeBikeFrame(g0: Vec3): BikeFrame {
  const down = norm(g0);
  let hint: Vec3 = [0, 1, 0];
  // Liegt die Oberkante fast entlang der Schwerkraft (Telefon flach), auf die
  // Geräte-Z-Achse ausweichen, damit die Längsachse nicht entartet.
  if (Math.abs(dot(hint, down)) > 0.9) hint = [0, 0, 1];
  let forward = norm(sub(hint, scale(down, dot(hint, down))));
  const lateral = norm(cross(forward, down));
  forward = cross(down, lateral); // garantiert orthonormal
  return { forward, lateral, down };
}

// Vorzeichenbehaftete Schräglage in Grad. Negativ = links, positiv = rechts.
// Die Vorwärts-Komponente wird herausprojiziert → Steigungen/Wheelies erzeugen
// keine Schein-Schräglage.
// ponytail: Vorzeichen-Konvention (links/rechts) hängt von der Montagerichtung
// ab; falls nach einer echten Testfahrt vertauscht, `lateral` negieren.
export function leanAngle(frame: BikeFrame, g: Vec3): number {
  const gp = sub(g, scale(frame.forward, dot(g, frame.forward)));
  return Math.atan2(dot(gp, frame.lateral), dot(gp, frame.down)) / DEG;
}
