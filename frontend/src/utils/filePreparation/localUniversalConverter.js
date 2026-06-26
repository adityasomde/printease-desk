import mammoth from 'mammoth';
import html2pdf from 'html2pdf.js';

/**
 * Universal local converter
 * Purpose: Converts office documents (like DOCX) into PDF entirely within the browser.
 * Added: June 2026, to remove the backend/desktop agent requirement for simple document preview and page counting.
 * Dependencies:
 *  - mammoth: Used to convert DOCX files into raw HTML.
 *  - html2pdf.js: Used to render that HTML onto a canvas and generate a PDF file.
 * 
 * @param {File} file - The original File object uploaded by the user via the file input.
 * @returns {Promise<File>} A Promise that resolves to the generated print-ready PDF File object.
 */
export async function convertGenericFileToPdfInBrowser(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'docx') {
    return await convertDocxToPdf(file);
  }

  // Fallback for completely unsupported files (PPTX, XLSX, etc.)
  // We'll create a basic PDF that says "Preview not available" but preserves the file name.
  return await createFallbackPdf(file);
}

/**
 * Converts a DOCX file into a PDF file.
 * Purpose: Provides a fast, local way to get page counts and previews for DOCX without a backend.
 * Dependencies: mammoth for DOCX -> HTML extraction, html2pdf.js for HTML -> PDF generation.
 * @param {File} file - The DOCX file to convert.
 * @returns {Promise<File>} The converted PDF File object.
 */

async function convertDocxToPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  
  // Convert DOCX to raw HTML
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value; // The generated HTML

  // Create a hidden container to hold the HTML for rendering
  const container = document.createElement('div');
  container.innerHTML = html;
  
  // Add some basic styling to make it look like a document
  container.style.padding = '20px';
  container.style.fontFamily = 'Arial, sans-serif';
  container.style.fontSize = '12pt';
  container.style.color = '#000';
  container.style.background = '#fff';
  container.style.width = '210mm'; // A4 width approx
  
  // Temporarily append to body to allow rendering (html2pdf needs it in DOM sometimes)
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  document.body.appendChild(container);

  try {
    const opt = {
      margin: 10,
      filename: file.name.replace(/\.[^/.]+$/, "") + ".pdf",
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const pdfBlob = await html2pdf().set(opt).from(container).output('blob');
    
    // Return a File object
    return new File([pdfBlob], opt.filename, { type: 'application/pdf' });
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Creates a placeholder PDF for unsupported file types (like PPTX).
 * Purpose: Allows the system to treat unsupported files as PDFs so they can still go through the standard upload pipeline (page counting will result in 1 page).
 * Added: June 2026, to simplify the upload flow and avoid desktop agent dependency for unsupported files.
 * @param {File} file - The unsupported file (e.g. PPTX).
 * @returns {Promise<File>} A placeholder PDF File object.
 */
async function createFallbackPdf(file) {
  const container = document.createElement('div');
  container.innerHTML = `
    <div style="padding: 40px; font-family: sans-serif; text-align: center;">
      <h2>${file.name}</h2>
      <p>This file type (${file.name.split('.').pop()}) cannot be perfectly rendered in the browser.</p>
      <p>It will be uploaded as-is, but this is a placeholder PDF for page counting purposes.</p>
    </div>
  `;
  container.style.width = '210mm';
  
  const opt = {
    margin: 10,
    filename: file.name.replace(/\.[^/.]+$/, "") + ".pdf",
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  const pdfBlob = await html2pdf().set(opt).from(container).output('blob');
  return new File([pdfBlob], opt.filename, { type: 'application/pdf' });
}
