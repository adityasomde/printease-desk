// PrintEase Desktop Release Builder - Renderer Process

// State Variables
let metadata = {
  gitSha: "N/A",
  version: "0.0.0",
  platform: "linux",
};

let currentReleaseMode = "linux-only"; // "linux-only", "windows-only", "dual"

// Tracks state of each running command
const commandStates = {
  clean: "pending",
  "build-frontend": "pending",
  "sync-frontend": "pending",
  "verify-html": "pending",
  "build-linux-unpacked": "pending",
  "verify-linux-package": "pending",
  "launch-linux-unpacked": "pending",
  "build-windows-unpacked": "pending",
  "verify-windows-package": "pending",
  "build-linux-dist": "pending",
  "build-windows-dist": "pending",
};

// Automated Safety Gate flags
const safetyGates = {
  frontendBuild: false,
  frontendAssetsExist: false,
  frontendHtmlRelative: false,

  // Linux unpacked checks
  linuxBuilt: false,
  linuxIpcSecurity: false,
  linuxUrlValidator: false,
  linuxPrintersIncluded: false,
  linuxWinExcluded: false,
  linuxCliVerifyPassed: false,

  // Windows unpacked checks
  winBuilt: false,
  winIpcSecurity: false,
  winUrlValidator: false,
  winPrintersIncluded: false,
  winLinuxExcluded: false,
  winCliVerifyPassed: false,
};

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Fetch Git and Version metadata
  try {
    metadata = await window.releaseBuilder.getGitAndVersionInfo();
    document.getElementById("meta-version").innerText = metadata.version;
    document.getElementById("meta-commit").innerText = metadata.gitSha.substring(0, 8);
    document.getElementById("meta-platform").innerText = metadata.platform;
  } catch (err) {
    appendLog("error", `Failed to retrieve system metadata: ${err.message}`);
  }

  // 2. Setup listeners for Logs and Process State updates
  window.releaseBuilder.onLog(({ type, data }) => {
    appendLog(type, data);
  });

  window.releaseBuilder.onCommandState(({ commandKey, status, exitCode }) => {
    updateCommandUIState(commandKey, status, exitCode);
  });

  // Set initial Release Mode view
  updateStepsPlatformView();

  // Run initial diagnostic check if built folders already exist
  runDiagnosticsCheck();
});

// Update DOM view based on target release platform mode
function updateStepsPlatformView() {
  const linuxStepIds = ["step-build-linux-unpacked", "step-verify-linux-package", "step-launch-linux-unpacked", "step-build-linux-dist"];
  const winStepIds = ["step-build-windows-unpacked", "step-verify-windows-package", "step-build-windows-dist"];

  const linuxBtnIds = ["btn-build-linux-unpacked", "btn-verify-linux-package", "btn-launch-linux-unpacked", "btn-build-linux-dist"];
  const winBtnIds = ["btn-build-windows-unpacked", "btn-verify-windows-package", "btn-build-windows-dist"];

  // Update step label texts dynamically
  const launchStepTitle = document.querySelector("#step-launch-linux-unpacked .step-num-title");
  const launchStepDesc = document.querySelector("#step-launch-linux-unpacked .step-desc");

  if (currentReleaseMode === "linux-only") {
    // Fade windows
    winStepIds.forEach(id => { document.getElementById(id).style.opacity = "0.4"; });
    linuxStepIds.forEach(id => { document.getElementById(id).style.opacity = "1.0"; });

    winBtnIds.forEach(id => { document.getElementById(id).disabled = true; });
    // Restore linux actions
    document.getElementById("btn-build-linux-unpacked").disabled = false;
    document.getElementById("btn-verify-linux-package").disabled = false;
    document.getElementById("btn-launch-linux-unpacked").disabled = false;

    if (launchStepTitle) launchStepTitle.innerText = "7. Launch Linux Unpacked Application (Debug Mode)";
    if (launchStepDesc) launchStepDesc.innerText = "Opens app locally with PE_DEBUG_RENDERER=1 for manual validation";

  } else if (currentReleaseMode === "windows-only") {
    // Fade linux
    linuxStepIds.forEach(id => { document.getElementById(id).style.opacity = "0.4"; });
    winStepIds.forEach(id => { document.getElementById(id).style.opacity = "1.0"; });

    linuxBtnIds.forEach(id => { document.getElementById(id).disabled = true; });
    // Restore windows actions
    document.getElementById("btn-build-windows-unpacked").disabled = false;
    document.getElementById("btn-verify-windows-package").disabled = false;

    if (launchStepTitle) launchStepTitle.innerText = "7. Launch Windows Unpacked Application (Skipped)";
    if (launchStepDesc) launchStepDesc.innerText = "Not relevant for Windows-only target platform release";

  } else {
    // Dual mode - restore all opacities
    linuxStepIds.forEach(id => { document.getElementById(id).style.opacity = "1.0"; });
    winStepIds.forEach(id => { document.getElementById(id).style.opacity = "1.0"; });

    // Enable/restore unpacked buttons
    document.getElementById("btn-build-linux-unpacked").disabled = false;
    document.getElementById("btn-verify-linux-package").disabled = false;
    document.getElementById("btn-launch-linux-unpacked").disabled = false;
    document.getElementById("btn-build-windows-unpacked").disabled = false;
    document.getElementById("btn-verify-windows-package").disabled = false;

    if (launchStepTitle) launchStepTitle.innerText = "7. Launch Linux Unpacked Application (Debug Mode)";
    if (launchStepDesc) launchStepDesc.innerText = "Opens app locally with PE_DEBUG_RENDERER=1 for manual validation";
  }
}

