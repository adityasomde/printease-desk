/**
 * PrintEase conversion placement policy.
 *
 * Purpose:
 * Decide where print-ready PDF preparation should happen without using the backend/server.
 *
 * Allowed processing locations:
 * - browser: light user-side conversion, mainly small common images.
 * - desktop: hub desktop agent conversion, mainly Office files, large images, and fallback work.
 * - none: no conversion needed, mainly PDF.
 * - manual: file is unsupported or too risky for automatic conversion.
 *
 * Backend rule:
 * This file must not trigger server/backend conversion. The backend should only store files,
 * metadata, payment state, and signed URLs. Heavy rendering/conversion belongs to browser or desktop.
 */

const MB = 1024 * 1024;

export const CONVERSION_PLACEMENT = Object.freeze({
  NONE: 'none',
  BROWSER: 'browser',
  DESKTOP: 'desktop',
  MANUAL: 'manual',
});

export const FILE_KIND = Object.freeze({
  PDF: 'pdf',
  IMAGE: 'image',
  OFFICE: 'office',
  TEXT: 'text',
  ARCHIVE: 'archive',
  UNSUPPORTED: 'unsupported',
});

/**
 * These defaults are intentionally conservative for Android phones.
 * They can be overridden from the app based on real telemetry later.
 */
export const DEFAULT_POLICY_LIMITS = Object.freeze({
  // Files estimated to convert on phone/browser in <= 8 seconds should stay on user side.
  browserFastSeconds: 8,

  // If hub conversion queue is likely to take > 30 seconds, offload browser-safe work to user side.
  hubBusySeconds: 30,

  // If hub queue can likely finish in <= 15 seconds, desktop can handle non-trivial work.
  hubFreeSoonSeconds: 15,

  // If hub is already converting more than 5 Office documents, treat it as busy.
  hubBusyOfficeQueueCount: 5,

  // Browser image conversion should be small to avoid freezing Android devices.
  maxBrowserImageBytes: 20 * MB,
  maxBrowserImagePixels: 25_000_000,

  // Browser text rendering is okay only for small simple files.
  maxBrowserTextBytes: 2 * MB,
});

export function extensionOf(name = '') {
  const clean = String(name || '').toLowerCase().split('?')[0].split('#')[0];
  const index = clean.lastIndexOf('.');
  return index >= 0 ? clean.slice(index) : '';
}

export function detectFileKindFromNameAndType({ name = '', type = '' } = {}) {
  const mime = String(type || '').toLowerCase();
  const ext = extensionOf(name);

  if (mime === 'application/pdf' || ext === '.pdf') return FILE_KIND.PDF;

  if (
    mime.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.heif'].includes(ext)
  ) {
    return FILE_KIND.IMAGE;
  }

  if (
    [
      '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.odt', '.ods', '.odp', '.rtf',
    ].includes(ext) ||
    mime.includes('word') ||
    mime.includes('excel') ||
    mime.includes('powerpoint') ||
    mime.includes('officedocument') ||
    mime.includes('opendocument')
  ) {
    return FILE_KIND.OFFICE;
  }

  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    ['.txt', '.csv', '.json'].includes(ext)
  ) {
    return FILE_KIND.TEXT;
  }

  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'].includes(ext)) return FILE_KIND.ARCHIVE;

  return FILE_KIND.UNSUPPORTED;
}

export function estimateBrowserConversionSeconds({ fileSizeBytes = 0, kind, width, height } = {}) {
  const sizeMb = Math.max(0, Number(fileSizeBytes || 0) / MB);
  const pixels = Number(width || 0) * Number(height || 0);
  const megapixels = pixels > 0 ? pixels / 1_000_000 : 0;

  if (kind === FILE_KIND.PDF) return 0;

  if (kind === FILE_KIND.IMAGE) {
    // Small screenshot/photo can be wrapped into PDF quickly in browser.
    // Large megapixel images can freeze low-end Android phones.
    return Math.ceil(1 + sizeMb * 0.35 + megapixels * 0.12);
  }

  if (kind === FILE_KIND.TEXT) {
    return Math.ceil(1 + sizeMb * 0.8);
  }

  // Browser Office conversion is intentionally treated as very expensive/unreliable.
  if (kind === FILE_KIND.OFFICE) return Infinity;

  return Infinity;
}

export function estimateDesktopConversionSeconds({ fileSizeBytes = 0, kind, pageCount } = {}) {
  const sizeMb = Math.max(0, Number(fileSizeBytes || 0) / MB);
  const pages = Math.max(1, Number(pageCount || 1));

  if (kind === FILE_KIND.PDF) return 0;
  if (kind === FILE_KIND.IMAGE) return Math.ceil(1 + sizeMb * 0.25);
  if (kind === FILE_KIND.TEXT) return Math.ceil(2 + sizeMb * 0.7);

  if (kind === FILE_KIND.OFFICE) {
    // Rough LibreOffice headless estimate. First run can add 3-10 seconds.
    return Math.ceil(4 + sizeMb * 1.2 + pages * 0.18);
  }

  return Infinity;
}

export function isBrowserSafeForConversion({ kind, fileSizeBytes = 0, width, height, limits = DEFAULT_POLICY_LIMITS } = {}) {
  const pixels = Number(width || 0) * Number(height || 0);

  if (kind === FILE_KIND.IMAGE) {
    return Number(fileSizeBytes || 0) <= limits.maxBrowserImageBytes &&
      (!pixels || pixels <= limits.maxBrowserImagePixels);
  }

  if (kind === FILE_KIND.TEXT) {
    return Number(fileSizeBytes || 0) <= limits.maxBrowserTextBytes;
  }

  return false;
}

