import mammoth from 'mammoth';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getOfficePageCount } from './officePageCounter';
import { extractPptxText, extractXlsxText } from './pptxXlsxExtractor';

const A4 = Object.freeze({ width: 595.28, height: 841.89 });

function wrapLine(text, maxChars) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    if (!word) continue;
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

export async function convertGenericFileToPdfInBrowser(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  
  const realPageCount = await getOfficePageCount(file);
  const targetPages = (realPageCount && realPageCount > 0) ? realPageCount : 1;

  if (extension === 'docx') {
    return await convertDocxToPdf(file, baseName, targetPages);
  } else if (extension === 'pptx') {
    return await convertPptxToPdf(file, baseName, targetPages);
  } else if (extension === 'xlsx' || extension === 'xls') {
    return await convertXlsxToPdf(file, baseName, targetPages);
  }

  return await createPlaceholderPdf(file, baseName, targetPages);
}

async function convertPptxToPdf(file, baseName, targetPages) {
  const text = await extractPptxText(file);
  if (text) {
    return await createPdfFromText(text, baseName, targetPages);
  }
  return await createPlaceholderPdf(file, baseName, targetPages);
}

async function convertXlsxToPdf(file, baseName, targetPages) {
  const text = await extractXlsxText(file);
  if (text) {
    return await createPdfFromText(text, baseName, targetPages);
  }
  return await createPlaceholderPdf(file, baseName, targetPages);
}

async function convertDocxToPdf(file, baseName, targetPages) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value || "No text could be extracted.";
    
    return await createPdfFromText(text, baseName, targetPages);
  } catch (error) {
    console.error("Failed to parse DOCX text:", error);
    return await createPlaceholderPdf(file, baseName, targetPages);
  }
}

async function createPlaceholderPdf(file, baseName, targetPages) {
  const text = `Placeholder preview for ${file.name}.\n\nThe web browser cannot accurately render this file type.\nA placeholder PDF has been generated with ${targetPages} page(s) for accurate pricing.\n\nFor a precise preview, please convert your file to PDF on your device before uploading.`;
  return await createPdfFromText(text, baseName, targetPages);
}

async function createPdfFromText(text, baseName, targetPages) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const fontSize = 10;
  const margin = 40;
  const lineHeight = 14;
  
  const maxChars = Math.max(40, Math.floor((A4.width - margin * 2) / (fontSize * 0.62)));
  const maxLines = Math.max(20, Math.floor((A4.height - margin * 2) / lineHeight));
  
  const sourceLines = text.split(/\r?\n/).flatMap((line) => wrapLine(line, maxChars));
  let page = pdf.addPage([A4.width, A4.height]);
  let lineIndex = 0;
  let pagesCreated = 1;

  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    
    // Stop rendering text if we've reached the target page count
    // (to ensure we don't accidentally exceed the real page count of the document)
    if (pagesCreated > targetPages) {
      break;
    }

    if (lineIndex >= maxLines) {
      page = pdf.addPage([A4.width, A4.height]);
      pagesCreated++;
      lineIndex = 0;
      if (pagesCreated > targetPages) break;
    }

    page.drawText(line.slice(0, maxChars), {
      x: margin,
      y: A4.height - margin - lineIndex * lineHeight,
      size: fontSize,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    lineIndex++;
  }

  // If the extracted text didn't fill up the real page count, add blank pages until it matches
  while (pagesCreated < targetPages) {
    pdf.addPage([A4.width, A4.height]);
    pagesCreated++;
  }

  const bytes = await pdf.save();
  return new File([bytes], `${baseName}.pdf`, { type: 'application/pdf' });
}
