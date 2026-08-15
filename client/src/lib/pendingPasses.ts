import { api } from './api';

// Blitzer- und Zonen-Durchfahrten werden sofort an den Server gemeldet. Ohne Netz
// (Funkloch, genau da wo die schönen Strecken sind) ginge die Durchfahrt sonst
// verloren – darum wird der fehlgeschlagene Request lokal gemerkt und später in
// derselben Reihenfolge nachgeholt.
const STORAGE_KEY = 'mototrack.pendingPasses';

export interface PendingPass {
  path: string; // z.B. "/cameras/42/pass"
  body: unknown;
  ts: number;
}

function read(): PendingPass[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(passes: PendingPass[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(passes));
  } catch {
    /* Speicher voll – Durchfahrt ist verloren, die Fahrt selbst zählt weiter */
  }
}

export function savePendingPass(path: string, body: unknown) {
  write([...read(), { path, body, ts: Date.now() }]);
}

/**
 * Holt alle vorgemerkten Durchfahrten nach. Beim ersten Fehler wird abgebrochen
 * (Netz weg / Server down), der Rest bleibt für den nächsten Versuch liegen.
 * Gibt die Anzahl der danach noch offenen Durchfahrten zurück.
 */
export async function flushPendingPasses(): Promise<number> {
  let queue = read();
  while (queue.length > 0) {
    try {
      await api.post(queue[0].path, queue[0].body);
    } catch {
      break;
    }
    // Frisch einlesen: währenddessen kann eine neue Durchfahrt dazugekommen sein.
    queue = read().slice(1);
    write(queue);
  }
  return read().length;
}
