import { PDFDocument } from 'pdf-lib';
import { prepareBrowserPrintReadyFile } from './prepareBrowserPrintReadyFile';
import { detectUploadFileKind } from './detectUploadFileKind';
import { convertTextToPdfInBrowser } from './textToPdfBrowser';

export const PREPARATION_STATUS = Object.freeze({
  IDLE: 'idle',
  PREPARING: 'preparing',
  READY: 'ready',
  PENDING_DESKTOP: 'pending_desktop',
  FAILED: 'failed',
});

async function countPdfPages(file) {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return pdf.getPageCount();
}

export async function prepareUploadPreview(file, context = {}) {
  const kind = detectUploadFileKind(file);

  if (kind === 'pdf') {
    const pageCount = await countPdfPages(file);
    return {
      status: PREPARATION_STATUS.READY,
      fileKind: kind,
      pageCount,
      previewPdfUrl: URL.createObjectURL(file),
      previewKind: 'pdf',
      printReadyFile: null,
      message: 'PDF page count ready.',
    };
  }

  if (kind === 'image') {
    const prepared = await prepareBrowserPrintReadyFile(file, context);
    if (!prepared.printReadyFile) {
      return {
        status: PREPARATION_STATUS.FAILED,
        fileKind: kind,
        pageCount: null,
        previewPdfUrl: '',
        previewKind: 'unsupported',
        printReadyFile: null,
        conversionPlacement: 'manual',
        conversionSource: 'none',
        reasonCode: prepared.decision?.reasonCode || 'BROWSER_IMAGE_PREPARATION_FAILED',
        errorMessage: 'Could not prepare this image in browser. Please upload as PDF.',
      };
    }
    const previewFile = prepared.printReadyFile || file;
    return {
      status: PREPARATION_STATUS.READY,
      fileKind: kind,
      pageCount: 1,
      previewPdfUrl: URL.createObjectURL(previewFile),
      previewKind: 'pdf',
      printReadyFile: prepared.printReadyFile,
      conversionPlacement: 'browser',
      conversionSource: 'browser',
      decision: prepared.decision,
      message: 'Image wrapped as print-ready PDF.',
    };
  }

  if (kind === 'text') {
    const printReadyFile = await convertTextToPdfInBrowser(file, context.textPdfOptions || {});
    const pageCount = await countPdfPages(printReadyFile);
    return {
      status: PREPARATION_STATUS.READY,
      fileKind: kind,
      pageCount,
      previewPdfUrl: URL.createObjectURL(printReadyFile),
      previewKind: 'pdf',
      printReadyFile,
      conversionPlacement: 'browser',
      conversionSource: 'browser',
      message: 'Text converted to print-ready PDF.',
    };
  }

  if (kind === 'office') {
    return {
      status: PREPARATION_STATUS.PENDING_DESKTOP,
      fileKind: kind,
      pageCount: null,
      previewPdfUrl: '',
      previewKind: 'unsupported',
      printReadyFile: null,
      conversionPlacement: 'desktop',
      conversionSource: 'none',
      reasonCode: 'DESKTOP_OFFICE_CONVERSION_REQUIRED',
      message: 'Office document will be converted and counted by the hub desktop before payment.',
      errorMessage: '',
    };
  }

  return {
    status: PREPARATION_STATUS.FAILED,
    fileKind: kind,
    pageCount: null,
    previewPdfUrl: '',
    previewKind: 'unsupported',
    printReadyFile: null,
    reasonCode: 'UNSUPPORTED_PREVIEW_TYPE',
    errorMessage: 'This file type cannot be priced or previewed safely yet. Please upload as PDF.',
  };
}

export function revokePreparationPreview(preparation) {
  if (preparation?.previewPdfUrl?.startsWith?.('blob:')) {
    URL.revokeObjectURL(preparation.previewPdfUrl);
  }
}
