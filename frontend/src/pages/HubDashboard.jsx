import { useEffect, useMemo, useState } from "react";
import { BarChart3, Copy, Download, FileText, IndianRupee, Link2, Printer, QrCode, RefreshCw, Wifi } from "lucide-react";
import Card from "../components/Card";
import Metric from "../components/Metric";
import HubLocationCard from "../components/HubLocationCard";
import HubAfterOrderSettingsCard from "../components/HubAfterOrderSettingsCard";
import HubActiveOrdersManager from "../components/HubActiveOrdersManager";
import { apiRequest, getHubAgentSummary, pairAgent } from "../services/api";

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

const CLOSED_STATUSES = new Set(["collected", "refund_requested", "printing_failed", "cancelled"]);
const PUBLIC_APP_URL = "https://printhubdesi.vercel.app";

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

export default function HubDashboard({ currentHub, hubOrders, updateOrderStatus, refreshOrders, onOrderSaved, navigate }) {
  const [agents, setAgents] = useState([]);
  const [agentPrinters, setAgentPrinters] = useState([]);
  const [printJobs, setPrintJobs] = useState([]);
  const [agentAnalytics, setAgentAnalytics] = useState(EMPTY_ANALYTICS);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingMessage, setPairingMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [centreLinkCopied, setCentreLinkCopied] = useState(false);

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
      }, 3000);
      const refreshOnFocus = () => {
        if (document.visibilityState === "visible") {
          refreshAgentStatus();
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

      <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
        <HubLocationCard currentCentre={currentHub} />
        <HubAfterOrderSettingsCard currentCentre={currentHub} onSettingsUpdate={(settings) => { if (currentHub) currentHub.afterOrderSettings = settings; }} />
      </div>

      <HubActiveOrdersManager
        currentHub={currentHub}
        hubOrders={hubOrders}
        updateOrderStatus={updateOrderStatus}
        refreshOrders={refreshOrders}
        onOrderSaved={onOrderSaved}
        navigate={navigate}
        agents={agents}
        agentPrinters={agentPrinters}
        printJobs={printJobs}
        refreshAgentStatus={refreshAgentStatus}
        agentLoading={agentLoading}
      />
    </div>
  );
}
