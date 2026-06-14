import { useMemo, useState } from "react";
import { BarChart3, Download, Eye, FileText, IndianRupee, Printer, ShieldCheck, X, Search, Filter, ArrowUpDown } from "lucide-react";
import Card from "../components/Card";
import Metric from "../components/Metric";
import StatusBadge from "../components/StatusBadge";
import { downloadDocumentBlob, getDesktopCachedDocumentUrl, getOrderDocuments } from "../services/api";

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

export default function HubHistoryPage({ currentHub, hubOrders }) {
  const [documentModalOrder, setDocumentModalOrder] = useState(null);
  const [orderDocuments, setOrderDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentPreview, setDocumentPreview] = useState(null);
  const [documentActionId, setDocumentActionId] = useState("");
  const [agentError, setAgentError] = useState("");
  
  // Advanced filters state
  const [orderSearch, setOrderSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const ordersForHub = hubOrders || [];

  const totalPages = ordersForHub.reduce((sum, item) => sum + item.pages * item.copies, 0);
  const totalRevenue = ordersForHub.filter(isPaymentVerified).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pendingOrders = ordersForHub.filter((item) => !CLOSED_STATUSES.has(normalizeStatus(item.status))).length;

  // Derive unique print & payment statuses from current hub orders for filters dropdown
  const statusCounts = useMemo(() => {
    const printStatuses = new Set();
    const paymentStatuses = new Set();
    for (const order of ordersForHub) {
      if (order.status) printStatuses.add(order.status);
      if (order.paymentStatus) paymentStatuses.add(order.paymentStatus);
    }
    return {
      printStatuses: [...printStatuses].sort(),
      paymentStatuses: [...paymentStatuses].sort()
    };
  }, [ordersForHub]);

  // Combined search, status filtering, and sorting
  const filteredOrders = useMemo(() => {
    let list = [...ordersForHub];

    // 1. Search Query
    const query = orderSearch.trim().toLowerCase();
    if (query) {
      list = list.filter((item) => {
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
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchable.includes(query);
      });
    }

    // 2. Status Filter
    if (statusFilter !== "all") {
      list = list.filter((item) => String(item.status).toLowerCase() === statusFilter.toLowerCase());
    }

    // 3. Payment Filter
    if (paymentFilter !== "all") {
      list = list.filter((item) => String(item.paymentStatus).toLowerCase() === paymentFilter.toLowerCase());
    }

    // 4. Sort
    list.sort((a, b) => {
      const timeA = new Date(a.date || a.createdAt || 0).getTime();
      const timeB = new Date(b.date || b.createdAt || 0).getTime();
      return sortBy === "oldest" ? timeA - timeB : timeB - timeA;
    });

    return list;
  }, [ordersForHub, orderSearch, statusFilter, paymentFilter, sortBy]);

  if (!currentHub) return <Card>Please login as print hub.</Card>;

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

  async function openSignedDocument(document, mode = "download") {
    const documentId = document.documentId || document.id;
    setDocumentActionId(`${mode}:${documentId}`);
    try {
      if (mode === "view") {
        const cachedUrl = await getDesktopCachedDocumentUrl(documentId);
        if (cachedUrl) {
          setDocumentPreview({
            url: cachedUrl,
            name: document.fileName || "Document preview",
          });
          return;
        }
      }

      const blob = await downloadDocumentBlob(documentId);
      const localUrl = URL.createObjectURL(blob);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-950">Hub History</h2>
          <p className="text-slate-600">{currentHub.name} · Code {currentHub.code}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Total Orders" value={ordersForHub.length} icon={<FileText />} />
        <Metric title="Active Orders" value={pendingOrders} icon={<Printer />} />
        <Metric title="Pages Printed" value={totalPages} icon={<BarChart3 />} />
        <Metric title="Collected Amount" value={`₹${totalRevenue}`} icon={<IndianRupee />} />
      </div>

      <Card className="relative left-1/2 w-[calc(100vw-1rem)] -translate-x-1/2 px-3 sm:w-[calc(100vw-2rem)] sm:px-4 lg:w-[min(1500px,calc(100vw-3rem))] lg:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-xl font-bold">Historical Orders</h3>
            <p className="mt-2 text-sm text-slate-600">
              Search and filter all hub orders. Operations are managed in Dashboard.
            </p>
          </div>
        </div>

        {/* Filters Controls */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              placeholder="Search code, user, document..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
            />
          </label>

          <label className="relative block">
            <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none appearance-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white"
            >
              <option value="all">All Print Statuses</option>
              {statusCounts.printStatuses.map((st) => (
                <option key={st} value={st}>{displayStatus(st)}</option>
              ))}
            </select>
          </label>

          <label className="relative block">
            <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none appearance-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white"
            >
              <option value="all">All Payment Statuses</option>
              {statusCounts.paymentStatuses.map((pst) => (
                <option key={pst} value={pst}>{label(pst)}</option>
              ))}
            </select>
          </label>

          <label className="relative block">
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none appearance-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white"
            >
              <option value="newest">Sort Newest</option>
              <option value="oldest">Sort Oldest</option>
            </select>
          </label>
        </div>

        {/* Orders Table */}
        <div className="mt-6 max-h-[720px] overflow-y-auto overflow-x-auto border rounded-2xl">
          <table className="w-full min-w-[900px] table-fixed text-left text-sm border-collapse">
            <thead className="sticky top-0 bg-white z-10 shadow-sm border-b">
              <tr className="border-b text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
                <th className="w-24 px-2 py-3">Order</th>
                <th className="w-36 px-2 py-3">Customer</th>
                <th className="w-52 px-2 py-3">Document</th>
                <th className="w-16 px-2 py-3">Pages</th>
                <th className="w-16 px-2 py-3">Amount</th>
                <th className="w-24 px-2 py-3">Payment</th>
                <th className="w-24 px-2 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredOrders.map((item) => {
                const paymentPending = isPaymentPending(item);
                const paymentVerified = isPaymentVerified(item);
                const orderCancelled = isOrderCancelled(item);
                const cancelledBeforePayment = orderCancelled && !paymentVerified;

                return (
                  <tr key={item.id} className="align-top odd:bg-white even:bg-slate-50 hover:bg-slate-100/50 transition">
                    <td className="px-2 py-4 font-semibold">
                      <p className="truncate max-w-[8rem]" title={item.id}>{item.id}</p>
                    </td>
                    <td className="px-2 py-4">
                      <p className="truncate font-semibold text-slate-900" title={item.customerName}>{item.customerName || "Customer"}</p>
                      {item.customerMobile && <p className="text-xs text-slate-500">{item.customerMobile}</p>}
                    </td>
                    <td className="px-2 py-4">
                      <p className="truncate font-semibold text-slate-800" title={item.document}>{item.document}</p>
                      <button
                        type="button"
                        onClick={() => openDocuments(item)}
                        className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                      >
                        <FileText size={13} /> View / Download
                      </button>
                    </td>
                    <td className="px-2 py-4 whitespace-nowrap font-medium">{item.pages} × {item.copies}</td>
                    <td className="px-2 py-4 whitespace-nowrap font-bold text-slate-950">₹{item.amount}</td>
                    <td className="w-24 max-w-[6rem] px-2 py-4 font-semibold">
                      <StatusBadge color={paymentVerified ? "green" : "yellow"}>
                        {label(item.paymentStatus)}
                      </StatusBadge>
                      {cancelledBeforePayment && (
                        <p className="mt-1 text-xs font-semibold text-rose-600">Cancelled before payment.</p>
                      )}
                      {paymentPending && (
                        <p className="mt-1 text-xs text-slate-500">Awaiting payment.</p>
                      )}
                    </td>
                    <td className="px-2 py-4">
                      <StatusBadge>{displayStatus(item.status)}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-500 font-medium">
                    No orders match your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Document Modal */}
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
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
                      >
                        <Download size={15} /> {documentActionId === `download:${document.documentId}` ? "Opening" : "Download original"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openSignedDocument(document, "view")}
                        className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-slate-50 transition"
                      >
                        <Eye size={15} /> {documentActionId === `view:${document.documentId}` ? "Loading" : "View"}
                      </button>
                      <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                        <ShieldCheck size={14} /> Hash verified
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {agentError && <p className="mt-4 text-sm font-semibold text-rose-600">{agentError}</p>}
          </div>
        </div>
      )}

      {documentPreview && (
        <div className="fixed inset-0 z-[60] bg-slate-950/95 flex flex-col p-4 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h3 className="text-white font-semibold truncate pr-4">{documentPreview.name}</h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDocumentPreview(null)}
                className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition"
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="flex-1 bg-white rounded-xl overflow-hidden">
            <iframe 
              src={documentPreview.url} 
              className="w-full h-full border-0" 
              title="Document Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
