/**
 * Conversion engine detection.
 *
 * LibreOffice is NOT bundled by this implementation.
 * The hub machine should install LibreOffice separately if Office conversion is needed.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

function exists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

function runCommand(command, args = [], { timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ success: false, code: null, stdout, stderr: `${stderr}\nTimed out`, command });
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ success: false, code: null, stdout, stderr: error.message, command });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, code, stdout, stderr, command });
    });
  });
}

export async function findLibreOfficeExecutable({ platform = process.platform, extraPaths = [] } = {}) {
  const candidates = [];

  for (const item of extraPaths) {
    if (item) candidates.push(item);
  }

  if (platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
    );
  } else if (platform === 'darwin') {
    candidates.push('/Applications/LibreOffice.app/Contents/MacOS/soffice');
  } else {
    candidates.push('/usr/bin/libreoffice', '/usr/bin/soffice', '/snap/bin/libreoffice');
  }

  // PATH fallback. spawn can resolve these names.
  candidates.push('soffice', 'libreoffice');

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || candidate.endsWith('.exe')) {
      if (!(await exists(candidate))) continue;
    }

    const result = await runCommand(candidate, ['--version'], { timeoutMs: 8000 });
    if (result.success || result.stdout || result.stderr) {
      return {
        found: true,
        executable: candidate,
        versionText: `${result.stdout || ''}${result.stderr || ''}`.trim(),
      };
    }
  }

  return {
    found: false,
    executable: null,
    reasonCode: 'CONVERSION_ENGINE_MISSING',
    message: 'LibreOffice/soffice was not found. Install LibreOffice to convert Office documents automatically.',
  };
}

export { runCommand };
