/**
 * Compatibility wrapper for LibreOffice detection.
 *
 * Keep existing conversion callers stable: they still call
 * findLibreOfficeExecutable() and receive a soffice executable path. The actual
 * resolver now lives in src/services/converter so future auto-setup work can
 * evolve without changing order, payment, pricing, or print dispatch logic.
 */

import { ensureConverterReady } from "../../src/services/converter/converterManager.js";
import { LIBREOFFICE_MANUAL_DOWNLOAD_URL } from "../../src/services/converter/libreOfficeDetector.js";
import { runCommand } from "../../src/services/converter/conversionRunner.js";

export { LIBREOFFICE_MANUAL_DOWNLOAD_URL, runCommand };

export async function findLibreOfficeExecutable(options = {}) {
  return ensureConverterReady({
    ...options,
    allowDownload: Boolean(options.allowDownload),
  });
}
