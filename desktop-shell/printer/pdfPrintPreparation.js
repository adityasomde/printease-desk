import { PDFDocument, degrees } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Pre-processes a PDF file if the printer profile or print options require manual adjustments.
 * This is especially useful for Windows SumatraPDF which lacks reliable back-side rotation via command line.
 * 
 * @param {string} inputFilePath 
 * @param {object} printOptions 
 * @param {object} printerProfile 
 * @returns {Promise<{ tempFilePath: string | null, cleanup: () => void }>}
 */
export async function preparePdfForPrinting(inputFilePath, printOptions = {}, printerProfile = {}) {
  // Determine if correction is needed based on profile or options
  let backSideRotation = printOptions.backSideRotation || printerProfile.backSideRotation || 'auto';
  let reversePageOrder = printOptions.pageOrder === 'reverse' || printerProfile.reversePageOrder;

  const requiresRotation = backSideRotation === 'rotate-180';
  
  if (!requiresRotation && !reversePageOrder) {
    return { tempFilePath: null, cleanup: () => {} }; // No correction needed
  }

  console.log(`[PDF PREP] Processing PDF: ${inputFilePath}`);
  if (requiresRotation) console.log(`[PDF PREP] Rotating even pages by 180 degrees.`);
  if (reversePageOrder) console.log(`[PDF PREP] Reversing page order.`);

  const originalPdfBytes = fs.readFileSync(inputFilePath);
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();

  // If page order needs to be reversed, we remove all pages and re-insert them backwards.
  // Wait, pdf-lib doesn't easily allow re-ordering in-place without removing and adding.
  // Actually, we can create a new document and copy pages.
  let targetDoc = pdfDoc;
  
  if (reversePageOrder) {
    targetDoc = await PDFDocument.create();
    const copiedPages = await targetDoc.copyPages(pdfDoc, pages.map((_, i) => i));
    for (let i = copiedPages.length - 1; i >= 0; i--) {
      targetDoc.addPage(copiedPages[i]);
    }
  }

  // Rotate even pages if required (for duplex short/long edge correction)
  if (requiresRotation) {
    const finalPages = targetDoc.getPages();
    for (let i = 0; i < finalPages.length; i++) {
      // 0-indexed. Page 2 is i=1 (even page when 1-indexed)
      if ((i + 1) % 2 === 0) {
        const currentRotation = finalPages[i].getRotation().angle;
        finalPages[i].setRotation(degrees(currentRotation + 180));
      }
    }
  }

  const modifiedPdfBytes = await targetDoc.save();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "printease-corrected-"));
  const tempFilePath = path.join(tempDir, "corrected.pdf");
  fs.writeFileSync(tempFilePath, modifiedPdfBytes);

  console.log(`[PDF PREP] Generated corrected PDF: ${tempFilePath}`);

  return {
    tempFilePath,
    cleanup: () => {
      try {
        fs.unlinkSync(tempFilePath);
        fs.rmdirSync(tempDir);
        console.log(`[PDF PREP] Cleaned up temp PDF: ${tempFilePath}`);
      } catch (err) {
        console.error(`[PDF PREP] Failed to cleanup temp PDF:`, err);
      }
    }
  };
}
