import { PDFDocument } from 'pdf-lib';
import { prepareBrowserPrintReadyFile } from './prepareBrowserPrintReadyFile';
import { detectUploadFileKind } from './detectUploadFileKind';

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

async function readTextPreview(file) {
  return file.text();
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
    const previewFile = prepared.printReadyFile || file;
    return {
      status: PREPARATION_STATUS.READY,
      fileKind: kind,
      pageCount: 1,
      previewPdfUrl: prepared.printReadyFile ? URL.createObjectURL(previewFile) : URL.createObjectURL(file),
      previewKind: prepared.printReadyFile ? 'pdf' : 'image',
      printReadyFile: prepared.printReadyFile || null,
      conversionPlacement: prepared.conversionPlacement,
      conversionSource: prepared.conversionSource,
      decision: prepared.decision,
      message: prepared.printReadyFile ? 'Image wrapped as print-ready PDF.' : 'Image page count ready.',
    };
  }

  if (kind === 'text') {
    return {
      status: PREPARATION_STATUS.READY,
      fileKind: kind,
      pageCount: 1,
      previewPdfUrl: URL.createObjectURL(file),
      previewKind: 'text',
      textContent: await readTextPreview(file),
      printReadyFile: null,
      message: 'Text preview ready. Backend will verify before payment.',
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
      reasonCode: 'DESKTOP_PREPARATION_REQUIRED',
      message: 'Office documents need hub desktop preparation before exact pricing. Upload as PDF for immediate price.',
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
