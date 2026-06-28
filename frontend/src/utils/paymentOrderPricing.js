function normalizeStatusKey(value) {
  return String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

export function buildPaymentPriceFromOrder(order, fallbackPrice = null) {
  if (!order) return fallbackPrice || null;

  const status = normalizeStatusKey(order.rawStatus || order.status);
  const billStatus = normalizeStatusKey(order.billStatus || order.bill_status);
  const snapshot = order.priceSnapshot || order.price_snapshot || {};
  const snapshotFiles = Array.isArray(snapshot.breakdown) ? snapshot.breakdown : [];
  const fallbackFiles = Array.isArray(fallbackPrice?.files) ? fallbackPrice.files : [];
  const files = snapshotFiles.length ? snapshotFiles : fallbackFiles;
  const billReady = status === "bill_confirmed";
  const pricingPending = !billReady && Boolean(
    order.pricingPending ||
    order.pricing_pending ||
    snapshot.pricingPending ||
    status === "awaiting_hub_bill_confirmation" ||
    billStatus === "awaiting_hub_confirmation" ||
    files.some((file) => file?.pricingPending || file?.reasonCode === "DESKTOP_PREPARATION_PENDING")
  );

  const totalAmount = firstPositiveNumber(
    order.amount,
    snapshot.amount,
    order.totalAmount,
    order.total_amount,
    Number(order.totalAmountPaise || order.total_amount_paise || snapshot.totalAmountPaise || 0) / 100
  );

  const firstFile = files[0] || {};

  return {
    ...(fallbackPrice || {}),
    totalAmount,
    totalAmountPaise: firstPositiveNumber(
      order.totalAmountPaise,
      order.total_amount_paise,
      snapshot.totalAmountPaise,
      totalAmount ? Math.round(totalAmount * 100) : null
    ),
    pricingPending,
    reasonCode: pricingPending ? (snapshot.reasonCode || fallbackPrice?.reasonCode || "DESKTOP_PREPARATION_PENDING") : null,
    message: pricingPending ? (snapshot.message || fallbackPrice?.message || "Preparing verified bill.") : null,
    pricePerPage: firstPositiveNumber(firstFile.pricePerPage, fallbackPrice?.pricePerPage),
    originalPageCount: firstPositiveNumber(firstFile.originalPageCount, order.originalPageCount, order.original_page_count),
    selectedPageCount: firstPositiveNumber(firstFile.selectedPageCount, order.selectedPageCount, order.selected_page_count, order.pages),
    printablePageCount: firstPositiveNumber(firstFile.printablePageCount, order.printablePageCount, order.printable_page_count),
    sheetCount: firstPositiveNumber(firstFile.sheetCount, order.sheetCount, order.sheet_count),
    files,
  };
}
