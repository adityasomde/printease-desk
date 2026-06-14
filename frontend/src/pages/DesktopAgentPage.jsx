import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Printer, RefreshCw, Send, Wifi, X, ShieldCheck, Loader2 } from "lucide-react";
import Card from "../components/Card";
import HubLocationCard from "../components/HubLocationCard";
import { registerDesktopAgent } from "../services/api";
import {
  checkBackendHealth,
  confirmApprovalPairing,
  confirmPairing,
  clearStoredAgent,
  diagnosePrinters,
  diagnoseWindowsPrintHelper,
  getAgentStatus,
  getDeviceIdentity,
  getDesktopStatus,
  getStoredAgent,
  isDesktop,
  listPrinters,
  openApprovalUrl,
  selectPrinter as selectDesktopPrinter,
  saveStoredAgent,
  onAgentUpdated,
  onPrintersUpdated,
  pollPrintJobs,
  sendHeartbeat,
  startApprovalPairing as requestApprovalPairing,
  startJobPolling,
  startPairing,
  stopJobPolling,
  stopPrinting,
  syncPrinters as syncDesktopPrinters,
  testPrint,
} from "../utils/desktopBridge";

function normalizePrinterResult(result) {
  if (Array.isArray(result)) {
    return {
      printers: result,
      error: "",
      detail: "",
      helpCommands: [],
    };
  }

  if (result?.success === false) {
    return {
      printers: [],
      error: result.error || result.message || "Could not load printers.",
      detail: result.detail || "",
      helpCommands: Array.isArray(result.helpCommands) ? result.helpCommands : [],
    };
  }

  return {
    printers: Array.isArray(result?.printers) ? result.printers : [],
    error: "",
    detail: "",
    helpCommands: [],
  };
}