/**
 * Decide where conversion should happen.
 *
 * hubLoad example:
 * {
 *   queuedEstimatedSeconds: 42,
 *   queuedOfficeCount: 6,
 *   isOnline: true
 * }
 *
 * fileInfo example:
 * {
 *   name: 'photo.jpg',
 *   type: 'image/jpeg',
 *   size: 3400000,
 *   width: 3000,
 *   height: 2000,
 *   pageCount: 1
 * }
 */
export function decideConversionPlacement({ fileInfo = {}, hubLoad = {}, userPreference = 'auto', limits = DEFAULT_POLICY_LIMITS } = {}) {
  const kind = fileInfo.kind || detectFileKindFromNameAndType({ name: fileInfo.name, type: fileInfo.type });
  const fileSizeBytes = Number(fileInfo.size || fileInfo.fileSizeBytes || 0);
  const browserSeconds = estimateBrowserConversionSeconds({
    fileSizeBytes,
    kind,
    width: fileInfo.width,
    height: fileInfo.height,
  });
  const desktopSeconds = estimateDesktopConversionSeconds({
    fileSizeBytes,
    kind,
    pageCount: fileInfo.pageCount,
  });

  const queuedEstimatedSeconds = Number(hubLoad.queuedEstimatedSeconds || 0);
  const queuedOfficeCount = Number(hubLoad.queuedOfficeCount || 0);
  const hubBusy = queuedEstimatedSeconds > limits.hubBusySeconds || queuedOfficeCount > limits.hubBusyOfficeQueueCount;
  const hubFreeSoon = queuedEstimatedSeconds <= limits.hubFreeSoonSeconds;
  const browserSafe = isBrowserSafeForConversion({
    kind,
    fileSizeBytes,
    width: fileInfo.width,
    height: fileInfo.height,
    limits,
  });

  if (kind === FILE_KIND.PDF) {
    return {
      placement: CONVERSION_PLACEMENT.NONE,
      reasonCode: 'PDF_ALREADY_PRINT_READY',
      kind,
      browserSeconds,
      desktopSeconds,
    };
  }

  if (kind === FILE_KIND.ARCHIVE) {
    return {
      placement: CONVERSION_PLACEMENT.MANUAL,
      reasonCode: 'ARCHIVE_BLOCKED_FOR_SECURITY',
      kind,
      browserSeconds,
      desktopSeconds,
    };
  }

  if (kind === FILE_KIND.UNSUPPORTED) {
    return {
      placement: CONVERSION_PLACEMENT.MANUAL,
      reasonCode: 'UNSUPPORTED_FILE_TYPE',
      kind,
      browserSeconds,
      desktopSeconds,
    };
  }

  if (userPreference === 'browser' && browserSafe) {
    return {
      placement: CONVERSION_PLACEMENT.BROWSER,
      reasonCode: 'USER_PREFERRED_BROWSER_AND_FILE_IS_SAFE',
      kind,
      browserSeconds,
      desktopSeconds,
    };
  }

  if (userPreference === 'desktop') {
    return {
      placement: CONVERSION_PLACEMENT.DESKTOP,
      reasonCode: 'USER_PREFERRED_DESKTOP',
      kind,
      browserSeconds,
      desktopSeconds,
    };
  }

  // Light files that take less than 8 seconds on phone/browser should be prepared locally.
  if (browserSafe && browserSeconds <= limits.browserFastSeconds) {
    return {
      placement: CONVERSION_PLACEMENT.BROWSER,
      reasonCode: 'FAST_BROWSER_CONVERSION',
      kind,
      browserSeconds,
      desktopSeconds,
    };
  }

  // If hub is busy for more than 30 seconds, offload browser-safe work to the user side.
  if (hubBusy && browserSafe && browserSeconds <= limits.hubBusySeconds) {
    return {
      placement: CONVERSION_PLACEMENT.BROWSER,
      reasonCode: 'HUB_BUSY_BROWSER_CAN_HELP',
      kind,
      browserSeconds,
      desktopSeconds,
    };
  }

  // Browser best-effort for small Office files (e.g. < 5MB).
  // Larger Office files require manual hub review (MANUAL) instead of auto desktop conversion.
  if (kind === FILE_KIND.OFFICE) {
    if (fileSizeBytes <= 5 * MB) {
      return {
        placement: CONVERSION_PLACEMENT.BROWSER,
        reasonCode: 'SMALL_OFFICE_BROWSER_ATTEMPT',
        kind,
        browserSeconds,
        desktopSeconds,
      };
    }

    return {
      placement: CONVERSION_PLACEMENT.MANUAL,
      reasonCode: 'COMPLEX_OFFICE_REQUIRES_HUB_REVIEW',
      kind,
      browserSeconds,
      desktopSeconds,
    };
  }

  // If hub is free soon, desktop can handle larger images/text without burdening Android.
  if (hubFreeSoon) {
    return {
      placement: CONVERSION_PLACEMENT.DESKTOP,
      reasonCode: 'HUB_FREE_SOON_DESKTOP_PREP',
      kind,
      browserSeconds,
      desktopSeconds,
    };
  }

  // Default: desktop fallback, because final print path is desktop-controlled.
  return {
    placement: CONVERSION_PLACEMENT.DESKTOP,
    reasonCode: 'DESKTOP_FALLBACK',
    kind,
    browserSeconds,
    desktopSeconds,
  };
}
