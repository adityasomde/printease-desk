import { useEffect, useMemo, useState, useRef } from "react";
import { Calendar, CheckCircle2, ChevronDown, Download, Eye, FileText, Filter, IndianRupee, MapPin, Printer, RefreshCw, Search, Settings2, Store, X, Info } from "lucide-react";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import { createDocumentSignedDownload, getUserHistory, getOrderDetail } from "../services/api";
import { useDocumentPreview } from "../hooks/useDocumentPreview";
import DocumentPreviewModal from "../components/DocumentPreviewModal";
import { getLocalHistory } from "../utils/localHistory";
import { onOrderChanged } from "../utils/appEvents";
import {
  filterAndSortHistory,
  computeSummary,
  getStatusColor,
  getStatusLabel as label,
  formatDateTime,
  formatDate,
  getOrderPrintableSummary,
  buildDocumentSettings
} from "../utils/historySelectors";

const paymentColor = (status) => getStatusColor("payment", status);
const printStatusColor = (status) => getStatusColor("print", status);

function SummaryCard({ title, value, icon }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-500">{title}</p>
        <span className="text-slate-400">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-extrabold text-slate-950">{value}</p>
    </div>
  );
}

function DetailLine({ label: itemLabel, value }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{itemLabel}</p>
      <p className="mt-1 text-sm font-semibold leading-snug text-slate-800">{value ?? "-"}</p>
    </div>
  );
}

function DetailPanel({ title, icon, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-950 text-white">{icon}</span>
        <h4 className="text-sm font-extrabold text-slate-950">{title}</h4>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ currentUser }) {
  return (
    <Card className="text-center">
      <FileText className="mx-auto text-slate-300" size={42} />
      <h2 className="mt-4 text-2xl font-bold">{currentUser ? "No print history yet" : "Login Required"}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        {currentUser
          ? "Your completed and pending print orders will appear here after you upload documents and create an order."
          : "You haven't made any print orders yet. Orders you place as a guest will appear here temporarily."}
      </p>
    </Card>
  );
}

