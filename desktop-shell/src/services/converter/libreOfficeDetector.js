import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  makeLibreOfficeUserInstallationArg,
  prepareLibreOfficeProfileEnvironment,
} from "../../../agent/printPreparation/libreOfficeProfile.js";
import { runCommand } from "./conversionRunner.js";
import {
  getAutoInstalledSofficeCandidates,
  readConverterConfig,
} from "./converterConfig.js";

export const LIBREOFFICE_MANUAL_DOWNLOAD_URL = "https://download.documentfoundation.org/libreoffice/stable/";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_SHELL_DIR = path.resolve(MODULE_DIR, "..", "..", "..");

function exists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

function hasPathSeparator(candidate) {
  return candidate.includes("/") || candidate.includes("\\");
}

function shouldCheckFileExists(candidate) {
  return hasPathSeparator(candidate) || /\.exe$/i.test(candidate) || /\.com$/i.test(candidate);
}

function addCandidate(candidates, executable, source, meta = {}) {
  if (!executable) return;
  candidates.push({ executable, source, ...meta });
}

function getBundledSofficePaths(platform) {
  const resourcesPath = typeof process !== "undefined" && process.resourcesPath
    ? process.resourcesPath
    : null;

  if (!resourcesPath) return [];

  if (platform === "win32") {
    const programDir = path.join(resourcesPath, "vendor", "libreoffice", "win", "program");
    return [
      path.join(programDir, "soffice.com"),
      path.join(programDir, "soffice.exe"),
    ];
  }

  return [path.join(resourcesPath, "vendor", "libreoffice", "linux", "program", "soffice")];
}

function getDevVendorSofficePaths(platform) {
  if (platform === "win32") {
    return [
      path.join(DESKTOP_SHELL_DIR, "vendor", "libreoffice", "win", "program", "soffice.com"),
      path.join(DESKTOP_SHELL_DIR, "vendor", "libreoffice", "win", "program", "soffice.exe"),
    ];
  }

  return [path.join(DESKTOP_SHELL_DIR, "vendor", "libreoffice", "linux", "program", "soffice")];
}

function getSystemSofficePaths(platform) {
  if (platform === "win32") {
    return [
      "C:\\Program Files\\LibreOffice\\program\\soffice.com",
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    ];
  }

  if (platform === "darwin") {
    return ["/Applications/LibreOffice.app/Contents/MacOS/soffice"];
  }

  return ["/usr/bin/libreoffice", "/usr/bin/soffice", "/snap/bin/libreoffice"];
}

function getPathFallbackCommands(platform) {
  if (platform !== process.platform) return [];
  if (platform === "win32") return ["soffice.com", "soffice.exe", "soffice", "libreoffice"];
  return ["soffice", "libreoffice"];
}

async function runSmokeTest(candidate) {
  const smokeDir = path.join(os.tmpdir(), `printease-lo-smoketest-${Date.now()}`);
  const smokeInput = path.join(smokeDir, "smoke.txt");
  const smokeProfile = path.join(os.tmpdir(), `printease-lo-smokeprofile-${Date.now()}`);

  try {
    await fs.mkdir(smokeDir, { recursive: true });
    await fs.writeFile(smokeInput, "printease smoke test", "utf8");
    const smokeEnv = await prepareLibreOfficeProfileEnvironment(smokeProfile);
    const smokeResult = await runCommand(candidate, [
      makeLibreOfficeUserInstallationArg(smokeProfile),
      "--headless",
      "--nologo",
      "--nofirststartwizard",
      "--nodefault",
      "--nolockcheck",
      "--convert-to", "pdf",
      "--outdir", smokeDir,
      smokeInput,
    ], { timeoutMs: 30000, env: smokeEnv });

    const smokeOutput = path.join(smokeDir, "smoke.pdf");
    const smokeWorked = smokeResult.success && await exists(smokeOutput);
    return {
      attempted: true,
      success: Boolean(smokeWorked),
      message: smokeWorked
        ? "Smoke conversion passed."
        : (smokeResult.stderr || smokeResult.stdout || "Smoke conversion did not create a PDF."),
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      message: error?.message || "Smoke conversion errored.",
    };
  } finally {
    await fs.rm(smokeProfile, { recursive: true, force: true }).catch(() => {});
    await fs.rm(smokeDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function getConfiguredCandidates(platform) {
  const config = await readConverterConfig({ platform });
  const candidates = [];

  if (config?.path) {
    addCandidate(candidates, config.path, config.source || "configured", {
      configured: true,
      installedBy: config.installedBy || "configured",
    });
  }

  for (const executable of getAutoInstalledSofficeCandidates(platform)) {
    addCandidate(candidates, executable, "auto-installed", { installedBy: "printease-auto-setup" });
  }

  return candidates;
}

export async function detectLibreOffice({ platform = process.platform, extraPaths = [] } = {}) {
  const candidates = [];
  const checkedPaths = [];

  candidates.push(...await getConfiguredCandidates(platform));

  for (const item of extraPaths) {
    addCandidate(candidates, item, "extra");
  }

  for (const item of getSystemSofficePaths(platform)) {
    addCandidate(candidates, item, "system");
  }

  const bundledPaths = getBundledSofficePaths(platform);
  const devVendorPaths = getDevVendorSofficePaths(platform);

  for (const item of bundledPaths) {
    addCandidate(candidates, item, "bundled", { bundled: true });
  }

  for (const item of devVendorPaths) {
    addCandidate(candidates, item, "dev-vendor", { bundled: false });
  }

  for (const item of getPathFallbackCommands(platform)) {
    addCandidate(candidates, item, "path");
  }

  for (const candidate of candidates) {
    checkedPaths.push(candidate.executable);

    if (shouldCheckFileExists(candidate.executable) && !(await exists(candidate.executable))) {
      continue;
    }

    const result = await runCommand(candidate.executable, ["--version"], { timeoutMs: 8000 });
    const versionText = `${result.stdout || ""}${result.stderr || ""}`.trim();
    const versionLooksValid = Boolean(result.success || /LibreOffice|OpenOffice/i.test(versionText));
    if (!versionLooksValid) continue;

    const smokeTest = await runSmokeTest(candidate.executable);
    if (!smokeTest.success) {
      console.warn(
        `[CONVERSION ENGINE] candidate "${candidate.executable}" failed smoke test. Real conversion will still be attempted.`,
        smokeTest.message
      );
    }

    return {
      found: true,
      executable: candidate.executable,
      bundled: Boolean(candidate.bundled || bundledPaths.includes(candidate.executable)),
      configured: Boolean(candidate.configured),
      installedBy: candidate.installedBy || candidate.source,
      source: candidate.source,
      manualDownloadUrl: LIBREOFFICE_MANUAL_DOWNLOAD_URL,
      checkedPaths,
      versionText,
      smokeTest,
    };
  }

  return {
    found: false,
    executable: null,
    bundled: false,
    reasonCode: "CONVERSION_ENGINE_MISSING",
    source: "missing",
    manualDownloadUrl: LIBREOFFICE_MANUAL_DOWNLOAD_URL,
    checkedPaths,
    message: "LibreOffice was not found. PrintEase can use an auto-installed converter, a local LibreOffice install, the old bundled copy, or soffice/libreoffice on PATH.",
  };
}
