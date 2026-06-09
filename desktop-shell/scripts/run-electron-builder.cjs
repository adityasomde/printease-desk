#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

process.env.npm_config_loglevel = process.env.npm_config_loglevel || "error";

const args = process.argv.slice(2);
const hasConfig = args.includes("--config") || args.some((arg) => arg.startsWith("--config="));
const targetPlatform = process.env.PE_TARGET_PLATFORM || process.platform;

if (!hasConfig) {
  args.unshift("--config", targetPlatform === "win32" ? "electron-builder.win.yml" : "electron-builder.linux.yml");
}

const cliPath = require.resolve("electron-builder/cli.js");
const result = spawnSync(process.execPath, [cliPath, ...args], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