export default function HistoryPage({ orders = [], currentUser, lastUpdatedAt, onOpenPayment, onReprintOrder, onReprintWithSettings, isReprinting }) {
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [mobileDetailOrder, setMobileDetailOrder] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [hubFilter, setHubFilter] = useState("all");
  const [downloadError, setDownloadError] = useState("");
  const [historyStale, setHistoryStale] = useState(false);

  const {
    documentId: previewDocId,
    openPreview,
    closePreview,
    downloadDocument: triggerDownload,
    blobUrl,
    previewKind,
    fileName: previewFileName,
    fileType: previewFileType,
    fileSize: previewFileSize,
    textContent: previewTextContent,
    loading: previewLoading,
    error: previewError
  } = useDocumentPreview();
  useEffect(() => {
    // Mobile check removed to keep unified simple PDF viewer
  }, []);
  const lastFetchTime = useRef(0);
  /** Stores fetched full-detail per order.id so repeat clicks skip re-fetch */
  const detailCache = useRef({});
  const [detailLoading, setDetailLoading] = useState("");
  const [detailError, setDetailError] = useState("");

  const loadHistory = (force = false) => {
    if (!currentUser || currentUser.role !== "user") {
      setHistoryData(null);
      return;
    }

    setLoading(true);
    setError("");

    getUserHistory({ force, userId: currentUser.id })
      .then((data) => {
        setHistoryData(data);
        lastFetchTime.current = Date.now();
        setHistoryStale(false);
      })
      .catch((err) => {
        setError(err.message || "Could not load print history.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  /**
   * Lazily fetches full order detail on demand.
   * Uses detailCache ref so repeat clicks don't re-fetch.
   */
  function fetchOrderDetail(order) {
    if (detailCache.current[order.id] || order.isLocal) return;
    setDetailLoading(order.id);
    setDetailError("");
    getOrderDetail(order.id)
      .then((detail) => {
        detailCache.current = { ...detailCache.current, [order.id]: detail };
        // Trigger re-render by updating a piece of state
        setDetailLoading("");
      })
      .catch((err) => {
        setDetailError(err.message || "Could not load order details.");
        setDetailLoading("");
      });
  }

  useEffect(() => {
    loadHistory(false);
  }, [currentUser?.id]);

  useEffect(() => {
    const handleFocus = () => {
      const isExpired = Date.now() - lastFetchTime.current > 120000;
      if (historyStale || isExpired) {
        loadHistory(false);
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [currentUser?.id, historyStale]);

  useEffect(() => {
    return onOrderChanged(() => {
      setHistoryStale(true);
    });
  }, [currentUser?.id]);

  const historyOrders = Array.isArray(historyData?.orders) ? historyData.orders : [];
  const localOrders = getLocalHistory(currentUser?.id || null).map((order) => ({
    id: order.id,
    order_code: order.orderCode || order.id,
    created_at: order.createdAt,
    status: order.status,
    payment_status: order.paymentStatus,
    payment_method: order.paymentMethod || "Unknown",
    amount: order.amount,
    pages: order.printConfigSnapshot?.printablePages || 1,
    copies: order.printConfigSnapshot?.copies || 1,
    hub: { name: "Local Centre", id: order.centreId },
    document: {
      file_name: order.documentName || "Uploaded Document",
      file_type: "application/pdf",
      original_pages: 1,
      page_range: "all",
      printable_pages: order.printConfigSnapshot?.printablePages || 1,
      copies: order.printConfigSnapshot?.copies || 1,
      charged_pages: 1,
    },
    documents: order.files || [],
    print_config: {
      paper_size: order.printConfigSnapshot?.paperSize || "A4",
      color_mode: order.printConfigSnapshot?.colorMode || "black_white",
      sides: order.printConfigSnapshot?.sides === "two_sided_long_edge" || order.printConfigSnapshot?.sides === "double" ? "Double-sided" : "Single-sided",
      orientation: order.printConfigSnapshot?.orientation || "auto",
      copies: order.printConfigSnapshot?.copies || 1,
      page_range: order.printConfigSnapshot?.pages?.mode === "custom" ? order.printConfigSnapshot.pages.range : "all",
      scaling: order.printConfigSnapshot?.scale?.mode || "original",
      pages_per_sheet: order.printConfigSnapshot?.pagesPerSheet || 1,
      margins: order.printConfigSnapshot?.margins?.mode || "default",
      quality_dpi: order.printConfigSnapshot?.quality?.dpi || 300,
      watermark: order.printConfigSnapshot?.watermark || { enabled: false },
    },
    payment: { status: order.paymentStatus, method: "Unknown", amount: order.amount },
    timeline: [{ label: "Order created locally", time: order.createdAt }],
    isLocal: true,
  }));

  const fallbackOrders = currentUser?.role === "user" && !historyData
    ? orders.map((order) => ({
        id: order.backendId || order.id,
        order_code: order.id,
        created_at: order.createdAt || order.date,
        status: order.status,
        payment_status: order.paymentStatus,
        payment_method: "Unknown",
        amount: order.amount,
        pages: order.pages,
        copies: order.copies,
        hub: { name: order.centre, id: order.centreId, code: order.centreCode },
        document: {
          file_name: order.document,
          file_type: "application/pdf",
          original_pages: order.pages,
          page_range: "all",
          printable_pages: order.pages,
          copies: order.copies,
          charged_pages: order.pages,
        },
        documents: [],
        print_config: {},
        payment: { status: order.paymentStatus, method: "Unknown", amount: order.amount },
        timeline: [{ label: "Order created", time: order.createdAt || order.date }],
      }))
    : [];

  const visibleSource = historyOrders.length || historyData ? historyOrders : [...fallbackOrders, ...localOrders];

  const summary = useMemo(() => {
    return historyData?.summary || computeSummary(visibleSource);
  }, [historyData, visibleSource]);

  const hubs = useMemo(() => {
    return [...new Set(visibleSource.map((order) => order.hub?.name).filter(Boolean))].sort();
  }, [visibleSource]);

  const statuses = useMemo(() => {
    return [...new Set(visibleSource.map((order) => order.status).filter(Boolean))].sort();
  }, [visibleSource]);

  const paymentMethods = useMemo(() => {
    return [...new Set(visibleSource.map((order) => order.payment_method || order.payment?.method).filter(Boolean))].sort();
  }, [visibleSource]);

  const filteredOrders = useMemo(() => {
    return filterAndSortHistory(visibleSource, {
      search,
      dateFrom,
      dateTo,
      status,
      paymentMethod,
      hubFilter,
      sortBy: "newest"
    });
  }, [visibleSource, search, dateFrom, dateTo, status, paymentMethod, hubFilter]);

  function downloadDocument(document, mode = "download") {
    if (!document?.document_id) return;
    setDownloadError("");
    if (mode === "view") {
      openPreview(document.document_id, document.file_name, document.file_type, document.file_size);
    } else {
      triggerDownload(document.document_id, document.file_name);
    }
  }

  function resetFilters() {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setStatus("all");
    setPaymentMethod("all");
    setHubFilter("all");
  }

  function renderOrderDetails(order) {
    // Prefer full cached detail, fall back to compact order data for local/fallback orders
    const detail = detailCache.current[order.id] || order;
    const isLoadingDetail = detailLoading === order.id;

    if (isLoadingDetail) {
      return (
        <div className="border-t bg-slate-50 p-6 flex items-center justify-center gap-3 text-sm text-slate-500">
          <RefreshCw size={16} className="animate-spin" />
          Loading order details…
        </div>
      );
    }

    if (detailError && expandedOrderId === order.id) {
      return (
        <div className="border-t bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {detailError}
        </div>
      );
    }

    const config = detail.print_config || {};
    const documents = detail.documents?.length ? detail.documents : [detail.document].filter(Boolean);
    const paymentStatus = detail.payment?.status || detail.payment_status;
    const paymentMethodLabel = label(detail.payment?.method || detail.payment_method || "Not recorded");
    const createdAt = formatDateTime(detail.created_at);

    return (
      <div className="border-t bg-slate-50 p-3 sm:p-4">
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Order sheet</p>
              <h4 className="mt-1 text-xl font-extrabold text-slate-950">{detail.order_code || detail.id}</h4>
              <p className="mt-1 text-sm text-slate-500">Created {createdAt}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge color={printStatusColor(detail.status)}>{label(detail.status) || "Order"}</StatusBadge>
              <StatusBadge color={paymentColor(paymentStatus)}>{label(paymentStatus) || "Payment"}</StatusBadge>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailLine label="Documents" value={`${documents.length || 1} file${documents.length === 1 ? "" : "s"}`} />
            <DetailLine label="Printable pages" value={detail.pages || detail.document?.printable_pages || "-"} />
            <DetailLine label="Copies" value={detail.copies || config.copies || 1} />
            <DetailLine label="Total paid/requested" value={`₹${detail.payment?.amount ?? detail.amount ?? 0}`} />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
          <div className="space-y-4">
            <DetailPanel title="Documents And Print Settings" icon={<FileText size={17} />}>
              <div className="space-y-3">
                {documents.map((document, index) => {
                  const documentKey = document.id || document.document_id || `${order.id}-${index}`;
                  const settings = buildDocumentSettings(document, config);
                  return (
                    <article key={documentKey} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
                              <FileText size={17} />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-extrabold text-slate-950">{document.file_name || `Document ${index + 1}`}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                {document.file_type || "PDF"} · {document.original_pages || "-"} original pages · Range {document.page_range || "all"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Printable {document.printable_pages || "-"} · Copies {document.copies || 1} · Charged {document.charged_pages || document.printable_pages || "-"}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!document.document_id}
                            onClick={() => downloadDocument(document, "view")}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            <Eye size={15} /> View
                          </button>
                          <button
                            type="button"
                            disabled={!document.document_id}
                            onClick={() => downloadDocument(document, "download")}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            <Download size={15} /> Download
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                        {settings.map(([settingLabel, value]) => (
                          <DetailLine key={`${documentKey}-${settingLabel}`} label={settingLabel} value={value} />
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </DetailPanel>

            <DetailPanel title="Order Progress" icon={<CheckCircle2 size={17} />}>
              <div className="space-y-3">
                {(detail.timeline || []).map((item, index) => (
                  <div key={`${item.label}-${item.time}-${index}`} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 h-3 w-3 rounded-full bg-slate-950" />
                      {index < (detail.timeline || []).length - 1 && <span className="mt-1 h-full min-h-8 w-px bg-slate-200" />}
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-sm font-bold text-slate-900">{item.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(item.time)}</p>
                    </div>
                  </div>
                ))}
                {!detail.timeline?.length && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">Timeline is not available for this order yet.</p>}
              </div>
            </DetailPanel>
          </div>

          <aside className="space-y-4">
            <DetailPanel title="Payment" icon={<IndianRupee size={17} />}>
              <div className="grid grid-cols-2 gap-2">
                <DetailLine label="Method" value={paymentMethodLabel} />
                <DetailLine label="Status" value={label(paymentStatus)} />
                <DetailLine label="Amount" value={`₹${detail.payment?.amount ?? detail.amount ?? 0}`} />
                <DetailLine label="Paid at" value={formatDateTime(detail.payment?.paid_at)} />
              </div>
              <div className="mt-2">
                <DetailLine label="Transaction reference" value={detail.payment?.transaction_id || "Not recorded"} />
              </div>
            </DetailPanel>

            <DetailPanel title="Print Centre" icon={<MapPin size={17} />}>
              <div className="grid grid-cols-2 gap-2">
                <DetailLine label="Shop" value={detail.hub?.name || "Print Hub"} />
                <DetailLine label="Centre code" value={detail.hub?.code || "-"} />
                <DetailLine label="Printer" value={detail.print_job?.printer_name || "Not recorded"} />
                <DetailLine label="Agent" value={detail.print_job?.agent_id || "Not recorded"} />
              </div>
            </DetailPanel>

            <DetailPanel title="Order Defaults" icon={<Settings2 size={17} />}>
              <div className="grid grid-cols-2 gap-2">
                <DetailLine label="Paper" value={config.paper_size || "A4"} />
                <DetailLine label="Color" value={label(config.color_mode || "black_white")} />
                <DetailLine label="Sides" value={config.sides || (config.duplex ? "Double-sided" : "Single-sided")} />
                <DetailLine label="Orientation" value={label(config.orientation || "auto")} />
                <DetailLine label="Page range" value={config.page_range || detail.document?.page_range || "all"} />
                <DetailLine label="DPI" value={config.quality_dpi || 300} />
              </div>
            </DetailPanel>

            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => onReprintOrder?.(detail)}
                disabled={isReprinting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              >
                <RefreshCw size={16} /> {isReprinting ? "Creating a new reprint order..." : "Reprint exact settings"}
              </button>
              <button
                type="button"
                onClick={() => onReprintWithSettings?.(detail)}
                disabled={isReprinting}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <Settings2 size={16} /> {isReprinting ? "Loading..." : "Reprint with changes"}
              </button>
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-400"
                title="Receipt PDF generation is not available yet."
              >
                <Download size={16} /> Receipt coming later
              </button>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if ((!currentUser || currentUser.role !== "user") && visibleSource.length === 0) {
    return <EmptyState currentUser={null} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-black tracking-tight lg:text-3xl">Print History</h2>
          <p className="mt-1 text-sm text-slate-500">View your previous orders, payment details, and print settings.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw size={14} className={loading ? "animate-spin text-slate-900" : ""} />
          <span>Last refreshed {formatDateTime(historyData?.summary?.last_print_date || new Date())}</span>
          <button
            onClick={() => loadHistory(true)}
            disabled={loading}
            className="ml-2 rounded border px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-md bg-blue-50 p-4 border border-blue-100 flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-700">
          <strong>Privacy Notice:</strong> For your security, all uploaded documents and server records are permanently deleted after 15 days. Local fallback history is stored only for this browser profile and current PrintEase account or guest session.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total Orders" value={summary.total_orders || 0} icon={<FileText size={18} />} />
        <SummaryCard title="Total Pages Printed" value={summary.total_pages_printed || 0} icon={<Printer size={18} />} />
        <SummaryCard title="Total Amount Spent" value={`₹${summary.total_amount_spent || 0}`} icon={<IndianRupee size={18} />} />
        <SummaryCard title="Last Print Date" value={formatDate(summary.last_print_date)} icon={<Calendar size={18} />} />
      </div>

      <Card>
        <button
          type="button"
          onClick={() => setFiltersOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 text-left lg:hidden"
        >
          <span className="inline-flex items-center gap-2 font-bold"><Filter size={18} /> Filters</span>
          <ChevronDown className={filtersOpen ? "rotate-180 transition" : "transition"} size={18} />
        </button>
        <div className={`${filtersOpen ? "grid" : "hidden"} mt-4 gap-3 lg:mt-0 lg:grid lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]`}>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order code or file"
              className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-300" />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-300" />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-300">
            <option value="all">All statuses</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-300">
            <option value="all">All payments</option>
            {paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={hubFilter} onChange={(event) => setHubFilter(event.target.value)} className="rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-300">
            <option value="all">All hubs</option>
            {hubs.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <button type="button" onClick={resetFilters} className="mt-3 text-sm font-semibold text-slate-500 hover:text-slate-900">
          Clear filters
        </button>
      </Card>

      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
      {downloadError && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{downloadError}</p>}
      {loading && <p className="rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-slate-600">Loading your print history...</p>}

      <div className="space-y-4">
        {filteredOrders.map((order) => {
          const expanded = expandedOrderId === order.id;
          return (
            <article key={order.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-extrabold">{order.order_code || order.id}</h3>
                    <StatusBadge color={printStatusColor(order.status)}>{label(order.status) || "Order"}</StatusBadge>
                    {label(order.payment?.status || order.payment_status) !== label(order.status) && (
                      <StatusBadge color={paymentColor(order.payment?.status || order.payment_status)}>
                        {label(order.payment?.status || order.payment_status) || "Payment"}
                      </StatusBadge>
                    )}
                  </div>
                  <p className="mt-1.5 font-semibold text-sm text-slate-800">{order.document?.file_name || order.document_name || `${order.file_count || order.documents?.length || 1} uploaded document${(order.file_count || order.documents?.length || 1) !== 1 ? 's' : ''}`}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(order.created_at)}</p>
                  <p className="mt-1 text-[11px] text-slate-600">{getOrderPrintableSummary(order)}</p>
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Store size={15} /> {order.hub?.name || "Print Hub"} • ₹{order.amount || 0} • {order.payment_method || order.payment?.method || "Payment"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {String(order.payment_status || "").toLowerCase() === "pending" && onOpenPayment && (
                    <button type="button" onClick={() => onOpenPayment(order)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                      Open Payment
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const nextExpanded = expanded ? "" : order.id;
                      setExpandedOrderId(nextExpanded);
                      setMobileDetailOrder(order);
                      if (nextExpanded) fetchOrderDetail(order);
                    }}
                    className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    {detailLoading === order.id ? "Loading…" : "View Details"}
                  </button>
                  <button type="button" disabled={isReprinting} onClick={() => onReprintOrder?.(order)} className="rounded-xl border px-3 py-2 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50">
                    {isReprinting ? "Reprinting..." : "Reprint exactly"}
                  </button>
                  <button type="button" disabled={isReprinting} onClick={() => onReprintWithSettings?.(order)} className="rounded-xl border px-3 py-2 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50">
                    {isReprinting ? "Loading..." : "Reprint with changes"}
                  </button>
                </div>
              </div>
              <div className="hidden lg:block">{expanded && renderOrderDetails(order)}</div>
            </article>
          );
        })}
      </div>

      {!loading && filteredOrders.length === 0 && <EmptyState currentUser={currentUser} />}

      {mobileDetailOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 p-0 lg:hidden" onClick={() => setMobileDetailOrder(null)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto overscroll-contain rounded-t-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-4">
              <div>
                <h3 className="font-bold text-slate-900">{mobileDetailOrder.order_code || mobileDetailOrder.id}</h3>
                <p className="text-xs text-slate-500">Order details</p>
              </div>
              <button type="button" onClick={() => setMobileDetailOrder(null)} className="rounded-full border p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100" aria-label="Close details">
                <X size={18} />
              </button>
            </div>
            {renderOrderDetails(mobileDetailOrder)}
          </div>
        </div>
      )}

      <DocumentPreviewModal
        isOpen={!!previewDocId}
        onClose={closePreview}
        blobUrl={blobUrl}
        previewKind={previewKind}
        fileName={previewFileName}
        fileType={previewFileType}
        fileSize={previewFileSize}
        textContent={previewTextContent}
        loading={previewLoading}
        error={previewError}
        onDownload={() => triggerDownload(previewDocId, previewFileName)}
      />
    </div>
  );
}
