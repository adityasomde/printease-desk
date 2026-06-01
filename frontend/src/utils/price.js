export function getPricePerPage(centre, colorType, sideType) {
  if (!centre) return 0;
  if (colorType === "bw" && sideType === "single") return centre.bwSingle;
  if (colorType === "bw" && sideType === "double") return centre.bwDouble;
  if (colorType === "color" && sideType === "single") return centre.colorSingle;
  return centre.colorDouble;
}

export function calculateTotalAmount({ pages, copies, pricePerPage, watermark, watermarkCharge = 2 }) {
  const base = Number(pages || 0) * Number(copies || 0) * Number(pricePerPage || 0);
  const watermarkAmount = watermark ? Number(watermarkCharge || 0) : 0;
  return base + watermarkAmount;
}

export function countSelectedPages(selectedPages, totalPages) {
  const total = Number(totalPages || 0);
  const value = String(selectedPages || "").trim().toLowerCase();

  if (!total || !Number.isFinite(total)) return 0;
  if (!value || value === "all") return total;

  const selected = new Set();
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    const single = part.match(/^\d+$/);

    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end || start < 1 || end > total) return 0;
      for (let page = start; page <= end; page += 1) selected.add(page);
      continue;
    }

    if (single) {
      const page = Number(part);
      if (page < 1 || page > total) return 0;
      selected.add(page);
      continue;
    }

    return 0;
  }

  return selected.size;
}
