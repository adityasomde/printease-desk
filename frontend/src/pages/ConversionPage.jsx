import { useEffect, useState } from "react";
import { Loader2, FileCog, ShieldAlert, CheckCircle2, RotateCw } from "lucide-react";
import Card from "../components/Card";
import { getAgentStatus, diagnoseLibreOffice, conversionNow, isDesktop } from "../utils/desktopBridge";

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
    getAgentStatus().then((status) => {
      if (active && status?.success) {
        setAgentSession(status);
      }
    });
    return () => { active = false; };
  }, []);

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

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start justify-between">
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
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 border whitespace-pre-wrap font-mono">
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
              Trigger the conversion queue immediately.
            </p>
          </div>
          
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 border">
            <p><span className="font-semibold">Paired Hub:</span> {agentSession?.hubId ? "Yes" : "No"}</p>
            <p><span className="font-semibold">Last Poll:</span> {agentSession?.lastJobPollAt ? new Date(agentSession.lastJobPollAt).toLocaleString() : "Never"}</p>
            {agentSession?.lastJobPollError && (
              <p className="text-red-600"><span className="font-semibold">Last Error:</span> {agentSession.lastJobPollError}</p>
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
