import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronDown, Download, FileText, Filter, IndianRupee, Printer, RefreshCw, Search, Store, X } from "lucide-react";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import { createDocumentSignedDownload, getUserHistory } from "../services/api";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function label(value) {
  return String(value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function paymentColor(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("paid") || value.includes("collected") || value.includes("verified")) return "green";
  if (value.includes("failed") || value.includes("refund")) return "red";
  return "amber";
}

function printStatusColor(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("collected") || value.includes("printed") || value.includes("ready")) return "green";
  if (value.includes("failed") || value.includes("cancelled")) return "red";
  return "slate";
}

function getOrderSearchText(order) {
  return [
    order.order_code,
    order.status,
    order.payment_status,
    order.payment_method,
    order.hub?.name,
    order.hub?.code,
    order.document?.file_name,
    ...(order.documents || []).map((file) => file.file_name),
  ].filter(Boolean).join(" ").toLowerCase();
}

function getOrderPrintableSummary(order) {
  const config = order.print_config || {};
  const document = order.document || {};
  return [
    config.paper_size || "A4",
    label(config.color_mode || "black_white"),
    config.sides || (config.duplex ? "Double-sided" : "Single-sided"),
    `${document.printable_pages || order.pages || 0} pages`,
    `${document.copies || order.copies || 1} copy`,
  ].join(" • ");
}

function getPageRangeFromOptions(options, fallback = "all") {
  const pages = options?.pages || {};
  if (pages.mode === "custom") return pages.range || fallback || "custom";
  return fallback || "all";
}

function getSidesLabel(options, fallback = "") {
  const sides = options?.sides || fallback;
  if (sides === "two_sided_long_edge" || sides === "double") return "Double-sided";
  if (sides === "two_sided_short_edge") return "Double-sided short edge";
  return "Single-sided";
}

function getWatermarkLabel(options) {
  const watermark = options?.watermark || {};
  if (!watermark.enabled) return "No";
  return watermark.type ? `Yes • ${label(watermark.type)}` : "Yes";
}

function buildDocumentSettings(document, orderConfig) {
  const options = document?.print_options || {};
  return [
    ["Paper", options.paperSize || orderConfig.paper_size || "A4"],
    ["Color", label(options.colorMode || orderConfig.color_mode || "black_white")],
    ["Sides", getSidesLabel(options, orderConfig.sides)],
    ["Orientation", label(options.orientation || orderConfig.orientation || "auto")],
    ["Copies", options.copies || document?.copies || orderConfig.copies || 1],
    ["Page range", getPageRangeFromOptions(options, document?.page_range || orderConfig.page_range || "all")],
    ["Pages/sheet", options.pagesPerSheet || orderConfig.pages_per_sheet || 1],
    ["DPI", options.quality?.dpi || orderConfig.quality_dpi || 300],
    ["Scaling", label(options.scale?.mode || orderConfig.scaling || "original")],
    ["Margins", label(options.margins?.mode || orderConfig.margins || "default")],
    ["Watermark", getWatermarkLabel(options.watermark ? options : { watermark: orderConfig.watermark })],
  ];
}

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
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{itemLabel}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value || "-"}</p>
    </div>
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
          : "Guest users cannot view history. Login to see your previous print orders, payments, and settings."}
      </p>
    </Card>
  );
}

