import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONFIG_FILE_NAME = "converter.json";

function getBaseDataDir(platform = process.platform) {
  if (process.env.PRINTEASE_CONVERTER_HOME) {
    return process.env.PRINTEASE_CONVERTER_HOME;
  }

  if (platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || os.homedir(), "PrintEase");
  }

  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "PrintEase");
  }

  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "PrintEase");
}

export function getConverterRootDir(platform = process.platform) {
  return path.join(getBaseDataDir(platform), "converter");
}

export function getConverterConfigPath(platform = process.platform) {
  return path.join(getConverterRootDir(platform), CONFIG_FILE_NAME);
}

export function getAutoInstalledLibreOfficeDir(platform = process.platform) {
  return path.join(getConverterRootDir(platform), "libreoffice");
}

export function getAutoInstalledSofficeCandidates(platform = process.platform) {
  const programDir = path.join(getAutoInstalledLibreOfficeDir(platform), "program");
  if (platform === "win32") {
    return [
      path.join(programDir, "soffice.com"),
      path.join(programDir, "soffice.exe"),
    ];
  }
  return [path.join(programDir, "soffice")];
}

export async function readConverterConfig({ platform = process.platform } = {}) {
  try {
    const raw = await fs.readFile(getConverterConfigPath(platform), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.engine !== "libreoffice" || typeof parsed.path !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeConverterConfig(config, { platform = process.platform } = {}) {
  const rootDir = getConverterRootDir(platform);
  const configPath = getConverterConfigPath(platform);
  const tempPath = `${configPath}.tmp`;
  const payload = {
    engine: "libreoffice",
    path: config.path,
    version: config.version || "",
    installedBy: config.installedBy || "detected",
    source: config.source || "unknown",
    updatedAt: new Date().toISOString(),
  };

  await fs.mkdir(rootDir, { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, configPath);
  return payload;
}
