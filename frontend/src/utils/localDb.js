const DB_NAME = "PrintEaseDB";
const DB_VERSION = 1;
const STORE_NAME = "store";

function canUseIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function getDb() {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      resolve(null);
      return;
    }

    let request = null;
    try {
      request = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

    request.onerror = () => reject(request.error || new Error("Could not open local cache."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function withStore(mode, operation) {
  const db = await getDb();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request = null;

    transaction.oncomplete = () => db.close();
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error("Local cache transaction was aborted."));
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("Local cache transaction failed."));
    };

    try {
      request = operation(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || transaction.error || new Error("Local cache request failed."));
  });
}

export async function localDbSet(key, value) {
  try {
    await withStore("readwrite", (store) => store.put(value, key));
    return true;
  } catch {
    return false;
  }
}

export async function localDbGet(key) {
  try {
    return await withStore("readonly", (store) => store.get(key));
  } catch {
    return null;
  }
}

export async function localDbDelete(key) {
  try {
    await withStore("readwrite", (store) => store.delete(key));
    return true;
  } catch {
    return false;
  }
}

export async function localDbDeletePrefix(prefix) {
  try {
    const db = await getDb();
    if (!db) return false;

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();

      transaction.oncomplete = () => {
        db.close();
        resolve(true);
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error("Local cache cleanup was aborted."));
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("Local cache cleanup failed."));
      };
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(prefix)) {
          cursor.delete();
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error || transaction.error || new Error("Local cache cursor failed."));
    });

    return true;
  } catch {
    return false;
  }
}