export default function HistoryPage({ orders = [], currentUser, lastUpdatedAt, onOpenPayment, onReprintOrder }) {
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

  useEffect(() => {
    if (!currentUser || currentUser.role !== "user") {
      setHistoryData(null);
      return;
    }

    let ignore = false;
    setLoading(true);
    setError("");

    getUserHistory()
      .then((data) => {
        if (!ignore) setHistoryData(data);
      })
      .catch((err) => {
        if (!ignore) setError(err.message || "Could not load print history.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [currentUser, lastUpdatedAt]);

  const historyOrders = Array.isArray(historyData?.orders) ? historyData.orders : [];
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
  const visibleSource = historyOrders.length || historyData ? historyOrders : fallbackOrders;

  const summary = historyData?.summary || {
    total_orders: visibleSource.length,
    total_pages_printed: visibleSource.reduce((sum, order) => sum + Number(order.pages || 0) * Number(order.copies || 1), 0),
    total_amount_spent: visibleSource.reduce((sum, order) => sum + Number(order.amount || 0), 0),
    last_print_date: visibleSource[0]?.created_at || null,
  };

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
    const searchText = search.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return visibleSource.filter((order) => {
      const createdTime = new Date(order.created_at).getTime();
      if (searchText && !getOrderSearchText(order).includes(searchText)) return false;
      if (fromTime && Number.isFinite(createdTime) && createdTime < fromTime) return false;
      if (toTime && Number.isFinite(createdTime) && createdTime > toTime) return false;
      if (status !== "all" && order.status !== status) return false;
      if (paymentMethod !== "all" && (order.payment_method || order.payment?.method) !== paymentMethod) return false;
      if (hubFilter !== "all" && order.hub?.name !== hubFilter) return false;
      return true;
    });
  }, [dateFrom, dateTo, hubFilter, paymentMethod, search, status, visibleSource]);

  async function downloadDocument(document) {
    if (!document?.document_id) return;
    setDownloadError("");
    try {
      const data = await createDocumentSignedDownload(document.document_id);
      if (data.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setDownloadError(err.message || "Could not create signed download link.");
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
    const config = order.print_config || {};
    const documents = order.documents?.length ? order.documents : [order.document].filter(Boolean);

    return (
      <div className="grid gap-5 border-t bg-slate-50/70 p-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="space-y-4">
          <div>
            <h4 className="font-bold text-slate-950">Document Details</h4>
            <div className="mt-3 grid gap-3">
              {documents.map((document, index) => (
                <div key={document.id || document.document_id || `${order.id}-${index}`} className="rounded-2xl border bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{document.file_name || "Document"}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {document.file_type || "PDF"} • Original {document.original_pages || "-"} pages • Range {document.page_range || "all"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Printable {document.printable_pages || "-"} • Copies {document.copies || 1} • Charged pages {document.charged_pages || "-"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!document.document_id}
                      onClick={() => downloadDocument(document)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      <Download size={15} /> View / Download
                    </button>
                  </div>
                  <div className="mt-4 border-t pt-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Settings used for this document</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                      {buildDocumentSettings(document, config).map(([settingLabel, value]) => (
                        <DetailLine key={`${document.id || document.document_id || index}-${settingLabel}`} label={settingLabel} value={value} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-950">Status Timeline</h4>
            <div className="mt-3 space-y-3">
              {(order.timeline || []).map((item, index) => (
                <div key={`${item.label}-${item.time}-${index}`} className="flex gap-3">
                  <span className="mt-1 h-3 w-3 rounded-full bg-slate-900" />
                  <div>
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(item.time)}</p>
                  </div>
                </div>
              ))}
              {!order.timeline?.length && <p className="text-sm text-slate-500">Timeline is not available for this order yet.</p>}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h4 className="font-bold text-slate-950">Print Settings Used</h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <DetailLine label="Paper" value={config.paper_size || "A4"} />
              <DetailLine label="Color" value={label(config.color_mode || "black_white")} />
              <DetailLine label="Sides" value={config.sides || (config.duplex ? "Double-sided" : "Single-sided")} />
              <DetailLine label="Orientation" value={label(config.orientation || "auto")} />
              <DetailLine label="Copies" value={config.copies || order.copies || 1} />
              <DetailLine label="Page range" value={config.page_range || order.document?.page_range || "all"} />
              <DetailLine label="Scaling" value={label(config.scaling || "original")} />
              <DetailLine label="DPI" value={config.quality_dpi || 300} />
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-950">Payment</h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <DetailLine label="Method" value={order.payment?.method || order.payment_method} />
              <DetailLine label="Status" value={order.payment?.status || order.payment_status} />
              <DetailLine label="Amount" value={`₹${order.payment?.amount ?? order.amount ?? 0}`} />
              <DetailLine label="Paid at" value={formatDateTime(order.payment?.paid_at)} />
              <DetailLine label="Transaction" value={order.payment?.transaction_id || "Not available"} />
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-950">Hub / Shop</h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <DetailLine label="Hub" value={order.hub?.name} />
              <DetailLine label="Code" value={order.hub?.code} />
              <DetailLine label="Printer" value={order.print_job?.printer_name || "Not recorded"} />
              <DetailLine label="Agent" value={order.print_job?.agent_id || "Not recorded"} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onReprintOrder?.(order)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              <RefreshCw size={15} /> Reprint same settings
            </button>
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold text-slate-400"
              title="Receipt PDF generation is not available yet."
            >
              <Download size={15} /> Download receipt
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!currentUser || currentUser.role !== "user") {
    return <EmptyState currentUser={null} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-950">My Prints</h2>
          <p className="mt-2 text-sm text-slate-600">View your previous orders, payment details, and print settings.</p>
        </div>
        {lastUpdatedAt && <p className="text-xs font-semibold text-slate-500">Last refreshed {new Date(lastUpdatedAt).toLocaleTimeString()}</p>}
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
                    <StatusBadge color={printStatusColor(order.status)}>{order.status || "Order"}</StatusBadge>
                    <StatusBadge color={paymentColor(order.payment?.status || order.payment_status)}>{order.payment?.status || order.payment_status || "Payment"}</StatusBadge>
                  </div>
                  <p className="mt-2 font-semibold text-slate-800">{order.document?.file_name || "Uploaded document"}</p>
                  <p className="mt-1 text-sm text-slate-500">{formatDateTime(order.created_at)}</p>
                  <p className="mt-2 text-sm text-slate-600">{getOrderPrintableSummary(order)}</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
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
                      setExpandedOrderId(expanded ? "" : order.id);
                      setMobileDetailOrder(order);
                    }}
                    className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    View Details
                  </button>
                  <button type="button" onClick={() => onReprintOrder?.(order)} className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-slate-50">
                    Reprint
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
        <div className="fixed inset-0 z-50 bg-slate-950/50 p-0 lg:hidden">
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-4">
              <div>
                <h3 className="font-bold">{mobileDetailOrder.order_code || mobileDetailOrder.id}</h3>
                <p className="text-xs text-slate-500">Order details</p>
              </div>
              <button type="button" onClick={() => setMobileDetailOrder(null)} className="rounded-full border p-2" aria-label="Close details">
                <X size={18} />
              </button>
            </div>
            {renderOrderDetails(mobileDetailOrder)}
          </div>
        </div>
      )}
    </div>
  );
}
