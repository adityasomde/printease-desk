export function getOrderSearchText(order) {
  return [
    order.order_code,
    order.status,
    order.payment_status,
    order.payment_method,
    order.hub?.name,
    order.hub?.code,
    order.document_name,
    order.document?.file_name,
    ...(order.documents || []).map((file) => file.file_name),
  ].filter(Boolean).join(" ").toLowerCase();
}

export function filterAndSortHistory(orders, { search = "", dateFrom = "", dateTo = "", status = "all", paymentMethod = "all", hubFilter = "all", sortBy = "newest" } = {}) {
  const searchText = search.trim().toLowerCase();
  const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
  const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

  const result = orders.filter((order) => {
    const createdTime = new Date(order.created_at).getTime();
    if (searchText && !getOrderSearchText(order).includes(searchText)) return false;
    if (fromTime && Number.isFinite(createdTime) && createdTime < fromTime) return false;
    if (toTime && Number.isFinite(createdTime) && createdTime > toTime) return false;
    if (status !== "all" && order.status !== status) return false;
    if (paymentMethod !== "all" && (order.payment_method || order.payment?.method) !== paymentMethod) return false;
    if (hubFilter !== "all" && order.hub?.name !== hubFilter) return false;
    return true;
  });

  result.sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    if (sortBy === "oldest") {
      return timeA - timeB;
    }
    return timeB - timeA; // default is newest first (descending)
  });

  return result;
}

export function groupHistoryByMonth(orders) {
  const groups = {};
  orders.forEach((order) => {
    const date = new Date(order.created_at);
    if (Number.isNaN(date.getTime())) return;
    const monthYear = date.toLocaleString("en-US", { month: "long", year: "numeric" });
    if (!groups[monthYear]) {
      groups[monthYear] = [];
    }
    groups[monthYear].push(order);
  });
  return groups;
}

export function computeSummary(orders) {
  // Sort by date descending to find the last print date
  const sorted = [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return {
    total_orders: orders.length,
    total_pages_printed: orders.reduce((sum, order) => {
      // Prefer printable_page_count (more accurate for custom page ranges)
      const pages = order.printable_page_count != null
        ? Number(order.printable_page_count)
        : Number(order.pages || 0) * Number(order.copies || 1);
      return sum + pages;
    }, 0),
    total_amount_spent: orders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
    last_print_date: sorted[0]?.created_at || null,
  };
}

export function getStatusColor(type, status) {
  const value = String(status || "").toLowerCase();
  if (type === "payment") {
    if (value.includes("paid") || value.includes("collected") || value.includes("verified")) return "green";
    if (value.includes("failed") || value.includes("refund")) return "red";
    return "amber";
  } else {
    // print status
    if (value.includes("collected") || value.includes("printed") || value.includes("ready")) return "green";
    if (value.includes("failed") || value.includes("cancelled")) return "red";
    return "slate";
  }
}

export function getStatusLabel(status) {
  return String(status || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function getOrderPrintableSummary(order) {
  const config = order.print_config || {};
  const doc = order.document || {};
  // Prefer printable_page_count from compact response; fall back to document detail, then pages
  const pages = order.printable_page_count != null
    ? Number(order.printable_page_count)
    : (doc.printable_pages || order.pages || 0);
  const copies = doc.copies || order.copies || config.copies || 1;
  const fileCount = order.file_count || order.documents?.length || 1;
  return [
    config.paper_size || "A4",
    getStatusLabel(config.color_mode || "black_white"),
    config.sides || (config.duplex ? "Double-sided" : "Single-sided"),
    `${pages} pages`,
    `${copies} copy`,
    fileCount > 1 ? `${fileCount} files` : null,
  ].filter(Boolean).join(" • ");
}

export function getPageRangeFromOptions(options, fallback = "all") {
  const pages = options?.pages || {};
  if (pages.mode === "custom") return pages.range || fallback || "custom";
  return fallback || "all";
}

export function getSidesLabel(options, fallback = "") {
  const sides = options?.sides || fallback;
  if (sides === "two_sided_long_edge" || sides === "double") return "Double-sided";
  if (sides === "two_sided_short_edge") return "Double-sided short edge";
  return "Single-sided";
}

export function getWatermarkLabel(options) {
  const watermark = options?.watermark || {};
  if (!watermark.enabled) return "No";
  return watermark.type ? `Yes • ${getStatusLabel(watermark.type)}` : "Yes";
}

export function buildDocumentSettings(document, orderConfig) {
  const options = document?.print_options || {};
  return [
    ["Paper", options.paperSize || orderConfig.paper_size || "A4"],
    ["Color", getStatusLabel(options.colorMode || orderConfig.color_mode || "black_white")],
    ["Sides", getSidesLabel(options, orderConfig.sides)],
    ["Orientation", getStatusLabel(options.orientation || orderConfig.orientation || "auto")],
    ["Copies", options.copies || document?.copies || orderConfig.copies || 1],
    ["Page range", getPageRangeFromOptions(options, document?.page_range || orderConfig.page_range || "all")],
    ["Pages/sheet", options.pagesPerSheet || orderConfig.pages_per_sheet || 1],
    ["DPI", options.quality?.dpi || orderConfig.quality_dpi || 300],
    ["Scaling", getStatusLabel(options.scale?.mode || orderConfig.scaling || "original")],
    ["Margins", getStatusLabel(options.margins?.mode || orderConfig.margins || "default")],
    ["Watermark", getWatermarkLabel(options.watermark ? options : { watermark: orderConfig.watermark })],
  ];
}

