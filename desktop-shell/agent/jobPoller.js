import { rm, readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { backendRequest } from "./heartbeat.js";
import { toPrintReadyPdfName } from "./printPreparation/fileNameUtils.js";
import { cacheReadableDocument, findCachedDocument, removeCachedDocument, getDocumentCacheDirectory } from "./documentCache.js";
import { printFile, stopPrinting } from "../printer/printExecutor.js";
import { preparePrintFile } from "./printPreparation/preparePrintFile.js";
import { 
  normalizeJobFiles, 
  validateJobFile, 
  getExpectedFileHash, 
  getSafeFileName 
} from "./jobFiles.js";

export async function getNextJob({ agentToken } = {}) {
  if (!agentToken) {
    return {
      success: false,
      message: "Pair the desktop before polling jobs.",
    };
  }

  try {
    return await backendRequest({
      endpoint: "/agent/jobs/next",
      agentToken,
    });
  } catch (error) {
    return {
      success: false,
      message: error.message || "Could not fetch next print job.",
      status: error.status || 0,
    };
  }
}

export async function getPredownloadCandidates({ agentToken, limit = 15 } = {}) {
  if (!agentToken) {
    return {
      success: false,
      message: "Pair the desktop before predownloading documents.",
    };
  }

  try {
    return await backendRequest({
      endpoint: `/agent/jobs/predownload?limit=${encodeURIComponent(String(limit))}`,
      agentToken,
    });
  } catch (error) {
    return {
      success: false,
      message: error.message || "Could not fetch predownload candidates.",
      status: error.status || 0,
    };
  }
}


export async function markJobStatus({ agentToken, jobId, status, reasonCode, reasonText } = {}) {
  if (!agentToken || !jobId || !status) {
    return {
      success: false,
      message: "Agent token, job ID, and status are required.",
    };
  }

  const statusEndpoint = {
    accepted: "accepted",
    downloading: "downloading",
    printing: "printing",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled",
  }[status];

  if (!statusEndpoint) {
    return {
      success: false,
      message: `Unsupported print job status: ${status}`,
    };
  }

  try {
    return await backendRequest({
      endpoint: `/agent/jobs/${encodeURIComponent(jobId)}/${statusEndpoint}`,
      method: "POST",
      agentToken,
      body: {
        reasonCode,
        reasonText,
      },
    });
  } catch (error) {
    return {
      success: false,
      message: error.message || `Could not mark job as ${status}.`,
      status: error.status || 0,
    };
  }
}



async function getRemoteJobStatus({ agentToken, jobId } = {}) {
  if (!agentToken || !jobId) return null;

  try {
    const data = await backendRequest({
      endpoint: "/desktop/print-jobs",
      agentToken,
    });
    const jobs = Array.isArray(data.printJobs) ? data.printJobs : [];
    return jobs.find((job) => job.jobId === jobId || job.id === jobId) || null;
  } catch {
    return null;
  }
}

function isJobAuthorizedForPrint(job) {
  return Boolean(
    job?.paymentVerified === true ||
    job?.approvedForPrint === true ||
    job?.printable === true
  );
}

function buildOrderScopedPrintOptions({ job, file, isLastFile }) {
  const fileOptions = file.printOptions || {};
  const jobOptions = job.printOptions || {};

  const {
    afterOrderSettings: _fileAfterOrderSettings,
    orderInfo: _fileOrderInfo,
    ...safeFileOptions
  } = fileOptions;

  const orderAfterOrderSettings =
    jobOptions.afterOrderSettings || fileOptions.afterOrderSettings || null;

  const orderInfo =
    jobOptions.orderInfo || fileOptions.orderInfo || null;

  return {
    ...safeFileOptions,
    copies: file.copies || fileOptions.copies || job.copies || 1,
    isLastFile,
    orderInsertScope: "order",
    afterOrderSettings: isLastFile ? orderAfterOrderSettings : null,
    orderInfo: isLastFile ? orderInfo : null,
  };
}

async function assertJobStillPrintable({ agentToken, jobId } = {}) {
  const remoteJob = await getRemoteJobStatus({ agentToken, jobId });
  const status = String(remoteJob?.status || "").toLowerCase();

  if (["cancelled", "failed"].includes(status)) {
    await stopPrinting().catch(() => {});
    const error = new Error(status === "cancelled" ? "Print job was cancelled by the hub." : "Print job is no longer printable.");
    error.reasonCode = status === "cancelled" ? "ORDER_CANCELLED" : "REMOTE_JOB_STOPPED";
    error.cancelled = status === "cancelled";
    throw error;
  }
}

export async function downloadJobFile(job, file = null) {
  const printFileItem = file || normalizeJobFiles(job)[0] || {};

  if (!validateJobFile(printFileItem)) {
    return {
      success: false,
      message: "Print job does not include a valid signed file URL.",
    };
  }

  const expectedHash = getExpectedFileHash(printFileItem);
  const cachedFilePath = printFileItem.documentId
    ? await findCachedDocument(printFileItem.documentId, expectedHash)
    : null;

  if (cachedFilePath) {
    return {
      success: true,
      filePath: cachedFilePath,
      cached: true,
    };
  }

  const response = await fetch(printFileItem.fileUrl);
  if (!response.ok || !response.body) {
    return {
      success: false,
      message: `Could not download print file. Status ${response.status}.`,
    };
  }

  const safeName = getSafeFileName(printFileItem);
  return cacheReadableDocument({
    documentId: printFileItem.documentId || printFileItem.fileHash || safeName,
    fileName: safeName,
    expectedHash,
    responseBody: response.body,
  });
}

async function reportDesktopPreparationResult({ agentToken, file, cachedFilePath, expectedHash }) {
  if (!file.requiresDesktopPreparation || file.preparationStatus !== "pending") {
    return null;
  }

  const prepResult = await preparePrintFile({
    filePath: cachedFilePath,
    fileName: file.fileName || "document.pdf",
    fileType: file.fileType || "application/pdf",
    sha256: expectedHash,
    cacheBaseDir: getDocumentCacheDirectory()
  });

  let preparedPageCount = null;
  let status = "failed";
  let errorCode = prepResult.reasonCode || "UNKNOWN_ERROR";
  let errorMessage = prepResult.message || "Failed to prepare print file";
  let convertedPdfBytes = null;

  if (prepResult.success && prepResult.filePath) {
    try {
      convertedPdfBytes = await readFile(prepResult.filePath);
      const pdfDoc = await PDFDocument.load(convertedPdfBytes, { ignoreEncryption: true });
      preparedPageCount = pdfDoc.getPageCount();
      status = "prepared";
      errorCode = null;
      errorMessage = null;
    } catch {
      errorCode = "PDF_PARSE_ERROR";
      errorMessage = "Failed to count pages in converted PDF";
      convertedPdfBytes = null;
    }
  }

  // The backend independently verifies the uploaded PDF and becomes the source
  // of truth for page count, hash, pricing, and bill confirmation.
  const formData = new FormData();
  formData.append("orderFileId", file.orderFileId);
  formData.append("documentId", file.documentId);
  formData.append("preparationStatus", status);
  if (preparedPageCount) formData.append("preparedPageCount", String(preparedPageCount));
  if (errorCode) formData.append("errorCode", errorCode);
  if (errorMessage) formData.append("errorMessage", errorMessage);

  if (convertedPdfBytes && status === "prepared") {
    const blob = new Blob([convertedPdfBytes], { type: "application/pdf" });
    formData.append(
      "printReadyFile",
      blob,
      file.fileName?.replace(/\.[^.]+$/, ".pdf") || "converted.pdf"
    );
  }

  return backendRequest({
    endpoint: "/agent/preparation-result",
    method: "POST",
    agentToken,
    body: formData
  });
}

export async function predownloadPendingDocuments({ agentToken, limit = 15 } = {}) {
  const candidates = await getPredownloadCandidates({ agentToken, limit });
  if (!candidates.success) return candidates;

  const files = Array.isArray(candidates.files) ? candidates.files : [];
  const cachedFiles = [];
  const failures = [];

  for (const file of files) {
    const documentId = file.documentId;
    const expectedHash = getExpectedFileHash({
      fileHash: file.fileSha256 || file.fileHash,
    });

    if (!documentId || !file.fileUrl || !expectedHash) continue;

    const alreadyCached = await findCachedDocument(documentId, expectedHash);
    if (alreadyCached) {
      try {
        await reportDesktopPreparationResult({
          agentToken,
          file,
          cachedFilePath: alreadyCached,
          expectedHash
        });
      } catch (error) {
        failures.push({
          documentId,
          orderId: file.orderId || null,
          message: error.message || "Cached document preparation failed.",
        });
      }

      cachedFiles.push({
        documentId,
        orderId: file.orderId || null,
        cached: true,
      });
      continue;
    }

    try {
      const response = await fetch(file.fileUrl);
      if (!response.ok || !response.body) {
        failures.push({
          documentId,
          orderId: file.orderId || null,
          message: `Predownload failed with status ${response.status}.`,
        });
        continue;
      }

      const cached = await cacheReadableDocument({
        documentId,
        fileName: file.fileName || "document.pdf",
        expectedHash,
        responseBody: response.body,
      });

      if (cached.success) {
        try {
          await reportDesktopPreparationResult({
            agentToken,
            file,
            cachedFilePath: cached.filePath,
            expectedHash
          });
        } catch (e) {
          console.warn("Predownload preparation failed:", e);
        }

        cachedFiles.push({
          documentId,
          orderId: file.orderId || null,
          cached: cached.cached,
        });
      } else {
        failures.push({
          documentId,
          orderId: file.orderId || null,
          message: cached.message || "Predownload cache write failed.",
        });
      }
    } catch (error) {
      failures.push({
        documentId,
        orderId: file.orderId || null,
        message: error.message || "Predownload failed.",
      });
    }
  }

  // Guardrail: predownload never calls printFile and never updates print job
  // statuses. It only warms the local cache for pending-payment documents.
  return {
    success: true,
    mode: "predownload_only",
    checked: files.length,
    cached: cachedFiles.length,
    failures,
  };
}

export async function processNextJob({ agentToken, printerName } = {}) {
  const nextJob = await getNextJob({ agentToken });
  if (!nextJob.success || !nextJob.job) return nextJob;

  const job = nextJob.job;

  if (!isJobAuthorizedForPrint(job)) {
    const error = new Error("Print job is not authorized for printing.");
    error.reasonCode = "PRINT_NOT_AUTHORIZED";
    return {
      success: false,
      message: error.message,
      reasonCode: error.reasonCode,
      job,
    };
  }

  const selectedPrinterName = printerName || job.printerName;
  const jobFiles = normalizeJobFiles(job);
  const downloads = [];

  try {
    if (!jobFiles.length) {
      const error = new Error("Print job does not include printable files.");
      error.reasonCode = "NO_PRINTABLE_FILES";
      throw error;
    }

    await markJobStatus({ agentToken, jobId: job.jobId, status: "accepted" });
    await markJobStatus({ agentToken, jobId: job.jobId, status: "downloading" });

    for (const file of jobFiles) {
      await assertJobStillPrintable({ agentToken, jobId: job.jobId });
      const download = await downloadJobFile(job, file);
      if (!download.success) throw new Error(download.message);
      
      const expectedHash = getExpectedFileHash(file);
      const prepResult = await preparePrintFile({
        filePath: download.filePath,
        fileName: file.fileName || "document.pdf",
        fileType: file.fileType || "application/pdf",
        sha256: expectedHash,
        cacheBaseDir: getDocumentCacheDirectory()
      });

      if (!prepResult.success) {
        const error = new Error(prepResult.message || "Print file preparation failed");
        error.reasonCode = prepResult.reasonCode || "PREPARATION_FAILED";
        throw error;
      }

      downloads.push({ 
        ...download, 
        filePath: prepResult.filePath,
        fileName: prepResult.fileName || toPrintReadyPdfName(file.fileName),
        fileType: prepResult.fileType,
        file 
      });
    }

    await markJobStatus({ agentToken, jobId: job.jobId, status: "printing" });

    const printedFiles = [];
    for (let idx = 0; idx < downloads.length; idx++) {
      const download = downloads[idx];
      const isLastFile = idx === downloads.length - 1;
      await assertJobStillPrintable({ agentToken, jobId: job.jobId });
      const printResult = await printFile({
        printerName: selectedPrinterName,
        filePath: download.filePath,
        copies: download.file.copies || job.copies || 1,
        fileType: download.fileType || download.file.fileType || "application/pdf",
        fileName: download.fileName || toPrintReadyPdfName(download.file.fileName),
        options: buildOrderScopedPrintOptions({
          job,
          file: download.file,
          isLastFile,
        }),
      });

      if (!printResult.success) {
        const error = new Error(printResult.message || printResult.error || "Local print command failed.");
        error.reasonCode = printResult.reasonCode || printResult.errorCode || "LOCAL_PRINT_FAILED";
        throw error;
      }

      printedFiles.push({
        documentId: download.file.documentId || null,
        fileName: download.file.fileName || null,
        printResult,
      });
    }

    await assertJobStillPrintable({ agentToken, jobId: job.jobId });

    await markJobStatus({ agentToken, jobId: job.jobId, status: "completed" });

    const cleanupTargets = new Map();
    for (const download of downloads) {
      const documentId = download.file.documentId;
      if (!documentId) continue;

      const expectedHash = getExpectedFileHash(download.file);
      cleanupTargets.set(`${documentId}:${expectedHash || ""}`, {
        documentId,
        expectedHash,
      });
    }

    for (const target of cleanupTargets.values()) {
      await removeCachedDocument(target.documentId, target.expectedHash).catch(() => {});
    }

    return {
      success: true,
      message: `Print job completed (${printedFiles.length} file${printedFiles.length === 1 ? "" : "s"}).`,
      job,
      printResult: printedFiles[printedFiles.length - 1]?.printResult || null,
      printedFiles,
    };
  } catch (error) {
    const reasonCode = error.reasonCode || error.code || "LOCAL_PRINT_FAILED";
    await markJobStatus({
      agentToken,
      jobId: job.jobId,
      status: error.cancelled ? "cancelled" : "failed",
      reasonCode,
      reasonText: error.message || "Local print job failed.",
    }).catch(() => {});

    return {
      success: false,
      message: error.message || "Could not process print job.",
      job,
    };
  } finally {
    for (const download of downloads) {
      if (download.tempDir) {
        await rm(download.tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}



export function createJobPoller(options = {}) {
  let timer = null;
  let isProcessing = false;

  async function runPollCycle(overrides = {}) {
    if (isProcessing) {
      return {
        success: true,
        skipped: true,
        message: "Job poll already running.",
      };
    }

    isProcessing = true;
    try {
      const pollOptions = { ...options, ...overrides };

      if (pollOptions.runPredownload !== false && pollOptions.agentToken) {
        await predownloadPendingDocuments({
          agentToken: pollOptions.agentToken,
          limit: pollOptions.predownloadLimit,
        }).catch(() => null);
      }

      return await processNextJob(pollOptions);
    } finally {
      isProcessing = false;
    }
  }

  return {
    get isRunning() {
      return Boolean(timer);
    },
    async pollOnce(overrides = {}) {
      return runPollCycle(overrides);
    },
    start(overrides = {}) {
      if (timer) {
        return {
          success: true,
          message: "Job polling is already running.",
        };
      }

      const pollOptions = { ...options, ...overrides };
      const intervalMs = Math.max(3000, Number(pollOptions.intervalMs) || 5000);
      timer = setInterval(() => {
        runPollCycle(pollOptions).catch(() => {});
      }, intervalMs);

      return {
        success: true,
        message: "Job polling started.",
        intervalMs,
      };
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }

      return {
        success: true,
        message: "Job polling stopped.",
      };
    },
  };
}
