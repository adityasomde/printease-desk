import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 30000;
const WINDOWS_HELPER_MISSING_MESSAGE = "Windows PDF print helper is missing. Reinstall PrintEase Desktop or contact support.";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_SHELL_ROOT = path.resolve(__dirname, "..");

function isWin() {
  return process.platform === "win32";
}

function helpCommands() {
  return [
    "PowerShell: Get-Printer | Select Name,Default,PrinterStatus",
    "Expected helper: desktop-shell/vendor/win/SumatraPDF.exe",
  ];
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
  const sumatra = findSumatraPdf();

  return {
    success: Boolean(printerResult.success && printerResult.printers?.length && sumatra),
    platform: "win32",
    path: process.env.PATH || "",
    printerResult,
    sumatraPath: sumatra || "",
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
  const candidates = [
    process.env.PRINTEASE_SUMATRA_PATH,
    path.join(DESKTOP_SHELL_ROOT, "vendor", "win", "SumatraPDF.exe"),
    process.resourcesPath ? path.join(process.resourcesPath, "vendor", "win", "SumatraPDF.exe") : "",
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) || "";
}

function validatePdf(filePath) {
  if (!filePath || typeof filePath !== "string") throw new Error("Missing PDF path.");
  if (!fs.existsSync(filePath)) throw new Error(`PDF file not found: ${filePath}`);
  if (path.extname(filePath).toLowerCase() !== ".pdf") {
    throw new Error("Windows printing supports PDF files only.");
  }
}

function buildPrintSettings(options = {}) {
  const settings = [];

  const copies = Number(options.copies || options.printOptions?.copies || 1);
  if (copies > 1) settings.push(`${copies}x`);

  const pages = options.pages?.range || options.selectedPages || options.printOptions?.pages?.range;
  if (pages && String(pages).toLowerCase() !== "all") settings.push(String(pages));

  const colorMode = options.colorMode || options.printOptions?.colorMode;
  if (colorMode === "color") settings.push("color");
  if (colorMode === "black_white" || colorMode === "monochrome") settings.push("monochrome");

  const sides = options.sides || options.printOptions?.sides;
  if (sides === "two_sided_long_edge") settings.push("duplexlong");
  else if (sides === "two_sided_short_edge") settings.push("duplexshort");
  else settings.push("simplex");

  const paperSize = options.paperSize || options.printOptions?.paperSize;
  if (paperSize) settings.push(`paper=${String(paperSize).toUpperCase()}`);

  if (!settings.length) settings.push("noscale");
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
    const sumatra = findSumatraPdf();

    if (!sumatra) {
      return {
        success: false,
        error: WINDOWS_HELPER_MISSING_MESSAGE,
        message: WINDOWS_HELPER_MISSING_MESSAGE,
        reasonCode: "WINDOWS_PDF_ENGINE_NOT_FOUND",
        helpCommands: helpCommands(),
      };
    }

    const settings = buildPrintSettings(options);
    const args = [
      "-silent",
      "-print-to",
      printer.printerName,
      "-print-settings",
      settings,
      filePath,
    ];

    const { stdout, stderr } = await execFileAsync(sumatra, args, {
      timeout: DEFAULT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

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
  return {
    success: true,
    message: "Windows print jobs are submitted to the OS print queue. Cancel jobs from Windows Settings > Printers & scanners.",
  };
}
