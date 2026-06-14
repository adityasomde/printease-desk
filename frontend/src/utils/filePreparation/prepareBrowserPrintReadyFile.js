/**
 * User/browser-side print-ready preparation.
 *
 * This file only does light browser work. It never converts Office documents.
 * Heavy conversion stays on the hub desktop agent.
 */

import { decideConversionPlacement, CONVERSION_PLACEMENT } from './conversionPlacementPolicy.js';
import { canBrowserTryImageToPdf, detectUploadFileKind } from './detectUploadFileKind.js';
import { convertImageToPdfInBrowser } from './imageToPdfBrowser.js';

export async function prepareBrowserPrintReadyFile(file, context = {}) {
  const kind = detectUploadFileKind(file);
  const decision = decideConversionPlacement({
    fileInfo: {
      name: file.name,
      type: file.type,
      size: file.size,
      kind,
      width: context.width,
      height: context.height,
      pageCount: context.pageCount,
    },
    hubLoad: context.hubLoad || {},
    userPreference: context.userPreference || 'auto',
  });

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

  if (decision.placement === CONVERSION_PLACEMENT.BROWSER && canBrowserTryImageToPdf(file)) {
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

  return {
    originalFile: file,
    printReadyFile: null,
    conversionPlacement: decision.placement,
    conversionSource: decision.placement === CONVERSION_PLACEMENT.DESKTOP ? 'desktop-required' : 'manual-or-unsupported',
    fileKind: kind,
    decision,
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
