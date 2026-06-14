/**
 * User/browser-side print-ready preparation.
 *
 * Temporary simple mode:
 * Do all possible preparation in the browser and bypass hybrid distribution.
 * Office conversion is not attempted unless a browser converter is added later.
 */

import { canBrowserTryImageToPdf, detectUploadFileKind } from './detectUploadFileKind.js';
import { convertImageToPdfInBrowser } from './imageToPdfBrowser.js';

const CONVERSION_PLACEMENT = Object.freeze({
  NONE: 'none',
  BROWSER: 'browser',
  MANUAL: 'manual',
});

export async function prepareBrowserPrintReadyFile(file, context = {}) {
  const kind = detectUploadFileKind(file);
  const decision = {
    placement: kind === 'pdf' ? CONVERSION_PLACEMENT.NONE : CONVERSION_PLACEMENT.BROWSER,
    reasonCode: 'BROWSER_PREPARATION_FORCED',
    kind,
  };

  if (kind === 'pdf') {
    return {
      originalFile: file,
      printReadyFile: null,
      conversionPlacement: CONVERSION_PLACEMENT.NONE,
      conversionSource: 'none',
      fileKind: kind,
      decision,
    };
  }

  if (canBrowserTryImageToPdf(file)) {
    const printReadyFile = await convertImageToPdfInBrowser(file, context.imagePdfOptions || {});
    return {
      originalFile: file,
      printReadyFile,
      conversionPlacement: CONVERSION_PLACEMENT.BROWSER,
      conversionSource: 'browser-image-to-pdf',
      fileKind: kind,
      decision,
    };
  }

  if (kind === 'office') {
    return {
      originalFile: file,
      printReadyFile: null,
      conversionPlacement: CONVERSION_PLACEMENT.MANUAL,
      conversionSource: 'none',
      fileKind: kind,
      decision: {
        placement: CONVERSION_PLACEMENT.MANUAL,
        reasonCode: 'BROWSER_OFFICE_CONVERSION_UNAVAILABLE',
        kind,
      },
    };
  }

  return {
    originalFile: file,
    printReadyFile: null,
    conversionPlacement: CONVERSION_PLACEMENT.MANUAL,
    conversionSource: 'none',
    fileKind: kind,
    decision: {
      placement: CONVERSION_PLACEMENT.MANUAL,
      reasonCode: 'BROWSER_PREPARATION_UNAVAILABLE',
      kind,
    },
  };
}

export function appendPreparedFileToFormData(formData, prepared, fieldPrefix = 'document') {
  formData.append(`${fieldPrefix}Original`, prepared.originalFile);
  formData.append(`${fieldPrefix}ConversionSource`, prepared.conversionSource);
  formData.append(`${fieldPrefix}ConversionPlacement`, prepared.conversionPlacement);
  formData.append(`${fieldPrefix}ConversionDecision`, JSON.stringify(prepared.decision || {}));

  if (prepared.printReadyFile) {
    formData.append(`${fieldPrefix}PrintReady`, prepared.printReadyFile);
  }

  return formData;
}
