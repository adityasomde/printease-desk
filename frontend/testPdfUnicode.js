import { PDFDocument, StandardFonts } from 'pdf-lib';
async function run() {
  try {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Courier);
    const page = pdf.addPage();
    page.drawText("Hello 👋 😊 or 这是一个测试", { font });
    await pdf.save();
    console.log("Success");
  } catch (e) {
    console.error("Error drawing text:", e);
  }
}
run();
