const DB_NAME = "yui-phone";
const DB_STORE = "kv";

function canUseDom() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(name: string): Promise<string | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(name);
      req.onsuccess = () => {
        const value = req.result;
        resolve(typeof value === "string" ? value : value == null ? null : String(value));
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(name: string, value: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(value, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbDel(name: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** IndexedDB 優先、localStorage を控え。iPhone のホーム画面アプリで残す。 */
export const phoneStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (!canUseDom()) return null;
    try {
      const fromIdb = await idbGet(name);
      if (fromIdb != null && fromIdb !== "") return fromIdb;
    } catch {
      /* fall through */
    }
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (!canUseDom()) return;
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* quota / private mode */
    }
    try {
      await idbSet(name, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (!canUseDom()) return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
    try {
      await idbDel(name);
    } catch {
      /* ignore */
    }
  },
};
