const LOCAL_HISTORY_KEY = 'printease_local_history';

/**
 * Save an order to local history in the browser's local storage.
 * @param {Object} order - The order object.
 * @param {Object} printConfig - The exact print configuration (color, sides, copies, etc.).
 * @param {Object} priceSnapshot - The exact price breakdown.
 * @param {Array} files - The array of files attached to the order.
 */
export function saveOrderToLocalHistory(order, printConfig, priceSnapshot, files) {
  try {
    const existingHistory = getLocalHistory();
    
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
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(limitedHistory));
  } catch (error) {
    console.error('Failed to save order to local history:', error);
  }
}

/**
 * Retrieve the local history from local storage.
 * @returns {Array} List of local history items.
 */
export function getLocalHistory() {
  try {
    const data = localStorage.getItem(LOCAL_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to parse local history:', error);
    return [];
  }
}
