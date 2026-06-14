/**
 * Browser image-to-PDF conversion for light user-side preparation.
 *
 * Dependency:
 *   npm install pdf-lib
 *
 * Supported in browser:
 * - JPG/JPEG directly through pdf-lib
 * - PNG directly through pdf-lib
 * - WebP through browser canvas, then embedded as PNG
 *
 * Keep this for small images only. Large images should be left for desktop agent conversion.
 */

import { PDFDocument } from 'pdf-lib';

const A4_PORTRAIT = Object.freeze({ width: 595.28, height: 841.89 });
const A4_LANDSCAPE = Object.freeze({ width: 841.89, height: 595.28 });

function getImageType(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();

  if (type === 'image/png' || name.endsWith('.png')) return 'png';
  if (type === 'image/webp' || name.endsWith('.webp')) return 'webp';
  if (type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpg';

  return 'unsupported';
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

async function loadImageFromFile(file) {
  const url = await fileToDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Browser could not decode the image'));
    img.src = url;
  });
}

async function convertWebpToPngBytes(file) {
  const image = await loadImageFromFile(file);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser canvas is not available for image conversion');
  ctx.drawImage(image, 0, 0);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Browser failed to convert WebP image to PNG');
  return new Uint8Array(await blob.arrayBuffer());
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

export async function convertImageToPdfInBrowser(file, options = {}) {
  const {
    paperSize = 'A4',
    orientation = 'auto',
    margin = 36,
    maxPixels = 25_000_000,
  } = options;

  if (paperSize !== 'A4') {
    throw new Error('Browser image conversion currently supports A4 only');
  }

  const imageType = getImageType(file);
  if (imageType === 'unsupported') {
    throw new Error('Browser image conversion supports JPG, PNG, and WebP only');
  }

  const decodedImage = await loadImageFromFile(file);
  const naturalWidth = decodedImage.naturalWidth || decodedImage.width;
  const naturalHeight = decodedImage.naturalHeight || decodedImage.height;
  const pixels = naturalWidth * naturalHeight;

  if (pixels > maxPixels) {
    throw new Error('Image is too large for safe browser conversion');
  }

  const pdfDoc = await PDFDocument.create();
  const rawBytes = new Uint8Array(await file.arrayBuffer());

  let embeddedImage;
  if (imageType === 'png') embeddedImage = await pdfDoc.embedPng(rawBytes);
  if (imageType === 'jpg') embeddedImage = await pdfDoc.embedJpg(rawBytes);
  if (imageType === 'webp') {
    const pngBytes = await convertWebpToPngBytes(file);
    embeddedImage = await pdfDoc.embedPng(pngBytes);
  }

  const pageSize = orientation === 'landscape' || (orientation === 'auto' && naturalWidth > naturalHeight)
    ? A4_LANDSCAPE
    : A4_PORTRAIT;

  const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
  const box = fitInsidePage(embeddedImage.width, embeddedImage.height, pageSize.width, pageSize.height, margin);
  page.drawImage(embeddedImage, box);

  const pdfBytes = await pdfDoc.save();
  const baseName = String(file.name || 'image').replace(/\.[^.]+$/, '');

  return new File([pdfBytes], `${baseName}.print-ready.pdf`, {
    type: 'application/pdf',
    lastModified: Date.now(),
  });
}
