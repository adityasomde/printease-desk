import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { backendRequest } from "./heartbeat.js";
import { printFile } from "../printer/printExecutor.js";

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

function extensionForJob(job) {
  if (job?.fileType === "application/pdf") return ".pdf";
  return ".bin";
}

function fileNameForJob(job) {
  return String(job?.jobId || "job").replace(/[^a-z0-9._-]/gi, "_");
}

async function calculateSha256(filePath) {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

export async function downloadJobFile(job) {
  if (!job?.fileUrl) {
    return {
      success: false,
      message: "Print job does not include a signed file URL.",
    };
  }

  const response = await fetch(job.fileUrl);
  if (!response.ok || !response.body) {
    return {
      success: false,
      message: `Could not download print file. Status ${response.status}.`,
    };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "printease-job-"));
  const filePath = path.join(tempDir, `${fileNameForJob(job)}${extensionForJob(job)}`);

  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));

    const expectedHash = job.fileSha256 || job.fileHash;
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
  let download = null;

  try {
    await markJobStatus({ agentToken, jobId: job.jobId, status: "accepted" });
    await markJobStatus({ agentToken, jobId: job.jobId, status: "downloading" });

    download = await downloadJobFile(job);
    if (!download.success) throw new Error(download.message);

    await markJobStatus({ agentToken, jobId: job.jobId, status: "printing" });

    const printResult = await printFile({
      printerName: selectedPrinterName,
      filePath: download.filePath,
      copies: job.copies || 1,
    });

    if (!printResult.success) {
      const error = new Error(printResult.message || printResult.error || "Local print command failed.");
      error.reasonCode = printResult.reasonCode || printResult.errorCode || "LOCAL_PRINT_FAILED";
      throw error;
    }

    await markJobStatus({ agentToken, jobId: job.jobId, status: "completed" });

    return {
      success: true,
      message: "Print job completed.",
      job,
      printResult,
    };
  } catch (error) {
    const reasonCode = error.reasonCode || error.code || "LOCAL_PRINT_FAILED";
    await markJobStatus({
      agentToken,
      jobId: job.jobId,
      status: "failed",
      reasonCode,
      reasonText: error.message || "Local print job failed.",
    }).catch(() => {});

    return {
      success: false,
      message: error.message || "Could not process print job.",
      job,
    };
  } finally {
    if (download?.tempDir) {
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
