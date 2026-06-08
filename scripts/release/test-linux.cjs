const { cleanBuildDirs, execCmd, shellPath } = require("./shared.cjs");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const noLaunch = process.argv.includes("--no-launch");

try {
  // 1. Clean
  cleanBuildDirs();

  // 2. Build frontend
  console.log("\nBuilding frontend source...");
  execCmd("npm", ["run", "build:frontend"]);

  // 3. Unpacked build inside desktop-shell
  console.log("\nBuilding unpacked Linux Electron app...");
  execCmd("npx", ["electron-builder", "--config", "electron-builder.linux.yml", "--dir"], { cwd: shellPath });

  // 4. Verify package inside desktop-shell
  console.log("\nRunning package verification checks...");
  execCmd("npm", ["run", "verify:package"], {
    cwd: shellPath,
    env: { ...process.env, PE_TARGET_PLATFORM: "linux" }
  });

  // 5. Find Linux executable
  const unpackedDir = path.join(shellPath, "release/linux-unpacked");
  if (!fs.existsSync(unpackedDir)) {
    throw new Error(`Unpacked directory not found at ${unpackedDir}`);
  }

  const entries = fs.readdirSync(unpackedDir);
  let appExecutable = null;

  for (const entry of entries) {
    const entryPath = path.join(unpackedDir, entry);
    try {
      const stat = fs.statSync(entryPath);
      const isFile = stat.isFile();
      const isExe = (stat.mode & 0o111) !== 0;

      if (isFile && isExe) {
        const name = entry.toLowerCase();
        if (
          name !== "chrome_crashpad_handler" &&
          name !== "chrome-sandbox" &&
          !name.startsWith("lib") &&
          !name.includes(".so")
        ) {
          appExecutable = entryPath;
          break;
        }
      }
    } catch (_) {
      // Ignore reading errors on links/special files
    }
  }

  if (!appExecutable) {
    throw new Error("Could not automatically locate the app executable inside linux-unpacked folder.");
  }

  console.log(`\nFound app executable at: ${appExecutable}`);
  console.log(`To launch manually run:\nPE_DEBUG_RENDERER=1 "${appExecutable}"`);

  // 6. Launch automatically if not disabled
  if (noLaunch) {
    console.log("\n--no-launch passed. Skipping automated application startup.");
    console.log("Linux local verification passed.");
    process.exit(0);
  }

  console.log("\nLaunching unpacked application with PE_DEBUG_RENDERER=1 for verification...");
  execCmd(appExecutable, [], {
    env: { ...process.env, PE_DEBUG_RENDERER: "1" }
  });

  // 7. Prompt developer sign-off
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question("\nDid the app open correctly? Type YES to confirm: ", (answer) => {
    rl.close();
    if (answer.trim().toUpperCase() === "YES") {
      console.log("\n====================================================");
      console.log("Linux local verification passed.");
      console.log("====================================================");
      process.exit(0);
    } else {
      console.error("\n====================================================");
      console.error("Do not release. Fix app startup first.");
      console.error("====================================================");
      process.exit(1);
    }
  });

} catch (err) {
  console.error("\nVerification step failed:", err.message);
  process.exit(1);
}
