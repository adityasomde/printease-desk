import { useEffect, useMemo, useState } from "react";
import { BarChart3, Copy, Download, Eye, FileText, IndianRupee, Link2, PauseCircle, Printer, QrCode, RefreshCw, Send, Settings, ShieldCheck, Wifi, X, XCircle } from "lucide-react";
import HubOrderConfigModal from "../components/HubOrderConfigModal";
import Card from "../components/Card";
import Metric from "../components/Metric";
import StatusBadge from "../components/StatusBadge";
import { hubStatusOptions } from "../data/demoData";
import { apiRequest, collectManualPayment, downloadDocumentBlob, getHubAgentSummary, getOrderDocuments, pairAgent, sendOrderToAgent } from "../services/api";

function normalizeStatus(status) {
  return String(status || "").toLowerCase().replace(/\s+/g, "_");
}

function label(value) {
  return String(value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
const PUBLIC_APP_URL = "https://printhubdesi.vercel.app";

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

function getPublicAppOrigin() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (!origin || origin === "null" || origin.startsWith("file://") || origin.startsWith("app://")) {
    return PUBLIC_APP_URL;
  }

  return origin;
}

async function openExternalUrl(url) {
  if (!url) return;

  if (window.printeaseDesktop?.openExternalUrl) {
    const result = await window.printeaseDesktop.openExternalUrl(url);
    if (result?.success) return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

async function downloadQrImage(url, fileName) {
  if (!url) return;

  if (window.printeaseDesktop?.downloadUrl) {
    const result = await window.printeaseDesktop.downloadUrl({ url, fileName });
    if (result?.success) return;
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
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

function canPauseOrder(order) {
  return !["paused", ...CLOSED_STATUSES].includes(normalizeStatus(order.status));
}

function canCancelOrder(order) {
  return !["ready_for_pickup", ...CLOSED_STATUSES].includes(normalizeStatus(order.status));
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
  const [documentPreview, setDocumentPreview] = useState(null);
  const [documentActionId, setDocumentActionId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedPrinterName, setSelectedPrinterName] = useState("");
  const [collectingOrderId, setCollectingOrderId] = useState("");
  const [statusActionId, setStatusActionId] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [centreLinkCopied, setCentreLinkCopied] = useState(false);
  const [globalAutoPrintAfterCash, setGlobalAutoPrintAfterCash] = useState(() => {
    const saved = localStorage.getItem("printease_global_auto_print_cash");
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    localStorage.setItem("printease_global_auto_print_cash", String(globalAutoPrintAfterCash));
  }, [globalAutoPrintAfterCash]);
  const ordersForHub = hubOrders || [];
  const centreUploadUrl =
    typeof window !== "undefined" && currentHub?.code
      ? `${getPublicAppOrigin()}/upload?centre=${encodeURIComponent(currentHub.code)}`
      : "";
  const centreQrUrl = centreUploadUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(centreUploadUrl)}`
    : "";
  const largeCentreQrUrl = centreUploadUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=900x900&data=${encodeURIComponent(centreUploadUrl)}`
    : "";

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
  const filteredOrders = useMemo(() => {
    const query = orderSearch.trim().toLowerCase();
    if (!query) return ordersForHub;

    return ordersForHub.filter((item) => {
      const job = jobByOrderId.get(item.backendId);
      const searchable = [
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
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [jobByOrderId, orderSearch, ordersForHub]);

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
      }, 3000);
      const refreshOnFocus = () => {
        if (document.visibilityState === "visible") {
          refreshAgentStatus();
          refreshOrders?.();
        }
      };
      window.addEventListener("focus", refreshOnFocus);
      document.addEventListener("visibilitychange", refreshOnFocus);
      return () => {
        clearInterval(interval);
        window.removeEventListener("focus", refreshOnFocus);
        document.removeEventListener("visibilitychange", refreshOnFocus);
      };
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
    const autoPrintAfterCollection = globalAutoPrintAfterCash;
    setCollectingOrderId(orderId);
    setAgentError("");
    setPairingMessage("");

    try {
      const data = await collectManualPayment(orderId, { autoPrintAfterCollection, method: "cash" });
      setPairingMessage(data.message || "Payment collected.");
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
    setPairingMessage("");

    try {
      await updateOrderStatus(order.id, nextStatus);
      await Promise.all([refreshAgentStatus(), refreshOrders?.()]);
      setPairingMessage(`Order marked ${displayStatus(nextStatus)}.`);
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
        body: JSON.stringify(payload)
      });
      if (typeof refreshOrders === "function") {
        await refreshOrders();
      }
      if (data.order) {
        setDocumentModalOrder(prev => ({ ...prev, ...data.order }));
      }
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
      const rawBlob = await downloadDocumentBlob(documentId);
      const pdfBlob = new Blob([rawBlob], { type: "application/pdf" });
      const localUrl = URL.createObjectURL(pdfBlob);

      if (mode === "view") {
        setDocumentPreview({
          url: localUrl,
          name: document.fileName || "Document preview",
        });
        return;
      }

      const a = window.document.createElement("a");
      a.href = localUrl;
      a.download = document.fileName || "document.pdf";
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(localUrl);
    } catch (error) {
      setAgentError(error.message || "Could not retrieve document.");
    } finally {
      setDocumentActionId("");
    }
  }

  async function copyCentreUploadLink() {
    if (!centreUploadUrl) return;

    try {
      await navigator.clipboard.writeText(centreUploadUrl);
      setCentreLinkCopied(true);
      setTimeout(() => setCentreLinkCopied(false), 1800);
    } catch {
      setAgentError("Could not copy centre upload link.");
    }
  }

  async function printCentreQr() {
    if (!largeCentreQrUrl) return;

    const safeCentreName = String(currentHub.name || "PrintEase Centre").replace(/[<>&"]/g, (character) => ({
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "\"": "&quot;",
    }[character]));
    const safeCentreCode = String(currentHub.code || "").replace(/[<>&"]/g, (character) => ({
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "\"": "&quot;",
    }[character]));
    const safeUploadUrl = centreUploadUrl.replace(/[<>&"]/g, (character) => ({
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "\"": "&quot;",
    }[character]));

    const printableHtml = `
      <!doctype html>
      <html>
        <head>
          <title>PrintEase Upload QR - ${safeCentreName}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
            }
            main {
              min-height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 18px;
              padding: 36px;
              text-align: center;
            }
            h1 {
              margin: 0;
              font-size: 34px;
              line-height: 1.15;
            }
            p {
              margin: 0;
              font-size: 18px;
              color: #475569;
            }
            img {
              width: min(720px, 86vw);
              height: min(720px, 86vw);
              image-rendering: crisp-edges;
            }
            .code {
              display: inline-block;
              border: 2px solid #0f172a;
              border-radius: 14px;
              padding: 10px 18px;
              font-size: 24px;
              font-weight: 800;
              letter-spacing: 0;
            }
            .link {
              max-width: 760px;
              overflow-wrap: anywhere;
              font-size: 13px;
              color: #64748b;
            }
            @media print {
              main { padding: 18mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <main>
            <h1>${safeCentreName}</h1>
            <p>Scan to upload documents directly to this print centre.</p>
            <div class="code">Centre Code: ${safeCentreCode}</div>
            <img src="${largeCentreQrUrl}" alt="PrintEase upload QR" />
            <p class="link">${safeUploadUrl}</p>
          </main>
          <script>
            window.addEventListener("load", () => {
              setTimeout(() => window.print(), 350);
            });
          </script>
        </body>
      </html>
    `;

    if (window.printeaseDesktop?.printHtml) {
      const result = await window.printeaseDesktop.printHtml({
        title: `PrintEase Upload QR - ${currentHub.name || currentHub.code || "Centre"}`,
        html: printableHtml,
      });
      if (!result?.success) {
        setAgentError(result?.message || "Could not print QR code.");
      }
      return;
    }

    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
    if (!printWindow) {
      setAgentError("Allow popups to print the QR code.");
      return;
    }

    printWindow.document.write(printableHtml);
    printWindow.document.close();
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
        <Metric title="Active Orders" value={pendingOrders} icon={<Printer />} />
        <Metric title="Pages Printed" value={totalPages} icon={<BarChart3 />} />
        <Metric title="Collected Amount" value={`₹${totalRevenue}`} icon={<IndianRupee />} />
      </div>

      <Card>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <div className="flex items-center gap-2">
              <QrCode size={22} />
              <h3 className="text-xl font-bold">Customer Upload QR</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Customers scan this QR to open the upload page with <b>{currentHub.name}</b> selected automatically.
            </p>
            <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
              <span className="font-semibold text-slate-900">Link: </span>
              <span className="break-all">{centreUploadUrl}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyCentreUploadLink}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                <Copy size={16} />
                {centreLinkCopied ? "Copied" : "Copy Link"}
              </button>
              <button
                type="button"
                onClick={() => openExternalUrl(centreUploadUrl).catch(() => setAgentError("Could not open upload page."))}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                <Link2 size={16} />
                Open Upload Page
              </button>
              <button
                type="button"
                onClick={() => downloadQrImage(largeCentreQrUrl, `PrintEase-${currentHub.code || "centre"}-upload-qr.png`).catch(() => setAgentError("Could not download QR code."))}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                <Download size={16} />
                Download QR
              </button>
              <button
                type="button"
                onClick={printCentreQr}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                <Printer size={16} />
                Print QR
              </button>
            </div>
          </div>
          {centreQrUrl && (
            <div className="mx-auto rounded-3xl border bg-white p-3 shadow-sm lg:mx-0">
              <img src={centreQrUrl} alt={`Upload QR for ${currentHub.name}`} className="h-44 w-44 rounded-2xl" />
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Wifi size={20} />
              <h3 className="text-xl font-bold">Printer Agent</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Desktop agent prints paid/collected jobs automatically when connected.
            </p>
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
                <StatusBadge>{label(agentStatus)}</StatusBadge>
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

      <Card className="relative left-1/2 w-[calc(100vw-1rem)] -translate-x-1/2 px-3 sm:w-[calc(100vw-2rem)] sm:px-4 lg:w-[min(1500px,calc(100vw-3rem))] lg:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-xl font-bold">Incoming / Active Orders</h3>
            <p className="mt-2 text-sm text-slate-600">
              Paid or cash-collected orders can be sent to the desktop agent. Ask customer for the last 4 digits/order code.
            </p>
          </div>
          <div className="w-full lg:max-w-sm">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search orders</label>
            <input
              value={orderSearch}
              onChange={(event) => setOrderSearch(event.target.value)}
              placeholder="Name, mobile, order, document, status"
              className="mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
            {orderSearch && <p className="mt-2 text-xs text-slate-500">{filteredOrders.length} of {ordersForHub.length} orders shown</p>}
          </div>
        </div>
        <div className="mt-6 max-h-[420px] overflow-y-auto overflow-x-auto border rounded-2xl">
          <table className="w-full min-w-[840px] table-fixed text-left text-sm border-collapse">
            <thead className="sticky top-0 bg-white z-10 shadow-sm border-b">
              <tr className="border-b text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
                <th className="w-24 px-2 py-3">Order</th>
                <th className="w-36 px-2 py-3">Customer</th>
                <th className="w-52 px-2 py-3">Document</th>
                <th className="w-16 px-2 py-3">Pages</th>
                <th className="w-16 px-2 py-3">Amount</th>
                <th className="w-24 px-2 py-3">Payment</th>
                <th className="w-32 px-2 py-3">Update</th>
                <th className="w-48 px-2 py-3">
                  <div className="flex items-center gap-2">
                    <span>Agent</span>
                    <label className="flex items-center gap-1 font-normal normal-case text-xs">
                      <input
                        type="checkbox"
                        checked={globalAutoPrintAfterCash}
                        onChange={(event) => setGlobalAutoPrintAfterCash(event.target.checked)}
                      />
                      Auto-print (Cash)
                    </label>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredOrders.map((item) => {
                const job = jobByOrderId.get(item.backendId);
                const orderId = item.backendId || item.id;
                const sendEnabled = canSendToAgent(item);
                const paymentPending = isPaymentPending(item);
                const paymentVerified = isPaymentVerified(item);
                const orderCancelled = isOrderCancelled(item);
                const cancelledBeforePayment = orderCancelled && !paymentVerified;
                const isManualPayment = ["draft", "pending", "collected"].includes(String(item.paymentStatus || "").toLowerCase());
                const isClosed = ["printed", "completed", "cancelled"].includes(String(item.status || "").toLowerCase());
                const hasActiveJobs = Boolean(job || (item.printJobs && item.printJobs.length > 0));
                const canConfigure = isManualPayment && !isClosed && !hasActiveJobs && !item.configLockedAt;

                return (
                  <tr key={item.id} className="align-top odd:bg-white even:bg-slate-50">
                    <td className="px-2 py-4 font-semibold">
                      <p className="truncate max-w-[8rem]" title={item.id}>{item.id}</p>
                    </td>
                    <td className="px-2 py-4">
                      <p className="truncate font-semibold text-slate-900" title={item.customerName}>{item.customerName || "Customer"}</p>
                      {item.customerMobile && <p className="text-xs text-slate-500">{item.customerMobile}</p>}
                    </td>
                    <td className="px-2 py-4">
                      <p className="truncate" title={item.document}>{item.document}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDocuments(item)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-xs font-semibold"
                        >
                          <FileText size={13} /> View / Download
                        </button>
                        {canConfigure && (
                          <button
                            type="button"
                            onClick={() => openConfiguration(item)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
                          >
                            <Settings size={13} /> Configure
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-4 whitespace-nowrap font-medium">{item.pages} × {item.copies}</td>
                    <td className="px-2 py-4 whitespace-nowrap font-semibold">₹{item.amount}</td>
                    <td className="w-24 max-w-[6rem] px-2 py-4">
                      <StatusBadge color="green">{label(item.paymentStatus)}</StatusBadge>
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
                    <td className="px-2 py-4">
                      <select value={item.status} onChange={(e) => updateOrderStatus(item.id, e.target.value)} className="w-full rounded-xl border px-2 py-1.5 text-sm lg:text-sm">
                        {hubStatusOptions.map((status) => <option key={status} value={status}>{displayStatus(status)}</option>)}
                      </select>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {canPauseOrder(item) && (
                          <button
                            type="button"
                            onClick={() => quickUpdateOrderStatus(item, "Paused")}
                            disabled={statusActionId === `${orderId}:Paused`}
                            className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                          >
                            <PauseCircle size={13} /> {statusActionId === `${orderId}:Paused` ? "Saving" : "Pause"}
                          </button>
                        )}
                        {normalizeStatus(item.status) === "paused" && (
                          <button
                            type="button"
                            onClick={() => quickUpdateOrderStatus(item, isPaymentVerified(item) ? "Payment Verified" : "Payment Pending")}
                            disabled={statusActionId.startsWith(`${orderId}:`)}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                          >
                            Resume
                          </button>
                        )}
                        {canCancelOrder(item) && (
                          <button
                            type="button"
                            onClick={() => quickUpdateOrderStatus(item, "Cancelled")}
                            disabled={statusActionId === `${orderId}:Cancelled`}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50"
                          >
                            <XCircle size={13} /> {statusActionId === `${orderId}:Cancelled` ? "Saving" : "Cancel"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-4">
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
                            onClick={() => markCashCollected(item)}
                            disabled={collectingOrderId === orderId || normalizeStatus(item.paymentStatus) === "draft"}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 px-2 py-1.5 font-semibold text-emerald-700 disabled:opacity-50"
                          >
                            <IndianRupee size={14} /> {collectingOrderId === orderId ? "Saving" : "Cash Collected"}
                          </button>
                        )}
                        {sendEnabled && routeableAgents.length > 0 && (
                          <button
                            onClick={() => openSendModal(item)}
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
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                    No orders match this search.
                  </td>
                </tr>
              )}
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
              <button type="button" onClick={() => {
                setDocumentModalOrder(null);
                setDocumentPreview(null);
              }} className="rounded-full border p-2" aria-label="Close documents modal">
                <X size={18} />
              </button>
            </div>

            {(() => {
              const isManualPayment = ["draft", "pending", "collected"].includes(String(documentModalOrder.paymentStatus || "").toLowerCase());
              const isClosed = ["printed", "completed", "cancelled"].includes(String(documentModalOrder.status || "").toLowerCase());
              const hasActiveJobs = Boolean(documentModalOrder.job || (documentModalOrder.printJobs && documentModalOrder.printJobs.length > 0));
              const canConfigure = isManualPayment && !isClosed && !hasActiveJobs && !documentModalOrder.configLockedAt;

              if (!canConfigure) return null;

              return (
                <div className="mt-4 flex items-center justify-between rounded-2xl bg-indigo-50 p-4 dark:bg-indigo-950/20">
                  <div className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                    Need to correct settings or copies for manual payment?
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfigModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-sm"
                  >
                    <Settings size={14} /> Adjust Print Settings
                  </button>
                </div>
              );
            })()}

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
                        onClick={() => openSignedDocument(document, "download")}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                      >
                        <Download size={15} /> {documentActionId === `download:${document.documentId}` ? "Opening" : "Download original"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openSignedDocument(document, "view")}
                        className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"
                      >
                        <Eye size={15} /> {documentActionId === `view:${document.documentId}` ? "Loading" : "View"}
                      </button>
                      <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                        <ShieldCheck size={14} /> Hash shown
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {documentPreview && (
                <div className="rounded-2xl border bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-slate-900">{documentPreview.name}</p>
                    <button type="button" onClick={() => setDocumentPreview(null)} className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold">
                      Close preview
                    </button>
                  </div>
                  <iframe title={documentPreview.name} src={documentPreview.url} className="h-[70vh] w-full rounded-xl border bg-white" />
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
          pricing={currentHub?.pricing || {}}
          onSave={handleSaveConfig}
          isLoading={documentsLoading}
        />
      )}
    </div>
  );
}
