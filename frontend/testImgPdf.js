import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

async function run() {
  const pdfDoc = await PDFDocument.create();
  const rawBytes = fs.readFileSync('public/logo.png'); // use logo.png from public
  const embeddedImage = await pdfDoc.embedPng(rawBytes);
  const page = pdfDoc.addPage([595.28, 841.89]);
  page.drawImage(embeddedImage, {
    x: 50, y: 50, width: 200, height: 200
  });
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('testImg.pdf', pdfBytes);
}
run().then(() => console.log("Done"));
