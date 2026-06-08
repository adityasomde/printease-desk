const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("releaseBuilder", {
  runCommand: (commandKey) => ipcRenderer.invoke("release-builder:run-command", commandKey),
  killCommand: (commandKey) => ipcRenderer.invoke("release-builder:kill-command", commandKey),
  runDiagnostics: () => ipcRenderer.invoke("release-builder:run-diagnostics"),
  getGitAndVersionInfo: () => ipcRenderer.invoke("release-builder:get-git-and-version"),
  saveReleaseReport: (reportData) => ipcRenderer.invoke("release-builder:save-report", reportData),
  openDirectory: (dirPath) => ipcRenderer.invoke("release-builder:open-directory", dirPath),
  onLog: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("release-builder:log", listener);
    return () => ipcRenderer.removeListener("release-builder:log", listener);
  },
  onCommandState: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("release-builder:command-state", listener);
    return () => ipcRenderer.removeListener("release-builder:command-state", listener);
  }
});
