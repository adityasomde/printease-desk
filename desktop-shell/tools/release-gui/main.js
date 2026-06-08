import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn as childSpawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
let asar;
try {
  asar = require("@electron/asar");
} catch (e) {
  console.warn("Could not load @electron/asar module; packaging diagnostics will look for loose files instead.");
}

const repoRoot = path.resolve(__dirname, "../../..");
const desktopShellDir = path.resolve(__dirname, "../..");

let mainWindow = null;
let runningProcess = null;
let runningProcessKey = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 850,
    title: "PrintEase Desktop Release Builder",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (runningProcess) {
      runningProcess.kill("SIGINT");
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Helper to send log lines to renderer
function logToRenderer(type, data) {
  if (mainWindow) {
    mainWindow.webContents.send("release-builder:log", { type, data });
  }
}

// Helper to notify command status change
function notifyState(commandKey, status, exitCode = null) {
  if (mainWindow) {
    mainWindow.webContents.send("release-builder:command-state", {
      commandKey,
      status,
      exitCode,
    });
  }
}

// 1. Clean previous build JS logic
function runCleanTask() {
  logToRenderer("info", "Starting clean task...");
  try {
    const pathsToClean = [
      path.join(desktopShellDir, "release"),
      path.join(repoRoot, "frontend-dist"),
      path.join(repoRoot, "frontend", "dist"),
    ];

    for (const p of pathsToClean) {
      if (fs.existsSync(p)) {
        logToRenderer("info", `Deleting directory: ${p}`);
        fs.rmSync(p, { recursive: true, force: true });
      }
    }
    logToRenderer("info", "Clean completed successfully.\n");
    return true;
  } catch (err) {
    logToRenderer("error", `Clean failed: ${err.message}\n`);
    return false;
  }
}

// Helper to check if file has relative asset paths
function verifyHtmlPaths(filePath) {
  if (!fs.existsSync(filePath)) {
    return { success: false, reason: `File does not exist: ${filePath}` };
  }
  const content = fs.readFileSync(filePath, "utf8");
  // Check if file uses /assets/ instead of ./assets/
  const absoluteAssetPattern = /(src|href)=["']\/assets\//i;
  const relativeAssetPattern = /(src|href)=["']\.\/assets\//i;

  const hasAbsolute = absoluteAssetPattern.test(content);
  const hasRelative = relativeAssetPattern.test(content);

  if (hasAbsolute) {
    return {
      success: false,
      reason: "Found absolute references to '/assets/' in index.html. Must use relative './assets/'.",
    };
  }
  if (!hasRelative && content.includes("assets/")) {
    return {
      success: false,
      reason: "Asset references found but they do not use relative './assets/' prefix.",
    };
  }

  return { success: true };
}

// Helper to walk a directory synchronously
function getFilesRecursively(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFilesRecursively(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

// Perform automated checks on the package
function runProgrammaticDiagnostics() {
  logToRenderer("info", "Running automated safety check diagnostics...");

  const results = {
    frontendHtmlRelative: false,
    frontendHtmlDetails: "",
    frontendAssetsExist: false,
    frontendAssetsDetails: "",
    linuxPackage: {
      built: false,
      ipcSecurityExists: false,
      urlValidatorExists: false,
      printerLinuxExists: false,
      printerWinExcluded: false,
      allPassed: false,
      details: "",
    },
    windowsPackage: {
      built: false,
      ipcSecurityExists: false,
      urlValidatorExists: false,
      printerWinExists: false,
      printerLinuxExcluded: false,
      allPassed: false,
      details: "",
    },
  };

  // 1. Verify index.html in frontend-dist
  const distHtmlPath = path.join(repoRoot, "frontend-dist", "index.html");
  const htmlCheck = verifyHtmlPaths(distHtmlPath);
  if (htmlCheck.success) {
    results.frontendHtmlRelative = true;
    results.frontendHtmlDetails = "Verified: frontend-dist/index.html uses relative './assets/'.";
    logToRenderer("info", "[PASS] frontend-dist/index.html uses relative paths.");
  } else {
    results.frontendHtmlRelative = false;
    results.frontendHtmlDetails = `[FAIL] ${htmlCheck.reason}`;
    logToRenderer("error", `[FAIL] frontend-dist/index.html paths verification: ${htmlCheck.reason}`);
  }

  // 2. Verify frontend-dist/assets folder
  const assetsDir = path.join(repoRoot, "frontend-dist", "assets");
  if (fs.existsSync(assetsDir) && fs.readdirSync(assetsDir).length > 0) {
    results.frontendAssetsExist = true;
    results.frontendAssetsDetails = `Verified: ${fs.readdirSync(assetsDir).length} files in frontend-dist/assets.`;
    logToRenderer("info", `[PASS] frontend-dist/assets exists and is populated.`);
  } else {
    results.frontendAssetsExist = false;
    results.frontendAssetsDetails = "[FAIL] frontend-dist/assets does not exist or is empty.";
    logToRenderer("error", "[FAIL] frontend-dist/assets directory is missing or empty.");
  }

  // Helper to verify unpacked resources for specific platform
  const verifyPlatformUnpacked = (platform) => {
    const isWin = platform === "win32";
    const unpackedDirName = isWin ? "win-unpacked" : "linux-unpacked";
    const targetPath = path.join(desktopShellDir, "release", unpackedDirName);
    const platformData = isWin ? results.windowsPackage : results.linuxPackage;

    if (!fs.existsSync(targetPath)) {
      platformData.details = `Unpacked directory does not exist at: ${targetPath}`;
      return;
    }
    platformData.built = true;

    // Check if app.asar exists
    const asarPath = path.join(targetPath, "resources", "app.asar");
    const looseAppPath = path.join(targetPath, "resources", "app");

    let appFiles = [];
    let isAsar = false;

    if (fs.existsSync(asarPath) && asar) {
      try {
        appFiles = asar.listPackage(asarPath).map(f => f.replace(/^\/+/, "").replaceAll("\\", "/"));
        isAsar = true;
      } catch (err) {
        logToRenderer("error", `Failed to list app.asar files: ${err.message}`);
      }
    } else if (fs.existsSync(looseAppPath)) {
      appFiles = getFilesRecursively(looseAppPath).map(f =>
        path.relative(looseAppPath, f).replaceAll("\\", "/")
      );
    } else {
      // Fallback: search loose files in release folder
      appFiles = getFilesRecursively(targetPath).map(f =>
        path.relative(targetPath, f).replaceAll("\\", "/")
      );
    }

    // Verify security modules
    const hasIpcSec = appFiles.some(f => f === "security/ipcSecurity.js" || f.endsWith("/security/ipcSecurity.js"));
    const hasUrlVal = appFiles.some(f => f === "security/urlValidator.js" || f.endsWith("/security/urlValidator.js"));

    platformData.ipcSecurityExists = hasIpcSec;
    platformData.urlValidatorExists = hasUrlVal;

    if (hasIpcSec && hasUrlVal) {
      logToRenderer("info", `[PASS] [${platform}] security modules ipcSecurity.js and urlValidator.js found in package.`);
    } else {
      logToRenderer("error", `[FAIL] [${platform}] security modules missing. ipcSecurity: ${hasIpcSec}, urlValidator: ${hasUrlVal}`);
    }

    // Printer driver checks
    let hasCorrectDrivers = false;
    let wrongDriversExcluded = true;

    if (!isWin) {
      // Linux: Must include printer/linux files, must exclude windows/sumatrapdf
      const hasLinuxPrinters = appFiles.some(f => f.includes("printer/linux") || f.includes("linuxcups"));
      const hasWinPrinters = appFiles.some(f => f.includes("printer/windows") || f.includes("windowsprinter") || f.toLowerCase().includes("sumatrapdf"));

      platformData.printerLinuxExists = hasLinuxPrinters;
      platformData.printerWinExcluded = !hasWinPrinters;
      hasCorrectDrivers = hasLinuxPrinters;
      wrongDriversExcluded = !hasWinPrinters;

      if (hasLinuxPrinters && !hasWinPrinters) {
        logToRenderer("info", `[PASS] [linux] Cups drivers included, Windows drivers/Sumatra excluded.`);
      } else {
        logToRenderer("error", `[FAIL] [linux] Driver checks. Cups included: ${hasLinuxPrinters}, Windows excluded: ${!hasWinPrinters}`);
      }
    } else {
      // Windows: Must include printer/windows files/Sumatra, must exclude linux
      const hasWinPrinters = appFiles.some(f => f.includes("printer/windows") || f.includes("windowsprinter") || f.toLowerCase().includes("sumatrapdf"));
      // Also look for SumatraPDF loose executable in resources/extraResources or vendor/win
      const hasSumatraPDF = appFiles.some(f => f.toLowerCase().includes("sumatrapdf.exe")) || 
                           fs.existsSync(path.join(targetPath, "resources", "vendor", "win", "SumatraPDF.exe")) ||
                           fs.existsSync(path.join(targetPath, "vendor", "win", "SumatraPDF.exe"));

      const hasLinuxPrinters = appFiles.some(f => f.includes("printer/linux") || f.includes("linuxcups"));

      platformData.printerWinExists = hasWinPrinters || hasSumatraPDF;
      platformData.printerLinuxExcluded = !hasLinuxPrinters;
      hasCorrectDrivers = hasWinPrinters || hasSumatraPDF;
      wrongDriversExcluded = !hasLinuxPrinters;

      if (platformData.printerWinExists && !hasLinuxPrinters) {
        logToRenderer("info", `[PASS] [win32] SumatraPDF/Windows drivers included, Linux drivers excluded.`);
      } else {
        logToRenderer("error", `[FAIL] [win32] Driver checks. Windows/Sumatra included: ${platformData.printerWinExists}, Linux excluded: ${!hasLinuxPrinters}`);
      }
    }

    // Verify index.html in unpacked folder
    let unpackedHtmlOk = false;
    const unpackedHtml = path.join(targetPath, "resources", "frontend-dist", "index.html");
    if (fs.existsSync(unpackedHtml)) {
      const unpackedHtmlCheck = verifyHtmlPaths(unpackedHtml);
      unpackedHtmlOk = unpackedHtmlCheck.success;
      if (!unpackedHtmlOk) {
        logToRenderer("error", `[FAIL] [${platform}] Packed index.html uses bad asset paths: ${unpackedHtmlCheck.reason}`);
      }
    } else {
      logToRenderer("warning", `[WARN] [${platform}] Packed index.html not found at ${unpackedHtml}. Checking root index.html instead.`);
      unpackedHtmlOk = results.frontendHtmlRelative;
    }

    platformData.allPassed = hasIpcSec && hasUrlVal && hasCorrectDrivers && wrongDriversExcluded && unpackedHtmlOk;
    platformData.details = `Checks: Security=${hasIpcSec && hasUrlVal ? "OK" : "FAILED"}, Printer drivers=${hasCorrectDrivers && wrongDriversExcluded ? "OK" : "FAILED"}, index.html=${unpackedHtmlOk ? "OK" : "FAILED"}`;
  };

  verifyPlatformUnpacked("linux");
  verifyPlatformUnpacked("win32");

  logToRenderer("info", "Automated safety checks diagnostics completed.\n");
  return results;
}

// IPC Handlers
ipcMain.handle("release-builder:get-git-and-version", async () => {
  let gitSha = "N/A";
  let version = "0.0.0";

  // Get Version
  try {
    const pkgContent = fs.readFileSync(path.join(desktopShellDir, "package.json"), "utf8");
    const pkg = JSON.parse(pkgContent);
    version = pkg.version || "0.0.0";
  } catch (err) {
    console.error("Failed to read package.json version", err);
  }

  // Get Git SHA
  try {
    gitSha = await new Promise((resolve) => {
      const child = childSpawn("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
      let output = "";
      child.stdout.on("data", (data) => { output += data.toString(); });
      child.on("close", () => {
        resolve(output.trim() || "N/A");
      });
      child.on("error", () => {
        resolve("N/A");
      });
    });
  } catch (err) {
    console.error("Failed to read git commit SHA", err);
  }

  return {
    gitSha,
    version,
    platform: process.platform,
  };
});

ipcMain.handle("release-builder:run-command", async (event, commandKey) => {
  if (runningProcess) {
    logToRenderer("error", `Cannot start ${commandKey} - process ${runningProcessKey} is already running.\n`);
    return false;
  }

  runningProcessKey = commandKey;
  notifyState(commandKey, "running");

  // Custom JS command
  if (commandKey === "clean") {
    const success = runCleanTask();
    notifyState(commandKey, success ? "success" : "failed", success ? 0 : 1);
    runningProcessKey = null;
    return success;
  }

  // Determine commands to execute
  let cmd = "";
  let args = [];
  let cwd = desktopShellDir;
  let envExtra = {};

  switch (commandKey) {
    case "build-frontend":
      cmd = "npm";
      args = ["run", "build", "--prefix", "frontend"];
      cwd = repoRoot;
      break;
    case "sync-frontend":
      cmd = "node";
      args = ["scripts/sync-frontend-dist.cjs"];
      cwd = desktopShellDir;
      break;
    case "build-linux-unpacked":
      cmd = "npx";
      args = ["electron-builder", "--config", "electron-builder.linux.yml", "--dir"];
      cwd = desktopShellDir;
      break;
    case "verify-linux-package":
      cmd = "npm";
      args = ["run", "verify:package"];
      cwd = desktopShellDir;
      envExtra = { PE_TARGET_PLATFORM: "linux" };
      break;
    case "launch-linux-unpacked": {
      const execPath = path.join(desktopShellDir, "release", "linux-unpacked", "printease-desktop-shell");
      if (!fs.existsSync(execPath)) {
        logToRenderer("error", `Executable not found at ${execPath}. Please build the unpacked app first.\n`);
        notifyState(commandKey, "failed", 1);
        runningProcessKey = null;
        return false;
      }
      cmd = execPath;
      args = ["--no-sandbox"];
      cwd = desktopShellDir;
      envExtra = { PE_DEBUG_RENDERER: "1" };
      break;
    }
    case "build-windows-unpacked":
      cmd = "npx";
      args = ["electron-builder", "--config", "electron-builder.win.yml", "--dir", "--win"];
      cwd = desktopShellDir;
      break;
    case "verify-windows-package":
      cmd = "npm";
      args = ["run", "verify:package"];
      cwd = desktopShellDir;
      envExtra = { PE_TARGET_PLATFORM: "win32" };
      break;
    case "build-linux-dist":
      cmd = "npm";
      args = ["run", "dist:linux"];
      cwd = desktopShellDir;
      break;
    case "build-windows-dist":
      cmd = "npm";
      args = ["run", "dist:win"];
      cwd = desktopShellDir;
      break;
    default:
      logToRenderer("error", `Unknown command key: ${commandKey}\n`);
      notifyState(commandKey, "failed", 1);
      runningProcessKey = null;
      return false;
  }

  logToRenderer("info", `Running: ${cmd} ${args.join(" ")} (in ${path.relative(repoRoot, cwd) || "."})`);
  if (Object.keys(envExtra).length > 0) {
    logToRenderer("info", `Env variables: ${JSON.stringify(envExtra)}`);
  }

  const spawnEnv = { ...process.env, ...envExtra };

  try {
    runningProcess = childSpawn(cmd, args, {
      cwd,
      env: spawnEnv,
      shell: true, // Needed for running command resolution on Windows/Linux (e.g. npm)
    });

    runningProcess.stdout.on("data", (data) => {
      logToRenderer("stdout", data.toString());
    });

    runningProcess.stderr.on("data", (data) => {
      logToRenderer("stderr", data.toString());
    });

    runningProcess.on("error", (err) => {
      logToRenderer("error", `Spawn error: ${err.message}\n`);
      notifyState(commandKey, "failed", -1);
      runningProcess = null;
      runningProcessKey = null;
    });

    runningProcess.on("close", (code) => {
      const isLaunch = commandKey === "launch-linux-unpacked";
      const status = code === 0 ? "success" : "failed";
      logToRenderer("info", `Process completed with exit code: ${code}\n`);
      notifyState(commandKey, status, code);
      runningProcess = null;
      runningProcessKey = null;
    });

    return true;
  } catch (err) {
    logToRenderer("error", `Failed to spawn process: ${err.message}\n`);
    notifyState(commandKey, "failed", -1);
    runningProcess = null;
    runningProcessKey = null;
    return false;
  }
});

ipcMain.handle("release-builder:kill-command", async (event, commandKey) => {
  if (runningProcess && runningProcessKey === commandKey) {
    logToRenderer("warning", `Killing active process ${commandKey}...\n`);
    runningProcess.kill("SIGINT");
    return true;
  }
  return false;
});

ipcMain.handle("release-builder:run-diagnostics", async () => {
  return runProgrammaticDiagnostics();
});

ipcMain.handle("release-builder:open-directory", async (event, dirPath) => {
  const fullPath = path.resolve(desktopShellDir, dirPath);
  if (fs.existsSync(fullPath)) {
    shell.openPath(fullPath);
    return true;
  }
  return false;
});

// Helper to get file size of final packages in release folder
function getReleaseArtifactsInfo() {
  const releaseDir = path.join(desktopShellDir, "release");
  if (!fs.existsSync(releaseDir)) return [];

  const artifacts = [];
  const files = fs.readdirSync(releaseDir);

  for (const file of files) {
    const filePath = path.join(releaseDir, file);
    const stat = fs.statSync(filePath);

    if (stat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      // Look for final builds (AppImage, deb, exe, blockmap, yml)
      if ([".appimage", ".deb", ".exe", ".zip", ".msi"].includes(ext)) {
        const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
        artifacts.push({
          name: file,
          size: `${sizeMb} MB`,
          path: path.relative(repoRoot, filePath),
        });
      }
    }
  }
  return artifacts;
}

ipcMain.handle("release-builder:save-report", async (event, reportData) => {
  try {
    const reportDir = path.join(desktopShellDir, "release-checks");
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportFilename = `release-report-${timestamp}.md`;
    const reportPath = path.join(reportDir, reportFilename);

    const artifacts = getReleaseArtifactsInfo();
    let artifactsSection = "*No final release installer artifacts found in release directory.*";

    if (artifacts.length > 0) {
      artifactsSection = "| Artifact Name | Package Size | Relative Path |\n| :--- | :--- | :--- |\n";
      for (const art of artifacts) {
        artifactsSection += `| **${art.name}** | ${art.size} | \`${art.path}\` |\n`;
      }
    }

    const mdReport = `# PrintEase Desktop Release Checklist Report

- **Version**: ${reportData.version}
- **Git Commit SHA**: \`${reportData.gitSha}\`
- **Build Platform**: \`${process.platform}\`
- **Build Timestamp**: ${new Date().toLocaleString()}
- **Release Mode**: \`${reportData.releaseMode}\`
- **Linux Release Ready**: \`${reportData.linuxReady}\`
- **Windows Release Ready**: \`${reportData.windowsReady}\`
- **Report Location**: \`desktop-shell/release-checks/${reportFilename}\`

---

## 1. Safety Gate Verification Table

| Safety Check | Status | Details |
| :--- | :--- | :--- |
| **Frontend Compilation** | ${reportData.gates.frontendBuild ? "✅ PASS" : "❌ FAIL"} | React production build successfully compiled. |
| **Asset Folder Verification** | ${reportData.gates.frontendAssetsExist ? "✅ PASS" : "❌ FAIL"} | \`frontend-dist/assets\` directory populated. |
| **Index.html Path Check** | ${reportData.gates.frontendHtmlRelative ? "✅ PASS" : "❌ FAIL"} | Uses relative \`./assets/\` loading base. |
| **Linux IPC Security Module** | ${reportData.gates.linuxIpcSecurity ? "✅ PASS" : "❌ FAIL"} | \`security/ipcSecurity.js\` found in Linux bundle. |
| **Linux URL Validator Module** | ${reportData.gates.linuxUrlValidator ? "✅ PASS" : "❌ FAIL"} | \`security/urlValidator.js\` found in Linux bundle. |
| **Linux Cups Driver Inclusion** | ${reportData.gates.linuxPrintersIncluded ? "✅ PASS" : "❌ FAIL"} | Correct OS printer scripts added. |
| **Linux Win-Driver Exclusion** | ${reportData.gates.linuxWinExcluded ? "✅ PASS" : "❌ FAIL"} | Windows executable exclusions verified. |
| **Windows IPC Security Module** | ${reportData.gates.winIpcSecurity ? "✅ PASS" : "❌ FAIL"} | \`security/ipcSecurity.js\` found in Windows bundle. |
| **Windows URL Validator Module** | ${reportData.gates.winUrlValidator ? "✅ PASS" : "❌ FAIL"} | \`security/urlValidator.js\` found in Windows bundle. |
| **Windows SumatraPDF/Drivers** | ${reportData.gates.winPrintersIncluded ? "✅ PASS" : "❌ FAIL"} | SumatraPDF & Windows helper binaries included. |
| **Windows Linux-Driver Exclusion** | ${reportData.gates.winLinuxExcluded ? "✅ PASS" : "❌ FAIL"} | Linux scripts exclusions verified. |
| **CLI Verification Script** | ${reportData.gates.cliVerificationPassed ? "✅ PASS" : "❌ FAIL"} | \`npm run verify:package\` executed and passed. |

---

## 2. Manual Launch Checklist (Linux Unpacked)

User checked the following items during manual validation:
- [${reportData.checklist.manuallyLaunched ? "x" : " "}] Unpacked app successfully launched with \`PE_DEBUG_RENDERER=1\`
- [${reportData.checklist.uiOpened ? "x" : " "}] GUI view loaded correctly (no blank screen)
- [${reportData.checklist.dashboardLoaded ? "x" : " "}] Dashboard page rendered and synced with backend successfully
- [${reportData.checklist.printerPageOpened ? "x" : " "}] Printer settings page loaded and listed drivers
- [${reportData.checklist.noBlankScreen ? "x" : " "}] No blank screen errors or frozen UI
- [${reportData.checklist.logsClean ? "x" : " "}] Main process logs show no \`did-fail-load\` or \`render-process-gone\` errors

---

## 3. Compiled Release Installers

${artifactsSection}

---

## 4. Final Recommendation

**Status**: ${reportData.recommendation.publish ? "🚀 READY TO PUBLISH" : "⚠️ DO NOT PUBLISH"}

*Comment/Details*:
${reportData.recommendation.notes || "No notes provided."}

---

*Generated by PrintEase Desktop Release Builder Helper.*
`;

    fs.writeFileSync(reportPath, mdReport, "utf8");
    logToRenderer("info", `Release report successfully generated at: ${path.relative(repoRoot, reportPath)}\n`);
    return { success: true, path: reportPath, filename: reportFilename };
  } catch (err) {
    logToRenderer("error", `Failed to generate release report: ${err.message}\n`);
    return { success: false, error: err.message };
  }
});
