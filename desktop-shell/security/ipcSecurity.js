import electron from "electron";
import path from "node:path";

const { ipcMain, app } = electron;

function isAllowedRendererUrl(senderUrl, isPackaged) {
  if (!senderUrl) return false;
  
  if (senderUrl.startsWith("app://")) return true;

  const packaged = isPackaged !== undefined ? isPackaged : app?.isPackaged;

  // Packaged and local built-mode frontends can both be loaded from file://.
  // Keep the check narrow so arbitrary local files cannot invoke privileged IPC.
  if (senderUrl.startsWith("file://")) {
    const normalizedSender = decodeURIComponent(senderUrl)
      .replace("file:///", "/")
      .replace("file://", "")
      .replaceAll("\\", "/");

    if (packaged) {
      // In packaged mode, file:// should be resolved from process.resourcesPath
      const prodRoot = path.resolve(process.resourcesPath, "frontend-dist").replaceAll("\\", "/");
      return normalizedSender.startsWith(`${prodRoot}/`);
    } else {
      // In unpackaged/development mode, resolve relative to process.cwd()
      const frontendDistPath = path.resolve(process.cwd(), "frontend-dist").replaceAll("\\", "/");
      const desktopFrontendDistPath = path.resolve(process.cwd(), "..", "frontend-dist").replaceAll("\\", "/");
      const frontendBuildPath = path.resolve(process.cwd(), "..", "frontend", "dist").replaceAll("\\", "/");

      return [
        frontendDistPath,
        desktopFrontendDistPath,
        frontendBuildPath
      ].some((allowedPath) => normalizedSender.startsWith(`${allowedPath}/`));
    }
  }

  if (packaged) {
    return false;
  }
  
  // Local dev
  return senderUrl.startsWith("http://localhost:") || senderUrl.startsWith("http://127.0.0.1:");
}

export function validateIpcSender(event, isPackaged) {
  const senderFrame = event.senderFrame;
  if (!senderFrame) return false;
  const packaged = isPackaged !== undefined ? isPackaged : app?.isPackaged;
  return isAllowedRendererUrl(senderFrame.url, packaged);
}

export function secureHandle(channel, handler, isPackaged) {
  ipcMain.handle(channel, async (event, ...args) => {
    const packaged = isPackaged !== undefined ? isPackaged : app?.isPackaged;
    if (!validateIpcSender(event, packaged)) {
      console.error(`[IPC SECURITY BLOCK] Unauthorized IPC access attempt to channel "${channel}" from URL: ${event.senderFrame?.url || 'unknown'}`);
      throw new Error("Unauthorized IPC access");
    }
    return handler(event, ...args);
  });
}
