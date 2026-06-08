const listeners = new Set();

export function emitOrderChanged(payload = {}) {
  for (const callback of listeners) {
    try {
      callback(payload);
    } catch (err) {
      console.error("Error in onOrderChanged callback:", err);
    }
  }
}

export function onOrderChanged(callback) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
