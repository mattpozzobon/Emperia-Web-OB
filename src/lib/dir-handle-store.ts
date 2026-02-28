/**
 * Persists file handles in IndexedDB across sessions.
 *
 * FileSystemDirectoryHandle and FileSystemFileHandle are structured-cloneable,
 * so IndexedDB can store them directly.
 *
 * Two stores:
 *  - 'dir-handles' — the last-used directory handle (for Open Folder picker)
 *  - 'file-handles' — per-role file handles (obj, spr, def, spriteMap) so each
 *    file can live at a different path and still be reopened / saved back.
 */

const DB_NAME = 'emperia-ob';
const DB_VERSION = 2;
const DIR_STORE = 'dir-handles';
const FILE_STORE = 'file-handles';
const DIR_KEY = 'last-source-dir';
const SESSION_KEY = 'last-session';

/** The per-role file handles we persist. */
export interface SessionHandles {
  dir?: FileSystemDirectoryHandle | null;
  obj?: FileSystemFileHandle | null;
  spr?: FileSystemFileHandle | null;
  def?: FileSystemFileHandle | null;
  spriteMap?: FileSystemFileHandle | null;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DIR_STORE)) {
        db.createObjectStore(DIR_STORE);
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Directory handle (legacy, still used for Open Folder picker start) ──────

export async function saveLastDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(DIR_STORE, 'readwrite');
    tx.objectStore(DIR_STORE).put(handle, DIR_KEY);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('[OB] Failed to save dir handle:', e);
  }
}

export async function loadLastDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(DIR_STORE, 'readonly');
    const req = tx.objectStore(DIR_STORE).get(DIR_KEY);
    const handle = await new Promise<FileSystemDirectoryHandle | null>((res, rej) => {
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return handle;
  } catch (e) {
    console.warn('[OB] Failed to load dir handle:', e);
    return null;
  }
}

// ─── Per-file session handles ────────────────────────────────────────────────

export async function saveSessionHandles(handles: SessionHandles): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(FILE_STORE, 'readwrite');
    tx.objectStore(FILE_STORE).put(handles, SESSION_KEY);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
    console.log('[OB] Saved session handles');
  } catch (e) {
    console.warn('[OB] Failed to save session handles:', e);
  }
}

export async function loadSessionHandles(): Promise<SessionHandles | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(FILE_STORE, 'readonly');
    const req = tx.objectStore(FILE_STORE).get(SESSION_KEY);
    const handles = await new Promise<SessionHandles | null>((res, rej) => {
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return handles;
  } catch (e) {
    console.warn('[OB] Failed to load session handles:', e);
    return null;
  }
}

/**
 * Request read-write permission on a handle. Returns true if granted.
 * The browser will show a prompt the first time per session.
 */
export async function verifyPermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  const opts: any = { mode };
  if (await (handle as any).queryPermission(opts) === 'granted') return true;
  if (await (handle as any).requestPermission(opts) === 'granted') return true;
  return false;
}
