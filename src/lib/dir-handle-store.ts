/**
 * Persists the last-used FileSystemDirectoryHandle in IndexedDB so the
 * "Open Folder" picker remembers where the user was last time.
 *
 * FileSystemDirectoryHandle is structured-cloneable, so IndexedDB can store it
 * directly.  We use a tiny single-row object store keyed by a fixed string.
 */

const DB_NAME = 'emperia-ob';
const DB_VERSION = 1;
const STORE = 'dir-handles';
const KEY = 'last-source-dir';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLastDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, KEY);
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
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
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
