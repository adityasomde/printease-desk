/**
 * Office-to-PDF conversion through LibreOffice headless.
 *
 * LibreOffice is bundled into release installers and can also be detected from
 * a local system install during development builds.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findLibreOfficeExecutable } from './conversionEngine.js';

function waitForProcess(command, args, { timeoutMs = 5 * 60 * 1000, cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ success: false, code: null, stdout, stderr: `${stderr}\nTimed out`, command, args });
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ success: false, code: null, stdout, stderr: error.message, command, args });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, code, stdout, stderr, command, args });
    });
  });
}

async function findConvertedPdf(outputDir, inputPath) {
  const baseName = path.basename(inputPath).replace(/\.[^.]+$/, '');
  const expected = path.join(outputDir, `${baseName}.pdf`);
  try {
    const stat = await fs.stat(expected);
    if (stat.isFile() && stat.size > 0) return expected;
  } catch {}

  const entries = await fs.readdir(outputDir).catch(() => []);
  const pdfs = entries.filter((name) => name.toLowerCase().endsWith('.pdf'));
  if (pdfs.length === 1) return path.join(outputDir, pdfs[0]);
  return null;
}

export async function convertOfficeToPdf({ inputPath, outputDir, timeoutMs = 5 * 60 * 1000, libreOfficePath } = {}) {
  if (!inputPath) throw new Error('convertOfficeToPdf requires inputPath');
  if (!outputDir) throw new Error('convertOfficeToPdf requires outputDir');

  await fs.mkdir(outputDir, { recursive: true });

  const engine = libreOfficePath
    ? { found: true, executable: libreOfficePath }
    : await findLibreOfficeExecutable();

  if (!engine.found) {
    return {
      success: false,
      reasonCode: 'CONVERSION_ENGINE_MISSING',
      message: engine.message || 'LibreOffice/soffice was not found.',
      manualDownloadUrl: engine.manualDownloadUrl,
      checkedPaths: engine.checkedPaths,
      details: engine,
    };
  }

  const args = [
    '--headless',
    '--nologo',
    '--nofirststartwizard',
    '--nodefault',
    '--nolockcheck',
    '--convert-to', 'pdf',
    '--outdir', outputDir,
    inputPath,
  ];

  const result = await waitForProcess(engine.executable, args, { timeoutMs });
  if (!result.success) {
    return {
      success: false,
      reasonCode: result.stderr?.includes('Timed out') ? 'CONVERSION_TIMEOUT' : 'CONVERSION_FAILED',
      message: result.stderr || result.stdout || 'LibreOffice conversion failed.',
      details: result,
    };
  }

  const outputPath = await findConvertedPdf(outputDir, inputPath);
  if (!outputPath) {
    return {
      success: false,
      reasonCode: 'CONVERSION_OUTPUT_MISSING',
      message: 'LibreOffice finished but no PDF output was found.',
      details: result,
    };
  }

  return {
    success: true,
    outputPath,
    outputFileType: 'application/pdf',
    conversionSource: 'desktop-libreoffice-headless',
    enginePath: engine.executable,
  };
}
