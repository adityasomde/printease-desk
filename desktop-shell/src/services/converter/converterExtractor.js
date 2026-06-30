import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand } from "./conversionRunner.js";
import {
  getAutoInstalledLibreOfficeDir,
  getAutoInstalledSofficeCandidates,
} from "./converterConfig.js";

async function pathExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

async function extractZip(archivePath, destinationDir, platform) {
  if (platform === "win32") {
    const command = "powershell.exe";
    const result = await runCommand(command, [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-Command",
      "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
      archivePath,
      destinationDir,
    ], { timeoutMs: 5 * 60 * 1000 });
    if (!result.success) {
      throw new Error(result.stderr || result.stdout || "PowerShell Expand-Archive failed.");
    }
    return;
  }

  const result = await runCommand("unzip", ["-q", archivePath, "-d", destinationDir], { timeoutMs: 5 * 60 * 1000 });
  if (!result.success) {
    throw new Error(result.stderr || result.stdout || "unzip failed.");
  }
}

async function extractTarGz(archivePath, destinationDir) {
  const result = await runCommand("tar", ["-xzf", archivePath, "-C", destinationDir], { timeoutMs: 5 * 60 * 1000 });
  if (!result.success) {
    throw new Error(result.stderr || result.stdout || "tar extraction failed.");
  }
}

async function findExecutableRoot(extractDir, executableRelativePath) {
  const directExecutable = path.join(extractDir, executableRelativePath);
  if (await pathExists(directExecutable)) return extractDir;

  const queue = [extractDir];
  while (queue.length) {
    const currentDir = queue.shift();
    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidateRoot = path.join(currentDir, entry.name);
      if (await pathExists(path.join(candidateRoot, executableRelativePath))) {
        return candidateRoot;
      }
      queue.push(candidateRoot);
    }
  }

  return null;
}

async function makeUnixExecutableIfNeeded(platform, executablePath) {
  if (platform === "win32" || !executablePath) return;
  await fs.chmod(executablePath, 0o755).catch(() => {});
}

export async function extractConverterArchive({ platform = process.platform, archivePath, manifest, onStatus } = {}) {
  if (!archivePath || !manifest?.archiveType || !manifest?.executableRelativePath) {
    return {
      success: false,
      reasonCode: "CONVERTER_EXTRACTION_INPUT_MISSING",
      message: "Converter extraction needs archivePath and manifest metadata.",
    };
  }

  const tempDir = path.join(os.tmpdir(), `printease-converter-extract-${Date.now()}`);
  const finalDir = getAutoInstalledLibreOfficeDir(platform);
  const stagingDir = `${finalDir}.staging-${Date.now()}`;

  try {
    onStatus?.({ setupStatus: "extracting", message: "Extracting LibreOffice converter..." });
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(stagingDir, { recursive: true, force: true });
    await fs.mkdir(tempDir, { recursive: true });

    if (manifest.archiveType === "zip") {
      await extractZip(archivePath, tempDir, platform);
    } else if (manifest.archiveType === "tar.gz" || manifest.archiveType === "tgz") {
      await extractTarGz(archivePath, tempDir);
    } else {
      throw new Error(`Unsupported converter archive type: ${manifest.archiveType}`);
    }

    const executableRoot = await findExecutableRoot(tempDir, manifest.executableRelativePath);
    if (!executableRoot) {
      throw new Error(`Converter archive did not contain ${manifest.executableRelativePath}.`);
    }

    await fs.mkdir(path.dirname(stagingDir), { recursive: true });
    await fs.cp(executableRoot, stagingDir, { recursive: true });
    await fs.rm(finalDir, { recursive: true, force: true });
    await fs.rename(stagingDir, finalDir);

    let executable = "";
    for (const candidate of getAutoInstalledSofficeCandidates(platform)) {
      if (await pathExists(candidate)) {
        await makeUnixExecutableIfNeeded(platform, candidate);
        executable = candidate;
        break;
      }
    }

    if (!executable) {
      const fallbackExecutable = path.join(finalDir, manifest.executableRelativePath);
      await makeUnixExecutableIfNeeded(platform, fallbackExecutable);
    }

    return {
      success: true,
      finalDir,
      executable: executable || path.join(finalDir, manifest.executableRelativePath),
      message: "Converter archive extracted.",
    };
  } catch (error) {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    return {
      success: false,
      reasonCode: "CONVERTER_EXTRACTION_FAILED",
      message: error?.message || "Converter extraction failed.",
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
