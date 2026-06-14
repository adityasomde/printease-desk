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

export function estimateSheets(pages, copies, sideType, pagesPerSheet = 1) {
  const normalizedPagesPerSheet = [1, 2, 4, 6, 9, 16].includes(Number(pagesPerSheet)) ? Number(pagesPerSheet) : 1;
  const pageCountAfterLayout = Math.ceil(Number(pages || 0) / normalizedPagesPerSheet);
  const isDouble = String(sideType || "").toLowerCase().includes("double") || 
                   String(sideType || "").toLowerCase().includes("two_sided");
  const sheetsPerCopy = isDouble ? Math.ceil(pageCountAfterLayout / 2) : pageCountAfterLayout;
  return sheetsPerCopy * Number(copies || 1);
}

export function estimatePricePreview({ pages, copies, pricePerPage, watermark, watermarkCharge = 2 }) {
  const base = Number(pages || 0) * Number(copies || 1) * Number(pricePerPage || 0);
  const watermarkAmount = watermark ? Number(watermarkCharge || 0) : 0;
  return base + watermarkAmount;
}
