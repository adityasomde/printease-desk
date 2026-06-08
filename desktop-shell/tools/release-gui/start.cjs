const { spawn } = require("node:child_process");
const path = require("node:path");
const electronPath = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// Path to the main.js file of the release GUI
const mainPath = path.join(__dirname, "main.js");

const child = spawn(electronPath, [mainPath, "--no-sandbox"], {
  cwd: path.resolve(__dirname, "../.."), // Should run from desktop-shell root
  env,
  stdio: "inherit",
  windowsHide: false,
});

child.on("error", (err) => {
  console.error("Failed to start Release Builder GUI helper process:", err);
  process.exit(1);
});

child.on("close", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
