import { countSelectedPages } from "./price";

export function countSelectedPagesPreview(selectedPages, totalPages) {
  return countSelectedPages(selectedPages, totalPages);
}

export function estimatePrintablePages(pages, copies) {
  return Number(pages || 0) * Number(copies || 1);
}

export function estimateGuestLimitExceeded(printablePages, currentUser, limit = 5) {
  if (currentUser) return false;
  return Number(printablePages) > limit;
}

export function estimateSheets(pages, copies, sideType) {
  const isDouble = String(sideType || "").toLowerCase().includes("double") || 
                   String(sideType || "").toLowerCase().includes("two_sided");
  const sheetsPerCopy = isDouble ? Math.ceil(Number(pages || 0) / 2) : Number(pages || 0);
  return sheetsPerCopy * Number(copies || 1);
}

export function estimatePricePreview({ pages, copies, pricePerPage, watermark, watermarkCharge = 2 }) {
  const base = Number(pages || 0) * Number(copies || 1) * Number(pricePerPage || 0);
  const watermarkAmount = watermark ? Number(watermarkCharge || 0) : 0;
  return base + watermarkAmount;
}
