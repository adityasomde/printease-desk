/**
 * Desktop image-to-PDF conversion.
 *
 * Dependency:
 *   npm install pdf-lib
 *
 * Supported without extra native packages:
 * - JPG/JPEG
 * - PNG
 *
 * Optional support through sharp if installed:
 * - WebP, GIF, BMP, TIFF, HEIC/HEIF depending on sharp build support
 *
 * Final output is always a PDF path that can be printed by the existing PDF print path.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

const A4_PORTRAIT = Object.freeze({ width: 595.28, height: 841.89 });
const A4_LANDSCAPE = Object.freeze({ width: 841.89, height: 595.28 });

function extensionOf(name = '') {
  const clean = String(name || '').toLowerCase();
  const index = clean.lastIndexOf('.');
  return index >= 0 ? clean.slice(index) : '';
}

async function maybeNormalizeImageWithSharp(inputPath) {
  const ext = extensionOf(inputPath);
  if (['.jpg', '.jpeg', '.png'].includes(ext)) return { normalized: false, path: inputPath };

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return {
      normalized: false,
      error: {
        reasonCode: 'IMAGE_CONVERSION_ENGINE_MISSING',
        message: 'Install sharp or upload JPG/PNG for automatic image conversion.',
      },
    };
  }

  const outputPath = `${inputPath}.normalized.png`;
  await sharp(inputPath).png().toFile(outputPath);
  return { normalized: true, path: outputPath };
}

function fitInsidePage(imageWidth, imageHeight, pageWidth, pageHeight, margin) {
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, 1);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    width,
    height,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
  };
}

export async function convertImageToPdf({ inputPath, outputDir, fileName = '', options = {} } = {}) {
  if (!inputPath) throw new Error('convertImageToPdf requires inputPath');
  if (!outputDir) throw new Error('convertImageToPdf requires outputDir');

  await fs.mkdir(outputDir, { recursive: true });

  const normalized = await maybeNormalizeImageWithSharp(inputPath);
  if (normalized.error) {
    return { success: false, ...normalized.error };
  }

  const sourcePath = normalized.path;
  const ext = extensionOf(sourcePath);
  const bytes = new Uint8Array(await fs.readFile(sourcePath));

  const pdfDoc = await PDFDocument.create();
  let image;
  if (ext === '.png') image = await pdfDoc.embedPng(bytes);
  else if (ext === '.jpg' || ext === '.jpeg') image = await pdfDoc.embedJpg(bytes);
  else return { success: false, reasonCode: 'UNSUPPORTED_IMAGE_FORMAT', message: `Unsupported image format: ${ext}` };

  const orientation = options.orientation || 'auto';
  const margin = Number(options.margin || 36);
  const pageSize = orientation === 'landscape' || (orientation === 'auto' && image.width > image.height)
    ? A4_LANDSCAPE
    : A4_PORTRAIT;

  const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
  const box = fitInsidePage(image.width, image.height, pageSize.width, pageSize.height, margin);
  page.drawImage(image, box);

  const baseName = String(fileName || path.basename(inputPath)).replace(/\.[^.]+$/, '');
  const outputPath = path.join(outputDir, `${baseName}.print-ready.pdf`);
  await fs.writeFile(outputPath, await pdfDoc.save());

  if (normalized.normalized) await fs.unlink(sourcePath).catch(() => {});

  return {
    success: true,
    outputPath,
    outputFileType: 'application/pdf',
    conversionSource: 'desktop-image-to-pdf',
  };
}
