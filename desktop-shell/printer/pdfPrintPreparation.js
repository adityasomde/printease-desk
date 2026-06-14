import { PDFDocument, degrees, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Pre-processes a PDF file if the printer profile, print options, or after-order settings require manual adjustments.
 * 
 * @param {string} inputFilePath 
 * @param {object} printOptions 
 * @param {object} printerProfile 
 * @returns {Promise<{ tempFilePath: string | null, cleanup: () => void }>}
 */
export async function preparePdfForPrinting(inputFilePath, printOptions = {}, printerProfile = {}) {
  // Determine if correction or insertion is needed based on profile or options
  let backSideRotation = printOptions.backSideRotation || printerProfile.backSideRotation || 'auto';
  let reversePageOrder = printOptions.pageOrder === 'reverse' || printerProfile.reversePageOrder;
  
  const afterOrderSettings = printOptions.afterOrderSettings;
  const insertEnabled = afterOrderSettings && afterOrderSettings.enabled && printOptions.isLastFile !== false;

  const requiresRotation = backSideRotation === 'rotate-180';
  
  let requestedOrientation = printOptions.orientation || printerProfile.defaultOrientation || 'auto';
  const isWindows = process.platform === 'win32';
  const requiresOrientationRotation = isWindows && (requestedOrientation === 'landscape' || requestedOrientation === 'portrait');
  
  if (!requiresRotation && !reversePageOrder && !insertEnabled && !requiresOrientationRotation) {
    return { tempFilePath: null, cleanup: () => {} }; // No correction/insertion/rotation needed
  }

  console.log(`[PDF PREP] Processing PDF: ${inputFilePath}`);
  if (requiresRotation) console.log(`[PDF PREP] Rotating even pages by 180 degrees.`);
  if (reversePageOrder) console.log(`[PDF PREP] Reversing page order.`);
  if (insertEnabled) console.log(`[PDF PREP] Appending slip/banner page after order.`);
  if (requiresOrientationRotation) console.log(`[PDF PREP] Adjusting page rotation for Windows ${requestedOrientation} mode.`);

  const originalPdfBytes = fs.readFileSync(inputFilePath);
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();

  // If insertion is enabled, copy first page size and append a page
  if (insertEnabled && pages.length > 0) {
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    const newPage = pdfDoc.addPage([width, height]);

    // Check type of page
    const type = afterOrderSettings.type || 'blank';
    if (type === 'custom' || type === 'watermark') {
      const lines = [];
      if (type === 'custom') {
        if (afterOrderSettings.customText) {
          lines.push(afterOrderSettings.customText);
        }
      } else if (type === 'watermark') {
        const meta = afterOrderSettings.watermarkMetadata || {};
        const info = printOptions.orderInfo || {};
        if (meta.clientName && info.clientName) lines.push(`Client: ${info.clientName}`);
        if (meta.pickupCode && info.pickupCode) lines.push(`Pickup Code: ${info.pickupCode}`);
        if (meta.printerId) {
          const pName = info.printerName || printOptions.printerName || 'N/A';
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

        // Calculate size for optional border box
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

  // If page order needs to be reversed, we copy pages backwards
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

  // Programmatically rotate pages for Windows landscape/portrait printing
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

