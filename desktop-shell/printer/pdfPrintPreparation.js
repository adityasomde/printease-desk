import { PDFDocument, degrees, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { imposePdf } from './pdfImposition.js';

/**
 * Parses a page range string or array of pages into a 1-indexed sorted page list.
 */
function parseRange(rangeStr, totalPages) {
  const raw = String(rangeStr || '').trim();
  if (!raw || raw.toLowerCase() === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const selected = new Set();
  for (const part of raw.split(',')) {
    const token = part.trim();
    if (!token) continue;
    if (/^\d+$/.test(token)) {
      const page = Number(token);
      if (page >= 1 && page <= totalPages) selected.add(page);
    } else {
      const match = token.match(/^(\d+)\s*-\s*(\d+)$/);
      if (match) {
        const start = Number(match[1]);
        const end = Number(match[2]);
        if (start <= end && start >= 1 && end <= totalPages) {
          for (let p = start; p <= end; p++) {
            selected.add(p);
          }
        }
      }
    }
  }
  const result = Array.from(selected).sort((a, b) => a - b);
  return result.length > 0 ? result : Array.from({ length: totalPages }, (_, i) => i + 1);
}

function getWatermarkText(orderInfo, watermark) {
  if (watermark.type === 'custom_text' && watermark.text) return watermark.text;
  if (watermark.type === 'pickup_code' && orderInfo?.pickupCode) return `Pickup ${orderInfo.pickupCode}`;
  if (watermark.type === 'date_time') return new Date().toLocaleString('en-IN');
  return orderInfo?.orderCode ? `Order ${orderInfo.orderCode}` : 'PrintEase';
}

function getWatermarkPosition(position, pageWidth, pageHeight, textWidth, fontSize) {
  const margin = 24;
  const positions = {
    top_left: [margin, pageHeight - margin - fontSize],
    top_center: [(pageWidth - textWidth) / 2, pageHeight - margin - fontSize],
    top_right: [pageWidth - textWidth - margin, pageHeight - margin - fontSize],
    center: [(pageWidth - textWidth) / 2, (pageHeight - fontSize) / 2],
    bottom_left: [margin, margin],
    bottom_center: [(pageWidth - textWidth) / 2, margin],
    bottom_right: [pageWidth - textWidth - margin, margin]
  };

  return positions[position] || positions.bottom_right;
}

/**
 * Resolves the target duplex option for printing depending on final orientation.
 */
export function resolveDuplexForPlatform({ sides, finalSheetOrientation, duplexBinding }) {
  const isOneSided = (sides === 'one_sided' || sides === 'single' || sides === 'one-sided' || sides === 'simplex');
  if (isOneSided) {
    return 'one-sided';
  }

  // Explicit duplexBinding override
  if (duplexBinding === 'long-edge' || duplexBinding === 'short-edge') {
    return duplexBinding;
  }

  // Explicit short edge side type
  if (sides === 'two_sided_short_edge') {
    return 'short-edge';
  }

  // Default auto-mapping rule
  if (finalSheetOrientation === 'landscape') {
    return 'short-edge';
  }
  return 'long-edge';
}

/**
 * Pre-processes a PDF file if the printer profile, print options, or after-order settings require manual adjustments.
 * Supports page selection, watermarks, imposition (N-up), and after-order page appends.
 *
 * @param {string|object} inputFilePathOrObj
 * @param {object} [printOptions]
 * @param {object} [printerProfile]
 * @returns {Promise<{ tempFilePath: string | null, copiesHandledInPdf: number, finalSheetOrientation: string, pagesPerSheetApplied: boolean, cleanup: () => void }>}
 */
export async function preparePdfForPrinting(inputFilePathOrObj, printOptions = {}, printerProfile = {}) {
  let inputFilePath;
  let options = printOptions;
  let profile = printerProfile;

  if (inputFilePathOrObj && typeof inputFilePathOrObj === 'object') {
    inputFilePath = inputFilePathOrObj.inputPdfPath || inputFilePathOrObj.inputFilePath;
    options = inputFilePathOrObj.printOptions || {};
    profile = inputFilePathOrObj.printerProfile || {};
  } else {
    inputFilePath = inputFilePathOrObj;
  }

  console.log(`[PDF PREP] Preparing PDF: ${inputFilePath}`);

  let backSideRotation = options.backSideRotation || profile.backSideRotation || 'auto';
  let reversePageOrder = options.pageOrder === 'reverse' || profile.reversePageOrder;
  const requestedCopies = Math.max(1, Math.min(Number(options.copies) || 1, 99));

  const afterOrderSettings = options.afterOrderSettings || {};
  const insertEnabled =
    Boolean(afterOrderSettings?.enabled) &&
    options.orderInsertScope === "order" &&
    options.isLastFile === true;

  const requiresRotation = backSideRotation === 'rotate-180';

  let requestedOrientation = options.orientation || profile.defaultOrientation || 'auto';
  const isWindows = process.platform === 'win32';
  const requiresOrientationRotation = isWindows && (requestedOrientation === 'landscape' || requestedOrientation === 'portrait');

  // We will track files to clean up
  const cleanups = [];
  let activePdfPath = inputFilePath;

  // 1. Slicing page range and/or Watermarking
  const pagesMode = options.pages?.mode;
  const watermarkEnabled = options.watermark?.enabled === true;
  
  if (pagesMode === 'custom' || watermarkEnabled) {
    console.log(`[PDF PREP] Applying slicing (${pagesMode}) or watermark (${watermarkEnabled}).`);
    const originalPdfBytes = fs.readFileSync(activePdfPath);
    const doc = await PDFDocument.load(originalPdfBytes);
    const totalPages = doc.getPageCount();

    // Slicing
    let targetDoc = doc;
    if (pagesMode === 'custom') {
      const selected = options.pages?.selected || parseRange(options.pages?.range, totalPages);
      console.log(`[PDF PREP] Slicing range: ${selected.join(',')}`);
      targetDoc = await PDFDocument.create();
      const copied = await targetDoc.copyPages(doc, selected.map(p => p - 1));
      copied.forEach(p => targetDoc.addPage(p));
    }

    // Watermark
    if (watermarkEnabled) {
      const watermark = options.watermark || {};
      const orderInfo = options.orderInfo || {};
      console.log(`[PDF PREP] Rendering watermark text.`);
      const font = await targetDoc.embedFont(StandardFonts.HelveticaBold);
      const text = getWatermarkText(orderInfo, watermark);
      const fontSize = Number(watermark.fontSize) || 18;
      const opacity = Math.max(0.05, Math.min(Number(watermark.opacity) || 0.18, 0.6));
      const rotation = Number(watermark.rotation) || 0;

      for (const page of targetDoc.getPages()) {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const [x, y] = getWatermarkPosition(watermark.position, width, height, textWidth, fontSize);

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.15, 0.18, 0.23),
          opacity,
          rotate: degrees(rotation)
        });
      }
    }

    const modifiedBytes = await targetDoc.save();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "printease-sliced-wm-"));
    const tempFilePath = path.join(tempDir, "sliced-wm.pdf");
    fs.writeFileSync(tempFilePath, modifiedBytes);
    
    activePdfPath = tempFilePath;
    cleanups.push(() => {
      try {
        fs.unlinkSync(tempFilePath);
        fs.rmdirSync(tempDir);
      } catch (err) {
        console.error(`[PDF PREP] Failed to clean up sliced/wm temp file ${tempFilePath}:`, err);
      }
    });
  }

  // 2. Imposition (N-up)
  const pagesPerSheet = Number(options.pagesPerSheet) || 1;
  let pagesPerSheetApplied = false;
  let finalSheetOrientation = 'portrait';

  if (pagesPerSheet > 1) {
    const paperSize = options.paperSize || profile.defaultPaperSize || 'A4';
    const impositionResult = await imposePdf({
      inputPdfPath: activePdfPath,
      pagesPerSheet,
      paperSize,
      orientation: requestedOrientation
    });

    activePdfPath = impositionResult.filePath;
    pagesPerSheetApplied = true;
    finalSheetOrientation = impositionResult.finalSheetOrientation;
    cleanups.push(impositionResult.cleanup);
  } else {
    // Detect orientation from page 1 of active PDF
    try {
      const bytes = fs.readFileSync(activePdfPath);
      const doc = await PDFDocument.load(bytes);
      const pages = doc.getPages();
      if (pages.length > 0) {
        const { width, height } = pages[0].getSize();
        const rot = pages[0].getRotation().angle;
        const isRotated90or270 = rot === 90 || rot === 270;
        const actualWidth = isRotated90or270 ? height : width;
        const actualHeight = isRotated90or270 ? width : height;
        finalSheetOrientation = (actualWidth > actualHeight) ? 'landscape' : 'portrait';
      }
    } catch (err) {
      console.warn(`[PDF PREP] Failed to auto-detect orientation, defaulting to portrait.`, err);
    }
  }

  // 3. Post-imposition processing (Baking copies, inserting after-order slip, rotation/reversal)
  // Let's load the active PDF for final touches
  const finalPdfBytes = fs.readFileSync(activePdfPath);
  let pdfDoc = await PDFDocument.load(finalPdfBytes);

  const copiesHandledInPdf = insertEnabled && requestedCopies > 1 ? requestedCopies : 0;
  if (copiesHandledInPdf) {
    const repeatedDoc = await PDFDocument.create();
    const sourceIndexes = pdfDoc.getPages().map((_, index) => index);
    for (let copyIndex = 0; copyIndex < copiesHandledInPdf; copyIndex++) {
      const copiedPages = await repeatedDoc.copyPages(pdfDoc, sourceIndexes);
      copiedPages.forEach((page) => repeatedDoc.addPage(page));
    }
    pdfDoc = repeatedDoc;
    console.log(`[PDF PREP] Baked ${copiesHandledInPdf} copies into PDF so order insert page is appended once.`);
  }

  const pages = pdfDoc.getPages();

  // If insertion is enabled, copy first page size and append a page
  if (insertEnabled && pages.length > 0) {
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    const newPage = pdfDoc.addPage([width, height]);

    const type = afterOrderSettings.type || 'blank';
    if (type === 'custom' || type === 'watermark') {
      const lines = [];
      if (type === 'custom') {
        if (afterOrderSettings.customText) {
          lines.push(afterOrderSettings.customText);
        }
      } else if (type === 'watermark') {
        const meta = afterOrderSettings.watermarkMetadata || {};
        const info = options.orderInfo || {};
        if (meta.clientName && info.clientName) lines.push(`Client: ${info.clientName}`);
        if (meta.pickupCode && info.pickupCode) lines.push(`Pickup Code: ${info.pickupCode}`);
        if (meta.printerId) {
          const pName = info.printerName || options.printerName || 'N/A';
          lines.push(`Printer ID: ${pName}`);
        }
        if (meta.serialNo && (info.orderCode || info.jobId)) {
          lines.push(`Serial/Order: ${info.orderCode || info.jobId}`);
        }
      }

      if (lines.length > 0) {
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const layout = afterOrderSettings.layout || {};
        const fontSize = Number(layout.fontSize || 12);
        const opacity = Number(layout.opacity !== undefined ? layout.opacity : 0.5);
        const rotation = Number(layout.orientation || 0);
        const shape = layout.shape || 'text';
        
        const rawX = layout.location?.x !== undefined ? Number(layout.location.x) : 100;
        const rawY = layout.location?.y !== undefined ? Number(layout.location.y) : 100;
        
        const x = rawX;
        const y = height - rawY; // relative to top

        let maxWidth = 0;
        for (const line of lines) {
          const w = font.widthOfTextAtSize(line, fontSize);
          if (w > maxWidth) maxWidth = w;
        }
        const lineHeight = fontSize * 1.2;
        const totalTextHeight = lines.length * lineHeight;
        const padding = 15;
        const boxWidth = maxWidth + padding * 2;
        const boxHeight = totalTextHeight + padding * 2;

        if (shape === 'box') {
          newPage.drawRectangle({
            x: x - padding,
            y: y - padding,
            width: boxWidth,
            height: boxHeight,
            borderColor: rgb(0.2, 0.4, 0.8),
            borderWidth: 2,
            color: rgb(0.95, 0.97, 1.0),
            opacity: opacity * 0.3,
            borderOpacity: opacity,
            rotate: degrees(rotation),
          });
        } else if (shape === 'circle') {
          const radius = Math.max(boxWidth, boxHeight) / 2 + 10;
          newPage.drawCircle({
            x: x + maxWidth / 2,
            y: y + totalTextHeight / 2,
            size: radius,
            borderColor: rgb(0.2, 0.4, 0.8),
            borderWidth: 2,
            color: rgb(0.95, 0.97, 1.0),
            opacity: opacity * 0.3,
            borderOpacity: opacity,
          });
        }

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineY = y + totalTextHeight - (i + 1) * lineHeight + (lineHeight - fontSize) / 2;
          newPage.drawText(line, {
            x: x,
            y: lineY,
            size: fontSize,
            font: font,
            color: rgb(0.1, 0.1, 0.1),
            opacity: opacity,
            rotate: degrees(rotation),
          });
        }
      }
    }
  }

  // Reverse page order if requested
  let targetDoc = pdfDoc;
  if (reversePageOrder) {
    targetDoc = await PDFDocument.create();
    const currentPages = pdfDoc.getPages();
    const copiedPages = await targetDoc.copyPages(pdfDoc, currentPages.map((_, i) => i));
    for (let i = copiedPages.length - 1; i >= 0; i--) {
      targetDoc.addPage(copiedPages[i]);
    }
  }

  // Rotate even pages if required
  if (requiresRotation) {
    const finalPages = targetDoc.getPages();
    for (let i = 0; i < finalPages.length; i++) {
      if ((i + 1) % 2 === 0) {
        const currentRotation = finalPages[i].getRotation().angle;
        finalPages[i].setRotation(degrees(currentRotation + 180));
      }
    }
  }

  // Rotate pages for Windows landscape/portrait printing
  if (requiresOrientationRotation) {
    const finalPages = targetDoc.getPages();
    for (const page of finalPages) {
      const { width, height } = page.getSize();
      const currentRotation = page.getRotation().angle;
      const isPortrait = (currentRotation % 180 === 0) ? (width < height) : (width > height);
      
      if (requestedOrientation === 'landscape' && isPortrait) {
        page.setRotation(degrees((currentRotation + 90) % 360));
      } else if (requestedOrientation === 'portrait' && !isPortrait) {
        page.setRotation(degrees((currentRotation + 90) % 360));
      }
    }
  }

  const finalBytes = await targetDoc.save();
  const finalTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "printease-prep-"));
  const finalTempFilePath = path.join(finalTempDir, "prepared.pdf");
  fs.writeFileSync(finalTempFilePath, finalBytes);

  console.log(`[PDF PREP] Generated final prepared PDF: ${finalTempFilePath}`);

  return {
    tempFilePath: finalTempFilePath,
    copiesHandledInPdf,
    finalSheetOrientation,
    pagesPerSheetApplied,
    cleanup: () => {
      // Cleanup all temp files in the cleanups queue
      for (const cleanupFn of cleanups) {
        try {
          cleanupFn();
        } catch (err) {
          console.error(`[PDF PREP] Cleanup step failed:`, err);
        }
      }
      // Cleanup final file
      try {
        fs.unlinkSync(finalTempFilePath);
        fs.rmdirSync(finalTempDir);
        console.log(`[PDF PREP] Cleaned up final temp PDF: ${finalTempFilePath}`);
      } catch (err) {
        console.error(`[PDF PREP] Failed to clean up final temp PDF:`, err);
      }
    }
  };
}
