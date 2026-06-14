import crypto from 'crypto';
import path from 'path';
import { toPrintReadyPdfName } from './printPreparation/fileNameUtils.js';

export function normalizeJobFiles(job) {
  if (!job) return [];

  // Prefer job.files[] from modern multi-file backend payload
  if (Array.isArray(job.files) && job.files.length > 0) {
    return job.files.map(file => ({
      documentId: file.documentId,
      fileUrl: file.fileUrl,
      fileHash: file.fileSha256 || file.fileHash,
      fileName: getSafeFileName(file),
      fileType: file.fileType || "application/pdf",
      copies: file.copies || 1,
      printOptions: file.printOptions || {},
      printSequence: file.printSequence || 0
    }));
  }

  // Fallback to legacy single-file payload
  if (job.fileUrl) {
    return [{
      fileUrl: job.fileUrl,
      fileHash: job.fileHash || job.fileSha256,
      fileName: 'document.pdf',
      fileType: job.fileType || "application/pdf",
      copies: job.copies || 1,
      printOptions: job.printOptions || {},
      printSequence: 0
    }];
  }

  return [];
}

export function validateJobFile(file) {
  if (!file || !file.fileUrl) {
    return false;
  }
  return true;
}

export function getExpectedFileHash(file) {
  return file.fileHash || null;
}

export function getSafeFileName(file) {
  const original = file.fileName || 'document.pdf';
  const fileType = file.fileType || 'application/pdf';
  
  if (fileType === 'application/pdf') {
    return toPrintReadyPdfName(original);
  }

  let ext = path.extname(original).toLowerCase() || '.pdf';
  const base = path.basename(original, path.extname(original)).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 80);
  return `${base || 'document'}${ext}`;
}
