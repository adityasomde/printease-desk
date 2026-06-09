import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { preparePdfForPrinting } from "../pdfPrintPreparation.js";

const require = createRequire(import.meta.url);
const { app } = require("electron");

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 30000;
const WINDOWS_HELPER_MISSING_MESSAGE = "Windows PDF print helper is missing. Reinstall PrintEase Desktop or contact support.";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Note: windowsPrinter.js has been moved to printer/windows/windowsPrinter.js, 
// so the root of desktop-shell is now "../../" instead of ".."
const DESKTOP_SHELL_ROOT = path.resolve(__dirname, "..", "..");

function isWin() {
  return process.platform === "win32";
}

function helpCommands() {
  return [
    "PowerShell: Get-Printer | Select Name,Default,PrinterStatus",
    "Expected packaged helper: resources/vendor/win/SumatraPDF.exe",
  ];
}

function getPackagedSumatraPdfPath() {
  return process.resourcesPath
    ? path.join(process.resourcesPath, "vendor", "win", "SumatraPDF.exe")
    : "";
}

function getDevSumatraPdfPath() {
  return path.join(DESKTOP_SHELL_ROOT, "vendor", "win", "SumatraPDF.exe");
}

export function getSumatraPdfPath() {
  if (process.env.PRINTEASE_SUMATRA_PATH) return process.env.PRINTEASE_SUMATRA_PATH;
  return app?.isPackaged ? getPackagedSumatraPdfPath() : getDevSumatraPdfPath();
}

export function diagnoseWindowsPrintHelper() {
  const expectedSumatraPath = getSumatraPdfPath();

  try {
    const exists = Boolean(expectedSumatraPath && fs.existsSync(expectedSumatraPath));
    const stat = exists ? fs.statSync(expectedSumatraPath) : null;

    return {
      success: exists,
      platform: process.platform,
      isPackaged: Boolean(app?.isPackaged),
      resourcesPath: process.resourcesPath || "",
      expectedSumatraPath,
      exists,
      sizeBytes: stat?.size || 0,
      message: exists
        ? "Windows print helper found."
        : "Windows print helper is missing from expected path.",
    };
  } catch (error) {
    return {
      success: false,
      platform: process.platform,
      isPackaged: Boolean(app?.isPackaged),
      resourcesPath: process.resourcesPath || "",
      expectedSumatraPath,
      exists: false,
      sizeBytes: 0,
      error: error.message || "Could not inspect Windows print helper.",
    };
  }
}

async function runPowerShell(command) {
  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 }
  );

  return {
    stdout: String(stdout || ""),
    stderr: String(stderr || ""),
  };
}

function normalizeStatus(value) {
  if (value === undefined || value === null || value === "") return "unknown";
  return String(value);
}

function normalizePrinter(printer) {
  const name = printer.Name || printer.name || printer.PrinterName || printer.printerName || "";

  return {
    printerName: name,
    displayName: name,
    systemPrinterId: name,
    isDefault: Boolean(printer.Default || printer.default || printer.IsDefault),
    status: normalizeStatus(printer.PrinterStatus || printer.Status || printer.status),
    condition: normalizeStatus(printer.PrinterStatus || printer.Status || printer.status),
    accepting: true,
    driverName: printer.DriverName || printer.driverName || "",
    portName: printer.PortName || printer.portName || "",
    platform: "win32",
    lastCheckedAt: new Date().toISOString(),
  };
}

