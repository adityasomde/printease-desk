/**
 * Print-ready PDF cache for desktop agent.
 *
 * Stores converted PDFs by original file SHA + conversion version.
 * This avoids converting the same file repeatedly during retry/reprint.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { toPrintReadyPdfName } from './fileNameUtils.js';

const CACHE_VERSION = 'print-ready-v1';

function safePart(value = 'unknown') {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

export function getPrintReadyCacheDir(baseDir) {
  if (!baseDir) throw new Error('printReadyCache requires a baseDir');
  return path.join(baseDir, 'print-ready-cache');
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function buildPrintReadyCacheKey({ sha256, fileName = '', kind = '', conversionProfile = 'default' } = {}) {
  const hash = crypto.createHash('sha256');
  hash.update(String(sha256 || 'missing-sha'));
  hash.update('|');
  hash.update(String(fileName || 'file'));
  hash.update('|');
  hash.update(String(kind || 'kind'));
  hash.update('|');
  hash.update(String(conversionProfile || 'default'));
  hash.update('|');
  hash.update(CACHE_VERSION);
  return hash.digest('hex').slice(0, 32);
}

export async function getPrintReadyPaths({ baseDir, sha256, fileName, kind, conversionProfile } = {}) {
  const cacheDir = getPrintReadyCacheDir(baseDir);
  const key = buildPrintReadyCacheKey({ sha256, fileName, kind, conversionProfile });
  const cleanPdfName = toPrintReadyPdfName(fileName || 'document');
  const pdfPath = path.join(cacheDir, `${key}-${cleanPdfName}`);
  const metaPath = path.join(cacheDir, `${key}-${cleanPdfName}.json`);
  return { cacheDir, key, pdfPath, metaPath };
}

export async function findPrintReadyPdf(args = {}) {
  const { pdfPath, metaPath } = await getPrintReadyPaths(args);
  try {
    const [pdfStat, metaRaw] = await Promise.all([
      fs.stat(pdfPath),
      fs.readFile(metaPath, 'utf8'),
    ]);
    if (!pdfStat.isFile() || pdfStat.size <= 0) return null;
    return {
      success: true,
      filePath: pdfPath,
      metadata: JSON.parse(metaRaw),
    };
  } catch {
    return null;
  }
}

export async function savePrintReadyPdf({ baseDir, sourcePath, sha256, fileName, kind, conversionProfile, metadata = {} } = {}) {
  const paths = await getPrintReadyPaths({ baseDir, sha256, fileName, kind, conversionProfile });
  await ensureParentDir(paths.pdfPath);
  await fs.copyFile(sourcePath, paths.pdfPath);
  await ensureParentDir(paths.metaPath);
  await fs.writeFile(paths.metaPath, JSON.stringify({
    ...metadata,
    cacheVersion: CACHE_VERSION,
    sourceSha256: sha256 || null,
    sourceFileName: fileName || null,
    kind: kind || null,
    conversionProfile: conversionProfile || 'default',
    cachedAt: new Date().toISOString(),
  }, null, 2));
  return {
    success: true,
    filePath: paths.pdfPath,
    metadataPath: paths.metaPath,
  };
}

export async function cleanupOldPrintReadyCache({ baseDir, maxAgeMs = 15 * 24 * 60 * 60 * 1000 } = {}) {
  const cacheDir = getPrintReadyCacheDir(baseDir);
  const now = Date.now();
  let deleted = 0;

  try {
    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(cacheDir, entry.name);
      const stat = await fs.stat(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.unlink(filePath).catch(() => {});
        deleted += 1;
      }
    }
  } catch {
    return { success: true, deleted: 0, cacheDir };
  }

  return { success: true, deleted, cacheDir };
}
