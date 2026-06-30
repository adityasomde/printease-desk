import fs from "node:fs/promises";
import path from "node:path";
import { downloadConverterArchive } from "./converterDownloader.js";
import { extractConverterArchive } from "./converterExtractor.js";
import { detectLibreOffice } from "./libreOfficeDetector.js";
import { writeConverterConfig } from "./converterConfig.js";

function shouldPersistDetection(result) {
  return result?.found && ["auto-installed", "configured", "extra", "system"].includes(result.source);
}

async function persistDetection(result, platform) {
  if (!shouldPersistDetection(result)) return;

  await writeConverterConfig({
    path: result.executable,
    version: result.versionText,
    installedBy: result.installedBy || result.source,
    source: result.source,
  }, { platform }).catch((error) => {
    console.warn("[CONVERTER MANAGER] Could not save converter config:", error?.message || error);
  });
}

async function setupConverterByDownload({ platform, onStatus }) {
  const download = await downloadConverterArchive({ platform, onStatus });
  if (!download.success) {
    if (download.archivePath) {
      await fs.rm(path.dirname(download.archivePath), { recursive: true, force: true }).catch(() => {});
    }
    onStatus?.({ setupStatus: "failed", message: download.message || "Converter setup failed." });
    return {
      ...download,
      setupStatus: "failed",
      setupAttempted: true,
    };
  }

  try {
    const extraction = await extractConverterArchive({
      platform,
      archivePath: download.archivePath,
      manifest: download.manifest,
      onStatus,
    });
    return {
      ...extraction,
      setupStatus: extraction.success ? "ready" : "failed",
      setupAttempted: true,
    };
  } finally {
    if (download.archivePath) {
      await fs.rm(path.dirname(download.archivePath), { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function ensureConverterReady({
  platform = process.platform,
  extraPaths = [],
  allowDownload = false,
  onStatus,
} = {}) {
  onStatus?.({ setupStatus: "checking", message: "Checking LibreOffice converter..." });
  const detection = await detectLibreOffice({ platform, extraPaths });

  if (detection.found) {
    await persistDetection(detection, platform);
    return {
      ...detection,
      setupRequired: false,
      setupStatus: "ready",
      setupAttempted: false,
    };
  }

  if (!allowDownload) {
    return {
      ...detection,
      setupRequired: true,
      setupStatus: "missing",
      setupAttempted: false,
    };
  }

  const setup = await setupConverterByDownload({ platform, onStatus });
  if (!setup.success) {
    onStatus?.({ setupStatus: "failed", message: setup.message || "Converter setup failed." });
    return {
      ...detection,
      ...setup,
      found: false,
      executable: null,
      setupRequired: true,
    };
  }

  onStatus?.({ setupStatus: "testing", message: "Testing LibreOffice converter..." });
  const afterSetup = await detectLibreOffice({ platform, extraPaths });
  await persistDetection(afterSetup, platform);
  return {
    ...afterSetup,
    setupRequired: !afterSetup.found,
    setupStatus: afterSetup.found ? "ready" : "failed",
    setupAttempted: true,
  };
}
