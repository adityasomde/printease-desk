/**
 * download-libreoffice.js
 * ─────────────────────────────────────────────────────────────
 * Pre-build script that bundles LibreOffice headless binaries into
 * the PrintEase Desktop installer so users never need to install
 * LibreOffice separately.
 *
 * Usage:
 *   node scripts/download-libreoffice.js [options]
 *
 * Options:
 *   --platform linux|win32   Target platform (default: current OS)
 *   --copy-local             Copy from system-installed LibreOffice
 *                            instead of downloading from the internet
 *   --prefer-local           Copy from a system install when available,
 *                            otherwise download from documentfoundation.org
 *   --force                  Re-download even if binaries already exist
 *
 * Examples:
 *   # Copy from local /usr/lib/libreoffice (fast, for Linux dev)
 *   node scripts/download-libreoffice.js --copy-local
 *
 *   # Download official Windows build (for cross-platform CI)
 *   node scripts/download-libreoffice.js --platform win32
 *
 * After running, vendor/libreoffice/<platform>/ will contain
 * program/ and share/ directories. electron-builder packs these
 * into the installer via extraResources.
 *
 * ─────────────────────────────────────────────────────────────
 * LibreOffice is © The Document Foundation, licensed under MPL 2.0.
 * ─────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

// ─── Configuration ───────────────────────────────────────────
const LO_VERSION = '26.2.4';
const LO_VERSION_FULL = '26.2.4';

const DOWNLOAD_URLS = {
  linux: `https://download.documentfoundation.org/libreoffice/stable/${LO_VERSION}/deb/x86_64/LibreOffice_${LO_VERSION_FULL}_Linux_x86-64_deb.tar.gz`,
  win32: `https://download.documentfoundation.org/libreoffice/stable/${LO_VERSION}/win/x86_64/LibreOffice_${LO_VERSION_FULL}_Win_x86-64.msi`
};

// Common system LibreOffice paths to copy from when --copy-local is used
const LOCAL_LO_PATHS = {
  linux: [
    '/usr/lib/libreoffice',
    '/usr/share/libreoffice',
    '/opt/libreoffice',
    '/opt/libreoffice25.8',
    '/opt/libreoffice24.2',
    '/snap/libreoffice/current/lib/libreoffice'
  ],
  win32: [
    'C:\\Program Files\\LibreOffice',
    'C:\\Program Files (x86)\\LibreOffice'
  ]
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const VENDOR_DIR = path.join(ROOT_DIR, 'vendor', 'libreoffice');
const TEMP_DIR = path.join(ROOT_DIR, '.lo-download-temp');

// ─── Helpers ─────────────────────────────────────────────────

function log(msg) {
  console.log(`[download-libreoffice] ${msg}`);
}

function logError(msg) {
  console.error(`[download-libreoffice] ERROR: ${msg}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let platform = process.platform;
  let force = false;
  let copyLocal = false;
  let preferLocal = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform' && args[i + 1]) {
      platform = args[++i];
    } else if (args[i] === '--force') {
      force = true;
    } else if (args[i] === '--copy-local') {
      copyLocal = true;
    } else if (args[i] === '--prefer-local') {
      preferLocal = true;
    }
  }

  if (!['linux', 'win32'].includes(platform)) {
    logError(`Unsupported platform: ${platform}. Only linux and win32 are supported.`);
    process.exit(1);
  }

  return { platform, force, copyLocal, preferLocal };
}

function getPlatformDir(platform) {
  return platform === 'win32' ? 'win' : 'linux';
}

function checkBinaryExists(platform) {
  const dir = getPlatformDir(platform);
  const binaryPath = platform === 'win32'
    ? path.join(VENDOR_DIR, dir, 'program', 'soffice.exe')
    : path.join(VENDOR_DIR, dir, 'program', 'soffice');

  return fs.existsSync(binaryPath);
}

async function downloadFile(url, destPath) {
  log(`Downloading: ${url}`);
  log(`Destination: ${destPath}`);

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
  }

  const totalBytes = Number(response.headers.get('content-length') || 0);
  if (totalBytes) {
    log(`File size: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
  }

  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const fileStream = createWriteStream(destPath);
  await pipeline(response.body, fileStream);

  const stat = await fsp.stat(destPath);
  log(`Downloaded ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
}

// ─── Copy from local system install ─────────────────────────

async function copyFromLocal(platform) {
  const dir = getPlatformDir(platform);
  const outputDir = path.join(VENDOR_DIR, dir);
  const searchPaths = LOCAL_LO_PATHS[platform] || [];

  let sourceDir = null;

  for (const candidate of searchPaths) {
    const programDir = path.join(candidate, 'program');
    const soffice = platform === 'win32'
      ? path.join(programDir, 'soffice.exe')
      : path.join(programDir, 'soffice');

    if (fs.existsSync(soffice)) {
      sourceDir = candidate;
      break;
    }
  }

  if (!sourceDir) {
    throw new Error(
      `Could not find a local LibreOffice installation.\n` +
      `Searched: ${searchPaths.join(', ')}\n` +
      `Install LibreOffice first, or run without --copy-local to download from the internet.`
    );
  }

  log(`Found local LibreOffice at: ${sourceDir}`);

  // Clean destination
  await fsp.rm(outputDir, { recursive: true, force: true });
  await fsp.mkdir(outputDir, { recursive: true });

  // Copy program/ and share/ directories (minimum needed for headless conversion)
  for (const subdir of ['program', 'share']) {
    const src = path.join(sourceDir, subdir);
    if (fs.existsSync(src)) {
      const destSub = path.join(outputDir, subdir);
      log(`  Copying ${subdir}/ ...`);
      await fsp.cp(src, destSub, { recursive: true });

      // Show size
      try {
        const sizeOutput = execSync(`du -sh "${destSub}"`, { encoding: 'utf8' }).trim();
        log(`    → ${sizeOutput.split('\t')[0]}`);
      } catch { /* ignore */ }
    } else {
      log(`  Skipping ${subdir}/ (not found)`);
    }
  }

  // Ensure soffice is executable (Linux only)
  if (platform !== 'win32') {
    const sofficePath = path.join(outputDir, 'program', 'soffice');
    if (fs.existsSync(sofficePath)) {
      await fsp.chmod(sofficePath, 0o755);
    }
    const sofficeBin = path.join(outputDir, 'program', 'soffice.bin');
    if (fs.existsSync(sofficeBin)) {
      await fsp.chmod(sofficeBin, 0o755);
    }
  }

  // Verify
  const binary = platform === 'win32'
    ? path.join(outputDir, 'program', 'soffice.exe')
    : path.join(outputDir, 'program', 'soffice');

  if (!fs.existsSync(binary)) {
    throw new Error(`Copy completed but soffice binary not found at: ${binary}`);
  }

  // Show total size
  try {
    const totalSize = execSync(`du -sh "${outputDir}"`, { encoding: 'utf8' }).trim();
    log(`Total bundled size: ${totalSize.split('\t')[0]}`);
  } catch { /* ignore */ }

  log(`✅ Local LibreOffice copied to: ${outputDir}`);
}

