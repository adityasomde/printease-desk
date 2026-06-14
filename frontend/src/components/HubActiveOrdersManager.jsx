import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  FileText,
  IndianRupee,
  PauseCircle,
  Printer,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import HubOrderConfigModal from "./HubOrderConfigModal";
import InlineDocumentFrame from "./InlineDocumentFrame";
import StatusBadge from "./StatusBadge";
import { hubStatusOptions } from "../data/demoData";
import {
  apiRequest,
  collectManualPayment,
  downloadDocumentBlob,
  getHubAgentSummary,
  getOrderDocuments,
  sendOrderToAgent,
} from "../services/api";

function normalizeStatus(status) {
  return String(status || "").toLowerCase().replace(/\s+/g, "_");
}

function label(value) {
  return String(value || "-").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function displayStatus(status) {
  const normalized = normalizeStatus(status);
  const labels = {
    payment_pending: "Payment Pending",
    payment_verified: "Payment Verified",
    accepted_by_centre: "Accepted",
    queued_for_printing: "Queued",
    sent_to_agent: "Sent to Agent",
    downloading: "Downloading",
    printing: "Printing",
    ready_for_pickup: "Ready for Pickup",
    collected: "Completed",
    printing_failed: "Printing Failed",
    paused: "Paused",
    cancelled: "Cancelled",
    refund_requested: "Refund Requested",
    failed: "Failed",
    completed: "Completed",
  };

  return labels[normalized] || status || "Unknown";
}

function isPaymentVerified(order) {
  const value = String(order?.paymentStatus || order?.payment_status || "").toLowerCase();
  return value === "verified" || value === "collected" || value === "paid" || value.includes("verif");
}

function isOrderCancelled(order) {
  return normalizeStatus(order?.status) === "cancelled";
}

function isPaymentPending(order) {
  if (isOrderCancelled(order)) return false;
  const value = String(order?.paymentStatus || order?.payment_status || "").toLowerCase();
  return value === "pending" || value === "unpaid" || !value;
}

const CLOSED_STATUSES = new Set(["collected", "refund_requested", "printing_failed", "cancelled"]);
const AGENT_LOCKED_STATUSES = new Set(["sent_to_agent", "queued_for_printing", "printing", "paused", "ready_for_pickup", "collected", "printing_failed", "cancelled"]);
const ROUTEABLE_PRINTER_STATUSES = new Set(["idle", "available", "enabled", "accepting"]);
const BLOCKED_PRINTER_STATUSES = new Set(["paused", "disabled", "stopped", "offline", "unable", "disconnected", "not_accepting"]);

function getHubPricing(hub) {
  const pricing = hub?.pricing || {};
  return {
    bwSingle: pricing.bwSingle ?? hub?.bwSingle,
    bwDouble: pricing.bwDouble ?? hub?.bwDouble,
    colorSingle: pricing.colorSingle ?? hub?.colorSingle,
    colorDouble: pricing.colorDouble ?? hub?.colorDouble,
    watermarkCharge: pricing.watermarkCharge ?? hub?.watermarkCharge,
  };
}

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

function canSendToAgent(order) {
  return isPaymentVerified(order) && !AGENT_LOCKED_STATUSES.has(normalizeStatus(order.status));
}

function canPauseOrder(order) {
  return !["paused", ...CLOSED_STATUSES].includes(normalizeStatus(order.status));
}

function canCancelOrder(order) {
  return !["ready_for_pickup", ...CLOSED_STATUSES].includes(normalizeStatus(order.status));
}

function canConfigureOrder(order, job) {
  const isManualPayment = ["draft", "pending", "collected"].includes(String(order.paymentStatus || "").toLowerCase());
  const isClosed = ["printed", "completed", "cancelled"].includes(String(order.status || "").toLowerCase());
  const hasActiveJobs = Boolean(job || (order.printJobs && order.printJobs.length > 0));
  return isManualPayment && !isClosed && !hasActiveJobs && !order.configLockedAt;
}

function OrderBadges({ order, job }) {
  const paymentVerified = isPaymentVerified(order);
  const paymentPending = isPaymentPending(order);
  return (
    <div className="flex flex-wrap gap-1.5">
      <StatusBadge color={paymentVerified ? "green" : "amber"}>{label(order.paymentStatus)}</StatusBadge>
      <StatusBadge>{displayStatus(order.status)}</StatusBadge>
      {paymentPending && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">Pending</span>}
      {paymentVerified && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">Paid</span>}
      {job && <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">{displayStatus(job.status)}</span>}
    </div>
  );
}

export default function HubActiveOrdersManager({
  currentHub,
  hubOrders,
  updateOrderStatus,
  refreshOrders,
  onOrderSaved,
  navigate,
  compact = false,
  agents: propsAgents,
  agentPrinters: propsAgentPrinters,
  printJobs: propsPrintJobs,
  refreshAgentStatus: propsRefreshAgentStatus,
  agentLoading: propsAgentLoading,
}) {
  const [internalAgents, setInternalAgents] = useState([]);
  const [internalAgentPrinters, setInternalAgentPrinters] = useState([]);
  const [internalPrintJobs, setInternalPrintJobs] = useState([]);
  const [internalAgentLoading, setInternalAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [message, setMessage] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [collectingOrderId, setCollectingOrderId] = useState("");
  const [statusActionId, setStatusActionId] = useState("");
  const [sendingOrderId, setSendingOrderId] = useState("");
  const [sendModalOrder, setSendModalOrder] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedPrinterName, setSelectedPrinterName] = useState("");
  const [documentModalOrder, setDocumentModalOrder] = useState(null);
  const [orderDocuments, setOrderDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentPreview, setDocumentPreview] = useState(null);
  const [documentActionId, setDocumentActionId] = useState("");
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [globalAutoPrintAfterCash, setGlobalAutoPrintAfterCash] = useState(() => {
    try {
      const saved = localStorage.getItem("printease_global_auto_print_cash");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const agents = propsAgents !== undefined ? propsAgents : internalAgents;
  const agentPrinters = propsAgentPrinters !== undefined ? propsAgentPrinters : internalAgentPrinters;
  const printJobs = propsPrintJobs !== undefined ? propsPrintJobs : internalPrintJobs;
  const agentLoading = propsAgentLoading !== undefined ? propsAgentLoading : internalAgentLoading;

  const ordersForHub = hubOrders || [];

  useEffect(() => {
    try {
      localStorage.setItem("printease_global_auto_print_cash", String(globalAutoPrintAfterCash));
    } catch {
      // Optional preference only.
    }
  }, [globalAutoPrintAfterCash]);

  async function refreshAgentStatus() {
    if (propsRefreshAgentStatus) {
      return propsRefreshAgentStatus();
    }
    if (!currentHub?.id) return;
    setInternalAgentLoading(true);
    setAgentError("");
    try {
      const data = await getHubAgentSummary();
      setInternalAgents(Array.isArray(data.agents) ? data.agents : []);
      setInternalAgentPrinters(Array.isArray(data.printers) ? data.printers : []);
      setInternalPrintJobs(Array.isArray(data.printJobs) ? data.printJobs : []);
    } catch (error) {
      setAgentError(error.message || "Could not load agent status.");
    } finally {
      setInternalAgentLoading(false);
    }
  }

  useEffect(() => {
    if (propsAgents === undefined) {
      refreshAgentStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHub?.id, propsAgents]);

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
  const jobByOrderId = useMemo(() => new Map(printJobs.map((job) => [job.orderId, job])), [printJobs]);

  const filteredOrders = useMemo(() => {
    const query = orderSearch.trim().toLowerCase();
    if (!query) return ordersForHub;
    return ordersForHub.filter((item) => {
      const job = jobByOrderId.get(item.backendId);
      return [
        item.id,
        item.backendId,
        item.customerName,
        item.customerMobile,
        item.document,
        item.paymentStatus,
        item.status,
        item.pickupCode,
        item.amount,
        job?.status,
        job?.printerName,
      ].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [jobByOrderId, orderSearch, ordersForHub]);

  function openSendModal(order) {
    const firstAgent = routeableAgents[0] || null;
    const firstPrinter = firstAgent ? (printersByAgent.get(firstAgent.id) || []).filter(isRouteablePrinter)[0] : null;
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
    const printers = (printersByAgent.get(agentId) || []).filter(isRouteablePrinter);
    const defaultForAgent = printers.find((printer) => printer.isDefault) || printers[0] || null;
    setSelectedAgentId(agentId);
    setSelectedPrinterName(defaultForAgent?.printerName || "");
  }

  async function markCashCollected(order) {
    const orderId = order.backendId || order.id;
    setCollectingOrderId(orderId);
    setAgentError("");
    setMessage("");
    try {
      const data = await collectManualPayment(orderId, {
        autoPrintAfterCollection: globalAutoPrintAfterCash,
        method: "cash",
      });
      setMessage(data.message || "Payment collected.");
      await Promise.all([refreshAgentStatus(), refreshOrders?.()]);
    } catch (error) {
      setAgentError(error.message || "Could not mark cash collected.");
    } finally {
      setCollectingOrderId("");
    }
  }

  async function quickUpdateOrderStatus(order, nextStatus) {
    const orderId = order.backendId || order.id;
    setStatusActionId(`${orderId}:${nextStatus}`);
    setAgentError("");
    setMessage("");
    try {
      await updateOrderStatus(order.id, nextStatus);
      await Promise.all([refreshAgentStatus(), refreshOrders?.()]);
      setMessage(`Order marked ${displayStatus(nextStatus)}.`);
    } catch (error) {
      setAgentError(error.message || `Could not mark order ${displayStatus(nextStatus)}.`);
    } finally {
      setStatusActionId("");
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
    setDocumentPreview(null);
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

  async function openConfiguration(order) {
    const orderId = order.backendId || order.id;
    setDocumentModalOrder(order);
    setOrderDocuments([]);
    setDocumentPreview(null);
    setDocumentsLoading(true);
    setAgentError("");
    setConfigModalOpen(true);
    try {
      const data = await getOrderDocuments(orderId);
      setOrderDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch (error) {
      setAgentError(error.message || "Could not load order documents.");
      setConfigModalOpen(false);
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function handleSaveConfig(payload) {
    const orderId = documentModalOrder.backendId || documentModalOrder.id;
    try {
      const data = await apiRequest(`/api/hubs/orders/${orderId}/configuration`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const savedOrder = typeof onOrderSaved === "function" && data.order ? onOrderSaved(data.order) : null;
      if (!savedOrder && typeof refreshOrders === "function") await refreshOrders();
      if (data.order || savedOrder) setDocumentModalOrder((prev) => ({ ...prev, ...(savedOrder || data.order) }));
      const docsData = await getOrderDocuments(orderId);
      setOrderDocuments(Array.isArray(docsData.documents) ? docsData.documents : []);
    } catch (error) {
      throw new Error(error.message || "Failed to update configuration");
    }
  }

  async function openSignedDocument(document, mode = "download") {
    const documentId = document.documentId || document.id;
    setDocumentActionId(`${mode}:${documentId}`);
    try {
      const blob = await downloadDocumentBlob(documentId);
      const localUrl = URL.createObjectURL(blob);
      if (mode === "view") {
        setDocumentPreview({ url: localUrl, name: document.fileName || "Document preview" });
        return;
      }
      const link = window.document.createElement("a");
      link.href = localUrl;
      link.download = document.fileName || "document.pdf";
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      URL.revokeObjectURL(localUrl);
    } catch (error) {
      setAgentError(error.message || "Could not retrieve document.");
    } finally {
      setDocumentActionId("");
    }
  }

  function renderActions(order, job, variant = "desktop") {
    const orderId = order.backendId || order.id;
    const sendEnabled = canSendToAgent(order);
    const paymentPending = isPaymentPending(order);
    const paymentVerified = isPaymentVerified(order);
    const orderCancelled = isOrderCancelled(order);
    const cancelledBeforePayment = orderCancelled && !paymentVerified;
    const canConfigure = canConfigureOrder(order, job);
    const compactButtons = variant === "mobile";

    return (
      <div className={compactButtons ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}>
        <button
          type="button"
          onClick={() => openDocuments(order)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold"
        >
          <FileText size={14} /> Documents
        </button>
        {canConfigure && (
          <button
            type="button"
            onClick={() => openConfiguration(order)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-2 text-xs font-semibold text-indigo-700"
          >
            <Settings size={14} /> Configure
          </button>
        )}
        {paymentPending && (
          <button
            onClick={() => markCashCollected(order)}
            disabled={collectingOrderId === orderId || normalizeStatus(order.paymentStatus) === "draft"}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 px-2 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50"
          >
            <IndianRupee size={14} /> {collectingOrderId === orderId ? "Saving" : "Cash Collected"}
          </button>
        )}
        {sendEnabled && routeableAgents.length > 0 && (
          <button
            onClick={() => openSendModal(order)}
            disabled={sendingOrderId === orderId}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-2 py-2 text-xs font-semibold text-white disabled:bg-slate-300"
          >
            <Send size={14} /> {sendingOrderId === orderId ? "Sending" : "Send"}
          </button>
        )}
        {sendEnabled && routeableAgents.length === 0 && (
          <button
            onClick={() => navigate("hubPrinters")}
            className="col-span-2 rounded-xl border border-amber-200 px-2 py-2 text-xs font-semibold text-amber-800"
          >
            Open agent to queue
          </button>
        )}
        {cancelledBeforePayment && (
          <p className="col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700">
            Cancelled before payment. Cash collection is disabled.
          </p>
        )}
      </div>
    );
  }

  function renderStatusControls(order, variant = "desktop") {
    const orderId = order.backendId || order.id;
    return (
      <div className={variant === "mobile" ? "grid gap-2" : "grid gap-2"}>
        <select
          value={order.status}
          onChange={(event) => updateOrderStatus(order.id, event.target.value)}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        >
          {hubStatusOptions.map((status) => (
            <option key={status} value={status}>{displayStatus(status)}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {canPauseOrder(order) && (
            <button
              type="button"
              onClick={() => quickUpdateOrderStatus(order, "Paused")}
              disabled={statusActionId === `${orderId}:Paused`}
              className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              <PauseCircle size={13} /> {statusActionId === `${orderId}:Paused` ? "Saving" : "Pause"}
            </button>
          )}
          {normalizeStatus(order.status) === "paused" && (
            <button
              type="button"
              onClick={() => quickUpdateOrderStatus(order, isPaymentVerified(order) ? "Payment Verified" : "Payment Pending")}
              disabled={statusActionId.startsWith(`${orderId}:`)}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-50"
            >
              Resume
            </button>
          )}
          {canCancelOrder(order) && (
            <button
              type="button"
              onClick={() => quickUpdateOrderStatus(order, "Cancelled")}
              disabled={statusActionId === `${orderId}:Cancelled`}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50"
            >
              <XCircle size={13} /> {statusActionId === `${orderId}:Cancelled` ? "Saving" : "Cancel"}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!currentHub) return null;

  return (
    <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5 relative left-1/2 w-[calc(100vw-1rem)] -translate-x-1/2 sm:w-[calc(100vw-2rem)] lg:w-[min(1800px,calc(100vw-3rem))]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-xl font-bold">Incoming / Active Orders</h3>
          <p className="mt-1 text-sm text-slate-600">Manage active print orders for your print hub.</p>
        </div>
        <div className="grid gap-3 lg:w-[420px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              value={orderSearch}
              onChange={(event) => setOrderSearch(event.target.value)}
              placeholder="Search name, mobile, order, document"
              className="w-full rounded-2xl border bg-white py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={globalAutoPrintAfterCash}
                onChange={(event) => setGlobalAutoPrintAfterCash(event.target.checked)}
              />
              Auto-print after cash collected
            </label>
            <button
              type="button"
              onClick={refreshAgentStatus}
              disabled={agentLoading}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw size={14} /> Agent
            </button>
          </div>
          {orderSearch && <p className="text-xs text-slate-500">{filteredOrders.length} of {ordersForHub.length} orders shown</p>}
        </div>
      </div>

      {(agentError || message) && (
        <p className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${agentError ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
          {agentError || message}
        </p>
      )}

      <div className="mt-5 grid gap-3 md:hidden">
        {filteredOrders.map((order) => {
          const job = jobByOrderId.get(order.backendId);
          return (
            <article key={order.id} className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{order.id}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{order.document}</p>
                </div>
                <p className="rounded-xl bg-white px-2.5 py-1 text-sm font-black text-slate-950">₹{order.amount}</p>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-600">
                <p><span className="font-semibold text-slate-900">{order.customerName || "Customer"}</span>{order.customerMobile ? ` · ${order.customerMobile}` : ""}</p>
                <p>{order.pages} pages × {order.copies} copies · {order.date || "recent"}</p>
                <OrderBadges order={order} job={job} />
              </div>
              <div className="mt-4 grid gap-3">
                {renderStatusControls(order, "mobile")}
                {renderActions(order, job, "mobile")}
              </div>
            </article>
          );
        })}
      </div>

      <div className={`mt-5 hidden md:block ${compact ? "max-h-[780px]" : "max-h-[690px]"} overflow-y-auto overflow-x-auto rounded-2xl border`}>
        <table className="w-full min-w-[1250px] table-fixed border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-28 px-3 py-3">Order</th>
              <th className="w-44 px-3 py-3">Customer</th>
              <th className="w-[280px] px-3 py-3">Document</th>
              <th className="w-24 px-3 py-3">Pages</th>
              <th className="w-20 px-3 py-3">Amount</th>
              <th className="w-36 px-3 py-3">Payment</th>
              <th className="w-48 px-3 py-3">Manage Status</th>
              <th className="w-64 px-3 py-3">Actions / Agent</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredOrders.map((order) => {
              const job = jobByOrderId.get(order.backendId);
              const orderId = order.backendId || order.id;
              const sendEnabled = canSendToAgent(order);
              const paymentPending = isPaymentPending(order);
              const paymentVerified = isPaymentVerified(order);
              const orderCancelled = isOrderCancelled(order);
              const cancelledBeforePayment = orderCancelled && !paymentVerified;
              const canConfigure = canConfigureOrder(order, job);

              return (
                <tr key={order.id} className="align-top odd:bg-white even:bg-slate-50">
                  <td className="px-3 py-4 font-semibold">
                    <p className="truncate" title={order.id}>{order.id}</p>
                  </td>
                  <td className="px-3 py-4">
                    <p className="truncate font-semibold text-slate-900" title={order.customerName}>{order.customerName || "Customer"}</p>
                    {order.customerMobile && <p className="text-xs text-slate-500">{order.customerMobile}</p>}
                  </td>
                  <td className="px-3 py-4">
                    <p className="truncate" title={order.document}>{order.document}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => openDocuments(order)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-xs font-semibold"
                      >
                        <FileText size={13} /> View / Download
                      </button>
                      {canConfigure && (
                        <button
                          type="button"
                          onClick={() => openConfiguration(order)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
                        >
                          <Settings size={13} /> Configure
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap font-medium">{order.pages} × {order.copies}</td>
                  <td className="px-3 py-4 whitespace-nowrap font-bold">₹{order.amount}</td>
                  <td className="px-3 py-4">
                    <StatusBadge color={paymentVerified ? "green" : "amber"}>{label(order.paymentStatus)}</StatusBadge>
                    {cancelledBeforePayment && (
                      <p className="mt-1 text-xs font-semibold text-rose-600">Cancelled before payment.</p>
                    )}
                    {paymentPending && (
                      <p className="mt-1 text-xs text-slate-500">Awaiting payment.</p>
                    )}
                    {paymentVerified && (
                      <p className="mt-1 text-xs text-emerald-700">
                        {orderCancelled ? "Payment collected; order cancelled." : "Ready to queue."}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    <select
                      value={order.status}
                      onChange={(event) => updateOrderStatus(order.id, event.target.value)}
                      className="w-full rounded-xl border px-2 py-1.5 text-sm"
                    >
                      {hubStatusOptions.map((status) => (
                        <option key={status} value={status}>{displayStatus(status)}</option>
                      ))}
                    </select>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {canPauseOrder(order) && (
                        <button
                          type="button"
                          onClick={() => quickUpdateOrderStatus(order, "Paused")}
                          disabled={statusActionId === `${orderId}:Paused`}
                          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                        >
                          <PauseCircle size={13} /> {statusActionId === `${orderId}:Paused` ? "Saving" : "Pause"}
                        </button>
                      )}
                      {normalizeStatus(order.status) === "paused" && (
                        <button
                          type="button"
                          onClick={() => quickUpdateOrderStatus(order, isPaymentVerified(order) ? "Payment Verified" : "Payment Pending")}
                          disabled={statusActionId.startsWith(`${orderId}:`)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                        >
                          Resume
                        </button>
                      )}
                      {canCancelOrder(order) && (
                        <button
                          type="button"
                          onClick={() => quickUpdateOrderStatus(order, "Cancelled")}
                          disabled={statusActionId === `${orderId}:Cancelled`}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50"
                        >
                          <XCircle size={13} /> {statusActionId === `${orderId}:Cancelled` ? "Saving" : "Cancel"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-col gap-2">
                      {job && <StatusBadge>{label(displayStatus(job.status))}</StatusBadge>}
                      {job && normalizeStatus(job.status) !== "failed" && <p className="text-xs text-slate-500">{displayStatus(job.status)} in desktop queue</p>}
                      {job?.failureReasonText && <p className="text-xs font-semibold text-rose-600">{job.failureReasonText}</p>}
                      {cancelledBeforePayment && (
                        <p className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700">
                          Cancelled before payment. Cash collection is disabled.
                        </p>
                      )}
                      {paymentPending && (
                        <button
                          onClick={() => markCashCollected(order)}
                          disabled={collectingOrderId === orderId || normalizeStatus(order.paymentStatus) === "draft"}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 px-2 py-1.5 font-semibold text-emerald-700 disabled:opacity-50"
                        >
                          <IndianRupee size={14} /> {collectingOrderId === orderId ? "Saving" : "Cash Collected"}
                        </button>
                      )}
                      {sendEnabled && routeableAgents.length > 0 && (
                        <button
                          onClick={() => openSendModal(order)}
                          disabled={sendingOrderId === orderId}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-2 py-1.5 font-semibold text-white disabled:bg-slate-300"
                        >
                          <Send size={14} /> {sendingOrderId === orderId ? "Sending" : "Send"}
                        </button>
                      )}
                      {sendEnabled && routeableAgents.length === 0 && (
                        <button
                          onClick={() => navigate("hubPrinters")}
                          className="rounded-xl border border-amber-200 px-2 py-1.5 text-left text-xs font-semibold text-amber-800"
                        >
                          Open agent to queue.
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

      {filteredOrders.length === 0 && (
        <div className="mt-5 rounded-2xl border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-500">
          No active orders match this search.
        </div>
      )}

      {sendModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold">Send to Printer</h3>
                <p className="mt-1 text-sm text-slate-600">Choose the desktop device and local printer for order {sendModalOrder.id}.</p>
              </div>
              <button type="button" onClick={closeSendModal} className="rounded-full border p-2" aria-label="Close send to printer modal">
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Select Device
                <select value={selectedAgentId} onChange={(event) => changeSelectedAgent(event.target.value)} className="rounded-xl border px-3 py-3 font-normal">
                  <option value="">Choose desktop device</option>
                  {routeableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.agentName || agent.deviceName || agent.id} · {agent.status || "unknown"}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                Select Printer
                <select value={selectedPrinterName} onChange={(event) => setSelectedPrinterName(event.target.value)} className="rounded-xl border px-3 py-3 font-normal" disabled={!selectedAgentId}>
                  <option value="">Choose printer</option>
                  {selectedAgentPrinters.map((printer) => (
                    <option key={printer.id || printer.printerName} value={printer.printerName}>{printer.printerName}{printer.isDefault ? " · Default" : ""}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={closeSendModal} className="rounded-xl border px-4 py-2 font-semibold">Cancel</button>
                <button type="button" onClick={sendToAgent} disabled={!selectedAgentId || Boolean(sendingOrderId)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white disabled:bg-slate-300">
                  <Send size={16} /> {sendingOrderId ? "Queueing" : "Queue Print Job"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {documentModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold">Order Documents</h3>
                <p className="mt-1 text-sm text-slate-600">{documentModalOrder.id}</p>
              </div>
              <button type="button" onClick={() => { setDocumentModalOrder(null); setDocumentPreview(null); }} className="rounded-full border p-2" aria-label="Close documents modal">
                <X size={18} />
              </button>
            </div>
            {canConfigureOrder(documentModalOrder, jobByOrderId.get(documentModalOrder.backendId)) && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-indigo-50 p-4">
                <p className="text-xs font-medium text-indigo-700">Need to correct settings or copies for manual payment?</p>
                <button type="button" onClick={() => setConfigModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white">
                  <Settings size={14} /> Adjust Print Settings
                </button>
              </div>
            )}
            <div className="mt-5 grid gap-3">
              {documentsLoading && <p className="text-sm text-slate-500">Loading documents...</p>}
              {!documentsLoading && orderDocuments.length === 0 && <p className="text-sm text-slate-500">No documents found.</p>}
              {orderDocuments.map((document) => (
                <div key={document.documentId} className="rounded-2xl border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{document.fileName}</p>
                      <p className="mt-1 text-xs text-slate-500">{document.pageCount} pages · {Math.ceil(Number(document.fileSizeBytes || 0) / 1024)} KB</p>
                      <p className="mt-1 text-xs text-slate-500">Selected {document.selectedPageCount} · printable {document.printablePageCount} · copies {document.copies} · ₹{Number(document.amountPaise || 0) / 100}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openSignedDocument(document, "download")} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                        <Download size={15} /> {documentActionId === `download:${document.documentId}` ? "Opening" : "Download"}
                      </button>
                      <button type="button" onClick={() => openSignedDocument(document, "view")} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold">
                        <Eye size={15} /> {documentActionId === `view:${document.documentId}` ? "Loading" : "View"}
                      </button>
                      <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                        <ShieldCheck size={14} /> Secure
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {documentPreview && (
                <div className="rounded-2xl border bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-slate-900">{documentPreview.name}</p>
                    <button type="button" onClick={() => setDocumentPreview(null)} className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold">Close preview</button>
                  </div>
                  <InlineDocumentFrame title={documentPreview.name} url={documentPreview.url} className="h-[70vh] w-full" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {documentModalOrder && (
        <HubOrderConfigModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          order={documentModalOrder}
          files={orderDocuments}
          pricing={getHubPricing(currentHub)}
          onSave={handleSaveConfig}
          isLoading={documentsLoading}
        />
      )}
    </section>
  );
}
