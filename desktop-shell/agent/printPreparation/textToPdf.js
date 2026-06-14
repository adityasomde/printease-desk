/**
 * Text/CSV/JSON to PDF converter.
 *
 * Dependency:
 *   npm install pdf-lib
 *
 * This is a simple plain-text renderer. It is not meant for perfect CSV spreadsheet layout.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const A4 = Object.freeze({ width: 595.28, height: 841.89 });

function wrapLine(line, maxChars) {
  const chunks = [];
  let value = String(line ?? '');
  while (value.length > maxChars) {
    chunks.push(value.slice(0, maxChars));
    value = value.slice(maxChars);
  }
  chunks.push(value);
  return chunks;
}

export async function convertTextToPdf({ inputPath, outputDir, fileName = '', options = {} } = {}) {
  if (!inputPath) throw new Error('convertTextToPdf requires inputPath');
  if (!outputDir) throw new Error('convertTextToPdf requires outputDir');

  await fs.mkdir(outputDir, { recursive: true });
  const text = await fs.readFile(inputPath, 'utf8');

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontSize = Number(options.fontSize || 10);
  const margin = Number(options.margin || 36);
  const lineHeight = fontSize * 1.35;
  const maxChars = Math.floor((A4.width - margin * 2) / (fontSize * 0.6));
  const maxLines = Math.floor((A4.height - margin * 2) / lineHeight);

  const allLines = text.split(/\r?\n/).flatMap((line) => wrapLine(line, maxChars));
  let page = null;
  let lineIndexOnPage = 0;

  for (const line of allLines.length ? allLines : ['']) {
    if (!page || lineIndexOnPage >= maxLines) {
      page = pdfDoc.addPage([A4.width, A4.height]);
      lineIndexOnPage = 0;
    }

    page.drawText(line, {
      x: margin,
      y: A4.height - margin - lineIndexOnPage * lineHeight,
      size: fontSize,
      font,
    });
    lineIndexOnPage += 1;
  }

  const baseName = String(fileName || path.basename(inputPath)).replace(/\.[^.]+$/, '');
  const outputPath = path.join(outputDir, `${baseName}.print-ready.pdf`);
  await fs.writeFile(outputPath, await pdfDoc.save());

  return {
    success: true,
    outputPath,
    outputFileType: 'application/pdf',
    conversionSource: 'desktop-text-to-pdf',
  };
}
