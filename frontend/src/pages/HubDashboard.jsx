import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, Eye, FileText, IndianRupee, Link2, Printer, RefreshCw, Send, ShieldCheck, Wifi, X } from "lucide-react";
import Card from "../components/Card";
import Metric from "../components/Metric";
import StatusBadge from "../components/StatusBadge";
import { hubStatusOptions } from "../data/demoData";
import { collectCashPayment, createDocumentSignedDownload, getHubAgentSummary, getOrderDocuments, pairAgent, sendOrderToAgent } from "../services/api";

function normalizeStatus(status) {
  return String(status || "").toLowerCase().replace(/\s+/g, "_");
}

function isPaymentVerified(order) {
  const value = String(order?.paymentStatus || order?.payment_status || "").toLowerCase();
  return value === "verified" || value === "collected" || value === "paid" || value.includes("verif");
}

function isPaymentPending(order) {
  const value = String(order?.paymentStatus || order?.payment_status || "").toLowerCase();
  return value === "pending" || value === "unpaid" || !value;
}

const CLOSED_STATUSES = new Set(["collected", "refund_requested", "printing_failed", "cancelled"]);
const AGENT_LOCKED_STATUSES = new Set(["sent_to_agent", "queued_for_printing", "printing", "ready_for_pickup", "collected", "printing_failed"]);

const ROUTEABLE_PRINTER_STATUSES = new Set(["idle", "available", "enabled", "accepting"]);
const BLOCKED_PRINTER_STATUSES = new Set(["paused", "disabled", "stopped", "offline", "unable", "disconnected", "not_accepting"]);

function getEffectivePrinterCondition(printer) {
  const condition = normalizeStatus(printer?.condition);
  const status = normalizeStatus(printer?.status);
  return condition && condition !== "unknown" ? condition : status;
}

function isRouteablePrinter(printer) {
  const condition = getEffectivePrinterCondition(printer);
  if (printer?.accepting === false || BLOCKED_PRINTER_STATUSES.has(condition)) return false;
  return ROUTEABLE_PRINTER_STATUSES.has(condition);
}
const EMPTY_ANALYTICS = {
  onlineAgents: 0,
  availablePrinters: 0,
  queuedJobs: 0,
  failedJobsToday: 0,
};

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

function canSendToAgent(order) {
  return isPaymentVerified(order) && !AGENT_LOCKED_STATUSES.has(normalizeStatus(order.status));
}


