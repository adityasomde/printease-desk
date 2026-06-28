const DB_NAME = "PrintEaseDB";
const DB_VERSION = 1;

function getDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("store")) {
        db.createObjectStore("store");
      }
    };
  });
}

export async function localDbSet(key, value) {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("store", "readwrite");
      const store = transaction.objectStore("store");
      const request = store.put(value, key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("LocalDB Set Error:", e);
  }
}

export async function localDbGet(key) {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("store", "readonly");
      const store = transaction.objectStore("store");
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("LocalDB Get Error:", e);
    return null;
  }
}

export async function localDbDelete(key) {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("store", "readwrite");
      const store = transaction.objectStore("store");
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("LocalDB Delete Error:", e);
  }
}
