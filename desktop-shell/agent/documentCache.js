import { createHash } from "node:crypto";
import fs from "node:fs";
import { createWriteStream } from "node:fs";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const CACHE_MAX_AGE_DAYS = 15;
let cacheDirectory = path.join(os.tmpdir(), "printease-document-cache");

function safeCacheKey(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 80);
}

function safeExtension(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (/^\.[a-z0-9]{1,12}$/.test(ext)) return ext;
  return ".pdf";
}

function ensureCacheDirectory() {
  fs.mkdirSync(cacheDirectory, { recursive: true });
  return cacheDirectory;
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function cachePrefixForDocument(documentId) {
  const key = safeCacheKey(documentId);
  return key ? `${key}-` : "";
}

async function calculateSha256(filePath) {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

export function setDocumentCacheDirectory(directory) {
  if (!directory || typeof directory !== "string") return;
  cacheDirectory = directory;
  ensureCacheDirectory();
}

export function getDocumentCacheDirectory() {
  return ensureCacheDirectory();
}

export function getDocumentCacheMaxAgeDays() {
  return CACHE_MAX_AGE_DAYS;
}

export async function findCachedDocument(documentId, expectedHash = "") {
  const prefix = cachePrefixForDocument(documentId);
  if (!prefix) return null;

  const root = ensureCacheDirectory();
  let entries = [];
  try {
    entries = await readdir(root);
  } catch {
    return null;
  }

  const candidates = entries
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => path.join(root, entry))
    .filter((entryPath) => isPathInside(root, entryPath));

  for (const candidate of candidates) {
    try {
      const details = await stat(candidate);
      if (!details.isFile()) continue;

      if (expectedHash) {
        const actualHash = await calculateSha256(candidate);
        if (actualHash !== expectedHash) {
          await rm(candidate, { force: true }).catch(() => {});
          continue;
        }
      }

      return candidate;
    } catch {
      // Ignore stale entries and try the next candidate.
    }
  }

  return null;
}

export async function cacheReadableDocument({ documentId, fileName, expectedHash, responseBody } = {}) {
  const key = safeCacheKey(documentId || expectedHash || fileName);
  if (!key) {
    return {
      success: false,
      message: "Document cache key is missing.",
    };
  }

  if (!responseBody) {
    return {
      success: false,
      message: "Document response body is missing.",
    };
  }

  const cached = documentId ? await findCachedDocument(documentId, expectedHash) : null;
  if (cached) {
    return {
      success: true,
      filePath: cached,
      cached: true,
    };
  }

  const root = ensureCacheDirectory();
  const filePath = path.join(root, `${key}-${Date.now()}${safeExtension(fileName)}`);
  const tempPath = `${filePath}.tmp`;

  if (!isPathInside(root, filePath) || !isPathInside(root, tempPath)) {
    return {
      success: false,
      message: "Document cache path is not safe.",
    };
  }

  try {
    await pipeline(Readable.fromWeb(responseBody), createWriteStream(tempPath));

    if (expectedHash) {
      const actualHash = await calculateSha256(tempPath);
      if (actualHash !== expectedHash) {
        await rm(tempPath, { force: true }).catch(() => {});
        return {
          success: false,
          message: "Downloaded print file failed SHA-256 verification.",
        };
      }
    }

    fs.renameSync(tempPath, filePath);
    return {
      success: true,
      filePath,
      cached: false,
    };
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    return {
      success: false,
      message: error.message || "Could not save downloaded print file.",
    };
  }
}

export async function cleanupDocumentCache({ maxAgeDays = CACHE_MAX_AGE_DAYS } = {}) {
  const root = ensureCacheDirectory();
  const maxAgeMs = Math.max(1, Number(maxAgeDays) || CACHE_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  let entries = [];
  try {
    entries = await readdir(root);
  } catch {
    return { success: true, removed };
  }

  for (const entry of entries) {
    const entryPath = path.join(root, entry);
    if (!isPathInside(root, entryPath)) continue;

    try {
      const details = await stat(entryPath);
      if (details.isFile() && details.mtimeMs < cutoff) {
        await rm(entryPath, { force: true });
        removed += 1;
      }
    } catch {
      // Cleanup is best effort.
    }
  }

  return { success: true, removed };
}

