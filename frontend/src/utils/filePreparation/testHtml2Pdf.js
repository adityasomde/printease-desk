import html2pdf from 'html2pdf.js';

export async function testPdf() {
  const container = document.createElement('div');
  container.innerHTML = '<h1>Test</h1><p>This is a test</p>';
  // do not append
  const blob = await html2pdf().from(container).output('blob');
  console.log('Blob size:', blob.size);
}
