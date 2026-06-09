import { execFile } from "node:child_process";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { preparePdfForPrinting } from "../pdfPrintPreparation.js";

const execFileAsync = promisify(execFile);

const LPSTAT_NOT_FOUND = "CUPS/lpstat not found. Install cups and cups-client.";
const HELP_COMMANDS = [
  "sudo apt update",
  "sudo apt install cups cups-client printer-driver-cups-pdf",
  "sudo systemctl enable cups",
  "sudo systemctl start cups",
  "lpstat -p",
];

async function runCommand(command, args) {
  try {
    return await execFileAsync(command, args, {
      shell: false,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      const notFound = new Error(command === "lpstat" ? LPSTAT_NOT_FOUND : `${command} not found.`);
      notFound.code = "ENOENT";
      throw notFound;
    }

    throw error;
  }
}

async function probeCommand(command, args) {
  try {
    const { stdout, stderr } = await runCommand(command, args);

    return {
      success: true,
      command: [command, ...args].join(" "),
      stdout: stdout?.trim() || "",
      stderr: stderr?.trim() || "",
      code: 0,
    };
  } catch (error) {
    return {
      success: false,
      command: [command, ...args].join(" "),
      stdout: error.stdout?.trim() || "",
      stderr: error.stderr?.trim() || "",
      error: error.message || "Command failed.",
      code: error.code || error.status || 1,
    };
  }
}

function parseDefaultPrinter(output) {
  const match = String(output || "").match(/system default destination:\s*(.+)$/im);
  return match?.[1]?.trim() || "";
}

function parsePrinterStatus(rawStatus) {
  const match = rawStatus.match(/^printer\s+\S+\s+is\s+([^.\n]+)/i);
  return match?.[1]?.trim() || "unknown";
}

function normalizePrinterCondition(status, accepting) {
  const raw = [status, accepting?.rawAccepting].filter(Boolean).join(" ").toLowerCase();

  if (accepting?.accepting === false || raw.includes("not accepting")) return "paused";
  if (raw.includes("printing") || raw.includes("processing")) return "printing";
  if (["paused", "disabled", "stopped"].some((word) => raw.includes(word))) return "paused";
  if (["offline", "unable", "disconnected"].some((word) => raw.includes(word))) return "offline";
  if (["idle", "available", "enabled", "accepting"].some((word) => raw.includes(word))) return "available";
  return "unknown";
}

function warningForCondition(condition, accepting) {
  if (condition === "offline") {
    return {
      warningCode: "PRINTER_OFFLINE",
      warningText: "Local printer appears offline or disconnected.",
    };
  }

  if (condition === "paused") {
    return {
      warningCode: "PRINTER_PAUSED",
      warningText: accepting?.accepting === false
        ? "Local printer is not accepting jobs."
        : "Local printer appears paused or disabled.",
    };
  }

  return {
    warningCode: null,
    warningText: null,
  };
}

function parseAccepting(output) {
  const acceptingByPrinter = new Map();

  for (const line of String(output || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const acceptingMatch = trimmed.match(/^(\S+)\s+accepting\s+requests/i);
    const notAcceptingMatch = trimmed.match(/^(\S+)\s+not\s+accepting\s+requests/i);
    const printerName = acceptingMatch?.[1] || notAcceptingMatch?.[1];

    if (printerName) {
      acceptingByPrinter.set(printerName, {
        accepting: Boolean(acceptingMatch),
        rawAccepting: trimmed,
      });
    }
  }

  return acceptingByPrinter;
}

function parsePrinters(printerOutput, defaultPrinter, acceptingOutput = "") {
  const acceptingByPrinter = parseAccepting(acceptingOutput);
  const lastCheckedAt = new Date().toISOString();

  return String(printerOutput || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("printer "))
    .map((line) => {
      const [, printerName = ""] = line.match(/^printer\s+(\S+)/i) || [];
      const status = parsePrinterStatus(line);
      const accepting = acceptingByPrinter.get(printerName) || null;
      const condition = normalizePrinterCondition(status, accepting);
      const warning = warningForCondition(condition, accepting);

      return {
        printerName,
        displayName: printerName,
        systemPrinterId: printerName,
        status,
        condition,
        accepting: accepting?.accepting ?? (condition !== "paused" && condition !== "offline"),
        isDefault: printerName === defaultPrinter,
        rawStatus: line,
        rawAccepting: accepting?.rawAccepting || "",
        warningCode: warning.warningCode,
        warningText: warning.warningText,
        platform: "linux",
        lastCheckedAt,
      };
    })
    .filter((printer) => printer.printerName);
}

function cupsFailure(error, fallbackMessage) {
  const message = String(error.stderr || error.message || fallbackMessage || "").trim();

  if (error.code === "ENOENT") {
    return {
      success: false,
      printers: [],
      error: LPSTAT_NOT_FOUND,
      helpCommands: HELP_COMMANDS,
    };
  }

  return {
    success: false,
    printers: [],
    error: message || fallbackMessage || "CUPS command failed.",
    helpCommands: HELP_COMMANDS,
  };
}

export async function listPrinters() {
  try {
    const [{ stdout: printerOutput }, defaultResult, acceptingResult] = await Promise.all([
      runCommand("lpstat", ["-p"]),
      runCommand("lpstat", ["-d"]).catch((error) => ({ stdout: "", stderr: error.stderr || error.message })),
      runCommand("lpstat", ["-a"]).catch((error) => ({ stdout: "", stderr: error.stderr || error.message })),
    ]);

    const defaultPrinter = parseDefaultPrinter(defaultResult.stdout || "");
    const printers = parsePrinters(printerOutput, defaultPrinter, acceptingResult.stdout || "");

    return {
      success: printers.length > 0,
      printers,
      defaultPrinter,
      diagnostics: {
        accepting: acceptingResult.stdout?.trim() || "",
      },
      error: printers.length > 0 ? undefined : "No CUPS printers were detected.",
      helpCommands: printers.length > 0 ? undefined : HELP_COMMANDS,
    };
  } catch (error) {
    return cupsFailure(error, "Could not list CUPS printers.");
  }
}

export async function diagnosePrinters() {
  const [printerStatus, defaultPrinter, deviceStatus, acceptingStatus] = await Promise.all([
    probeCommand("lpstat", ["-p"]),
    probeCommand("lpstat", ["-d"]),
    probeCommand("lpstat", ["-v"]),
    probeCommand("lpstat", ["-a"]),
  ]);

  return {
    success: printerStatus.success,
    platform: process.platform,
    path: process.env.PATH || "",
    cupsServer: process.env.CUPS_SERVER || "",
    probes: [printerStatus, defaultPrinter, deviceStatus, acceptingStatus],
  };
}

async function validatePrinter(printerName) {
  if (!printerName || typeof printerName !== "string") {
    return {
      success: false,
      reasonCode: "PRINTER_NOT_SELECTED",
      message: "Select a printer before sending a test print.",
    };
  }

  const result = await listPrinters();
  if (!result.success) return result;

  const printer = result.printers.find((item) => item.printerName === printerName);
  if (!printer) {
    return {
      success: false,
      reasonCode: "PRINTER_NOT_FOUND",
      message: "Selected printer was not found in the detected local printers.",
    };
  }

  const condition = (printer.condition || printer.status || "").toLowerCase();
  const isOffline = ["offline", "unable", "disconnected", "paused", "disabled", "stopped"].includes(condition) || printer.accepting === false;
  if (isOffline) {
    return {
      success: false,
      reasonCode: "PRINTER_OFFLINE",
      message: `Printer ${printer.printerName} is currently offline or not accepting jobs.`,
    };
  }

  return {
    success: true,
    printer,
  };
}

export async function testPrint(printerName) {
  const validation = await validatePrinter(printerName);
  if (!validation.success) return validation;

  let tempDir = "";
  let tempFile = "";

  try {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "printease-test-"));
    tempFile = path.join(tempDir, "test-print.txt");

    await writeFile(
      tempFile,
      [
        "PrintEase Desktop test print",
        `Printer: ${validation.printer.printerName}`,
        `Platform: ${process.platform}`,
        `Time: ${new Date().toISOString()}`,
        "",
      ].join("\n"),
      "utf8"
    );

    const result = await printFile({
      printerName: validation.printer.printerName,
      filePath: tempFile,
      copies: 1,
    });

    return result.success
      ? {
          ...result,
          message: "Test print job sent to CUPS.",
        }
      : result;
  } catch (error) {
    return cupsFailure(error, "Could not send test print job.");
  } finally {
    if (tempFile) {
      await unlink(tempFile).catch(() => {});
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function printFile({ printerName, filePath, copies = 1, options = {} } = {}) {
  const validation = await validatePrinter(printerName);
  if (!validation.success) return validation;

  if (!filePath || typeof filePath !== "string") {
    return {
      success: false,
      reasonCode: "PRINTER_NOT_SELECTED",
      message: "A file path is required before printing.",
    };
  }

  const optionCopies = options?.copies || options?.printOptions?.copies;
  const safeCopies = Math.max(1, Math.min(Number(optionCopies || copies) || 1, 99));

  // Determine effective profile from available profiles or passed options
  const profiles = options.printerProfiles || [];
  const profile = profiles.find(p => p.osPlatform === 'linux') || options.printerProfile || {};
  const printOptions = options.printOptions || {};

  // Pre-process PDF if required (rotation / page order)
  let activeFilePath = filePath;
  let cleanupPdf = () => {};
  try {
    const prep = await preparePdfForPrinting(filePath, printOptions, profile);
    if (prep.tempFilePath) {
      activeFilePath = prep.tempFilePath;
      cleanupPdf = prep.cleanup;
    }
  } catch (prepError) {
    console.error("[CUPS] PDF Prep failed:", prepError);
    // Continue with original file if preparation fails
  }

  try {
    const args = [
      "-d",
      validation.printer.printerName,
      "-n",
      String(safeCopies),
    ];

    const pages = options.pages?.range || options.selectedPages || printOptions?.pages?.range;
    if (pages && String(pages).toLowerCase() !== "all") {
      args.push("-P", String(pages));
    }

    const colorMode = options.colorMode || printOptions?.colorMode;
    if (colorMode === "color") {
      args.push("-o", "ColorModel=Color");
    } else if (colorMode === "bw" || colorMode === "black_white" || colorMode === "monochrome") {
      args.push("-o", "ColorModel=Gray");
    }

    const sideType = printOptions?.sideType || options.sides || printOptions?.sides;
    let duplexBinding = printOptions?.duplexBinding || 'auto';
    let orientation = options.orientation || printOptions?.orientation || 'auto';

    if (orientation === 'auto') {
      orientation = profile.defaultOrientation || 'portrait';
    }

    if (sideType === 'single' || sideType === 'one_sided') {
      args.push("-o", "sides=one-sided");
    } else if (sideType === 'double' || sideType === 'two_sided') {
      if (duplexBinding === 'auto') {
        if (orientation === 'landscape') {
          duplexBinding = profile.landscapeDuplexBinding || profile.defaultDuplexBinding || 'short-edge';
        } else {
          duplexBinding = profile.defaultDuplexBinding || 'long-edge';
        }
      }
      
      if (duplexBinding === "long-edge" || sideType === "two_sided_long_edge") {
        args.push("-o", "sides=two-sided-long-edge");
      } else if (duplexBinding === "short-edge" || sideType === "two_sided_short_edge") {
        args.push("-o", "sides=two-sided-short-edge");
      }
    }

    const paperSize = options.paperSize || printOptions?.paperSize;
    if (paperSize) {
      args.push("-o", `media=${paperSize}`);
    }

    if (orientation === "landscape") {
      args.push("-o", "landscape");
    } else if (orientation === "portrait") {
      args.push("-o", "portrait");
    }

    const scaleMode = printOptions?.scaleMode || profile.scaleMode || 'fit-to-page';
    if (scaleMode === 'fit-to-page') {
      args.push("-o", "fit-to-page");
    } else if (scaleMode === 'actual-size') {
      // no fit-to-page option implies actual size in most CUPS drivers
    }

    // Collate
    const collate = printOptions?.collate ?? profile.collate ?? true;
    if (collate) {
      args.push("-o", "Collate=True");
    } else {
      args.push("-o", "Collate=False");
    }

    args.push(activeFilePath);
    
    console.log(`[CUPS] Executing: lp ${args.join(' ')}`);

    const { stdout, stderr } = await runCommand("lp", args);

    return {
      success: true,
      message: "Print job sent to CUPS.",
      printerName: validation.printer.printerName,
      stdout: stdout?.trim() || "",
      stderr: stderr?.trim() || "",
    };
  } catch (error) {
    const result = cupsFailure(error, "Could not send print job.");
    return {
      ...result,
      reasonCode: result.reasonCode || "LOCAL_PRINT_FAILED"
    };
  } finally {
    cleanupPdf();
  }
}
