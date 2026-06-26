import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

export async function convertTextToPdfInBrowser(file, options = {}) {
  const {
    fontSize = 10,
    margin = 42,
    lineHeight = 14,
  } = options;

  const text = await file.text();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const maxChars = Math.max(40, Math.floor((A4.width - margin * 2) / (fontSize * 0.62)));
  const maxLines = Math.max(20, Math.floor((A4.height - margin * 2) / lineHeight));

  const sourceLines = text.split(/\r?\n/).flatMap((line) => wrapLine(line, maxChars));
  let page = null;
  let lineIndex = 0;

  sourceLines.forEach((line, index) => {
    if (!page || lineIndex >= maxLines) {
      page = pdf.addPage([A4.width, A4.height]);
      lineIndex = 0;
    }

    page.drawText(line.slice(0, maxChars), {
      x: margin,
      y: A4.height - margin - lineIndex * lineHeight,
      size: fontSize,
      font,
      color: rgb(0.08, 0.1, 0.14),
    });
    lineIndex += 1;

    if (index === sourceLines.length - 1 && !page) {
      page = pdf.addPage([A4.width, A4.height]);
    }
  });

  if (!sourceLines.length) {
    pdf.addPage([A4.width, A4.height]);
  }

  const bytes = await pdf.save();
  const baseName = String(file.name || 'document').replace(/\.[^/.]+$/, '');
  return new File([bytes], `${baseName}.pdf`, {
    type: 'application/pdf',
    lastModified: Date.now(),
  });
}
