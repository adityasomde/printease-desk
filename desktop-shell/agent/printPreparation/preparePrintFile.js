/**
 * Main desktop print preparation entry point.
 *
 * This module prepares a given downloaded file into a print-ready PDF path.
 * Final automatic printing should always receive PDF.
 *
 * Rules:
 * - PDF: no conversion.
 * - Image: convert/wrap to PDF once and cache.
 * - Office: convert with bundled/local LibreOffice headless; cache result.
 * - Text: render to PDF and cache.
 * - Unsupported/archive: fail safely.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectDesktopFileKind } from './detectFileKind.js';
import { findPrintReadyPdf, savePrintReadyPdf } from './printReadyCache.js';
import { convertImageToPdf } from './imageToPdf.js';
import { convertOfficeToPdf } from './officeToPdf.js';
import { convertTextToPdf } from './textToPdf.js';
import { toPrintReadyPdfName } from './fileNameUtils.js';

async function makeTempConversionDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'printease-convert-'));
}

export async function preparePrintFile({
  filePath,
  fileName,
  fileType,
  sha256,
  cacheBaseDir,
  conversionProfile = 'default',
  options = {},
} = {}) {
  if (!filePath) throw new Error('preparePrintFile requires filePath');
  if (!cacheBaseDir) throw new Error('preparePrintFile requires cacheBaseDir');

  const kind = detectDesktopFileKind({ fileName, fileType });

  if (kind === 'pdf') {
    return {
      success: true,
      filePath,
      fileType: 'application/pdf',
      kind,
      conversionSource: 'none-pdf-direct',
      cached: false,
    };
  }

  if (kind === 'archive') {
    return {
      success: false,
      reasonCode: 'ARCHIVE_BLOCKED_FOR_SECURITY',
      message: 'Archive files are blocked for automatic print preparation.',
      kind,
    };
  }

  if (kind === 'unsupported') {
    return {
      success: false,
      reasonCode: 'UNSUPPORTED_LOCAL_PRINT_FILE_TYPE',
      message: 'Unsupported file type for automatic print preparation.',
      kind,
    };
  }

  const cached = await findPrintReadyPdf({
    baseDir: cacheBaseDir,
    sha256,
    fileName,
    kind,
    conversionProfile,
  });
  if (cached?.success) {
    return {
      success: true,
      filePath: cached.filePath,
      fileName: toPrintReadyPdfName(fileName),
      fileType: 'application/pdf',
      kind,
      conversionSource: cached.metadata?.conversionSource || 'cache',
      cached: true,
    };
  }

  const tempDir = await makeTempConversionDir();
  let conversionResult;

  try {
    if (kind === 'image') {
      conversionResult = await convertImageToPdf({ inputPath: filePath, outputDir: tempDir, fileName, options });
    } else if (kind === 'office') {
      conversionResult = await convertOfficeToPdf({
        inputPath: filePath,
        outputDir: tempDir,
        timeoutMs: options.officeTimeoutMs || 5 * 60 * 1000,
        libreOfficePath: options.libreOfficePath,
      });
    } else if (kind === 'text') {
      conversionResult = await convertTextToPdf({ inputPath: filePath, outputDir: tempDir, fileName, options });
    }

    if (!conversionResult?.success) return conversionResult;

    const saved = await savePrintReadyPdf({
      baseDir: cacheBaseDir,
      sourcePath: conversionResult.outputPath,
      sha256,
      fileName,
      kind,
      conversionProfile,
      metadata: {
        conversionSource: conversionResult.conversionSource,
        outputFileType: 'application/pdf',
      },
    });

    return {
      success: true,
      filePath: saved.filePath,
      fileName: toPrintReadyPdfName(fileName),
      fileType: 'application/pdf',
      kind,
      conversionSource: conversionResult.conversionSource,
      cached: false,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
