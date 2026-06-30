const LOCAL_HISTORY_KEY = "printease_local_history";
const GUEST_HISTORY_SCOPE = "guest";

function getHistoryKey(ownerId) {
  const scope = ownerId ? String(ownerId) : GUEST_HISTORY_SCOPE;
  return `${LOCAL_HISTORY_KEY}:${scope}`;
}

function readHistory(key) {
  const data = localStorage.getItem(key);
  if (!data) return [];
  const parsed = JSON.parse(data);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Save an order to local history in the browser's local storage.
 * @param {Object} order - The order object.
 * @param {Object} printConfig - The exact print configuration (color, sides, copies, etc.).
 * @param {Object} priceSnapshot - The exact price breakdown.
 * @param {Array} files - The array of files attached to the order.
 * @param {Object} options - Local cache options.
 * @param {string} options.ownerId - Current logged-in user id. Omit for guest scope.
 */
export function saveOrderToLocalHistory(order, printConfig, priceSnapshot, files, options = {}) {
  try {
    const ownerId = options.ownerId || order.userId || order.user_id || null;
    const historyKey = getHistoryKey(ownerId);
    const existingHistory = getLocalHistory(ownerId);
    
    // Check if order already exists to avoid duplicates
    const existingIndex = existingHistory.findIndex(h => h.id === order.id);
    
    const historyItem = {
      id: order.id,
      orderCode: order.orderCode || order.order_code,
      documentName: order.documentName || order.document_name,
      amount: order.amount,
      createdAt: order.createdAt || order.created_at || new Date().toISOString(),
      status: order.status,
      paymentStatus: order.paymentStatus || order.payment_status,
      centreId: order.centreId || order.centre_id,
      printConfigSnapshot: printConfig || order.printConfigSnapshot || {},
      priceSnapshot: priceSnapshot || order.priceSnapshot || {},
      files: files || []
    };

    if (existingIndex >= 0) {
      existingHistory[existingIndex] = historyItem;
    } else {
      existingHistory.unshift(historyItem);
    }

    // Keep only the latest 20 items locally
    const limitedHistory = existingHistory.slice(0, 20);
    localStorage.setItem(historyKey, JSON.stringify(limitedHistory));
  } catch (error) {
    console.warn("Failed to save order to local history:", error);
  }
}

/**
 * Retrieve the local history from local storage.
 * Local history is scoped by user id so cached records do not leak between accounts.
 * @returns {Array} List of local history items.
 */
export function getLocalHistory(ownerId = null) {
  try {
    const scopedHistory = readHistory(getHistoryKey(ownerId));
    if (scopedHistory.length > 0 || ownerId) return scopedHistory;

    // Legacy guest-only fallback for records saved before local history became scoped.
    return readHistory(LOCAL_HISTORY_KEY);
  } catch (error) {
    console.warn("Failed to parse local history:", error);
    return [];
  }
}

export function clearLocalHistory(ownerId = null) {
  try {
    localStorage.removeItem(getHistoryKey(ownerId));
    if (!ownerId) localStorage.removeItem(LOCAL_HISTORY_KEY);
    return true;
  } catch {
    return false;
  }
}
