const DB_NAME = 'heygen_cms_assets';
const DB_VERSION = 1;
const STORE_NAME = 'media';

interface MediaRecord {
  id: string;
  blob: Blob;
  name?: string;
  type?: string;
  updatedAt: number;
}

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open media database.'));
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDatabase();

  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = callback(store);

    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));

    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
  });
};

export const saveMediaBlob = async (id: string, blob: Blob): Promise<void> => {
  const record: MediaRecord = {
    id,
    blob,
    name: 'name' in blob ? (blob as File).name : undefined,
    type: blob.type || undefined,
    updatedAt: Date.now(),
  };

  await withStore('readwrite', (store) => store.put(record));
};

export const loadMediaBlob = async (id: string): Promise<Blob | null> => {
  const record = await withStore<MediaRecord | undefined>('readonly', (store) => store.get(id));
  return record?.blob ?? null;
};

export const deleteMediaBlob = async (id: string): Promise<void> => {
  await withStore('readwrite', (store) => store.delete(id));
};

export const loadMediaUrl = async (id: string): Promise<string | null> => {
  try {
    const blob = await loadMediaBlob(id);
    if (!blob) {
      return null;
    }
    return URL.createObjectURL(blob);
  } catch (error) {
    console.warn('[media] Unable to load blob URL.', error);
    return null;
  }
};
