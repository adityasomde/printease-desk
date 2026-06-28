/**
 * Conversion engine detection.
 *
 * Priority order for finding LibreOffice:
 *   1. Bundled copy inside the Electron app's resources (vendor/libreoffice/)
 *   2. Any paths passed via `extraPaths`
 *   3. Common system installation paths (platform-specific)
 *   4. PATH fallback (soffice / libreoffice on PATH)
 *
 * When the app is packaged by electron-builder, the bundled copy lives at:
 *   process.resourcesPath/vendor/libreoffice/<platform>/program/soffice[.exe]
 *
 * During development (npm run dev), process.resourcesPath may not exist,
 * so we fall through to system-installed LibreOffice automatically.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  makeLibreOfficeUserInstallationArg,
  prepareLibreOfficeProfileEnvironment,
} from './libreOfficeProfile.js';

export const LIBREOFFICE_MANUAL_DOWNLOAD_URL = 'https://download.documentfoundation.org/libreoffice/stable/';
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_SHELL_DIR = path.resolve(MODULE_DIR, '..', '..');

function exists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

function runCommand(command, args = [], { timeoutMs = 8000, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, env: env || process.env });
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

/**
 * Returns the path to the bundled soffice binary inside the packaged Electron app.
 * Returns null if not found (e.g. during development or if not yet downloaded).
 */
function getBundledSofficePaths(platform) {
  // In a packaged Electron app, process.resourcesPath points to the resources/ dir
  const resourcesPath = typeof process !== 'undefined' && process.resourcesPath
    ? process.resourcesPath
    : null;

  if (!resourcesPath) return [];

  if (platform === 'win32') {
    const programDir = path.join(resourcesPath, 'vendor', 'libreoffice', 'win', 'program');
    return [
      path.join(programDir, 'soffice.com'),
      path.join(programDir, 'soffice.exe'),
    ];
  }
  return [path.join(resourcesPath, 'vendor', 'libreoffice', 'linux', 'program', 'soffice')];
}

function hasPathSeparator(candidate) {
  return candidate.includes('/') || candidate.includes('\\');
}

export async function findLibreOfficeExecutable({ platform = process.platform, extraPaths = [] } = {}) {
  const candidates = [];
  const checkedPaths = [];

  // 1. Bundled copy inside the packaged app (highest priority)
  const bundledPaths = getBundledSofficePaths(platform);
  candidates.push(...bundledPaths);

  // 2. Also check relative vendor/ dir (for dev mode when running from source)
  const devVendorPaths = platform === 'win32'
    ? [
        path.join(DESKTOP_SHELL_DIR, 'vendor', 'libreoffice', 'win', 'program', 'soffice.com'),
        path.join(DESKTOP_SHELL_DIR, 'vendor', 'libreoffice', 'win', 'program', 'soffice.exe'),
      ]
    : [path.join(DESKTOP_SHELL_DIR, 'vendor', 'libreoffice', 'linux', 'program', 'soffice')];
  
  candidates.push(...devVendorPaths);

  // 3. Any extra paths provided by caller
  for (const item of extraPaths) {
    if (item) candidates.push(item);
  }

  // 4. Common system installation paths
  if (platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\LibreOffice\\program\\soffice.com',
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
    );
  } else if (platform === 'darwin') {
    candidates.push('/Applications/LibreOffice.app/Contents/MacOS/soffice');
  } else {
    candidates.push('/usr/bin/libreoffice', '/usr/bin/soffice', '/snap/bin/libreoffice');
  }

  // 5. PATH fallback. Only use it for the current OS so cross-platform
  // diagnostics do not accidentally pick up Linux soffice for a Windows check.
  if (platform === process.platform) {
    if (platform === 'win32') {
      candidates.push('soffice.com', 'soffice.exe');
    }
    candidates.push('soffice', 'libreoffice');
  }

  for (const candidate of candidates) {
    checkedPaths.push(candidate);
    if (hasPathSeparator(candidate) || candidate.endsWith('.exe')) {
      if (!(await exists(candidate))) continue;
    }

    const result = await runCommand(candidate, ['--version'], { timeoutMs: 8000 });
    const versionText = `${result.stdout || ''}${result.stderr || ''}`.trim();
    const versionLooksValid = Boolean(result.success || /LibreOffice|OpenOffice/i.test(versionText));
    if (versionLooksValid) {
      let smokeTest = {
        attempted: false,
        success: false,
        message: '',
      };

      // Smoke test gives diagnostics, but it must not hide a real installed
      // converter. Some LibreOffice builds can open Office files while refusing
      // a tiny synthetic text smoke file in restricted desktop environments.
      const os = await import('node:os');
      const smokeDir = path.join(os.default.tmpdir(), `printease-lo-smoketest-${Date.now()}`);
      const smokeInput = path.join(smokeDir, 'smoke.txt');
      try {
        smokeTest.attempted = true;
        await fs.mkdir(smokeDir, { recursive: true });
        await fs.writeFile(smokeInput, 'printease smoke test', 'utf8');
        const smokeProfile = path.join(os.default.tmpdir(), `printease-lo-smokeprofile-${Date.now()}`);
        const smokeEnv = await prepareLibreOfficeProfileEnvironment(smokeProfile);
        const smokeResult = await runCommand(candidate, [
          makeLibreOfficeUserInstallationArg(smokeProfile),
          '--headless', '--nologo', '--nofirststartwizard', '--nodefault', '--nolockcheck',
          '--convert-to', 'pdf', '--outdir', smokeDir, smokeInput,
        ], { timeoutMs: 30000, env: smokeEnv });
        await fs.rm(smokeProfile, { recursive: true, force: true }).catch(() => {});
        const smokeOutput = path.join(smokeDir, 'smoke.pdf');
        const smokeWorked = smokeResult.success && await exists(smokeOutput);
        await fs.rm(smokeDir, { recursive: true, force: true }).catch(() => {});
        smokeTest = {
          attempted: true,
          success: Boolean(smokeWorked),
          message: smokeWorked ? 'Smoke conversion passed.' : (smokeResult.stderr || smokeResult.stdout || 'Smoke conversion did not create a PDF.'),
        };
        if (!smokeWorked) console.warn(`[CONVERSION ENGINE] candidate "${candidate}" failed smoke test. Real conversion will still be attempted.`, smokeTest.message);
      } catch (smokeError) {
        await fs.rm(smokeDir, { recursive: true, force: true }).catch(() => {});
        smokeTest = {
          attempted: true,
          success: false,
          message: smokeError?.message || 'Smoke conversion errored.',
        };
        console.warn(`[CONVERSION ENGINE] candidate "${candidate}" smoke test error. Real conversion will still be attempted.`, smokeTest.message);
      }

      return {
        found: true,
        executable: candidate,
        bundled: bundledPaths.includes(candidate),
        source: bundledPaths.includes(candidate) ? 'bundled' : devVendorPaths.includes(candidate) ? 'dev-vendor' : 'system',
        manualDownloadUrl: LIBREOFFICE_MANUAL_DOWNLOAD_URL,
        checkedPaths,
        versionText,
        smokeTest,
      };
    }
  }

  return {
    found: false,
    executable: null,
    bundled: false,
    reasonCode: 'CONVERSION_ENGINE_MISSING',
    source: 'missing',
    manualDownloadUrl: LIBREOFFICE_MANUAL_DOWNLOAD_URL,
    checkedPaths,
    message: 'LibreOffice was not found. PrintEase uses the bundled copy in release builds and also detects local LibreOffice installs. Install LibreOffice from the official download page, then retry conversion.',
  };
}

export { runCommand };