export default function HubDashboard({ currentHub, hubOrders, updateOrderStatus, refreshOrders, navigate }) {
  const [agents, setAgents] = useState([]);
  const [agentPrinters, setAgentPrinters] = useState([]);
  const [printJobs, setPrintJobs] = useState([]);
  const [agentAnalytics, setAgentAnalytics] = useState(EMPTY_ANALYTICS);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingMessage, setPairingMessage] = useState("");
  const [sendingOrderId, setSendingOrderId] = useState("");
  const [sendModalOrder, setSendModalOrder] = useState(null);
  const [documentModalOrder, setDocumentModalOrder] = useState(null);
  const [orderDocuments, setOrderDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedPrinterName, setSelectedPrinterName] = useState("");
  const [collectingOrderId, setCollectingOrderId] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const ordersForHub = hubOrders || [];

  const totalPages = ordersForHub.reduce((sum, item) => sum + item.pages * item.copies, 0);
  const totalRevenue = ordersForHub.filter(isPaymentVerified).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pendingOrders = ordersForHub.filter((item) => !CLOSED_STATUSES.has(normalizeStatus(item.status))).length;
  const primaryAgent = agents[0] || null;
  const defaultPrinter = agentPrinters.find((printer) => printer.isDefault) || agentPrinters[0] || null;
  const agentStatus = primaryAgent ? (primaryAgent.paused ? "New Jobs Disabled" : primaryAgent.status || "Offline") : "Offline";
  const routeableAgents = useMemo(() => {
    return agents.filter((agent) => {
      const status = normalizeStatus(agent.liveStatus || agent.status);
      return !agent.paused && status === "online";
    });
  }, [agents]);
  const printersByAgent = useMemo(() => {
    const grouped = new Map();
    for (const printer of agentPrinters) {
      const list = grouped.get(printer.agentId) || [];
      list.push(printer);
      grouped.set(printer.agentId, list);
    }
    return grouped;
  }, [agentPrinters]);
  const selectedAgentPrinters = (printersByAgent.get(selectedAgentId) || []).filter(isRouteablePrinter);
  const jobByOrderId = useMemo(() => {
    return new Map(printJobs.map((job) => [job.orderId, job]));
  }, [printJobs]);

  async function refreshAgentStatus() {
    setAgentLoading(true);
    setAgentError("");

    try {
      const data = await getHubAgentSummary();
      setAgents(Array.isArray(data.agents) ? data.agents : []);
      setAgentPrinters(Array.isArray(data.printers) ? data.printers : []);
      setPrintJobs(Array.isArray(data.printJobs) ? data.printJobs : []);
      setAgentAnalytics(data.analytics || EMPTY_ANALYTICS);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setAgentError(error.message || "Could not load agent status.");
    } finally {
      setAgentLoading(false);
    }
  }

  useEffect(() => {
    if (currentHub?.id) {
      refreshAgentStatus();
      const interval = setInterval(() => {
        refreshAgentStatus();
        refreshOrders?.();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [currentHub?.id]);

  if (!currentHub) return <Card>Please login as print hub.</Card>;

  async function submitPairingCode() {
    const code = pairingCode.trim();
    setPairingMessage("");
    setAgentError("");

    if (!code) {
      setPairingMessage("Enter the code shown in PrintEase Desktop.");
      return;
    }

    setAgentLoading(true);

    try {
      const data = await pairAgent(code);
      setPairingCode("");
      setPairingMessage(data.message || "Agent paired.");
      await refreshAgentStatus();
    } catch (error) {
      setPairingMessage(error.message || "Could not pair agent.");
    } finally {
      setAgentLoading(false);
    }
  }

  function openSendModal(order) {
    const firstAgent = routeableAgents[0] || null;
    const firstPrinter = firstAgent ? (printersByAgent.get(firstAgent.id) || [])[0] : null;

    setSendModalOrder(order);
    setSelectedAgentId(firstAgent?.id || "");
    setSelectedPrinterName(firstPrinter?.printerName || "");
    setAgentError("");
  }

  function closeSendModal() {
    setSendModalOrder(null);
    setSelectedAgentId("");
    setSelectedPrinterName("");
  }

  function changeSelectedAgent(agentId) {
    const printers = printersByAgent.get(agentId) || [];
    const defaultForAgent = printers.find((printer) => printer.isDefault) || printers[0] || null;

    setSelectedAgentId(agentId);
    setSelectedPrinterName(defaultForAgent?.printerName || "");
  }

  async function markCashCollected(order) {
    const orderId = order.backendId || order.id;
    setCollectingOrderId(orderId);
    setAgentError("");
    setPairingMessage("");

    try {
      const data = await collectCashPayment(orderId);
      setPairingMessage(data.message || "Payment collected.");
      await Promise.all([refreshAgentStatus(), refreshOrders?.()]);
    } catch (error) {
      setAgentError(error.message || "Could not mark cash collected.");
    } finally {
      setCollectingOrderId("");
    }
  }

  async function sendToAgent() {
    const order = sendModalOrder;
    if (!order) return;

    const orderId = order.backendId || order.id;

    if (!selectedAgentId) {
      setAgentError("Select a desktop device before sending to agent.");
      return;
    }

    setSendingOrderId(orderId);
    setAgentError("");

    try {
      await sendOrderToAgent(orderId, {
        agentId: selectedAgentId,
        printerName: selectedPrinterName,
      });
      closeSendModal();
      await Promise.all([refreshAgentStatus(), refreshOrders?.()]);
    } catch (error) {
      setAgentError(error.message || "Could not send order to agent.");
    } finally {
      setSendingOrderId("");
    }
  }

  async function openDocuments(order) {
    const orderId = order.backendId || order.id;
    setDocumentModalOrder(order);
    setOrderDocuments([]);
    setDocumentsLoading(true);
    setAgentError("");

    try {
      const data = await getOrderDocuments(orderId);
      setOrderDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch (error) {
      setAgentError(error.message || "Could not load order documents.");
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function downloadDocument(documentId) {
    try {
      const data = await createDocumentSignedDownload(documentId);
      if (data.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setAgentError(error.message || "Could not create signed download link.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold">Print Hub Dashboard</h2>
          <p className="text-slate-600">{currentHub.name} · Code {currentHub.code}</p>
        </div>
        <button onClick={() => navigate("hubPricing")} className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white">
          Manage Pricing
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Total Orders" value={ordersForHub.length} icon={<FileText />} />
        <Metric title="Pending" value={pendingOrders} icon={<Printer />} />
        <Metric title="Pages Printed" value={totalPages} icon={<BarChart3 />} />
        <Metric title="Money Collected" value={`₹${totalRevenue}`} icon={<IndianRupee />} />
      </div>

      <Card>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Wifi size={20} />
              <h3 className="text-xl font-bold">Printer Agent</h3>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="font-semibold text-slate-900">Online devices</p>
                <p>{agentAnalytics.onlineAgents}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Available printers</p>
                <p>{agentAnalytics.availablePrinters}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Queued jobs</p>
                <p>{agentAnalytics.queuedJobs}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Failed today</p>
                <p>{agentAnalytics.failedJobsToday}</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p>
                Primary device: <b>{primaryAgent?.agentName || primaryAgent?.deviceId || "Not paired"}</b>{" "}
                <StatusBadge>{agentStatus}</StatusBadge>
              </p>
              <p className="mt-2">Default printer: <b>{defaultPrinter?.printerName || "Not selected"}</b></p>
              <p className="mt-2">Last seen: {formatDateTime(primaryAgent?.lastSeenAt)}</p>
              {lastUpdatedAt && <p className="mt-2 text-xs">Last updated: {new Date(lastUpdatedAt).toLocaleTimeString()}</p>}
            </div>
            {routeableAgents.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                {routeableAgents.slice(0, 3).map((agent) => (
                  <span key={agent.id} className="rounded-full border bg-white px-3 py-1">
                    {agent.agentName || agent.deviceId || agent.id} · {(printersByAgent.get(agent.id) || []).length} printers
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:min-w-[320px]">
            <div className="flex gap-2">
              <input
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value)}
                placeholder="Pairing code"
                className="min-w-0 flex-1 rounded-xl border px-3 py-2"
              />
              <button
                onClick={submitPairingCode}
                disabled={agentLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                <Link2 size={16} /> Pair Agent
              </button>
            </div>
            <button
              onClick={refreshAgentStatus}
              disabled={agentLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 font-semibold"
            >
              <RefreshCw size={16} /> Refresh Agent Status
            </button>
            <button
              onClick={() => navigate("hubPrinters")}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white"
            >
              <Printer size={16} /> Open Printer Agent Page
            </button>
            {(pairingMessage || agentError) && (
              <p className={agentError ? "text-sm font-semibold text-rose-600" : "text-sm font-semibold text-emerald-700"}>
                {agentError || pairingMessage}
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-xl font-bold">Incoming / Active Orders</h3>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-3">Order ID</th>
                <th>Document</th>
                <th>Pages</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Files</th>
                <th>Update</th>
                <th>Agent</th>
              </tr>
            </thead>
            <tbody>
              {ordersForHub.map((item) => {
                const job = jobByOrderId.get(item.backendId);
                const orderId = item.backendId || item.id;
                const sendEnabled = canSendToAgent(item);

                return (
                  <tr key={item.id} className="border-b">
                    <td className="py-3 font-semibold">{item.id}</td>
                    <td>{item.document}</td>
                    <td>{item.pages} × {item.copies}</td>
                    <td>₹{item.amount}</td>
                    <td>
                      <StatusBadge color="green">{item.paymentStatus}</StatusBadge>
                      {isPaymentPending(item) && (
                        <p className="mt-1 text-xs text-slate-500">Document stored securely. Printer agent will receive it only after payment is collected or verified.</p>
                      )}
                      {isPaymentVerified(item) && (
                        <p className="mt-1 text-xs text-emerald-700">Payment completed. Print job can be queued for the desktop agent even if no cloud printer is currently synced.</p>
                      )}
                    </td>
                    <td>
                      <StatusBadge>{item.status}</StatusBadge>
                      {job?.failureReasonText && <p className="mt-1 text-xs font-semibold text-rose-600">{job.failureReasonText}</p>}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openDocuments(item)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 font-semibold"
                      >
                        <FileText size={15} /> Documents
                      </button>
                    </td>
                    <td>
                      <select value={item.status} onChange={(e) => updateOrderStatus(item.id, e.target.value)} className="rounded-xl border px-3 py-2">
                        {hubStatusOptions.map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </td>
                    <td>
                      <div className="flex flex-col gap-2">
                        {job && <StatusBadge>{job.status}</StatusBadge>}
                        {job && normalizeStatus(job.status) !== "failed" && <p className="text-xs text-slate-500">Queued for Printing</p>}
                        {isPaymentPending(item) && (
                          <button
                            onClick={() => markCashCollected(item)}
                            disabled={collectingOrderId === orderId}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 font-semibold text-emerald-700 disabled:opacity-50"
                          >
                            <IndianRupee size={15} /> {collectingOrderId === orderId ? "Saving" : "Mark Cash Collected"}
                          </button>
                        )}
                        {sendEnabled && routeableAgents.length > 0 && (
                          <button
                            onClick={() => openSendModal(item)}
                            disabled={sendingOrderId === orderId}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 font-semibold text-white disabled:bg-slate-300"
                          >
                            <Send size={15} /> {sendingOrderId === orderId ? "Sending" : "Send to Agent"}
                          </button>
                        )}
                        {sendEnabled && routeableAgents.length === 0 && (
                          <button
                            onClick={() => navigate("hubPrinters")}
                            className="rounded-xl border border-amber-200 px-3 py-2 text-left text-xs font-semibold text-amber-800"
                          >
                            Payment completed. No online desktop agent is currently paired. The job will queue and wait for PrintEase Desktop to connect.
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {sendModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold">Send to Printer</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Choose the desktop device and local printer for order {sendModalOrder.id}.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSendModal}
                className="rounded-full border p-2"
                aria-label="Close send to printer modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Select Device
                <select
                  value={selectedAgentId}
                  onChange={(event) => changeSelectedAgent(event.target.value)}
                  className="rounded-xl border px-3 py-3 font-normal"
                >
                  <option value="">Choose desktop device</option>
                  {routeableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.agentName || agent.deviceName || agent.id} · {agent.status || "unknown"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Select Printer
                <select
                  value={selectedPrinterName}
                  onChange={(event) => setSelectedPrinterName(event.target.value)}
                  className="rounded-xl border px-3 py-3 font-normal"
                  disabled={!selectedAgentId}
                >
                  <option value="">Choose printer</option>
                  {selectedAgentPrinters.map((printer) => (
                    <option key={printer.id || printer.printerName} value={printer.printerName}>
                      {printer.printerName}{printer.isDefault ? " · Default" : ""}
                    </option>
                  ))}
                </select>
              </label>

              {routeableAgents.length === 0 && (
                <p className="rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                  No online desktop devices are available. Open PrintEase Hub Desktop on a shop PC and refresh status.
                </p>
              )}

              {selectedAgentId && selectedAgentPrinters.length === 0 && (
                <p className="rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                  This device has not synced any printers yet.
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={closeSendModal} className="rounded-xl border px-4 py-2 font-semibold">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={sendToAgent}
                  disabled={!selectedAgentId || Boolean(sendingOrderId)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white disabled:bg-slate-300"
                >
                  <Send size={16} /> {sendingOrderId ? "Queueing" : "Queue Print Job"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {documentModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold">Order Documents</h3>
                <p className="mt-1 text-sm text-slate-600">{documentModalOrder.id}</p>
              </div>
              <button type="button" onClick={() => setDocumentModalOrder(null)} className="rounded-full border p-2" aria-label="Close documents modal">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {documentsLoading && <p className="text-sm text-slate-500">Loading documents...</p>}
              {!documentsLoading && orderDocuments.length === 0 && <p className="text-sm text-slate-500">No documents found.</p>}
              {orderDocuments.map((document) => (
                <div key={document.documentId} className="rounded-2xl border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{document.fileName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {document.pageCount} pages · {Math.ceil(Number(document.fileSizeBytes || 0) / 1024)} KB · uploaded {document.uploadedAt ? new Date(document.uploadedAt).toLocaleString("en-IN") : "recently"}
                      </p>
                      <p className="mt-2 break-all text-xs text-slate-500">SHA-256: {document.fileSha256 || "Not available"}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Selected {document.selectedPageCount} · printable {document.printablePageCount} · copies {document.copies} · ₹{Number(document.amountPaise || 0) / 100}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => downloadDocument(document.documentId)}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                      >
                        <Download size={15} /> Download original
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadDocument(document.documentId)}
                        className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"
                      >
                        <Eye size={15} /> View
                      </button>
                      <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                        <ShieldCheck size={14} /> Hash shown
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
