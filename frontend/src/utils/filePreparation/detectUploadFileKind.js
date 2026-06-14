/**
 * Browser-side upload file detection for PrintEase.
 *
 * This file is intentionally small and safe for Android browsers.
 * It does not inspect file bytes. The backend/desktop must still validate files again.
 */

export function getUploadExtension(file) {
  const name = String(file?.name || '').toLowerCase();
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index) : '';
}

export function detectUploadFileKind(file) {
  const type = String(file?.type || '').toLowerCase();
  const ext = getUploadExtension(file);

  if (type === 'application/pdf' || ext === '.pdf') return 'pdf';

  if (
    type.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.heif'].includes(ext)
  ) {
    return 'image';
  }

  if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.rtf'].includes(ext)) {
    return 'office';
  }

  if (type.startsWith('text/') || type === 'application/json' || ['.txt', '.csv', '.json'].includes(ext)) {
    return 'text';
  }

  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'].includes(ext)) {
    return 'archive';
  }

  return 'unsupported';
}

export function canBrowserTryImageToPdf(file, { maxBytes = 20 * 1024 * 1024 } = {}) {
  const kind = detectUploadFileKind(file);
  if (kind !== 'image') return false;

  const type = String(file?.type || '').toLowerCase();
  const ext = getUploadExtension(file);

  // pdf-lib directly supports JPG/PNG. WebP is handled through canvas in imageToPdfBrowser.js.
  const browserSupported = ['image/jpeg', 'image/png', 'image/webp'].includes(type) ||
    ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);

  return browserSupported && Number(file?.size || 0) <= maxBytes;
}
