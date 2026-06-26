import mammoth from 'mammoth';
import html2pdf from 'html2pdf.js';

/**
 * Universal local converter
 * Converts DOCX files to HTML using Mammoth, then to PDF using html2pdf.js.
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
    filename: file.name + ".pdf",
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  const pdfBlob = await html2pdf().set(opt).from(container).output('blob');
  return new File([pdfBlob], file.name + ".pdf", { type: 'application/pdf' });
}
