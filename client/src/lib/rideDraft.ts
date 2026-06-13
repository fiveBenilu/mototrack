import type { RideSummary } from '../hooks/useRideRecorder';

// Während einer Aufzeichnung wird der aktuelle Stand der Fahrt regelmäßig in
// IndexedDB gesichert. Stürzt die App ab, geht der Akku leer oder wird die Seite
// neu geladen, kann die Fahrt beim nächsten Start wiederhergestellt und gespeichert
// werden, statt verloren zu gehen. Es gibt immer höchstens einen Entwurf.
//
// IndexedDB (statt localStorage), weil ein langer Track mehrere MB groß werden
// kann und Writes asynchron erfolgen, ohne den Aufzeichnungs-Thread zu blockieren.
const DB_NAME = 'mototrack';
const STORE = 'rideDraft';
const KEY = 'current';

// Ein Entwurf ist eine noch nicht beendete Fahrt – inhaltlich identisch zur
// fertigen Zusammenfassung, ergänzt um den Zeitpunkt der letzten Sicherung.
export interface RideDraft extends RideSummary {
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const store = db.transaction(STORE, mode).objectStore(STORE);
          const req = run(store);
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export function saveDraft(draft: RideDraft): Promise<unknown> {
  return tx('readwrite', (store) => store.put(draft, KEY));
}

export function loadDraft(): Promise<RideDraft | null> {
  return tx<RideDraft>('readonly', (store) => store.get(KEY));
}

export function clearDraft(): Promise<unknown> {
  return tx('readwrite', (store) => store.delete(KEY));
}