// ─── Linux: Extract from .tar.gz of .deb packages ───────────

async function extractLinux(archivePath) {
  const outputDir = path.join(VENDOR_DIR, 'linux');
  const extractDir = path.join(TEMP_DIR, 'linux-extract');

  await fsp.rm(outputDir, { recursive: true, force: true });
  await fsp.mkdir(extractDir, { recursive: true });
  await fsp.mkdir(outputDir, { recursive: true });

  log('Extracting tar.gz archive...');
  execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, { stdio: 'inherit' });

  // Find the DEBS directory inside the extracted archive
  const entries = await fsp.readdir(extractDir, { recursive: true });
  const debsDir = entries
    .filter(e => e.endsWith('/DEBS') || e === 'DEBS')
    .map(e => path.join(extractDir, e))
    .find(p => fs.existsSync(p) && fs.statSync(p).isDirectory());

  if (!debsDir) {
    throw new Error('Could not find DEBS directory inside the LibreOffice archive.');
  }

  log(`Found DEBS at: ${debsDir}`);

  // Extract all .deb packages needed for headless conversion
  const debFiles = (await fsp.readdir(debsDir))
    .filter(f => f.endsWith('.deb'))
    .filter(f => {
      const name = f.toLowerCase();
      return name.includes('core') ||
             name.includes('writer') ||
             name.includes('calc') ||
             name.includes('impress') ||
             name.includes('draw') ||
             name.includes('math') ||
             name.includes('ure') ||
             name.includes('base-core') ||
             name.includes('common');
    });

  log(`Extracting ${debFiles.length} .deb packages...`);

  const debExtractDir = path.join(TEMP_DIR, 'deb-extract');
  await fsp.mkdir(debExtractDir, { recursive: true });

  for (const deb of debFiles) {
    const debPath = path.join(debsDir, deb);
    log(`  ${deb}`);
    execSync(`dpkg-deb -x "${debPath}" "${debExtractDir}"`, { stdio: 'inherit' });
  }

  // Find the /opt/libreofficeX.Y directory
  const optDir = path.join(debExtractDir, 'opt');
  if (!fs.existsSync(optDir)) {
    throw new Error('Extracted .deb packages do not contain /opt directory.');
  }

  const loDir = (await fsp.readdir(optDir))
    .find(d => d.startsWith('libreoffice'));

  if (!loDir) {
    throw new Error('Could not find libreoffice directory inside /opt.');
  }

  const sourceDir = path.join(optDir, loDir);
  log(`Found LibreOffice at: ${sourceDir}`);

  for (const subdir of ['program', 'share']) {
    const src = path.join(sourceDir, subdir);
    if (fs.existsSync(src)) {
      log(`  Copying ${subdir}/...`);
      await fsp.cp(src, path.join(outputDir, subdir), { recursive: true });
    }
  }

  // Make soffice executable
  const sofficePath = path.join(outputDir, 'program', 'soffice');
  if (fs.existsSync(sofficePath)) await fsp.chmod(sofficePath, 0o755);
  const sofficeBin = path.join(outputDir, 'program', 'soffice.bin');
  if (fs.existsSync(sofficeBin)) await fsp.chmod(sofficeBin, 0o755);

  if (!fs.existsSync(sofficePath)) {
    throw new Error(`soffice binary not found at ${sofficePath} after extraction.`);
  }

  log(`✅ Linux LibreOffice extracted to: ${outputDir}`);
}

