import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function encodeWindowsFileUrl(filePath) {
  const normalized = String(filePath).replace(/\\/g, '/');
  const [drive, ...parts] = normalized.split('/');
  const encodedTail = parts.map((part) => encodeURIComponent(part)).join('/');
  return `file:///${drive}${encodedTail ? `/${encodedTail}` : ''}`;
}

/**
 * LibreOffice expects file URLs for per-run user profiles.
 * Building the URL with string concatenation breaks on Windows drive paths
 * because `file://C:/...` is not the same as `file:///C:/...`.
 */
export function makeLibreOfficeUserInstallationArg(profileDir) {
  if (!profileDir) throw new Error('LibreOffice profile directory is required');
  const profilePath = String(profileDir);
  const profileUrl = /^[a-zA-Z]:[\\/]/.test(profilePath)
    ? encodeWindowsFileUrl(profilePath)
    : pathToFileURL(profilePath).href;
  return `-env:UserInstallation=${profileUrl}`;
}

export async function prepareLibreOfficeProfileEnvironment(profileDir) {
  if (!profileDir) throw new Error('LibreOffice profile directory is required');

  const configDir = path.join(profileDir, 'xdg-config');
  const cacheDir = path.join(profileDir, 'xdg-cache');
  const runtimeDir = path.join(profileDir, 'xdg-runtime');

  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.mkdir(runtimeDir, { recursive: true });

  try {
    await fs.chmod(runtimeDir, 0o700);
  } catch {
    // Windows and some filesystems ignore POSIX modes; LibreOffice can still use the directory.
  }

  return {
    ...process.env,
    HOME: profileDir,
    XDG_CONFIG_HOME: configDir,
    XDG_CACHE_HOME: cacheDir,
    XDG_RUNTIME_DIR: runtimeDir,
    SAL_USE_VCLPLUGIN: process.env.SAL_USE_VCLPLUGIN || 'svp',
  };
}
