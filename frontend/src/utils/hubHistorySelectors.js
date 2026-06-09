export function getHubHistoryOrders(activityData) {
  return Array.isArray(activityData) ? activityData : [];
}

export function getOrderSearchText(order) {
  if (!order) return "";
  const code = order.id || "";
  const name = order.customerName || "";
  const mobile = order.customerMobile || "";
  const doc = order.document || "";
  return `${code} ${name} ${mobile} ${doc}`.toLowerCase();
}

export function filterHubHistoryOrders(orders, filters = {}) {
  const list = getHubHistoryOrders(orders);
  return list.filter((order) => {
    // 1. Search Query
    if (filters.search) {
      const searchLower = filters.search.trim().toLowerCase();
      const searchText = getOrderSearchText(order);
      if (!searchText.includes(searchLower)) {
        return false;
      }
    }

    // 2. Order/Print Status
    if (filters.status && filters.status !== "all") {
      const orderStatus = getHubOrderDisplayStatus(order).toLowerCase();
      if (orderStatus !== filters.status.toLowerCase()) {
        return false;
      }
    }

    // 3. Payment Status
    if (filters.paymentStatus && filters.paymentStatus !== "all") {
      const payStatus = getHubOrderPaymentStatus(order).toLowerCase();
      if (payStatus !== filters.paymentStatus.toLowerCase()) {
        return false;
      }
    }

    return true;
  });
}

export function sortHubHistoryOrders(orders, sortMode = "newest") {
  const sorted = [...orders];
  sorted.sort((a, b) => {
    const timeA = new Date(a.date || 0).getTime();
    const timeB = new Date(b.date || 0).getTime();
    if (sortMode === "oldest") {
      return timeA - timeB;
    }
    return timeB - timeA; // default is newest
  });
  return sorted;
}

export function getHubOrderDisplayStatus(order) {
  return order?.status || "Pending";
}

export function getHubOrderPaymentStatus(order) {
  return order?.paymentStatus || "Pending";
}

export function getHubHistorySummary(orders) {
  const list = getHubHistoryOrders(orders);
  const totalOrders = list.length;
  
  const completed = list.filter((order) => {
    const status = getHubOrderDisplayStatus(order).toLowerCase();
    return status === "completed" || status === "printed" || status === "collected";
  }).length;

  const collectedOrPaid = list.filter((order) => {
    const payment = getHubOrderPaymentStatus(order).toLowerCase();
    const status = getHubOrderDisplayStatus(order).toLowerCase();
    return payment === "paid" || payment === "collected" || status === "collected";
  }).length;

  const cancelledOrFailed = list.filter((order) => {
    const status = getHubOrderDisplayStatus(order).toLowerCase();
    const payment = getHubOrderPaymentStatus(order).toLowerCase();
    return status === "cancelled" || status === "failed" || payment === "failed" || payment === "refunded";
  }).length;

  return {
    totalOrders,
    completed,
    collectedOrPaid,
    cancelledOrFailed
  };
}

export function getHubHistoryStatusCounts(orders) {
  const list = getHubHistoryOrders(orders);
  const printStatuses = new Set();
  const paymentStatuses = new Set();

  for (const order of list) {
    printStatuses.add(getHubOrderDisplayStatus(order));
    paymentStatuses.add(getHubOrderPaymentStatus(order));
  }

  return {
    printStatuses: [...printStatuses],
    paymentStatuses: [...paymentStatuses]
  };
}
