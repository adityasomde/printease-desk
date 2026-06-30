import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_SHELL_DIR = path.resolve(MODULE_DIR, "..", "..", "..");
const DEFAULT_MANIFEST_PATH = path.join(DESKTOP_SHELL_DIR, "config", "converter-manifest.json");

function getPlatformKey(platform) {
  return platform === "win32" ? "win32" : platform;
}

function normalizeManifestEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const url = String(entry.url || "").trim();
  const sha256 = String(entry.sha256 || "").trim().toLowerCase();
  const archiveType = String(entry.archiveType || "").trim().toLowerCase();
  const executableRelativePath = String(entry.executableRelativePath || "").trim();

  if (!url || !sha256 || !archiveType || !executableRelativePath) return null;
  if (!/^https:\/\//i.test(url)) return null;

  return {
    url,
    sha256,
    archiveType,
    executableRelativePath,
    version: entry.version || "",
    licenseNotice: entry.licenseNotice || "",
  };
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function readConverterManifest({ platform = process.platform } = {}) {
  let manifest = null;

  if (process.env.PRINTEASE_CONVERTER_MANIFEST_JSON) {
    manifest = JSON.parse(process.env.PRINTEASE_CONVERTER_MANIFEST_JSON);
  } else {
    const manifestPath = process.env.PRINTEASE_CONVERTER_MANIFEST_FILE || DEFAULT_MANIFEST_PATH;
    manifest = await readJsonFile(manifestPath).catch(() => null);
  }

  const platforms = manifest?.platforms || {};
  return normalizeManifestEntry(platforms[getPlatformKey(platform)]);
}
