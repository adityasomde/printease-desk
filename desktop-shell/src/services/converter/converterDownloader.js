import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { readConverterManifest } from "./converterManifest.js";
import { verifySha256 } from "./converterVerifier.js";

function getArchiveExtension(archiveType) {
  if (archiveType === "zip") return ".zip";
  if (archiveType === "tar.gz" || archiveType === "tgz") return ".tar.gz";
  return "";
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await pipeline(response.body, createWriteStream(destinationPath));
  return destinationPath;
}

export async function downloadConverterArchive({ platform = process.platform, downloadDir, onStatus } = {}) {
  const manifest = await readConverterManifest({ platform });
  if (!manifest) {
    return {
      success: false,
      reasonCode: "CONVERTER_DOWNLOAD_NOT_CONFIGURED",
      message: "Automatic LibreOffice download needs a trusted converter manifest with URL, SHA256, archive type, and executable path.",
    };
  }

  if (!["zip", "tar.gz", "tgz"].includes(manifest.archiveType)) {
    return {
      success: false,
      reasonCode: "CONVERTER_ARCHIVE_UNSUPPORTED",
      message: `Unsupported converter archive type: ${manifest.archiveType}`,
      manifest,
    };
  }

  const tempDir = downloadDir || path.join(os.tmpdir(), `printease-converter-download-${Date.now()}`);
  const archivePath = path.join(tempDir, `libreoffice-converter${getArchiveExtension(manifest.archiveType)}`);

  try {
    onStatus?.({ setupStatus: "downloading", message: "Downloading LibreOffice converter..." });
    await downloadFile(manifest.url, archivePath);
    onStatus?.({ setupStatus: "verifying", message: "Verifying LibreOffice converter download..." });
    const verification = await verifySha256(archivePath, manifest.sha256);
    if (!verification.success) {
      await fs.rm(archivePath, { force: true }).catch(() => {});
      return {
        ...verification,
        success: false,
        archivePath,
        manifest,
      };
    }

    return {
      success: true,
      archivePath,
      manifest,
      verification,
      message: "Converter archive downloaded and verified.",
    };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    return {
      success: false,
      reasonCode: "CONVERTER_DOWNLOAD_FAILED",
      message: error?.message || "Converter download failed.",
      manifest,
    };
  }
}
