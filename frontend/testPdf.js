import fs from 'fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const A4 = Object.freeze({ width: 595.28, height: 841.89 });

async function createPdfFromText() {
  const text = "This is a test document.\nIt should not be blank.\nLine 3.";
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Courier);
  const fontSize = 10;
  const margin = 40;
  const lineHeight = 14;
  
  const sourceLines = text.split(/\r?\n/);
  let page = pdf.addPage([A4.width, A4.height]);

  for (let i = 0; i < sourceLines.length; i++) {
    page.drawText(sourceLines[i], {
      x: margin,
      y: A4.height - margin - i * lineHeight,
      size: fontSize,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }

  const bytes = await pdf.save();
  fs.writeFileSync('test.pdf', bytes);
}

createPdfFromText().then(() => console.log("Done")).catch(console.error);
