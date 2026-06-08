import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { backendRequest } from "./heartbeat.js";
import { printFile, stopPrinting } from "../printer/printExecutor.js";
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



async function calculateSha256(filePath) {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
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

  const response = await fetch(printFileItem.fileUrl);
  if (!response.ok || !response.body) {
    return {
      success: false,
      message: `Could not download print file. Status ${response.status}.`,
    };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "printease-job-"));
  const safeName = getSafeFileName(printFileItem);
  const filePath = path.join(tempDir, safeName);

  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));

    const expectedHash = getExpectedFileHash(printFileItem);
    if (expectedHash) {
      const actualHash = await calculateSha256(filePath);
      if (actualHash !== expectedHash) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        return {
          success: false,
          message: "Downloaded print file failed SHA-256 verification.",
        };
      }
    }

    return {
      success: true,
      filePath,
      tempDir,
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return {
      success: false,
      message: error.message || "Could not save downloaded print file.",
    };
  }
}

export async function processNextJob({ agentToken, printerName } = {}) {
  const nextJob = await getNextJob({ agentToken });
  if (!nextJob.success || !nextJob.job) return nextJob;

  const job = nextJob.job;
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
      downloads.push({ ...download, file });
    }

    await markJobStatus({ agentToken, jobId: job.jobId, status: "printing" });

    const printedFiles = [];
    for (const download of downloads) {
      await assertJobStillPrintable({ agentToken, jobId: job.jobId });
      const printResult = await printFile({
        printerName: selectedPrinterName,
        filePath: download.filePath,
        copies: download.file.copies || job.copies || 1,
        options: {
          ...download.file.printOptions,
          copies: download.file.copies || download.file.printOptions?.copies || job.copies || 1,
        },
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
      await rm(download.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export function createJobPoller(options = {}) {
  let timer = null;

  return {
    get isRunning() {
      return Boolean(timer);
    },
    async pollOnce(overrides = {}) {
      return processNextJob({ ...options, ...overrides });
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
        processNextJob(pollOptions).catch(() => {});
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
