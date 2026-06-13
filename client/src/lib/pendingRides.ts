import { api } from './api';
import type { RideSummary } from '../hooks/useRideRecorder';

// Fahrten, die nach dem Beenden noch nicht erfolgreich zum Server übertragen
// wurden, werden lokal zwischengespeichert und später erneut hochgeladen. So
// geht eine Fahrt nicht verloren, wenn beim Speichern kein Netz da ist oder der
// Server gerade nicht erreichbar ist. `startedAt` dient als stabile lokale ID.
const STORAGE_KEY = 'mototrack.pendingRides';

export type PendingRide = RideSummary;

function read(): PendingRide[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(rides: PendingRide[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rides));
  } catch {
    /* Speicher voll o.ä. – nicht abbrechen, Fahrt liegt noch im UI-State */
  }
}

/** Fahrt lokal vormerken (idempotent über `startedAt`). */
export function savePending(ride: PendingRide) {
  const rides = read();
  if (!rides.some((r) => r.startedAt === ride.startedAt)) {
    rides.push(ride);
    write(rides);
  }
}

export function removePending(startedAt: number) {
  write(read().filter((r) => r.startedAt !== startedAt));
}

/** Lädt eine Fahrt hoch und entfernt sie bei Erfolg aus dem lokalen Speicher. */
export async function uploadRide(ride: PendingRide): Promise<void> {
  await api.post('/rides', ride);
  removePending(ride.startedAt);
}

/**
 * Versucht, alle noch ausstehenden Fahrten hochzuladen. Beim ersten Fehler wird
 * abgebrochen (Netz weg / Server down), die restlichen bleiben gespeichert und
 * werden beim nächsten Versuch erneut probiert. Gibt die Anzahl der danach noch
 * ausstehenden Fahrten zurück.
 */
export async function flushPendingRides(): Promise<number> {
  for (const ride of read()) {
    try {
      await uploadRide(ride);
    } catch {
      break;
    }
  }
  return read().length;
}
