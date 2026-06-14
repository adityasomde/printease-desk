/**
 * Desktop-side file type detection for print preparation.
 *
 * This detector uses filename + MIME type passed by backend/agent payload.
 * Do not treat it as a security scanner. Backend and storage validation must still exist.
 */

export function extensionOf(name = '') {
  const clean = String(name || '').toLowerCase().split('?')[0].split('#')[0];
  const index = clean.lastIndexOf('.');
  return index >= 0 ? clean.slice(index) : '';
}

export function detectDesktopFileKind({ fileName = '', fileType = '' } = {}) {
  const mime = String(fileType || '').toLowerCase();
  const ext = extensionOf(fileName);

  if (mime === 'application/pdf' || ext === '.pdf') return 'pdf';

  if (
    mime.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.heif'].includes(ext)
  ) {
    return 'image';
  }

  if (
    ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.rtf'].includes(ext) ||
    mime.includes('word') || mime.includes('excel') || mime.includes('powerpoint') ||
    mime.includes('officedocument') || mime.includes('opendocument')
  ) {
    return 'office';
  }

  if (mime.startsWith('text/') || mime === 'application/json' || ['.txt', '.csv', '.json'].includes(ext)) {
    return 'text';
  }

  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'].includes(ext)) return 'archive';

  return 'unsupported';
}

export function isPdfKind(kind) {
  return kind === 'pdf';
}