// Global change handler linked to index.html radio buttons
window.changeReleaseMode = function(mode) {
  currentReleaseMode = mode;
  appendLog("info", `[SYSTEM] Target Release Mode changed to: ${mode.toUpperCase()}`);
  
  // Hide Wine warnings when switching modes
  document.getElementById("wine-warning-banner").style.display = "none";

  updateStepsPlatformView();
  evaluateInteractiveGates();
};

// Logs Helper
function appendLog(type, text) {
  const consoleEl = document.getElementById("log-console");
  if (!consoleEl) return;

  const lines = text.split("\n");
  for (const line of lines) {
    if (line.trim() === "" && lines.length > 1) continue;

    const div = document.createElement("div");
    div.className = "terminal-line";

    let cssClass = "line-stdout";
    if (type === "info") cssClass = "line-info";
    else if (type === "warning") cssClass = "line-warning";
    else if (type === "error") cssClass = "line-error";
    else if (type === "stderr") cssClass = "line-stderr";

    div.classList.add(cssClass);
    div.innerText = line;
    consoleEl.appendChild(div);
  }

  // Auto scroll
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function clearLogs() {
  const consoleEl = document.getElementById("log-console");
  if (consoleEl) {
    consoleEl.innerHTML = `<div class="terminal-line line-info">[SYSTEM] Logs cleared.</div>`;
  }
}

function copyLogs() {
  const consoleEl = document.getElementById("log-console");
  if (consoleEl) {
    navigator.clipboard.writeText(consoleEl.innerText)
      .then(() => alert("Logs copied to clipboard!"))
      .catch(err => alert("Failed to copy logs: " + err));
  }
}

// UI State Updates
function updateCommandUIState(commandKey, status, exitCode) {
  commandStates[commandKey] = status;

  const badgeEl = document.getElementById(`status-${commandKey}`);
  if (badgeEl) {
    badgeEl.className = "badge";
    if (status === "running") {
      badgeEl.classList.add("badge-running");
      badgeEl.innerText = "Running";
    } else if (status === "success") {
      badgeEl.classList.add("badge-success");
      badgeEl.innerText = "Success";
    } else if (status === "failed") {
      badgeEl.classList.add("badge-failed");
      badgeEl.innerText = `Failed (${exitCode})`;
    } else {
      badgeEl.classList.add("badge-pending");
      badgeEl.innerText = "Pending";
    }
  }

  // Update logic triggers based on completions
  if (commandKey === "build-frontend") {
    safetyGates.frontendBuild = (status === "success");
    runDiagnosticsCheck();
  }

  if (commandKey === "verify-linux-package") {
    safetyGates.linuxCliVerifyPassed = (status === "success");
    runDiagnosticsCheck();
  }

  if (commandKey === "verify-windows-package") {
    safetyGates.winCliVerifyPassed = (status === "success");
    runDiagnosticsCheck();
  }

  if (commandKey === "launch-linux-unpacked") {
    if (status === "running" || status === "success") {
      document.getElementById("chk-manually-launched").checked = true;
      validateChecklist();
    }
  }

  if (commandKey === "build-windows-unpacked" && status === "failed") {
    if (metadata.platform === "linux") {
      document.getElementById("wine-warning-banner").style.display = "flex";
    }
  }

  // Handle flow gating: disable next commands if previous failed
  evaluateInteractiveGates();
}

function resetAllStatuses() {
  for (const key of Object.keys(commandStates)) {
    commandStates[key] = "pending";
    const badgeEl = document.getElementById(`status-${key}`);
    if (badgeEl) {
      badgeEl.className = "badge badge-pending";
      badgeEl.innerText = "Pending";
    }
  }
  // Clear checklists
  const checkboxes = ["chk-manually-launched", "chk-ui-opened", "chk-dashboard-loaded", "chk-printer-page", "chk-no-blank", "chk-logs-clean"];
  for (const chk of checkboxes) {
    document.getElementById(chk).checked = false;
  }
  validateChecklist();
  appendLog("info", "[SYSTEM] Stored execution states reset.");
}

// Run electron main process commands
async function triggerCommand(commandKey) {
  appendLog("info", `[SYSTEM] Triggering action: ${commandKey}...`);
  try {
    const initiated = await window.releaseBuilder.runCommand(commandKey);
    if (!initiated) {
      appendLog("error", `[SYSTEM] Could not start ${commandKey}. Make sure no other process is running.`);
    }
  } catch (err) {
    appendLog("error", `[SYSTEM] Error executing ${commandKey}: ${err.message}`);
  }
}

// Custom step 4 Paths verification triggers
async function runHtmlVerification() {
  updateCommandUIState("verify-html", "running");
  appendLog("info", "[SYSTEM] Verifying frontend-dist/index.html assets pathings...");

  try {
    const diag = await window.releaseBuilder.runDiagnostics();
    
    // Update local gate flags
    safetyGates.frontendHtmlRelative = diag.frontendHtmlRelative;
    safetyGates.frontendAssetsExist = diag.frontendAssetsExist;

    const success = diag.frontendHtmlRelative && diag.frontendAssetsExist;
    updateCommandUIState("verify-html", success ? "success" : "failed", success ? 0 : 1);

    if (success) {
      appendLog("info", "[PASS] HTML asset paths are relative and assets directory is populated.");
    } else {
      appendLog("error", `[FAIL] HTML verification failed. ${diag.frontendHtmlDetails} | ${diag.frontendAssetsDetails}`);
    }

    updateGatesUI(diag);
    evaluateInteractiveGates();
  } catch (err) {
    appendLog("error", `[SYSTEM] Error running HTML verification: ${err.message}`);
    updateCommandUIState("verify-html", "failed", -1);
  }
}

// Custom step 6 & 9 packaging verification triggers
async function triggerVerifyPlatform(platform) {
  const commandKey = platform === "linux" ? "verify-linux-package" : "verify-windows-package";
  updateCommandUIState(commandKey, "running");
  appendLog("info", `[SYSTEM] Verifying packaging files for ${platform}...`);

  try {
    // 1. Run the electron-builder verification script process
    const verifiedCli = await window.releaseBuilder.runCommand(commandKey);
    if (!verifiedCli) {
      appendLog("error", `[SYSTEM] CLI verification process failed to spawn.`);
      updateCommandUIState(commandKey, "failed", -1);
      return;
    }

    // Note: The CLI command progress is streamed. Once closed, updating gate is triggered in updateCommandUIState callback.
    // For local package diagnostics checks, we run them in parallel
    setTimeout(async () => {
      await runDiagnosticsCheck();
    }, 1500); // Small delay to let check start

  } catch (err) {
    appendLog("error", `[SYSTEM] Error verifying ${platform} package: ${err.message}`);
    updateCommandUIState(commandKey, "failed", -1);
  }
}

// Run full diagnostics check & update UI gates list
async function runDiagnosticsCheck() {
  try {
    const diag = await window.releaseBuilder.runDiagnostics();

    // Map diagnostics outputs to safetyGates state
    safetyGates.frontendHtmlRelative = diag.frontendHtmlRelative;
    safetyGates.frontendAssetsExist = diag.frontendAssetsExist;

    // Linux unpacked
    safetyGates.linuxBuilt = diag.linuxPackage.built;
    safetyGates.linuxIpcSecurity = diag.linuxPackage.ipcSecurityExists;
    safetyGates.linuxUrlValidator = diag.linuxPackage.urlValidatorExists;
    safetyGates.linuxPrintersIncluded = diag.linuxPackage.printerLinuxExists;
    safetyGates.linuxWinExcluded = diag.linuxPackage.printerWinExcluded;

    // Windows unpacked
    safetyGates.winBuilt = diag.windowsPackage.built;
    safetyGates.winIpcSecurity = diag.windowsPackage.ipcSecurityExists;
    safetyGates.winUrlValidator = diag.windowsPackage.urlValidatorExists;
    safetyGates.winPrintersIncluded = diag.windowsPackage.printerWinExists;
    safetyGates.winLinuxExcluded = diag.windowsPackage.printerLinuxExcluded;

    updateGatesUI(diag);
    evaluateInteractiveGates();
  } catch (err) {
    console.error("Diagnostics check failed", err);
  }
}

// Update the visual status of safety gates
function updateGatesUI(diag) {
  const setGateBadge = (gateId, passed, label = "") => {
    const el = document.getElementById(gateId);
    if (el) {
      el.innerHTML = passed 
        ? `<span class="gate-pass">✓ PASS ${label}</span>`
        : `<span class="gate-fail">✕ FAILED ${label}</span>`;
    }
  };

  setGateBadge("gate-frontend-build", safetyGates.frontendBuild);
  setGateBadge("gate-frontend-assets-exist", safetyGates.frontendAssetsExist);
  setGateBadge("gate-frontend-html-relative", safetyGates.frontendHtmlRelative);

  // Linux gates
  setGateBadge("gate-linux-ipc-security", !safetyGates.linuxBuilt ? false : safetyGates.linuxIpcSecurity, !safetyGates.linuxBuilt ? "(UNBUILT)" : "");
  setGateBadge("gate-linux-url-validator", !safetyGates.linuxBuilt ? false : safetyGates.linuxUrlValidator, !safetyGates.linuxBuilt ? "(UNBUILT)" : "");
  setGateBadge("gate-linux-printers-included", !safetyGates.linuxBuilt ? false : safetyGates.linuxPrintersIncluded, !safetyGates.linuxBuilt ? "(UNBUILT)" : "");
  setGateBadge("gate-linux-win-excluded", !safetyGates.linuxBuilt ? false : safetyGates.linuxWinExcluded, !safetyGates.linuxBuilt ? "(UNBUILT)" : "");

  // Windows gates
  setGateBadge("gate-win-ipc-security", !safetyGates.winBuilt ? false : safetyGates.winIpcSecurity, !safetyGates.winBuilt ? "(UNBUILT)" : "");
  setGateBadge("gate-win-url-validator", !safetyGates.winBuilt ? false : safetyGates.winUrlValidator, !safetyGates.winBuilt ? "(UNBUILT)" : "");
  setGateBadge("gate-win-printers-included", !safetyGates.winBuilt ? false : safetyGates.winPrintersIncluded, !safetyGates.winBuilt ? "(UNBUILT)" : "");
  setGateBadge("gate-win-linux-excluded", !safetyGates.winBuilt ? false : safetyGates.winLinuxExcluded, !safetyGates.winBuilt ? "(UNBUILT)" : "");

  const cliPassed = (safetyGates.linuxBuilt && safetyGates.linuxCliVerifyPassed) || (safetyGates.winBuilt && safetyGates.winCliVerifyPassed);
  setGateBadge("gate-cli-verification", cliPassed);
}

// Logic flow validation - enabling/disabling installer buttons
function evaluateInteractiveGates() {
  const linuxReady = 
    safetyGates.frontendBuild &&
    safetyGates.frontendHtmlRelative &&
    safetyGates.frontendAssetsExist &&
    safetyGates.linuxBuilt &&
    safetyGates.linuxIpcSecurity &&
    safetyGates.linuxUrlValidator &&
    safetyGates.linuxPrintersIncluded &&
    safetyGates.linuxWinExcluded &&
    commandStates["verify-linux-package"] === "success";

  document.getElementById("btn-build-linux-dist").disabled = (currentReleaseMode === "windows-only" || !linuxReady);

  const windowsReady = 
    safetyGates.frontendBuild &&
    safetyGates.frontendHtmlRelative &&
    safetyGates.frontendAssetsExist &&
    safetyGates.winBuilt &&
    safetyGates.winIpcSecurity &&
    safetyGates.winUrlValidator &&
    safetyGates.winPrintersIncluded &&
    safetyGates.winLinuxExcluded &&
    commandStates["verify-windows-package"] === "success";

  document.getElementById("btn-build-windows-dist").disabled = (currentReleaseMode === "linux-only" || !windowsReady);

  validateChecklist();
}

// Manual checkboxes and Publish Sign-off status
function validateChecklist() {
  const checklist = {
    manuallyLaunched: document.getElementById("chk-manually-launched").checked,
    uiOpened: document.getElementById("chk-ui-opened").checked,
    dashboardLoaded: document.getElementById("chk-dashboard-loaded").checked,
    printerPageOpened: document.getElementById("chk-printer-page").checked,
    noBlankScreen: document.getElementById("chk-no-blank").checked,
    logsClean: document.getElementById("chk-logs-clean").checked,
  };

  const allChecked = Object.values(checklist).every(val => val === true);
  
  const linuxReady = 
    safetyGates.frontendBuild &&
    safetyGates.frontendHtmlRelative &&
    safetyGates.frontendAssetsExist &&
    safetyGates.linuxBuilt &&
    safetyGates.linuxIpcSecurity &&
    safetyGates.linuxUrlValidator &&
    safetyGates.linuxPrintersIncluded &&
    safetyGates.linuxWinExcluded &&
    commandStates["verify-linux-package"] === "success";

  const windowsReady = 
    safetyGates.frontendBuild &&
    safetyGates.frontendHtmlRelative &&
    safetyGates.frontendAssetsExist &&
    safetyGates.winBuilt &&
    safetyGates.winIpcSecurity &&
    safetyGates.winUrlValidator &&
    safetyGates.winPrintersIncluded &&
    safetyGates.winLinuxExcluded &&
    commandStates["verify-windows-package"] === "success";

  let targetPassed = false;
  let missingTargetLabel = "";

  if (currentReleaseMode === "linux-only") {
    targetPassed = linuxReady;
    missingTargetLabel = "Linux package verification pending or failed.";
  } else if (currentReleaseMode === "windows-only") {
    targetPassed = windowsReady;
    missingTargetLabel = "Windows package verification pending or failed.";
  } else {
    targetPassed = linuxReady && windowsReady;
    missingTargetLabel = "Linux and/or Windows package verification pending or failed.";
  }

  const readyToPublish = allChecked && targetPassed;

  const statusBox = document.getElementById("publish-status-box");
  const statusText = document.getElementById("publish-status-text");
  const reportBtn = document.getElementById("btn-generate-report");

  if (readyToPublish) {
    statusBox.className = "status-alert alert-success";
    statusText.innerText = `🚀 READY TO PUBLISH: All automated safety checks & manual verification items passed successfully for release mode: ${currentReleaseMode.toUpperCase()}.`;
    reportBtn.disabled = false;
  } else {
    statusBox.className = "status-alert";
    
    let pendingMsg = "NOT SIGNED OFF: ";
    if (!targetPassed) {
      pendingMsg += `${missingTargetLabel} `;
    }
    if (!allChecked) {
      pendingMsg += "Manual launch validation checklists pending.";
    }
    statusText.innerText = pendingMsg;
    reportBtn.disabled = true;
  }
}

// Generate the final Markdown Report
async function generateReport() {
  appendLog("info", "[SYSTEM] Generating final release checklist report...");

  const linuxReady = 
    safetyGates.frontendBuild &&
    safetyGates.frontendHtmlRelative &&
    safetyGates.frontendAssetsExist &&
    safetyGates.linuxBuilt &&
    safetyGates.linuxIpcSecurity &&
    safetyGates.linuxUrlValidator &&
    safetyGates.linuxPrintersIncluded &&
    safetyGates.linuxWinExcluded &&
    commandStates["verify-linux-package"] === "success";

  const windowsReady = 
    safetyGates.frontendBuild &&
    safetyGates.frontendHtmlRelative &&
    safetyGates.frontendAssetsExist &&
    safetyGates.winBuilt &&
    safetyGates.winIpcSecurity &&
    safetyGates.winUrlValidator &&
    safetyGates.winPrintersIncluded &&
    safetyGates.winLinuxExcluded &&
    commandStates["verify-windows-package"] === "success";

  const reportData = {
    version: metadata.version,
    gitSha: metadata.gitSha,
    releaseMode: currentReleaseMode,
    linuxReady: linuxReady ? "YES" : "NO",
    windowsReady: windowsReady ? "YES" : "NO",
    gates: {
      frontendBuild: safetyGates.frontendBuild,
      frontendAssetsExist: safetyGates.frontendAssetsExist,
      frontendHtmlRelative: safetyGates.frontendHtmlRelative,
      linuxIpcSecurity: safetyGates.linuxIpcSecurity,
      linuxUrlValidator: safetyGates.linuxUrlValidator,
      linuxPrintersIncluded: safetyGates.linuxPrintersIncluded,
      linuxWinExcluded: safetyGates.linuxWinExcluded,
      winIpcSecurity: safetyGates.winIpcSecurity,
      winUrlValidator: safetyGates.winUrlValidator,
      winPrintersIncluded: safetyGates.winPrintersIncluded,
      winLinuxExcluded: safetyGates.winLinuxExcluded,
      cliVerificationPassed: commandStates["verify-linux-package"] === "success" || commandStates["verify-windows-package"] === "success",
    },
    checklist: {
      manuallyLaunched: document.getElementById("chk-manually-launched").checked,
      uiOpened: document.getElementById("chk-ui-opened").checked,
      dashboardLoaded: document.getElementById("chk-dashboard-loaded").checked,
      printerPageOpened: document.getElementById("chk-printer-page").checked,
      noBlankScreen: document.getElementById("chk-no-blank").checked,
      logsClean: document.getElementById("chk-logs-clean").checked,
    },
    recommendation: {
      publish: true,
      notes: document.getElementById("report-notes").value,
    }
  };

  try {
    const result = await window.releaseBuilder.saveReleaseReport(reportData);
    if (result.success) {
      appendLog("info", `[SYSTEM] Release checklist report successfully created: ${result.filename}`);
      alert(`Report generated successfully!\nSaved to: ${result.path}`);
    } else {
      appendLog("error", `[SYSTEM] Failed to write release report: ${result.error}`);
      alert("Failed to write report: " + result.error);
    }
  } catch (err) {
    appendLog("error", `[SYSTEM] Error calling save report handler: ${err.message}`);
  }
}

// Helpers
async function openReleaseDirectory() {
  try {
    await window.releaseBuilder.openDirectory("release");
  } catch (err) {
    console.error(err);
  }
}
