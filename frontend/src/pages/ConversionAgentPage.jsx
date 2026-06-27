import { useEffect, useState } from "react";
import { FileDown, FileText, Settings, TriangleAlert } from "lucide-react";
import Card from "../components/Card";
import { onAgentUpdated, getDesktopStatus, diagnoseLibreOffice, checkBackendHealth } from "../utils/desktopBridge";

export default function ConversionAgentPage() {
  const [agentSession, setAgentSession] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [libreOfficeDiagnostics, setLibreOfficeDiagnostics] = useState(null);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);

  useEffect(() => {
    let active = true;

    getDesktopStatus().then((nextStatus) => {
      if (!active) return;
      if (nextStatus?.success === false) {
        setError(nextStatus.error || "Could not load desktop status.");
        return;
      }
      setStatus(nextStatus);
    });

    const unsubscribeAgent = onAgentUpdated((result) => {
      if (result?.success) {
        setAgentSession(result);
      }
    });

    return () => {
      active = false;
      unsubscribeAgent();
    };
  }, []);

  async function runLibreOfficeDiagnostics() {
    setDiagnosticsRunning(true);
    try {
      const result = await diagnoseLibreOffice();
      setLibreOfficeDiagnostics(result);
    } catch (e) {
      setLibreOfficeDiagnostics({ success: false, message: e.message });
    } finally {
      setDiagnosticsRunning(false);
    }
  }

  const isPaired = Boolean(agentSession?.agentId);
  const conversionLoopRunning = Boolean(agentSession?.conversionLoopRunning);
  const conversionRunning = Boolean(agentSession?.conversionRunning);
  
  const libreOfficeFound = libreOfficeDiagnostics?.found === true || libreOfficeDiagnostics?.success === true;
  const conversionHasError = Boolean(agentSession?.lastConversionError || (libreOfficeDiagnostics && !libreOfficeFound));
  
  const conversionStatusText = conversionRunning
    ? "Conversion in progress"
    : conversionLoopRunning
      ? "Watching for pending conversions"
      : "Conversion watcher is stopped";

  if (!isPaired) {
    return (
      <Card>
        <div className="flex items-center gap-3 text-amber-600">
          <TriangleAlert size={24} />
          <div>
            <h2 className="text-xl font-bold">Conversion Module Offline</h2>
            <p className="mt-1 font-medium">Please pair the Desktop Agent first to enable the conversion module.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <div className="flex items-start gap-3">
          <FileText size={24} className="text-blue-600" />
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-slate-800">Conversion Agent</h2>
            <p className="mt-1 text-sm text-slate-600">
              Handles background conversion of Office documents to PDF using headless LibreOffice.
            </p>
            
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Conversion Loop Status</p>
                  <p className="text-xs text-slate-500 mt-1">{conversionStatusText}</p>
                </div>
                <div>
                  {conversionLoopRunning ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold">Active</span>
                  ) : (
                    <span className="px-3 py-1 bg-slate-200 text-slate-800 rounded-full text-xs font-semibold">Idle</span>
                  )}
                </div>
              </div>

              {agentSession?.lastConversionMessage && (
                <div className="p-4 bg-blue-50 text-blue-800 rounded-lg border border-blue-100 text-sm">
                  <p className="font-semibold mb-1">Latest Activity:</p>
                  <p>• {agentSession.lastConversionMessage}</p>
                </div>
              )}

              {conversionHasError && (
                <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2 mb-2">
                    <TriangleAlert size={18} />
                    <span className="font-bold">Conversion Failures / Warnings</span>
                  </div>
                  {agentSession?.lastConversionError && (
                    <p className="text-sm mt-1">• {agentSession.lastConversionError}</p>
                  )}
                  {libreOfficeDiagnostics && !libreOfficeFound && (
                    <p className="text-sm mt-1">• LibreOffice engine not found or failed to start.</p>
                  )}
                </div>
              )}
            </div>
            
            <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap gap-3">
              <button
                onClick={runLibreOfficeDiagnostics}
                disabled={diagnosticsRunning}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50"
              >
                <Settings size={16} />
                {diagnosticsRunning ? "Running Diagnostics..." : "Diagnose LibreOffice"}
              </button>
            </div>
            
            {libreOfficeDiagnostics && (
               <div className="mt-4 text-xs font-mono bg-slate-900 text-emerald-400 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                 {JSON.stringify(libreOfficeDiagnostics, null, 2)}
               </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