// ─── Windows: Extract from .msi ──────────────────────────────

async function extractWindows(archivePath) {
  const outputDir = path.join(VENDOR_DIR, 'win');
  const extractDir = path.join(TEMP_DIR, 'win-extract');

  // Don't nuke vendor/win entirely - SumatraPDF lives there too
  await fsp.rm(path.join(outputDir, 'program'), { recursive: true, force: true });
  await fsp.rm(path.join(outputDir, 'share'), { recursive: true, force: true });
  await fsp.mkdir(extractDir, { recursive: true });
  await fsp.mkdir(outputDir, { recursive: true });

  const isLinuxHost = process.platform === 'linux';

  if (isLinuxHost) {
    log('Extracting MSI using msiextract (cross-platform build)...');
    try {
      execSync(`msiextract -C "${extractDir}" "${archivePath}"`, { stdio: 'inherit' });
    } catch {
      logError('msiextract failed. Install it with: sudo apt install msitools');
      throw new Error('msiextract is required to extract Windows LibreOffice MSI on Linux.');
    }
  } else {
    log('Extracting MSI using msiexec...');
    execSync(`msiexec /a "${archivePath}" /qn TARGETDIR="${extractDir}"`, { stdio: 'inherit' });
  }

  // Recursively find the program/ directory containing soffice.exe or soffice.bin
  const findProgram = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() === 'program') {
          if (fs.existsSync(path.join(fullPath, 'soffice.exe')) ||
              fs.existsSync(path.join(fullPath, 'soffice.bin'))) {
            return path.dirname(fullPath);
          }
        }
        const found = findProgram(fullPath);
        if (found) return found;
      }
    }
    return null;
  };

  const loRoot = findProgram(extractDir);
  if (!loRoot) {
    throw new Error('Could not find LibreOffice program directory in extracted MSI.');
  }

  log(`Found LibreOffice at: ${loRoot}`);

  for (const subdir of ['program', 'share']) {
    const src = path.join(loRoot, subdir);
    if (fs.existsSync(src)) {
      log(`  Copying ${subdir}/...`);
      await fsp.cp(src, path.join(outputDir, subdir), { recursive: true });
    }
  }

  log(`✅ Windows LibreOffice extracted to: ${outputDir}`);
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const { platform, force, copyLocal, preferLocal } = parseArgs();

  log(`Target platform: ${platform}`);
  log(`Mode: ${copyLocal ? 'copy-local' : preferLocal ? 'prefer-local' : 'download'}`);

  // Skip if already present
  if (!force && checkBinaryExists(platform)) {
    log(`✅ LibreOffice binary already exists for ${platform}. Skipping. (use --force to redo)`);
    return;
  }

  if (copyLocal) {
    // ── Fast path: copy from system install ──
    await copyFromLocal(platform);
  } else {
    if (preferLocal) {
      try {
        await copyFromLocal(platform);
        log('');
        log('════════════════════════════════════════════════════════');
        log('✅ LibreOffice headless is ready for bundling.');
        log(`   Location: ${path.join(VENDOR_DIR, getPlatformDir(platform))}`);
        log('   It will be included in the installer via extraResources.');
        log('════════════════════════════════════════════════════════');
        return;
      } catch (error) {
        log(`Local LibreOffice copy was not available: ${error.message}`);
        log('Falling back to the official LibreOffice download.');
      }
    }

    // ── Full download from documentfoundation.org ──
    const url = DOWNLOAD_URLS[platform];
    if (!url) {
      logError(`No download URL configured for platform: ${platform}`);
      process.exit(1);
    }

    log(`LibreOffice version: ${LO_VERSION} (${LO_VERSION_FULL})`);

    await fsp.rm(TEMP_DIR, { recursive: true, force: true });
    await fsp.mkdir(TEMP_DIR, { recursive: true });

    try {
      const ext = platform === 'linux' ? '.tar.gz' : '.msi';
      const archivePath = path.join(TEMP_DIR, `libreoffice${ext}`);

      await downloadFile(url, archivePath);

      if (platform === 'linux') {
        await extractLinux(archivePath);
      } else {
        await extractWindows(archivePath);
      }
    } finally {
      log('Cleaning up temporary files...');
      await fsp.rm(TEMP_DIR, { recursive: true, force: true });
    }
  }

  log('');
  log('════════════════════════════════════════════════════════');
  log('✅ LibreOffice headless is ready for bundling.');
  log(`   Location: ${path.join(VENDOR_DIR, getPlatformDir(platform))}`);
  log('   It will be included in the installer via extraResources.');
  log('════════════════════════════════════════════════════════');
}

main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
