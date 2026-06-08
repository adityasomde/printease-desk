let paused = false;

function unsupportedPlatform() {
  return {
    success: false,
    printers: [],
    error: `Printer support is not implemented for ${process.platform}.`,
  };
}

async function getPrinterModule() {
  if (process.platform === "linux") {
    return await import("./linux/linuxCups.js");
  }
  if (process.platform === "win32") {
    return await import("./windows/windowsPrinter.js");
  }
  return null;
}

export async function listPrinters() {
  const printerModule = await getPrinterModule();
  if (!printerModule) return unsupportedPlatform();

  return printerModule.listPrinters();
}

export async function diagnosePrinters() {
  const printerModule = await getPrinterModule();
  if (!printerModule?.diagnosePrinters) return unsupportedPlatform();

  return printerModule.diagnosePrinters();
}

export async function testPrint(printerName) {
  if (paused) {
    return {
      success: false,
      message: "Printing is paused locally. Restart the desktop shell to resume printing in this phase.",
    };
  }

  const printerModule = await getPrinterModule();
  if (!printerModule) return unsupportedPlatform();

  return printerModule.testPrint(printerName);
}

export async function printFile({ printerName, filePath, copies = 1, options = {} } = {}) {
  if (paused) {
    return {
      success: false,
      message: "Printing is paused locally. Restart the desktop shell to resume printing in this phase.",
    };
  }

  const printerModule = await getPrinterModule();
  if (!printerModule?.printFile) return unsupportedPlatform();

  const result = await printerModule.printFile({ printerName, filePath, copies, options });
  if (result && typeof result.success === 'boolean') {
    return result;
  }

  return {
    success: false,
    message: 'Printer module returned unexpected result.',
    reasonCode: 'LOCAL_PRINT_FAILED'
  };
}

export async function stopPrinting() {
  if (process.platform === "win32") {
    const printerModule = await getPrinterModule();
    if (printerModule?.stopPrinting) {
      return printerModule.stopPrinting();
    }
  }

  paused = true;

  return {
    success: true,
    message: "Printing paused locally. Active OS job cancellation will be implemented later.",
  };
}

export async function resumePrinting() {
  paused = false;

  return {
    success: true,
    message: "Printing resumed locally.",
  };
}

