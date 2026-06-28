import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, DownloadCloud, FileCog, RefreshCw } from "lucide-react";
import Card from "../components/Card";
import {
  conversionNow,
  diagnoseLibreOffice,
  getAgentStatus,
  isDesktop,
  onAgentUpdated,
  predownloadNow,
} from "../utils/desktopBridge";

export default function ConversionPage({ navigate }) {
  const [desktopAvailable, setDesktopAvailable] = useState(() => isDesktop());
  const [agentSession, setAgentSession] = useState(null);
  const [diagnostic, setDiagnostic] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDesktopAvailable(isDesktop());
    const unsubscribe = onAgentUpdated((session) => {
      setDesktopAvailable(true);
      if (session?.success) setAgentSession(session);
    });

    getAgentStatus()
      .then((session) => {
        if (session?.success) setAgentSession(session);
      })
      .catch(() => {});

    return unsubscribe;
  }, []);

  async function runAction(label, action) {
    setBusy(label);
    setMessage("");
    setError("");
    try {
      const result = await action();
      if (result?.session) setAgentSession(result.session);
      if (result?.success === false) {
        setError(result.error || result.message || `${label} failed.`);
      } else {
        setMessage(result?.message || `${label} completed.`);
      }
      return result;
    } catch (actionError) {
      setError(actionError.message || `${label} failed.`);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function runLibreOfficeDiagnostic() {
    const result = await runAction("Diagnose LibreOffice", diagnoseLibreOffice);
    if (result) setDiagnostic(result);
  }

  if (!desktopAvailable) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-1 text-amber-600" size={22} />
          <div>
            <h2 className="text-2xl font-bold">Conversion Diagnostics</h2>
            <p className="mt-2 text-slate-600">
              Open this page inside PrintEase Desktop to inspect LibreOffice and run local conversion checks.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileCog size={24} />
              <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Conversion Diagnostics
              </h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Check whether this hub desktop can download and convert Office files before printing.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate?.("desktopAgent")}
            className="min-h-11 rounded-2xl border px-4 py-3 text-sm font-semibold hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            Open Desktop Agent
          </button>
        </div>
      </Card>

      {(message || error) && (
        <div
          role={error ? "alert" : "status"}
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="text-lg font-bold">Desktop Conversion Status</h3>
          <div className="mt-4 grid gap-2 text-sm text-slate-600">
            <p>Paired: <b>{agentSession?.paired ? "Yes" : "No"}</b></p>
            <p>Predownload loop: <b>{agentSession?.predownloadLoopRunning ? "Running" : "Stopped"}</b></p>
            <p>Conversion loop: <b>{agentSession?.conversionLoopRunning ? "Running" : "Stopped"}</b></p>
            <p>Converting now: <b>{agentSession?.conversionRunning ? "Yes" : "No"}</b></p>
            {agentSession?.lastPredownloadMessage && <p>Predownload: {agentSession.lastPredownloadMessage}</p>}
            {agentSession?.lastConversionMessage && <p>Conversion: {agentSession.lastConversionMessage}</p>}
            {agentSession?.lastConversionError && (
              <p className="font-semibold text-rose-700">Last error: {agentSession.lastConversionError}</p>
            )}
            {agentSession?.converterPath && <p className="break-all">Converter: {agentSession.converterPath}</p>}
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => runAction("Predownload now", predownloadNow)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            >
              <DownloadCloud size={16} />
              Predownload Now
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => runAction("Conversion now", conversionNow)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            >
              <RefreshCw size={16} className={busy === "Conversion now" ? "animate-spin" : ""} />
              Convert Now
            </button>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-bold">LibreOffice</h3>
          <p className="mt-2 text-sm text-slate-600">
            PrintEase uses LibreOffice to convert DOCX, PPTX, and XLSX into print-ready PDFs.
          </p>

          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={runLibreOfficeDiagnostic}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            <RefreshCw size={16} className={busy === "Diagnose LibreOffice" ? "animate-spin" : ""} />
            Diagnose LibreOffice
          </button>

          {diagnostic && (
            <div className={`mt-4 rounded-2xl border p-4 text-sm ${
              diagnostic.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
            }`}>
              <div className="flex items-start gap-2">
                {diagnostic.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <div>
                  <p className="font-bold">{diagnostic.message || (diagnostic.success ? "LibreOffice detected." : "LibreOffice not detected.")}</p>
                  {diagnostic.path && <p className="mt-1 break-all">Path: {diagnostic.path}</p>}
                  {diagnostic.source && <p className="mt-1">Source: {diagnostic.source}</p>}
                  {diagnostic.manualDownloadUrl && !diagnostic.success && (
                    <p className="mt-2 break-all">Manual download: {diagnostic.manualDownloadUrl}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

