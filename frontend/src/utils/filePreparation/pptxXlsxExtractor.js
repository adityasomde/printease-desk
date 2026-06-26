import JSZip from 'jszip';

export async function extractPptxText(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    let text = "";
    
    // PPTX stores slide content in ppt/slides/slide1.xml, slide2.xml, etc.
    const slideFiles = Object.keys(zip.files).filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/));
    
    // Sort slides by number
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)[1], 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/)[1], 10);
      return numA - numB;
    });

    for (const slideName of slideFiles) {
      const content = await zip.file(slideName).async("string");
      // Extract text from <a:t> tags
      const matches = content.match(/<a:t>([\s\S]*?)<\/a:t>/g);
      if (matches) {
        const slideText = matches.map(m => m.replace(/<a:t>|<\/a:t>/g, '')).join(' ');
        text += `--- Slide ---\n${slideText}\n\n`;
      } else {
        text += `--- Slide (No Text) ---\n\n`;
      }
    }
    
    return text || "No text could be extracted from this presentation.";
  } catch (error) {
    console.error("Failed to extract PPTX text:", error);
    return null;
  }
}

export async function extractXlsxText(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    let text = "";
    
    // Excel usually stores text in xl/sharedStrings.xml
    const sharedStringsFile = zip.file('xl/sharedStrings.xml');
    if (sharedStringsFile) {
      const content = await sharedStringsFile.async("string");
      // Extract text from <t> tags
      const matches = content.match(/<t(?:\s+[^>]+)?>([\s\S]*?)<\/t>/g);
      if (matches) {
        text = matches.map(m => m.replace(/<t(?:[^>]*)>|<\/t>/g, '')).join('\n');
      }
    }
    
    return text || "No text could be extracted from this spreadsheet.";
  } catch (error) {
    console.error("Failed to extract XLSX text:", error);
    return null;
  }
}
