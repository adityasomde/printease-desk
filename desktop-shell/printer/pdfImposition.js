import { PDFDocument, degrees } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PAPER_SIZES = {
  A4: { width: 595.27, height: 841.89 },
  A3: { width: 841.89, height: 1190.55 },
  LETTER: { width: 612, height: 792 },
  LEGAL: { width: 612, height: 1008 }
};

/**
 * Imposes a source PDF into a new PDF with standard N-up pages-per-sheet layout.
 *
 * @param {object} params
 * @param {string} params.inputPdfPath
 * @param {number} params.pagesPerSheet
 * @param {string} params.paperSize
 * @param {string} params.orientation
 * @returns {Promise<{ filePath: string, pagesPerSheetApplied: boolean, finalSheetOrientation: string, cleanup: () => void }>}
 */
export async function imposePdf({
  inputPdfPath,
  pagesPerSheet,
  paperSize = 'A4',
  orientation = 'auto'
}) {
  console.log(`[PDF IMPOSITION] Starting imposition for ${inputPdfPath} with pagesPerSheet: ${pagesPerSheet}, paperSize: ${paperSize}, orientation: ${orientation}`);
  
  const originalPdfBytes = fs.readFileSync(inputPdfPath);
  const srcDoc = await PDFDocument.load(originalPdfBytes);
  const srcPages = srcDoc.getPages();
  const totalSrcPages = srcPages.length;

  if (totalSrcPages === 0) {
    throw new Error("Source PDF contains no pages.");
  }

  // Determine final sheet orientation
  let finalSheetOrientation = 'portrait';
  if (orientation === 'portrait') {
    finalSheetOrientation = 'portrait';
  } else if (orientation === 'landscape') {
    finalSheetOrientation = 'landscape';
  } else {
    // auto orientation
    if (pagesPerSheet === 2) {
      finalSheetOrientation = 'landscape';
    } else if (pagesPerSheet === 1) {
      const firstPage = srcPages[0];
      const { width, height } = firstPage.getSize();
      const rot = firstPage.getRotation().angle;
      const isRotated90or270 = rot === 90 || rot === 270;
      const actualWidth = isRotated90or270 ? height : width;
      const actualHeight = isRotated90or270 ? width : height;
      if (actualWidth > actualHeight) {
        finalSheetOrientation = 'landscape';
      } else {
        finalSheetOrientation = 'portrait';
      }
    } else {
      // 4, 6, 9, 16
      finalSheetOrientation = 'portrait';
    }
  }

  // Determine final sheet dimensions
  const sizeKey = String(paperSize || 'A4').toUpperCase();
  const baseSize = PAPER_SIZES[sizeKey] || PAPER_SIZES.A4;
  const sheetWidth = finalSheetOrientation === 'landscape' ? baseSize.height : baseSize.width;
  const sheetHeight = finalSheetOrientation === 'landscape' ? baseSize.width : baseSize.height;

  // Determine grid layout (rows and columns)
  let rows = 1, cols = 1;
  if (pagesPerSheet === 1) {
    rows = 1; cols = 1;
  } else if (pagesPerSheet === 2) {
    if (finalSheetOrientation === 'landscape') {
      rows = 1; cols = 2;
    } else {
      rows = 2; cols = 1;
    }
  } else if (pagesPerSheet === 4) {
    rows = 2; cols = 2;
  } else if (pagesPerSheet === 6) {
    if (finalSheetOrientation === 'landscape') {
      rows = 2; cols = 3;
    } else {
      rows = 3; cols = 2;
    }
  } else if (pagesPerSheet === 9) {
    rows = 3; cols = 3;
  } else if (pagesPerSheet === 16) {
    rows = 4; cols = 4;
  } else {
    rows = 1; cols = 1;
  }

  console.log(`[PDF IMPOSITION] Imposing into grid rows: ${rows}, cols: ${cols} on ${finalSheetOrientation} ${paperSize} sheet.`);

  const targetDoc = await PDFDocument.create();
  const embeddedPages = await targetDoc.embedPages(srcPages);

  const margin = 20; // safe margin from sheet boundaries
  const printableWidth = sheetWidth - 2 * margin;
  const printableHeight = sheetHeight - 2 * margin;
  const cellWidth = printableWidth / cols;
  const cellHeight = printableHeight / rows;

  const cellsPerPage = rows * cols;
  let currentSheet = null;

  for (let i = 0; i < totalSrcPages; i++) {
    const cellIndex = i % cellsPerPage;
    if (cellIndex === 0) {
      currentSheet = targetDoc.addPage([sheetWidth, sheetHeight]);
    }

    const col = cellIndex % cols;
    const row = Math.floor(cellIndex / cols);

    const cx = margin + col * cellWidth;
    const cy = sheetHeight - margin - (row + 1) * cellHeight;

    const srcPage = srcPages[i];
    const embeddedPage = embeddedPages[i];
    const { width: srcWidth, height: srcHeight } = srcPage.getSize();
    const rot = srcPage.getRotation().angle; // 0, 90, 180, 270

    const isRotated90or270 = rot === 90 || rot === 270;
    const visualWidth = isRotated90or270 ? srcHeight : srcWidth;
    const visualHeight = isRotated90or270 ? srcWidth : srcHeight;

    // Small cell padding
    const cellPadding = 4;
    const targetCellWidth = cellWidth - 2 * cellPadding;
    const targetCellHeight = cellHeight - 2 * cellPadding;

    const scaleX = targetCellWidth / visualWidth;
    const scaleY = targetCellHeight / visualHeight;
    const scale = Math.min(scaleX, scaleY);

    const fitWidth = visualWidth * scale;
    const fitHeight = visualHeight * scale;

    const offsetX = cellPadding + (targetCellWidth - fitWidth) / 2;
    const offsetY = cellPadding + (targetCellHeight - fitHeight) / 2;

    const w = srcWidth * scale;
    const h = srcHeight * scale;

    let drawOptions = {
      width: w,
      height: h,
    };

    if (rot === 90) {
      drawOptions.rotate = degrees(90);
      drawOptions.x = cx + offsetX + h;
      drawOptions.y = cy + offsetY;
    } else if (rot === 180) {
      drawOptions.rotate = degrees(180);
      drawOptions.x = cx + offsetX + w;
      drawOptions.y = cy + offsetY + h;
    } else if (rot === 270) {
      drawOptions.rotate = degrees(270);
      drawOptions.x = cx + offsetX;
      drawOptions.y = cy + offsetY + w;
    } else {
      drawOptions.rotate = degrees(0);
      drawOptions.x = cx + offsetX;
      drawOptions.y = cy + offsetY;
    }

    currentSheet.drawPage(embeddedPage, drawOptions);
  }

  const modifiedPdfBytes = await targetDoc.save();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "printease-imposed-"));
  const tempFilePath = path.join(tempDir, "imposed.pdf");
  fs.writeFileSync(tempFilePath, modifiedPdfBytes);

  console.log(`[PDF IMPOSITION] Created imposed PDF: ${tempFilePath}`);

  return {
    filePath: tempFilePath,
    pagesPerSheetApplied: true,
    finalSheetOrientation,
    cleanup: () => {
      try {
        fs.unlinkSync(tempFilePath);
        fs.rmdirSync(tempDir);
        console.log(`[PDF IMPOSITION] Cleaned up temp PDF: ${tempFilePath}`);
      } catch (err) {
        console.error(`[PDF IMPOSITION] Failed to cleanup temp PDF:`, err);
      }
    }
  };
}
