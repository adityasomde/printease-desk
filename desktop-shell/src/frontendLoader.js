import fs from "node:fs";
import path from "node:path";
import { app, net, protocol } from "electron";
import { pathToFileURL } from "node:url";
import { findCachedDocument, getDocumentCacheDirectory } from "../agent/documentCache.js";

const DEV_FRONTEND_URL = process.env.PRINTEASE_FRONTEND_URL || "http://127.0.0.1:5175";
const USE_DEV_FRONTEND = process.env.PRINTEASE_USE_DEV_FRONTEND === "1";
const DESKTOP_PROTOCOL_ORIGIN = "app://printease";

export function getProductionIndexPath(dirname) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "frontend-dist", "index.html");
  }
  const bundledIndex = path.join(dirname, "..", "frontend-dist", "index.html");
  if (fs.existsSync(bundledIndex)) return bundledIndex;
  return path.join(dirname, "..", "frontend", "dist", "index.html");
}

export function getFrontendDistRoot(dirname) {
  return path.dirname(getProductionIndexPath(dirname));
}

export function getDesktopAppUrl() {
  return `${DESKTOP_PROTOCOL_ORIGIN}/index.html`;
}

export function getFrontendBundleDiagnostics(dirname) {
  const indexPath = getProductionIndexPath(dirname);
  const frontendRoot = path.dirname(indexPath);
  const assetsPath = path.join(frontendRoot, "assets");
  let assetSample = [];

  try {
    if (fs.existsSync(assetsPath)) {
      assetSample = fs.readdirSync(assetsPath).slice(0, 12);
    }
  } catch (error) {
    assetSample = [`Could not read assets: ${error.message || error}`];
  }

  return {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    indexPath,
    indexExists: fs.existsSync(indexPath),
    frontendRoot,
    assetsPath,
    assetsExists: fs.existsSync(assetsPath),
    assetSample,
    protocolUrl: getDesktopAppUrl(),
  };
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function registerDesktopProtocol(dirname) {
  protocol.handle("app", async (request) => {
    const frontendRoot = getFrontendDistRoot(dirname);
    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.hostname !== "printease") {
        return new Response("Not found", { status: 404 });
      }

      const requestedPath = decodeURIComponent(requestUrl.pathname || "/");
      if (requestedPath.startsWith("/cache/")) {
        const documentId = requestedPath.replace(/^\/cache\/+/, "");
        const cachedDocumentPath = await findCachedDocument(documentId);
        const cacheRoot = getDocumentCacheDirectory();

        if (!cachedDocumentPath || !isPathInside(cacheRoot, cachedDocumentPath)) {
          return new Response("Cached document not found", { status: 404 });
        }
        return net.fetch(pathToFileURL(cachedDocumentPath).toString());
      }

      const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
      const candidatePath = path.normalize(path.join(frontendRoot, relativePath));

      if (!isPathInside(frontendRoot, candidatePath)) {
        return new Response("Forbidden", { status: 403 });
      }

      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        return net.fetch(pathToFileURL(candidatePath).toString());
      }

      if (!path.extname(candidatePath)) {
        return net.fetch(pathToFileURL(getProductionIndexPath(dirname)).toString());
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.warn("[DESKTOP PROTOCOL FAILED]", error?.message || error);
      return net.fetch(pathToFileURL(getProductionIndexPath(dirname)).toString());
    }
  });
}

function getDevServerErrorHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>PrintEase Desktop</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8fafc; color: #0f172a; font-family: system-ui; }
      main { width: min(640px, calc(100vw - 48px)); border: 1px solid #e2e8f0; border-radius: 18px; background: #fff; padding: 32px; }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { color: #475569; line-height: 1.6; }
      pre { overflow-x: auto; border-radius: 12px; background: #0f172a; color: #e2e8f0; padding: 16px; }
    </style>
  </head>
  <body>
    <main>
      <h1>PrintEase frontend bundle was not found</h1>
      <p>PrintEase Desktop normally loads <strong>frontend-dist/index.html</strong>.</p>
      <pre>PRINTEASE_USE_DEV_FRONTEND=1 npm run dev --prefix desktop-shell</pre>
    </main>
  </body>
</html>`;
}

export async function loadFrontend(window, dirname, writeLog) {
  const localIndex = getProductionIndexPath(dirname);
  const bundleDiagnostics = getFrontendBundleDiagnostics(dirname);
  writeLog("frontend-bundle", bundleDiagnostics);

  if (app.isPackaged) {
    try {
      await window.loadURL(getDesktopAppUrl());
    } catch (error) {
      console.warn("[DESKTOP APP PROTOCOL LOAD FAILED]", error?.message || error);
      await window.loadFile(localIndex);
    }
    return;
  }

  if (!USE_DEV_FRONTEND && fs.existsSync(localIndex)) {
    await window.loadFile(localIndex);
    return;
  }

  try {
    await window.loadURL(DEV_FRONTEND_URL);
  } catch {
    if (fs.existsSync(localIndex)) {
      await window.loadFile(localIndex);
      return;
    }
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getDevServerErrorHtml())}`);
  }
}

export function isAllowedNavigation(url) {
  if (url.startsWith("data:text/html")) return true;
  if (url.startsWith(DESKTOP_PROTOCOL_ORIGIN)) return true;
  if (app.isPackaged) return false;
  if (url.startsWith("file://")) return true;
  if (!USE_DEV_FRONTEND) return false;
  try {
    return new URL(url).origin === new URL(DEV_FRONTEND_URL).origin;
  } catch {
    return false;
  }
}
