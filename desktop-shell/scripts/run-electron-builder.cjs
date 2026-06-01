#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

process.env.npm_config_loglevel = process.env.npm_config_loglevel || "error";

const binary = process.platform === "win32" ? "electron-builder.cmd" : "electron-builder";
const result = spawnSync(binary, process.argv.slice(2), {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
