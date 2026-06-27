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

export const LIBREOFFICE_MANUAL_DOWNLOAD_URL = 'https://download.documentfoundation.org/libreoffice/stable/';

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

/**
 * Returns the path to the bundled soffice binary inside the packaged Electron app.
 * Returns null if not found (e.g. during development or if not yet downloaded).
 */
function getBundledSofficePath(platform) {
  // In a packaged Electron app, process.resourcesPath points to the resources/ dir
  const resourcesPath = typeof process !== 'undefined' && process.resourcesPath
    ? process.resourcesPath
    : null;

  if (!resourcesPath) return null;

  if (platform === 'win32') {
    return path.join(resourcesPath, 'vendor', 'libreoffice', 'win', 'program', 'soffice.com');
  }
  return path.join(resourcesPath, 'vendor', 'libreoffice', 'linux', 'program', 'soffice');
}

export async function findLibreOfficeExecutable({ platform = process.platform, extraPaths = [] } = {}) {
  const candidates = [];
  const checkedPaths = [];

  // 1. Bundled copy inside the packaged app (highest priority)
  const bundledPath = getBundledSofficePath(platform);
  if (bundledPath) {
    candidates.push(bundledPath);
  }

  // 2. Also check relative vendor/ dir (for dev mode when running from source)
  const devVendorPath = platform === 'win32'
    ? path.resolve('vendor', 'libreoffice', 'win', 'program', 'soffice.com')
    : path.resolve('vendor', 'libreoffice', 'linux', 'program', 'soffice');
  
  if (platform === 'win32') {
    candidates.push(devVendorPath);
    candidates.push(devVendorPath.replace(/\.com$/, '.exe'));
  } else {
    candidates.push(devVendorPath);
  }

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

  // 5. PATH fallback. spawn can resolve these names.
  if (platform === 'win32') {
    candidates.push('soffice.com');
  }
  candidates.push('soffice', 'libreoffice');

  for (const candidate of candidates) {
    checkedPaths.push(candidate);
    if (candidate.includes(path.sep) || candidate.endsWith('.exe')) {
      if (!(await exists(candidate))) continue;
    }

    const result = await runCommand(candidate, ['--version'], { timeoutMs: 8000 });
    if (result.success || result.stdout || result.stderr) {
      // Smoke test: verify the candidate can actually perform a conversion.
      // Some vendor/portable copies respond to --version but crash on real work.
      const os = await import('node:os');
      const smokeDir = path.join(os.default.tmpdir(), `printease-lo-smoketest-${Date.now()}`);
      const smokeInput = path.join(smokeDir, 'smoke.txt');
      try {
        await fs.mkdir(smokeDir, { recursive: true });
        await fs.writeFile(smokeInput, 'printease smoke test', 'utf8');
        const smokeProfile = path.join(os.default.tmpdir(), `printease-lo-smokeprofile-${Date.now()}`);
        const smokeResult = await runCommand(candidate, [
          `-env:UserInstallation=file://${smokeProfile.replace(/\\/g, '/')}`,
          '--headless', '--nologo', '--nofirststartwizard', '--nodefault', '--nolockcheck',
          '--convert-to', 'pdf', '--outdir', smokeDir, smokeInput,
        ], { timeoutMs: 30000 });
        await fs.rm(smokeProfile, { recursive: true, force: true }).catch(() => {});
        const smokeOutput = path.join(smokeDir, 'smoke.pdf');
        const smokeWorked = smokeResult.success && await exists(smokeOutput);
        await fs.rm(smokeDir, { recursive: true, force: true }).catch(() => {});
        if (!smokeWorked) {
          console.warn(`[CONVERSION ENGINE] candidate "${candidate}" failed smoke test, skipping.`, smokeResult.stderr || smokeResult.stdout || '');
          continue;
        }
      } catch (smokeError) {
        await fs.rm(smokeDir, { recursive: true, force: true }).catch(() => {});
        console.warn(`[CONVERSION ENGINE] candidate "${candidate}" smoke test error, skipping.`, smokeError?.message || '');
        continue;
      }

      return {
        found: true,
        executable: candidate,
        bundled: candidate === bundledPath,
        source: candidate === bundledPath ? 'bundled' : candidate === devVendorPath ? 'dev-vendor' : 'system',
        manualDownloadUrl: LIBREOFFICE_MANUAL_DOWNLOAD_URL,
        checkedPaths,
        versionText: `${result.stdout || ''}${result.stderr || ''}`.trim(),
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