function localPrinterMessage(count) {
  return `Detected ${count} local printer${count === 1 ? "" : "s"}.`;
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function getUserRoleInfo(user) {
  const roleValues = [
    user?.role,
    user?.userRole,
    user?.accountType,
    user?.type,
    user?.profile?.role,
    user?.profile?.accountType,
  ].filter(Boolean);

  const normalizedRoles = roleValues.map(normalizeRole);
  const hubRoleValues = new Set([
    "hub",
    "centre",
    "center",
    "shop",
    "print-hub",
    "print-centre",
    "print-center",
    "printer",
    "owner",
    "admin",
  ]);
  const hasHubRole = normalizedRoles.some((role) => hubRoleValues.has(role));
  const hasHubIdentity = Boolean(
    user?.centreId ||
      user?.centerId ||
      user?.hubId ||
      user?.shopId ||
      user?.centre?.id ||
      user?.hub?.id ||
      user?.shop?.id
  );

  return {
    roleValues,
    normalizedRoles,
    hasHubRole,
    hasHubIdentity,
    isHubAccount: Boolean(hasHubRole || hasHubIdentity),
    reason: hasHubRole
      ? "Matched hub-like role"
      : hasHubIdentity
        ? "Matched hub/centre/shop id"
        : "No hub-like role or hub identity found",
  };
}

function getStoredUser() {
  if (typeof window === "undefined") return null;

  try {
    return JSON.parse(window.localStorage.getItem("printease_user") || "null");
  } catch {
    return null;
  }
}

export default function DesktopAgentPage({ currentUser = null }) {
  const [desktopAvailable, setDesktopAvailable] = useState(() => isDesktop());
  const [storedUser, setStoredUser] = useState(() => getStoredUser());
  const [status, setStatus] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [selectedPrinterName, setSelectedPrinterName] = useState("");
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [helpCommands, setHelpCommands] = useState([]);
  const [agentSession, setAgentSession] = useState(null);
  const [agentStatusLoaded, setAgentStatusLoaded] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentMessage, setAgentMessage] = useState("");
  const [backendHealth, setBackendHealth] = useState(null);
  const [printerDiagnostics, setPrinterDiagnostics] = useState(null);
  const [windowsHelperDiagnostics, setWindowsHelperDiagnostics] = useState(null);
  const [autoPollingStarted, setAutoPollingStarted] = useState(false);
  const [approvalPolling, setApprovalPolling] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState("");
  const [manualPairingVisible, setManualPairingVisible] = useState(false);
  const [advancedDiagnosticsVisible, setAdvancedDiagnosticsVisible] = useState(false);
  const approvalTimerRef = useRef(null);
  const approvalSessionIdRef = useRef("");

  const defaultPrinter = useMemo(() => printers.find((printer) => printer.isDefault) || printers[0] || null, [printers]);
  const localPrinterNames = printers.map((printer) => printer.displayName || printer.printerName).filter(Boolean).join(", ");
  const activeUser = currentUser || storedUser;
  const roleInfo = useMemo(() => getUserRoleInfo(activeUser), [activeUser]);
  const isLoggedIn = Boolean(activeUser);
  const isHubAccount = roleInfo.isHubAccount;
  const hiddenReason = !isLoggedIn ? "No logged-in user found" : roleInfo.reason;

  function applyPrinterResult(result) {
    const normalized = normalizePrinterResult(result);

    setPrinters(normalized.printers);
    setSelectedPrinterName((previous) => {
      const savedSelection = agentSession?.selectedPrinterName || previous;
      const selectedStillExists = normalized.printers.some((printer) => printer.printerName === savedSelection);
      if (selectedStillExists) return savedSelection;
      return normalized.printers.find((printer) => printer.isDefault)?.printerName || normalized.printers[0]?.printerName || "";
    });
    setError(normalized.error);
    setErrorDetail(normalized.detail);
    setHelpCommands(normalized.helpCommands);
    const syncMessage = result?.cloudSync?.success === false ? " Cloud sync warning: " + result.cloudSync.message : "";
    setMessage(normalized.error ? "" : localPrinterMessage(normalized.printers.length) + syncMessage);
  }

  useEffect(() => {
    setDesktopAvailable(isDesktop());
    setStoredUser(getStoredUser());
    const unsubscribePrinters = onPrintersUpdated((result) => {
      setDesktopAvailable(true);
      applyPrinterResult(result);
    });
    const unsubscribeAgent = onAgentUpdated((result) => {
      setDesktopAvailable(true);
      if (result?.success) {
        setAgentSession(result);
        if (result.selectedPrinterName) setSelectedPrinterName(result.selectedPrinterName);
      }
    });

    return () => {
      unsubscribePrinters();
      unsubscribeAgent();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (approvalTimerRef.current) {
        clearInterval(approvalTimerRef.current);
        approvalTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (agentSession?.pairingSessionId) {
      approvalSessionIdRef.current = agentSession.pairingSessionId;
    }
  }, [agentSession?.pairingSessionId]);

  useEffect(() => {
    if (!desktopAvailable) return;
    let active = true;
    setAgentStatusLoaded(false);

    getDesktopStatus().then((nextStatus) => {
      if (!active) return;
      if (nextStatus?.success === false) {
        setError(nextStatus.error || "Could not load desktop status.");
        return;
      }

      setStatus(nextStatus);
      if (nextStatus.printerResult) applyPrinterResult(nextStatus.printerResult);
    });

    async function loadAgentStatus() {
      const stored = await getStoredAgent();
      if (!active) return;
      if (stored?.session?.success) {
        setAgentSession(stored.session);
        if (stored.session.selectedPrinterName) setSelectedPrinterName(stored.session.selectedPrinterName);
      }

      const nextSession = await getAgentStatus();
      if (!active) return;
      if (nextSession?.success) {
        setAgentSession(nextSession);
        if (nextSession.selectedPrinterName) setSelectedPrinterName(nextSession.selectedPrinterName);
      }
      setAgentStatusLoaded(true);
    }

    loadAgentStatus().catch((loadError) => {
      if (!active) return;
      setError(loadError.message || "Could not load desktop agent status.");
      setAgentStatusLoaded(true);
    });

    return () => {
      active = false;
    };
  }, [desktopAvailable]);

  useEffect(() => {
    if (!desktopAvailable || autoPollingStarted) return;
    if (!agentSession?.paired || agentSession?.polling) return;

    let active = true;

    async function autoStartPolling() {
      setError("");
      setMessage("");

      const syncResult = await syncDesktopPrinters();
      if (active && syncResult?.session) {
        setAgentSession(syncResult.session);
      }

      const pollingResult = await startJobPolling({ printerName: selectedPrinterName || undefined, intervalMs: 5000 });
      if (active) {
        if (pollingResult?.session) setAgentSession(pollingResult.session);
        if (pollingResult?.success) {
          setAgentMessage("Auto-print enabled. Desktop agent polling started.");
        } else if (pollingResult?.success === false) {
          setError(pollingResult.error || pollingResult.message || "Could not start auto-print polling.");
        }
        setAutoPollingStarted(true);
      }
    }

    autoStartPolling();

    return () => {
      active = false;
    };
  }, [desktopAvailable, agentSession?.paired, agentSession?.polling, selectedPrinterName, autoPollingStarted]);

  useEffect(() => {
    if (!desktopAvailable) return;
    refreshPrinters();
  }, [desktopAvailable]);

  useEffect(() => {
    if (defaultPrinter && !selectedPrinterName) {
      setSelectedPrinterName(defaultPrinter.printerName);
    }
  }, [defaultPrinter, selectedPrinterName]);

  async function refreshPrinters() {
    setLoadingPrinters(true);
    setError("");
    setErrorDetail("");
    setHelpCommands([]);
    setMessage("");

    const result = await listPrinters();
    applyPrinterResult(result);
    setLoadingPrinters(false);
  }

  async function selectLocalPrinter(printerName) {
    setError("");
    setErrorDetail("");
    setHelpCommands([]);
    setMessage("");

    if (!printerName) {
      setError("Choose a printer first.");
      return;
    }

    const result = await selectDesktopPrinter({ printerName });

    if (result?.success === false) {
      setError(result.error || result.message || "Could not select printer.");
      return;
    }

    if (result?.session) setAgentSession(result.session);
    const nextPrinterName = result?.session?.selectedPrinterName || result?.printer?.printerName || printerName;
    setSelectedPrinterName(nextPrinterName);
    setPrinters((current) => current.map((printer) => ({
      ...printer,
      isDefault: printer.printerName === nextPrinterName,
    })));

    const syncWarning = result?.printerSync?.success === false ? " Cloud sync warning: " + result.printerSync.message : "";
    setMessage((result?.message || "Printer selected.") + syncWarning);
  }

  async function runPrinterDiagnostics() {
    setAdvancedDiagnosticsVisible(true);
    setError("");
    setErrorDetail("");
    setHelpCommands([]);
    setMessage("");

    const result = await diagnosePrinters();
    setPrinterDiagnostics(result);

    if (result?.success === false) {
      setError(result.error || "Printer diagnostics found a local printing issue.");
      return;
    }

    setMessage("Printer diagnostics completed.");
  }

  async function checkWindowsPrintHelper() {
    setAdvancedDiagnosticsVisible(true);
    setError("");
    setErrorDetail("");
    setHelpCommands([]);
    setMessage("");

    const result = await diagnoseWindowsPrintHelper();
    setWindowsHelperDiagnostics(result);

    if (result?.success === false) {
      setError(result.error || result.message || "Windows print helper check failed.");
      return;
    }

    setMessage(result?.message || "Windows print helper found.");
  }

  async function sendTestPrint() {
    setError("");
    setErrorDetail("");
    setHelpCommands([]);
    setMessage("");

    if (!selectedPrinterName) {
      setError("Select a printer before sending a test print.");
      return;
    }

    const result = await testPrint({ printerName: selectedPrinterName });

    if (result?.success === false) {
      setError(result.error || result.message || "Could not send test print.");
      return;
    }

    setMessage(result?.message || "Test print sent.");
  }

  async function stopLocalPrinting() {
    setError("");
    setErrorDetail("");
    setHelpCommands([]);
    setMessage("");

    const result = await stopPrinting();

    if (result?.success === false) {
      setError(result.error || result.message || "Could not stop printing.");
      return;
    }

    setMessage(result?.message || "Printing stopped locally.");
  }

  async function runAgentAction(action) {
    setAgentBusy(true);
    setAgentMessage("");
    setError("");
    setErrorDetail("");
    setHelpCommands([]);

    const result = await action();

    if (result?.session) setAgentSession(result.session);

    if (result?.success === false) {
      setError(result.error || result.message || "Desktop agent action failed.");
    } else {
      setAgentMessage(result?.message || (result?.paired === false ? "Pairing is still pending." : "Desktop agent action completed."));
    }

    setAgentBusy(false);
    return result;
  }

  async function clearLocalAgentAndReconnect() {
    setAgentBusy(true);
    setAgentMessage("");
    setApprovalMessage("");
    setError("");
    setErrorDetail("");
    setHelpCommands([]);

    try {
      const result = await clearStoredAgent();
      if (result?.success === false) {
        setError(result.error || result.message || "Could not clear local desktop agent.");
        return;
      }

      const nextSession = await getAgentStatus();
      if (nextSession?.success) {
        setAgentSession(nextSession);
      } else {
        setAgentSession(null);
      }
      setAutoPollingStarted(false);
      setAgentMessage("Local desktop agent credentials cleared. Register this desktop again to reconnect.");
    } catch (clearError) {
      setError(clearError.message || "Could not clear local desktop agent.");
    } finally {
      setAgentBusy(false);
    }
  }

  function stopApprovalPolling() {
    if (approvalTimerRef.current) {
      clearInterval(approvalTimerRef.current);
      approvalTimerRef.current = null;
    }
    setApprovalPolling(false);
  }

  async function pollApprovalStatus() {
    try {
      const result = await confirmApprovalPairing(approvalSessionIdRef.current || agentSession?.pairingSessionId);

      if (result?.session) {
        setAgentSession(result.session);
      }

      if (result?.paired) {
        stopApprovalPolling();
        setAgentMessage(result.message || "Device paired successfully.");
        setApprovalMessage("");
        approvalSessionIdRef.current = "";
        return;
      }

      if (result?.status === 403 || result?.status === 410) {
        stopApprovalPolling();
        setError(result.message || "Pairing request was rejected or expired.");
        setApprovalMessage("");
        approvalSessionIdRef.current = "";
      } else if (result?.success === true && result?.paired === false) {
        setApprovalMessage(result.message || "Waiting for hub approval...");
      }
    } catch (pollError) {
      setApprovalMessage("");
      setError(pollError.message || "Could not poll pairing status.");
      stopApprovalPolling();
    }
  }

  function startApprovalPolling() {
    stopApprovalPolling();
    setApprovalPolling(true);
    setApprovalMessage("Waiting for hub approval...");
    approvalTimerRef.current = setInterval(pollApprovalStatus, 3000);
    pollApprovalStatus();
  }

  async function beginApprovalPairing() {
    setAgentBusy(true);
    setAgentMessage("");
    setApprovalMessage("");
    setError("");
    setErrorDetail("");
    setHelpCommands([]);

    const result = await requestApprovalPairing({ deviceName: agentSession?.deviceName || "PrintEase Desktop" });

    if (result?.session) {
      setAgentSession(result.session);
      approvalSessionIdRef.current = result.session.pairingSessionId || "";
    }

    if (result?.success && result?.approvalUrl) {
      const openResult = await openApprovalUrl(result.approvalUrl);
      if (openResult?.success) {
        setAgentMessage("Approval URL opened in your browser. Waiting for hub approval.");
      } else {
        setAgentMessage("Approval started. Open the approval link manually if it does not open automatically.");
      }
      startApprovalPolling();
    } else {
      setError(result?.message || "Could not start approval pairing.");
    }

    setAgentBusy(false);
  }

  async function registerLoggedInHubAgent() {
    setAgentBusy(true);
    setAgentMessage("");
    setApprovalMessage("");
    setError("");
    setErrorDetail("");
    setHelpCommands([]);

    try {
      const currentSession = agentSession || await getAgentStatus();
      const identity = await getDeviceIdentity();
      const deviceId = currentSession?.deviceId;
      const deviceName = currentSession?.deviceName || identity?.deviceName || "PrintEase Desktop";

      if (!deviceId && !identity?.deviceId) {
        setError("Desktop device identity is not ready. Refresh this page and try again.");
        return;
      }

      const result = await registerDesktopAgent({
        deviceId: deviceId || identity.deviceId,
        deviceName,
        platform: status?.platform || window.printeaseDesktop?.platform || "desktop",
        appVersion: status?.version,
        clientAction: "registerDesktopAgent",
      });
      const agentToken = result?.agentToken || result?.accessToken;

      if (!result?.success || !agentToken || !result?.agentId || !result?.hubId) {
        setError(result?.message || "Could not register this desktop agent.");
        return;
      }

      const stored = await saveStoredAgent({
        agentToken,
        agentId: result.agentId,
        hubId: result.hubId,
        linkedHubUserId: result.linkedHubUserId,
        linkedHubCentreId: result.linkedHubCentreId,
        deviceId: deviceId || identity.deviceId,
        deviceName,
        selectedPrinterName,
        pairedAt: new Date().toISOString(),
      });

      if (stored?.success === false) {
        setError(stored.error || stored.message || "Registered, but could not save desktop agent credentials.");
        return;
      }

      if (stored?.session) setAgentSession(stored.session);
      setAgentMessage("Desktop registered and auto-print is running.");
    } catch (registrationError) {
      setError(registrationError.message || "Could not register desktop agent for this hub.");
    } finally {
      setAgentBusy(false);
    }
  }

  async function checkHealth() {
    const result = await checkBackendHealth();
    setBackendHealth(result);

    if (result?.success === false) {
      setError(result.error || result.message || "Backend health check failed.");
      return;
    }

    setMessage("Backend health check passed.");
  }

  if (!desktopAvailable) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Printer size={22} />
          <div>
            <h2 className="text-2xl font-bold">Desktop Agent</h2>
            <p className="mt-1 font-semibold text-amber-700">Desktop bridge disconnected</p>
            <p className="mt-1 text-slate-600">Open this page inside the PrintEase Desktop window to use printer controls.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Wifi size={24} />
            <div>
              <h2 className="text-3xl font-bold">Desktop Agent</h2>
              <p className="mt-1 font-semibold text-emerald-700">Desktop mode detected</p>
              <p className="mt-1 text-sm font-semibold text-emerald-700">Desktop bridge connected</p>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Keep this app open on the shop PC. It will sync printers and automatically print assigned paid/collected jobs.
              </p>
              <p className="mt-2 text-sm text-slate-600">Platform: {status?.platform || window.printeaseDesktop?.platform || "unknown"}</p>
              <p className="text-sm text-slate-600">Backend: {status?.backendUrl || "https://printease-backend-byex.onrender.com"}</p>
              <p className={`mt-2 text-sm font-semibold ${printers.length > 0 ? "text-emerald-700" : "text-amber-700"}`}>
                Local printers: {printers.length > 0 ? localPrinterNames : "checking"}
              </p>
              <p className={`mt-1 text-sm font-semibold ${selectedPrinterName ? "text-emerald-700" : "text-amber-700"}`}>
                Selected printer for auto-print: {selectedPrinterName || "Not selected"}
              </p>
              {backendHealth && (
                <p className={`mt-1 text-sm font-semibold ${backendHealth.success ? "text-emerald-700" : "text-rose-700"}`}>
                  Backend health: {backendHealth.success ? "online" : "unreachable"}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={checkHealth}
              className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold"
            >
              <Wifi size={16} /> Check Backend
            </button>
            <button
              type="button"
              onClick={refreshPrinters}
              disabled={loadingPrinters}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              <RefreshCw size={16} /> {loadingPrinters ? "Refreshing" : "Refresh Printers"}
            </button>
            <button
              type="button"
              onClick={runPrinterDiagnostics}
              className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold"
            >
              <Printer size={16} /> Diagnose
            </button>
            <button
              type="button"
              onClick={checkWindowsPrintHelper}
              className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold"
            >
              <Printer size={16} /> Check Windows Print Helper
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link2 size={20} />
              <h3 className="text-xl font-bold">Backend Agent</h3>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-600">
              <p>Device: {agentSession?.deviceName || "PrintEase Desktop"}</p>
              <p>Paired: {!agentStatusLoaded ? "Checking" : agentSession?.paired ? "Yes" : "No"}</p>
              {agentSession?.agentId && <p className="break-all">Agent ID: {agentSession.agentId}</p>}
              {agentSession?.hubId && <p className="break-all">Hub ID: {agentSession.hubId}</p>}
              {agentSession?.pairingCode && (
                <p className="text-lg font-bold text-slate-900">Pairing code: {agentSession.pairingCode}</p>
              )}
              {agentSession?.expiresAt && <p>Expires: {new Date(agentSession.expiresAt).toLocaleString()}</p>}
              <p>Polling: {agentSession?.polling ? "Running" : "Stopped"}</p>
              <p className={`font-semibold ${agentSession?.autoPrintRunning ? "text-emerald-700" : agentSession?.lastJobPollError ? "text-amber-700" : "text-slate-600"}`}>
                Auto-print: {agentSession?.autoPrintRunning ? "Running" : agentSession?.lastJobPollError ? "Error" : "Stopped"}
              </p>
              <p>Auto-print runs in the background after this desktop is registered.</p>
              <p>Heartbeat loop: {agentSession?.heartbeatRunning ? "Running" : "Stopped"}</p>
              {agentSession?.lastHeartbeatAt && <p>Last heartbeat: {new Date(agentSession.lastHeartbeatAt).toLocaleString()}</p>}
              {agentSession?.lastHeartbeatError && <p className="font-semibold text-amber-700">Heartbeat warning: {agentSession.lastHeartbeatError}</p>}
              {agentSession?.lastPrinterSyncAt && <p>Last printer sync: {new Date(agentSession.lastPrinterSyncAt).toLocaleString()}</p>}
              {agentSession?.lastPrinterSyncError && <p className="font-semibold text-amber-700">Printer sync warning: {agentSession.lastPrinterSyncError}</p>}
              {agentSession?.lastJobPollAt && <p>Last poll: {new Date(agentSession.lastJobPollAt).toLocaleString()}</p>}
              {agentSession?.lastJobPollMessage && <p>Last poll result: {agentSession.lastJobPollMessage}</p>}
              {agentSession?.lastJobPollError && <p className="font-semibold text-amber-700">Auto-print warning: {agentSession.lastJobPollError}</p>}
            </div>
          </div>

          <div className="grid gap-2 sm:min-w-[300px]">
            {!agentStatusLoaded && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                Checking saved desktop agent...
              </p>
            )}
            {agentStatusLoaded && !agentSession?.paired && isLoggedIn && isHubAccount && (
              <button
                type="button"
                disabled={agentBusy}
                onClick={registerLoggedInHubAgent}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:bg-slate-300"
              >
                {agentBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck size={16} />}
                Register This Desktop
              </button>
            )}
            {agentStatusLoaded && !agentSession?.paired && (!isLoggedIn || !isHubAccount) && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                Login as hub account to register this desktop.
              </p>
            )}
            <button
              type="button"
              disabled={agentBusy || approvalPolling}
              onClick={beginApprovalPairing}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:bg-slate-300"
            >
              {agentBusy || approvalPolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck size={16} />}
              Pair with Hub Account
            </button>
            {(approvalMessage || approvalPolling) && (
              <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                {approvalMessage || "Waiting for hub approval..."}
              </p>
            )}
            <button
              type="button"
              disabled={agentBusy}
              onClick={() => setManualPairingVisible((visible) => !visible)}
              className="rounded-xl border px-4 py-2 font-semibold"
            >
              Manual pairing fallback
            </button>
            {manualPairingVisible && (
              <div className="grid gap-2 rounded-2xl border bg-slate-50 p-3">
                <p className="text-sm text-slate-600">
                  Use this only if account-based registration is not working.
                </p>
                <button
                  type="button"
                  disabled={agentBusy}
                  onClick={() => runAgentAction(() => startPairing({ deviceName: agentSession?.deviceName || "PrintEase Desktop" }))}
                  className="rounded-xl border bg-white px-4 py-2 font-semibold"
                >
                  Generate Pairing Code
                </button>
                <button
                  type="button"
                  disabled={agentBusy || !agentSession?.pairingSessionId}
                  onClick={() => runAgentAction(confirmPairing)}
                  className="rounded-xl border bg-white px-4 py-2 font-semibold disabled:opacity-50"
                >
                  Confirm Manual Pairing
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={agentBusy || !agentSession?.paired}
              onClick={() => runAgentAction(() => startJobPolling({ printerName: selectedPrinterName || undefined }))}
              className="rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white disabled:bg-slate-300"
            >
              Restart Auto Print
            </button>
            <button
              type="button"
              disabled={agentBusy || !agentSession?.paired}
              onClick={() => runAgentAction(sendHeartbeat)}
              className="rounded-xl border px-4 py-2 font-semibold disabled:opacity-50"
            >
              Send Heartbeat
            </button>
            <button
              type="button"
              disabled={agentBusy}
              onClick={clearLocalAgentAndReconnect}
              className="rounded-xl border border-amber-200 px-4 py-2 font-semibold text-amber-700 disabled:opacity-50"
            >
              Clear Local Agent
            </button>
            <button
              type="button"
              disabled={agentBusy || !agentSession?.paired}
              onClick={() => runAgentAction(syncDesktopPrinters)}
              className="rounded-xl border px-4 py-2 font-semibold disabled:opacity-50"
            >
              Sync Printers
            </button>
            <button
              type="button"
              disabled={agentBusy || !agentSession?.paired || !selectedPrinterName}
              onClick={() => runAgentAction(() => pollPrintJobs({ printerName: selectedPrinterName }))}
              className="rounded-xl border px-4 py-2 font-semibold disabled:opacity-50"
            >
              Poll Now
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={agentBusy || !agentSession?.paired || !selectedPrinterName}
                onClick={() => runAgentAction(() => startJobPolling({ printerName: selectedPrinterName }))}
                className="flex-1 rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white disabled:bg-slate-300"
              >
                Start Polling
              </button>
              <button
                type="button"
                disabled={agentBusy}
                onClick={() => runAgentAction(stopJobPolling)}
                className="flex-1 rounded-xl border px-4 py-2 font-semibold"
              >
                Stop
              </button>
            </div>
          </div>
        </div>

        {agentMessage && (
          <p className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            {agentMessage}
          </p>
        )}
      </Card>

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <h3 className="text-xl font-bold">Local Printers</h3>
            {printers.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                No printers loaded yet. Refresh printers to detect CUPS printers such as PDF.
              </p>
            ) : (
              <div className="mt-4 grid gap-3">
                {printers.map((printer) => (
                  <label key={printer.systemPrinterId || printer.printerName} className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4">
                    <input
                      type="radio"
                      name="desktopPrinter"
                      value={printer.printerName}
                      checked={selectedPrinterName === printer.printerName}
                      onChange={(event) => selectLocalPrinter(event.target.value)}
                      className="mt-1"
                    />
                    <span className="flex-1">
                      <span className="block font-semibold">
                        {printer.displayName || printer.printerName}
                        {selectedPrinterName === printer.printerName ? " · Selected" : printer.isDefault ? " · Default" : ""}
                      </span>
                      <span className="block text-sm text-slate-600">{printer.condition || printer.status || "unknown"} · accepting {printer.accepting === false ? "no" : "yes"} · {printer.platform}</span>
                      {printer.warningText && <span className="mt-1 block text-xs font-semibold text-amber-700">{printer.warningCode}: {printer.warningText}</span>}
                      {printer.rawStatus && <span className="mt-1 block text-xs text-slate-500">{printer.rawStatus}</span>}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          selectLocalPrinter(printer.printerName);
                        }}
                        disabled={selectedPrinterName === printer.printerName}
                        className="mt-3 rounded-xl border px-3 py-2 text-xs font-semibold text-slate-700 disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700"
                      >
                        {selectedPrinterName === printer.printerName ? "Selected Printer" : "Use This Printer"}
                      </button>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:min-w-[260px]">
            <button
              type="button"
              onClick={sendTestPrint}
              disabled={!selectedPrinterName}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:bg-slate-300"
            >
              <Send size={16} /> Test Print
            </button>
            <button
              type="button"
              onClick={stopLocalPrinting}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-3 font-semibold text-rose-700 hover:bg-rose-50"
            >
              <X size={16} /> STOP Printing on this PC
            </button>
            <p className="text-xs text-slate-500">This only affects this desktop app.</p>
          </div>
        </div>

        {(message || error) && (
          <div className={`mt-5 rounded-2xl p-4 text-sm ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
            <p className="font-semibold">{error || message}</p>
            {errorDetail && <p className="mt-2 text-xs">{errorDetail}</p>}
            {helpCommands.length > 0 && (
              <div className="mt-3 grid gap-2">
                {helpCommands.map((command) => (
                  <code key={command} className="block rounded-xl bg-white/70 px-3 py-2 text-xs text-slate-800">
                    {command}
                  </code>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 rounded-2xl border bg-slate-50 p-4">
          <button
            type="button"
            onClick={() => setAdvancedDiagnosticsVisible((visible) => !visible)}
            className="text-sm font-semibold text-slate-800"
          >
            Advanced diagnostics
          </button>
          <p className="mt-2 text-xs text-slate-500">Use these tools only for troubleshooting.</p>

          {advancedDiagnosticsVisible && (
            <div className="mt-4 grid gap-3">
              {backendHealth?.success === false && (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                  Backend unreachable. Saved agent was not cleared. Retrying is safe.
                </p>
              )}
              <div className="rounded-xl bg-white p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">Account detection</p>
                <p>Detected role: {roleInfo.normalizedRoles.join(", ") || "none"}</p>
                <p>Detected account type: {roleInfo.roleValues.join(", ") || "none"}</p>
                <p>isHubAccount: {String(isHubAccount)}</p>
                <p>Reason button hidden: {isHubAccount ? "Button is available for this account." : hiddenReason}</p>
              </div>
            </div>
          )}
        </div>

        {advancedDiagnosticsVisible && printerDiagnostics?.probes?.length > 0 && (
          <div className="mt-5 rounded-2xl border bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-900">Desktop printer diagnostics</p>
            <div className="mt-3 grid gap-3">
              {printerDiagnostics.probes.map((probe) => (
                <div key={probe.command} className="rounded-xl bg-white p-3">
                  <p className="font-mono text-xs font-semibold text-slate-700">{probe.command}</p>
                  {probe.stdout && <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{probe.stdout}</pre>}
                  {probe.stderr && <pre className="mt-2 whitespace-pre-wrap text-xs text-rose-700">{probe.stderr}</pre>}
                  {probe.error && <p className="mt-2 text-xs text-rose-700">{probe.error}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {advancedDiagnosticsVisible && windowsHelperDiagnostics && (
          <div className="mt-5 rounded-2xl border bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-900">Windows print helper</p>
            <div className="mt-3 grid gap-2 text-slate-700">
              <p>Status: {windowsHelperDiagnostics.exists ? "Found" : "Missing"}</p>
              <p>Packaged: {windowsHelperDiagnostics.isPackaged ? "Yes" : "No"}</p>
              <p className="break-all">Path: {windowsHelperDiagnostics.expectedSumatraPath || "unknown"}</p>
              {windowsHelperDiagnostics.resourcesPath && (
                <p className="break-all">Resources: {windowsHelperDiagnostics.resourcesPath}</p>
              )}
              <p>Size: {windowsHelperDiagnostics.sizeBytes || 0} bytes</p>
              {(windowsHelperDiagnostics.message || windowsHelperDiagnostics.error) && (
                <p className={windowsHelperDiagnostics.success ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                  {windowsHelperDiagnostics.message || windowsHelperDiagnostics.error}
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Hub Location Visibility — lightweight card, no map library */}
      {isHubAccount && (
        <HubLocationCard currentCentre={activeUser} />
      )}
    </div>
  );
}
