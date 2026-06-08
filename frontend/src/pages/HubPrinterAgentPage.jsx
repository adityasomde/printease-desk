import { useEffect, useMemo, useState } from "react";
import { Activity, Link2, Pause, Play, Printer, RefreshCw, RotateCcw, ShieldX, Wifi } from "lucide-react";
import Card from "../components/Card";
import Metric from "../components/Metric";
import StatusBadge from "../components/StatusBadge";
import {
  checkBackendHealth,
  getHubAgentSummary,
  pairAgent,
  pauseHubAgent,
  resumeHubAgent,
  revokeHubAgent,
} from "../services/api";
import { isDesktop, listPrinters as listLocalPrinters, onPrintersUpdated } from "../utils/desktopBridge";

const EMPTY_ANALYTICS = {
  totalAgents: 0,
  onlineAgents: 0,
  offlineAgents: 0,
  pausedAgents: 0,
  revokedAgents: 0,
  totalPrinters: 0,
  availablePrinters: 0,
  offlinePrinters: 0,
  pausedPrinters: 0,
  queuedJobs: 0,
  printingJobs: 0,
  completedJobsToday: 0,
  failedJobsToday: 0,
};

function shortId(value) {
  if (!value) return "N/A";
  return String(value).slice(0, 8);
}

function label(value) {
  return String(value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return "Not seen yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function agentLabel(agent) {
  return agent?.agentName || agent?.deviceName || agent?.deviceId || shortId(agent?.id);
}

export default function HubPrinterAgentPage({ navigate }) {
  const [desktopAvailable, setDesktopAvailable] = useState(() => isDesktop());
  const [localPrinters, setLocalPrinters] = useState([]);
  const [localPrinterError, setLocalPrinterError] = useState("");
  const [agents, setAgents] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [printJobs, setPrintJobs] = useState([]);
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [backendHealth, setBackendHealth] = useState(null);
  const [pairingCode, setPairingCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const localPrinterNames = localPrinters.map((printer) => printer.displayName || printer.printerName).filter(Boolean).join(", ");
  const printersByAgent = useMemo(() => {
    const grouped = new Map();
    for (const printer of printers) {
      const next = grouped.get(printer.agentId) || [];
      next.push(printer);
      grouped.set(printer.agentId, next);
    }
    return grouped;
  }, [printers]);

  async function refreshAll() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const [summary, health] = await Promise.all([
        getHubAgentSummary(),
        checkBackendHealth().catch((healthError) => ({ success: false, message: healthError.message })),
      ]);

      setAgents(Array.isArray(summary.agents) ? summary.agents : []);
      setPrinters(Array.isArray(summary.printers) ? summary.printers : []);
      setPrintJobs(Array.isArray(summary.printJobs) ? summary.printJobs : []);
      setAnalytics(summary.analytics || EMPTY_ANALYTICS);
      setBackendHealth(health);
      setLastUpdatedAt(new Date().toISOString());

      const desktopNow = isDesktop();
      setDesktopAvailable(desktopNow);

      if (desktopNow) {
        const localPrinterResult = await listLocalPrinters();
        setLocalPrinters(Array.isArray(localPrinterResult?.printers) ? localPrinterResult.printers : []);
        setLocalPrinterError(localPrinterResult?.success === false ? localPrinterResult.error || localPrinterResult.message || "Could not load local printers." : "");
      } else {
        setLocalPrinters([]);
        setLocalPrinterError("");
      }
    } catch (loadError) {
      setError(loadError.message || "Could not load printer agent dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    return onPrintersUpdated((result) => {
      setDesktopAvailable(true);
      setLocalPrinters(Array.isArray(result?.printers) ? result.printers : []);
      setLocalPrinterError(result?.success === false ? result.error || result.message || "Could not load local printers." : "");
    });
  }, []);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 7000);
    return () => clearInterval(interval);
  }, []);

  async function submitPairingCode() {
    const code = pairingCode.trim();
    setError("");
    setMessage("");

    if (!code) {
      setError("Enter the pairing code shown in PrintEase Desktop.");
      return;
    }

    setLoading(true);

    try {
      const data = await pairAgent(code);
      setPairingCode("");
      setMessage(data.message || "Device paired. Confirm pairing in PrintEase Desktop.");
      await refreshAll();
    } catch (pairError) {
      setError(pairError.message || "Could not pair desktop device.");
    } finally {
      setLoading(false);
    }
  }

  async function runAgentAction(agentId, action, fallbackMessage) {
    setActionId(agentId);
    setError("");
    setMessage("");

    try {
      const data = await action(agentId);
      setMessage(data.message || "Device updated.");
      await refreshAll();
    } catch (actionError) {
      setError(actionError.message || fallbackMessage);
    } finally {
      setActionId("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold">Printer Status Sync</h2>
          <p className="text-slate-600">Backend monitors printer status for monitoring only. Actual printing happens on PrintEase Desktop, which selects the local printer and reports success or failure.</p>
          <p className={`mt-2 text-sm font-semibold ${backendHealth?.success ? "text-emerald-700" : "text-amber-700"}`}>
            Backend: {backendHealth ? (backendHealth.success ? "online" : "check failed") : "checking"}
          </p>
          {lastUpdatedAt && <p className="mt-2 text-xs text-slate-500">Last updated: {new Date(lastUpdatedAt).toLocaleTimeString()}</p>}
          {desktopAvailable && (
            <p className={`mt-2 text-sm font-semibold ${localPrinters.length > 0 ? "text-emerald-700" : "text-amber-700"}`}>
              Local desktop printers: {localPrinters.length > 0 ? localPrinterNames : "checking"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate("hubDashboard")} className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 font-semibold">
            <RotateCcw size={16} /> Dashboard
          </button>
          <button onClick={refreshAll} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {(message || error) && (
        <p className={`rounded-2xl p-4 text-sm font-semibold ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Online Devices" value={analytics.onlineAgents} icon={<Wifi />} />
        <Metric title="Available Printers" value={analytics.availablePrinters} icon={<Printer />} />
        <Metric title="Queued Jobs" value={analytics.queuedJobs} icon={<Activity />} />
        <Metric title="Failed Today" value={analytics.failedJobsToday} icon={<ShieldX />} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Offline Devices" value={analytics.offlineAgents} icon={<Wifi />} />
        <Metric title="Total Printers" value={analytics.totalPrinters} icon={<Printer />} />
        <Metric title="Printing Jobs" value={analytics.printingJobs} icon={<Activity />} />
        <Metric title="Completed Today" value={analytics.completedJobsToday} icon={<Activity />} />
      </div>

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-bold">Pair Desktop Device</h3>
            <p className="mt-1 text-sm text-slate-600">Open PrintEase Desktop on a shop PC, start pairing, then enter the code here.</p>
          </div>
          <div className="flex gap-2 lg:min-w-[360px]">
            <input
              value={pairingCode}
              onChange={(event) => setPairingCode(event.target.value)}
              placeholder="Pairing code"
              className="min-w-0 flex-1 rounded-xl border px-3 py-3"
            />
            <button onClick={submitPairingCode} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60">
              <Link2 size={16} /> Pair
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-xl font-bold">Connected Desktop Devices</h3>
        {agents.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            No online desktop devices are available. Open PrintEase Desktop on a shop PC, select a printer, and keep it connected.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {agents.map((agent) => {
              const agentPrinters = printersByAgent.get(agent.id) || [];
              const busy = actionId === agent.id;
              return (
                <div key={agent.id} className="rounded-2xl border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold">{agentLabel(agent)}</h4>
                      <p className="mt-1 text-xs text-slate-500">ID {shortId(agent.id)} · {agent.platform || "unknown"} · v{agent.version || "N/A"}</p>
                    </div>
                    <StatusBadge>{label(agent.liveStatus || agent.status)}</StatusBadge>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <p>Last seen: {formatDateTime(agent.lastSeenAt)}</p>
                    <p>Printers: {agentPrinters.length}</p>
                    <p>New jobs: {agent.paused ? "Disabled" : "Enabled"}</p>
                    <p>Paired: {formatDateTime(agent.pairedAt)}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => runAgentAction(agent.id, pauseHubAgent, "Could not disable new jobs.")}
                      disabled={busy || agent.paused || agent.liveStatus === "revoked"}
                      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      <Pause size={15} /> Disable New Jobs
                    </button>
                    <button
                      onClick={() => runAgentAction(agent.id, resumeHubAgent, "Could not enable new jobs.")}
                      disabled={busy || !agent.paused || agent.liveStatus === "revoked"}
                      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      <Play size={15} /> Enable New Jobs
                    </button>
                    <button
                      onClick={() => runAgentAction(agent.id, revokeHubAgent, "Could not revoke device.")}
                      disabled={busy || agent.liveStatus === "revoked"}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
                    >
                      <ShieldX size={15} /> Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-bold">Local Desktop Printers</h3>
            <p className="mt-1 text-sm text-slate-600">
              {desktopAvailable ? "Detected in this desktop shell before backend sync." : "Open PrintEase Desktop to detect local printers."}
            </p>
          </div>
          {desktopAvailable && (
            <button onClick={() => navigate("desktopAgent")} className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 font-semibold">
              <Printer size={16} /> Desktop Agent
            </button>
          )}
        </div>
        {localPrinterError ? (
          <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{localPrinterError}</p>
        ) : localPrinters.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            {desktopAvailable ? "No local desktop printers detected in this view." : "Desktop bridge disconnected. Open this page inside the PrintEase Desktop window to see local printers."}
          </p>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {localPrinters.map((printer) => (
              <div key={printer.systemPrinterId || printer.printerName} className="rounded-2xl border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold">{printer.displayName || printer.printerName}</h4>
                    <p className="mt-1 text-sm text-slate-600">{printer.rawStatus || printer.status || "unknown"}</p>
                  </div>
                  <StatusBadge>{label(printer.isDefault ? "default" : printer.status || "local")}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-xl font-bold">Synced Printer Status</h3>
        <p className="mt-1 text-sm text-slate-600">These are status reports from desktop devices. The backend does not stop, pause, or command local OS printers.</p>
        {printers.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            No printers synced yet. Open Desktop Agent page and click Refresh Printers.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {printers.map((printer) => {
              const agent = agentsById.get(printer.agentId);
              return (
                <div key={printer.id || `${printer.agentId}-${printer.printerName}`} className="rounded-2xl border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold">{printer.printerName}</h4>
                      <p className="mt-1 text-sm text-slate-600">{agentLabel(agent)} · {printer.systemPrinterId || "system printer"}</p>
                    </div>
                    <StatusBadge>{label(printer.condition || printer.status || "unknown")}</StatusBadge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <p>{printer.isDefault ? "Default printer" : "Not default"}</p>
                    <p>Accepting: {printer.accepting === false ? "No" : "Yes"}</p>
                    <p>Last checked: {formatDateTime(printer.lastCheckedAt)}</p>
                    {printer.warningText && <p className="font-semibold text-amber-700 sm:col-span-2">{printer.warningCode}: {printer.warningText}</p>}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button disabled className="rounded-xl border px-3 py-2 text-sm font-semibold text-slate-400">
                      Set Default Later
                    </button>
                    <button disabled className="rounded-xl border px-3 py-2 text-sm font-semibold text-slate-400">
                      Test Print Later
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-xl font-bold">Print Jobs</h3>
        {printJobs.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">No print jobs have been queued yet.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-3">Job</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Printer</th>
                  <th>Device</th>
                  <th>Failure</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {printJobs.map((job) => {
                  const agent = agentsById.get(job.agentId);
                  return (
                    <tr key={job.id} className="border-b">
                      <td className="py-3 font-semibold">{shortId(job.id)}</td>
                      <td>{shortId(job.orderId)}</td>
                      <td><StatusBadge>{label(job.status)}</StatusBadge></td>
                      <td>{job.printerName || "Unassigned"}</td>
                      <td>{agentLabel(agent)}</td>
                      <td className="max-w-[220px] text-rose-700">{job.failureReasonText || "-"}</td>
                      <td>{formatDateTime(job.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
