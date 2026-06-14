export function toPrintReadyPdfName(fileName = "document") {
  let base = String(fileName)
    .split(/[\\/]/)
    .pop()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim();

  if (!base) base = "document";

  const knownExtPattern = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|jpg|jpeg|png|webp|gif|bmp|tif|tiff|txt|csv|json)$/i;

  while (knownExtPattern.test(base)) {
    base = base.replace(knownExtPattern, "");
  }

  if (!base) base = "document";

  return `${base}.pdf`;
}
