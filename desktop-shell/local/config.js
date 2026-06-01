import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

let configFilePath = "";
let memoryConfig = {};

function stripSecrets(value = {}) {
  const nextConfig = { ...value };

  for (const key of Object.keys(nextConfig)) {
    if (/token|secret|password|authorization|signed/i.test(key)) {
      delete nextConfig[key];
    }
  }

  return nextConfig;
}

export function setConfigDirectory(directory) {
  configFilePath = path.join(directory, "config.json");
}

export async function loadConfig() {
  if (!configFilePath) return { ...memoryConfig };

  try {
    const rawConfig = await readFile(configFilePath, "utf8");
    memoryConfig = stripSecrets(JSON.parse(rawConfig));
  } catch {
    memoryConfig = {};
  }

  return { ...memoryConfig };
}

export async function saveConfig(nextConfig = {}) {
  memoryConfig = stripSecrets({
    ...memoryConfig,
    ...nextConfig,
  });

  if (configFilePath) {
    await mkdir(path.dirname(configFilePath), { recursive: true });
    await writeFile(configFilePath, `${JSON.stringify(memoryConfig, null, 2)}\n`, "utf8");
  }

  return { ...memoryConfig };
}
