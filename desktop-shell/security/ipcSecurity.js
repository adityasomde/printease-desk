import { ipcMain } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

function isAllowedRendererUrl(senderUrl, isPackaged) {
  if (!senderUrl) return false;
  
  if (isPackaged) {
    if (senderUrl.startsWith("app://")) return true;
    
    // Fallback for file:// if custom protocol isn't used
    if (senderUrl.startsWith("file://")) {
      const frontendDistPath = path.resolve(process.cwd(), "frontend-dist").replaceAll("\\", "/");
      const normalizedSender = senderUrl.replace("file:///", "").replace("file://", "").replaceAll("\\", "/");
      return normalizedSender.includes("frontend-dist/");
    }
    return false;
  }
  
  // Local dev
  return senderUrl.startsWith("http://localhost:") || senderUrl.startsWith("http://127.0.0.1:");
}

export function validateIpcSender(event, isPackaged) {
  const senderFrame = event.senderFrame;
  if (!senderFrame) return false;
  return isAllowedRendererUrl(senderFrame.url, isPackaged);
}

export function secureHandle(channel, handler, isPackaged) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!validateIpcSender(event, isPackaged)) {
      console.error(`[IPC SECURITY BLOCK] Unauthorized IPC access attempt to channel "${channel}" from URL: ${event.senderFrame?.url || 'unknown'}`);
      throw new Error("Unauthorized IPC access");
    }
    return handler(event, ...args);
  });
}
