import { Trail, BreadcrumbPoint } from '../types';

const DB_NAME = 'trail_navigator_db';
const DB_VERSION = 1;
const TRAILS_STORE = 'trails';
const SESSIONS_STORE = 'sessions';

export interface ActiveSession {
  trailId: string;
  elapsedSeconds: number;
  isNavigating: boolean;
  lastDistanceAlong: number | null;
  updatedAt: number;
  breadcrumbs?: BreadcrumbPoint[][];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(TRAILS_STORE)) {
        db.createObjectStore(TRAILS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open database'));
  });
}

export async function getAllTrailsFromDB(): Promise<Trail[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRAILS_STORE, 'readonly');
    const store = tx.objectStore(TRAILS_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as Trail[]);
    request.onerror = () => reject(request.error || new Error('Failed to load saved trails'));
  });
}

export async function saveTrailToDB(trail: Trail): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRAILS_STORE, 'readwrite');
    const store = tx.objectStore(TRAILS_STORE);
    const request = store.put(trail);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Failed to save trail'));
    tx.onerror = () => reject(tx.error || new Error('Transaction error saving trail'));
  });
}

export async function saveAllTrailsToDB(trails: Trail[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRAILS_STORE, 'readwrite');
    const store = tx.objectStore(TRAILS_STORE);

    for (const trail of trails) {
      store.put(trail);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Transaction error saving trails'));
  });
}

export async function deleteTrailFromDB(trailId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRAILS_STORE, 'readwrite');
    const store = tx.objectStore(TRAILS_STORE);
    const request = store.delete(trailId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Failed to delete trail'));
    tx.onerror = () => reject(tx.error || new Error('Transaction error deleting trail'));
  });
}

export async function saveActiveSessionToDB(session: ActiveSession): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    const store = tx.objectStore(SESSIONS_STORE);
    const request = store.put({ key: 'active_session', ...session });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Failed to persist active session'));
    tx.onerror = () => reject(tx.error || new Error('Transaction error saving session'));
  });
}

export async function getActiveSessionFromDB(): Promise<ActiveSession | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readonly');
    const store = tx.objectStore(SESSIONS_STORE);
    const request = store.get('active_session');

    request.onsuccess = () => {
      const res = request.result;
      if (!res) {
        resolve(null);
      } else {
        const { key, ...session } = res;
        resolve(session as ActiveSession);
      }
    };
    request.onerror = () => reject(request.error || new Error('Failed to retrieve active session'));
  });
}

export async function clearActiveSessionFromDB(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    const store = tx.objectStore(SESSIONS_STORE);
    const request = store.delete('active_session');

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Failed to clear active session'));
    tx.onerror = () => reject(tx.error || new Error('Transaction error clearing session'));
  });
}

/**
 * Migrates any existing 'trailnav_saved_trails' from localStorage to IndexedDB on first load.
 */
export async function migrateFromLocalStorage(): Promise<Trail[] | null> {
  try {
    const stored = localStorage.getItem('trailnav_saved_trails');
    if (!stored) return null;

    const parsed: Trail[] = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0) {
      await saveAllTrailsToDB(parsed);
      localStorage.removeItem('trailnav_saved_trails');
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to migrate trails from localStorage:', e);
  }
  return null;
}
