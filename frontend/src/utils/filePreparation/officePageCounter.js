import JSZip from 'jszip';

/**
 * Extracts page/slide/worksheet count from Office files (.docx, .pptx, .xlsx)
 * using JSZip to read the docProps/app.xml metadata.
 */
export async function getOfficePageCount(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    const appXml = zip.file('docProps/app.xml');
    if (!appXml) return null;
    
    const xmlContent = await appXml.async('string');
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (ext === 'pptx') {
      const match = xmlContent.match(/<Slides>(\d+)<\/Slides>/i) || xmlContent.match(/<(?:\w+:)?Slides>(\d+)<\/(?:\w+:)?Slides>/i);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    } else if (ext === 'docx') {
      const match = xmlContent.match(/<Pages>(\d+)<\/Pages>/i) || xmlContent.match(/<(?:\w+:)?Pages>(\d+)<\/(?:\w+:)?Pages>/i);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    } else if (ext === 'xlsx') {
      // In Excel, we can just count the number of worksheet files
      let sheetCount = 0;
      zip.folder('xl/worksheets/').forEach(() => {
        sheetCount++;
      });
      if (sheetCount > 0) return sheetCount;
    }
    
    return null;
  } catch (error) {
    console.debug('Failed to extract office page count:', error);
    return null;
  }
}