export async function listPrinters() {
  if (!isWin()) {
    return {
      success: false,
      printers: [],
      error: "Windows printer listing is only available on Windows.",
      helpCommands: [],
    };
  }

  try {
    const command = "Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Default | ConvertTo-Json -Depth 3";
    const { stdout } = await runPowerShell(command);
    const text = stdout.trim();

    if (!text) {
      return {
        success: true,
        printers: [],
        message: "No Windows printers found.",
        helpCommands: helpCommands(),
      };
    }

    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const printers = rows.map(normalizePrinter).filter((printer) => printer.printerName);

    return {
      success: true,
      printers,
      defaultPrinter: printers.find((printer) => printer.isDefault)?.printerName || "",
      message: `Detected ${printers.length} Windows printer${printers.length === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return {
      success: false,
      printers: [],
      error: "Could not list Windows printers.",
      detail: error.message || String(error),
      helpCommands: helpCommands(),
    };
  }
}

export async function diagnosePrinters() {
  if (!isWin()) {
    return {
      success: false,
      error: "Windows diagnostics are only available on Windows.",
      helpCommands: [],
    };
  }

  const printerResult = await listPrinters();
  const helperDiagnostics = diagnoseWindowsPrintHelper();
  const sumatra = helperDiagnostics.exists ? helperDiagnostics.expectedSumatraPath : "";

  return {
    success: Boolean(printerResult.success && printerResult.printers?.length && sumatra),
    platform: "win32",
    path: process.env.PATH || "",
    printerResult,
    sumatraPath: sumatra || "",
    helperDiagnostics,
    checks: {
      powershell: printerResult.success,
      printersFound: Boolean(printerResult.printers?.length),
      sumatraFound: Boolean(sumatra),
    },
    error: !sumatra ? WINDOWS_HELPER_MISSING_MESSAGE : printerResult.error || "",
    helpCommands: helpCommands(),
  };
}

export function findSumatraPdf() {
  const candidate = getSumatraPdfPath();
  try {
    return candidate && fs.existsSync(candidate) ? candidate : "";
  } catch {
    return "";
  }
}

function validatePdf(filePath) {
  if (!filePath || typeof filePath !== "string") throw new Error("Missing PDF path.");
  if (!fs.existsSync(filePath)) throw new Error(`PDF file not found: ${filePath}`);
  if (path.extname(filePath).toLowerCase() !== ".pdf") {
    throw new Error("Windows printing supports PDF files only.");
  }
}

function buildPrintSettings(options = {}, profile = {}) {
  const settings = [];
  const printOptions = options.printOptions || {};

  const copies = Number(options.copies || printOptions.copies || 1);
  if (copies > 1) settings.push(`${copies}x`);

  const pages = options.pages?.range || options.selectedPages || printOptions.pages?.range;
  if (pages && String(pages).toLowerCase() !== "all") settings.push(String(pages));

  const colorMode = options.colorMode || printOptions.colorMode;
  if (colorMode === "color") settings.push("color");
  if (colorMode === "black_white" || colorMode === "monochrome") settings.push("monochrome");

  const sideType = printOptions.sideType || options.sides || printOptions.sides;
  let duplexBinding = printOptions.duplexBinding || 'auto';
  let orientation = options.orientation || printOptions.orientation || 'auto';

  if (orientation === 'auto') {
    orientation = profile.defaultOrientation || 'portrait';
  }

  if (sideType === 'single' || sideType === 'one_sided') {
    settings.push("simplex");
  } else if (sideType === 'double' || sideType === 'two_sided') {
    if (duplexBinding === 'auto') {
      if (orientation === 'landscape') {
        duplexBinding = profile.landscapeDuplexBinding || profile.defaultDuplexBinding || 'short-edge';
      } else {
        duplexBinding = profile.defaultDuplexBinding || 'long-edge';
      }
    }
    
    if (duplexBinding === "long-edge" || sideType === "two_sided_long_edge") {
      settings.push("duplexlong");
    } else if (duplexBinding === "short-edge" || sideType === "two_sided_short_edge") {
      settings.push("duplexshort");
    }
  }

  const paperSize = options.paperSize || printOptions.paperSize;
  if (paperSize) settings.push(`paper=${String(paperSize).toUpperCase()}`);

  const scaleMode = printOptions.scaleMode || profile.scaleMode || 'fit-to-page';
  if (scaleMode === 'fit-to-page' || scaleMode === 'shrink-to-fit') settings.push("shrink");
  else if (scaleMode === 'actual-size') settings.push("noscale");

  if (!settings.some(s => s === "shrink" || s === "noscale")) settings.push("noscale");

  return settings.join(",");
}

async function getValidatedPrinter(printerName) {
  const result = await listPrinters();
  if (!result.success) throw new Error(result.error || "Could not list printers.");

  const printers = result.printers || [];
  if (!printers.length) throw new Error("No Windows printers found.");

  const selected = printerName
    ? printers.find((printer) => printer.printerName === printerName || printer.displayName === printerName)
    : printers.find((printer) => printer.isDefault) || printers[0];

  if (!selected) throw new Error(`Printer not found: ${printerName}`);

  return selected;
}

export async function printPdfFile({ filePath, printerName, options = {} } = {}) {
  if (!isWin()) {
    return {
      success: false,
      error: "Windows PDF printing is only available on Windows.",
    };
  }

  try {
    validatePdf(filePath);
    const printer = await getValidatedPrinter(printerName);
    const helperDiagnostics = diagnoseWindowsPrintHelper();
    const sumatra = helperDiagnostics.exists ? helperDiagnostics.expectedSumatraPath : "";

    if (!sumatra) {
      return {
        success: false,
        code: "SUMATRA_MISSING",
        error: WINDOWS_HELPER_MISSING_MESSAGE,
        message: WINDOWS_HELPER_MISSING_MESSAGE,
        reasonCode: "WINDOWS_PDF_ENGINE_NOT_FOUND",
        diagnostics: helperDiagnostics,
        helpCommands: helpCommands(),
      };
    }

    const profiles = options.printerProfiles || [];
    const profile = profiles.find(p => p.osPlatform === 'win32') || options.printerProfile || {};
    const printOptions = options.printOptions || {};

    let activeFilePath = filePath;
    let cleanupPdf = () => {};
    try {
      const prep = await preparePdfForPrinting(filePath, printOptions, profile);
      if (prep.tempFilePath) {
        activeFilePath = prep.tempFilePath;
        cleanupPdf = prep.cleanup;
      }
    } catch (prepError) {
      console.error("[WINDOWS] PDF Prep failed:", prepError);
    }

    const settings = buildPrintSettings(options, profile);
    const args = [
      "-silent",
      "-print-to",
      printer.printerName,
      "-print-settings",
      settings,
      activeFilePath,
    ];

    console.log(`[WINDOWS] Executing: SumatraPDF ${args.join(' ')}`);

    let stdout = "";
    let stderr = "";
    try {
      const result = await execFileAsync(sumatra, args, {
        timeout: DEFAULT_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } finally {
      cleanupPdf();
    }

    return {
      success: true,
      message: `Sent PDF to ${printer.displayName || printer.printerName}.`,
      printerName: printer.printerName,
      settings,
      stdout: String(stdout || ""),
      stderr: String(stderr || ""),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || "Windows print failed.",
      reasonCode: "WINDOWS_PRINT_FAILED",
      helpCommands: helpCommands(),
    };
  }
}

export function printFile({ filePath, printerName, copies = 1, options = {} } = {}) {
  return printPdfFile({
    filePath,
    printerName,
    options: {
      ...options,
      copies,
    },
  });
}

export async function testPrint(payload = {}) {
  const printerName = typeof payload === "string" ? payload : payload?.printerName;
  const options = typeof payload === "object" && payload ? payload.options || {} : {};
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "printease-win-test-"));
  const filePath = path.join(tempDir, "test-print.pdf");

  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 70>>stream
BT /F1 24 Tf 72 760 Td (PrintEase Windows Test Print) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000238 00000 n 
0000000358 00000 n 
trailer<</Root 1 0 R/Size 6>>
startxref
428
%%EOF`;

  try {
    fs.writeFileSync(filePath, pdf, "utf8");
    return await printPdfFile({ filePath, printerName, options });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function stopPrinting() {
  try {
    await execFileAsync("taskkill", ["/IM", "SumatraPDF.exe", "/T", "/F"], {
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    return {
      success: true,
      message: "Stopped active SumatraPDF print helper. Jobs already accepted by Windows may still need cancelling from the printer queue.",
    };
  } catch (error) {
    const stderr = String(error.stderr || error.message || "");
    const noProcess = stderr.toLowerCase().includes("not found") || stderr.toLowerCase().includes("not running");

    if (noProcess) {
      return {
        success: true,
        message: "No active SumatraPDF print helper was running.",
      };
    }

    return {
      success: false,
      message: error.message || "Could not stop Windows print helper.",
      reasonCode: "WINDOWS_STOP_PRINTING_FAILED",
    };
  }
}
