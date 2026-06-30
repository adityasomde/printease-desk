import { useEffect, useState } from "react";
import { Loader2, FileCog, ShieldAlert, CheckCircle2, RotateCw } from "lucide-react";
import Card from "../components/Card";
import { getAgentStatus, diagnoseLibreOffice, conversionNow, isDesktop, onAgentUpdated } from "../utils/desktopBridge";

function normalizeAgentPayload(payload) {
  if (!payload) return null;
  return payload.session && typeof payload.session === "object" ? payload.session : payload;
}

function formatDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function StatusLine({ label, active, detail }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
      <span className="min-w-0 font-medium text-slate-700">{label}</span>
      <span className={`shrink-0 text-right ${active ? "font-semibold text-emerald-700" : "font-semibold text-slate-500"}`}>
        {detail || (active ? "On" : "Off")}
      </span>
    </div>
  );
}

export default function ConversionPage({ currentUser }) {
  const [desktopAvailable, setDesktopAvailable] = useState(() => isDesktop());
  const [agentSession, setAgentSession] = useState(null);
  const [libreOfficeDiagnostics, setLibreOfficeDiagnostics] = useState(null);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [conversionRunning, setConversionRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDesktopAvailable(isDesktop());
    if (!isDesktop()) return;

    let active = true;
    const applySession = (payload) => {
      const nextSession = normalizeAgentPayload(payload);
      if (active && nextSession?.success) {
        setAgentSession(nextSession);
      }
    };

    getAgentStatus().then(applySession).catch(() => {});
    const unsubscribe = onAgentUpdated(applySession);

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  async function refreshAgentSession() {
    const status = await getAgentStatus();
    const nextSession = normalizeAgentPayload(status);
    if (nextSession?.success) setAgentSession(nextSession);
    return nextSession;
  }

  async function runLibreOfficeCheck() {
    if (!desktopAvailable) return;
    setDiagnosticsRunning(true);
    setError("");
    setMessage("");

    try {
      const result = await diagnoseLibreOffice();
      setLibreOfficeDiagnostics(result);
      if (result?.success === false) {
        setError(result.error || result.message || "LibreOffice check failed.");
      } else {
        setMessage(result?.message || "LibreOffice looks good.");
      }
      await refreshAgentSession().catch(() => {});
    } catch (e) {
      setError(e.message || "Failed to run LibreOffice diagnostics.");
    } finally {
      setDiagnosticsRunning(false);
    }
  }

  async function runForceConversion() {
    if (!desktopAvailable) return;
    setConversionRunning(true);
    setError("");
    setMessage("");

    try {
      const result = await conversionNow();
      if (result?.success === false) {
        setError(result.error || result.message || "Forced conversion failed.");
      } else {
        setMessage(result?.message || "Forced conversion completed.");
      }
      const nextSession = normalizeAgentPayload(result);
      if (nextSession?.success) {
        setAgentSession(nextSession);
      } else {
        await refreshAgentSession().catch(() => {});
      }
    } catch (e) {
      setError(e.message || "Failed to trigger forced conversion.");
    } finally {
      setConversionRunning(false);
    }
  }

  if (!desktopAvailable) {
    return (
      <Card>
        <div className="flex items-center gap-3 text-amber-700">
          <ShieldAlert size={22} />
          <div>
            <h2 className="text-xl font-bold">Conversion Diagnostics</h2>
            <p className="mt-1">This page is only available in the PrintEase Desktop App.</p>
          </div>
        </div>
      </Card>
    );
  }

  const paired = Boolean(agentSession?.paired || agentSession?.hubId);
  const converterReady = agentSession?.converterStatus === "ready" || Boolean(agentSession?.converterPath);
  const moduleReady = Boolean(paired && agentSession?.conversionLoopRunning && converterReady);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-slate-100 p-3">
              <FileCog size={24} className="text-slate-700" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Conversion Diagnostics</h2>
              <p className="text-sm text-slate-600 mt-1">
                Monitor local file conversions and LibreOffice engine status.
              </p>
            </div>
          </div>
          <div className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${moduleReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {moduleReady ? "Conversion loop active" : paired ? "Agent paired" : "Agent not paired"}
          </div>
        </div>
      </Card>

      {error && (
        <div className="rounded-2xl bg-red-50 p-4 border border-red-200">
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}

      {message && (
        <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-200">
          <p className="text-sm font-semibold text-emerald-700">{message}</p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-bold">LibreOffice Engine</h3>
            <p className="text-sm text-slate-600 mt-1">
              Check if the bundled or local LibreOffice executable is working properly for Office-to-PDF conversions.
            </p>
          </div>
          
          {libreOfficeDiagnostics && (
            <div className="max-h-80 overflow-auto rounded-xl border bg-slate-50 p-3 font-mono text-xs text-slate-700 whitespace-pre-wrap break-words">
              {JSON.stringify(libreOfficeDiagnostics, null, 2)}
            </div>
          )}

          <div className="mt-auto pt-4">
            <button
              type="button"
              onClick={runLibreOfficeCheck}
              disabled={diagnosticsRunning}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {diagnosticsRunning ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {diagnosticsRunning ? "Checking Engine..." : "Diagnose LibreOffice"}
            </button>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-bold">Agent Status & Force Conversion</h3>
            <p className="text-sm text-slate-600 mt-1">
              Watch the desktop agent loops and trigger the conversion queue immediately.
            </p>
          </div>
          
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 border">
            <StatusLine label="Paired Hub" active={paired} detail={paired ? "Ready" : "Pair desktop first"} />
            <StatusLine label="Heartbeat" active={agentSession?.heartbeatRunning} />
            <StatusLine label="Printer Sync" active={agentSession?.printerSyncRunning} />
            <StatusLine label="Print Polling" active={agentSession?.polling} />
            <StatusLine label="Predownload Loop" active={agentSession?.predownloadLoopRunning} />
            <StatusLine label="Conversion Loop" active={agentSession?.conversionLoopRunning} />
            <StatusLine
              label="LibreOffice"
              active={converterReady}
              detail={agentSession?.converterStatus ? agentSession.converterStatus.replace(/_/g, " ") : (converterReady ? "ready" : "unknown")}
            />
            <div className="pt-2 text-xs text-slate-600">
              <p><span className="font-semibold">Last job poll:</span> {formatDateTime(agentSession?.lastJobPollAt)}</p>
              <p><span className="font-semibold">Last conversion:</span> {formatDateTime(agentSession?.lastConversionAt)}</p>
              {agentSession?.converterPath && (
                <p className="break-all"><span className="font-semibold">Converter:</span> {agentSession.converterPath}</p>
              )}
              {agentSession?.lastConversionMessage && (
                <p className="break-words"><span className="font-semibold">Conversion:</span> {agentSession.lastConversionMessage}</p>
              )}
              {agentSession?.converterMessage && (
                <p className="break-words"><span className="font-semibold">Converter status:</span> {agentSession.converterMessage}</p>
              )}
              {(agentSession?.lastJobPollError || agentSession?.lastConversionError) && (
                <p className="break-words text-red-600"><span className="font-semibold">Last Error:</span> {agentSession.lastConversionError || agentSession.lastJobPollError}</p>
              )}
            </div>
            {!paired && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                Pair the desktop from the Desktop Agent page before running conversion diagnostics.
              </p>
            )}
          </div>

          <div className="mt-auto pt-4">
            <button
              type="button"
              onClick={runForceConversion}
              disabled={conversionRunning}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {conversionRunning ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
              {conversionRunning ? "Running Conversion Loop..." : "Force Conversion Loop"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
