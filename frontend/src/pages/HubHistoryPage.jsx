import { useEffect, useMemo, useState } from "react";
import { Search, Filter, RefreshCw, AlertCircle, FileText, CheckCircle2, IndianRupee, XCircle, ArrowUpDown } from "lucide-react";
import { hubActivityStore } from "../state/hubActivityStore";
import {
  filterHubHistoryOrders,
  sortHubHistoryOrders,
  getHubHistorySummary,
  getHubHistoryStatusCounts,
  getHubOrderDisplayStatus,
  getHubOrderPaymentStatus
} from "../utils/hubHistorySelectors";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";

function SummaryCard({ title, value, icon, colorClass = "text-slate-500" }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition duration-200">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-500">{title}</p>
        <span className={colorClass}>{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-extrabold text-slate-950">{value}</p>
    </div>
  );
}

export default function HubHistoryPage({ navigate }) {
  const [activityState, setActivityState] = useState(() => hubActivityStore.getState());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  // Subscribe to hub activity store changes
  useEffect(() => {
    return hubActivityStore.subscribe(setActivityState);
  }, []);

  const orders = activityState.hubOrders || [];
  const loading = activityState.loading;
  const lastLoadedAt = activityState.lastLoadedAt;

  // Memoize status options for dropdown selectors
  const statusCounts = useMemo(() => getHubHistoryStatusCounts(orders), [orders]);

  // Memoize filtered and sorted orders list
  const filteredOrders = useMemo(() => {
    const filters = {
      search,
      status: statusFilter,
      paymentStatus: paymentFilter
    };
    const filtered = filterHubHistoryOrders(orders, filters);
    return sortHubHistoryOrders(filtered, sortBy);
  }, [orders, search, statusFilter, paymentFilter, sortBy]);

  // Memoize summary counts
  const summary = useMemo(() => getHubHistorySummary(orders), [orders]);

  const handleRefresh = async () => {
    await hubActivityStore.triggerRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight lg:text-3xl text-slate-950">Hub History</h2>
          <p className="mt-1 text-sm text-slate-500">
            View recent active orders and payment statuses synced from the dashboard.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          {lastLoadedAt && (
            <p className="text-xs text-slate-400 font-medium">
              Last Synced: {new Date(lastLoadedAt).toLocaleTimeString()}
            </p>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-sm"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Sync Dashboard
          </button>
        </div>
      </div>

      {/* Summary Section */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total Orders" value={summary.totalOrders} icon={<FileText size={20} />} />
        <SummaryCard title="Completed" value={summary.completed} icon={<CheckCircle2 size={20} />} colorClass="text-emerald-500" />
        <SummaryCard title="Paid / Collected" value={summary.collectedOrPaid} icon={<IndianRupee size={20} />} colorClass="text-blue-500" />
        <SummaryCard title="Failed / Cancelled" value={summary.cancelledOrFailed} icon={<XCircle size={20} />} colorClass="text-rose-500" />
      </div>

      {/* Filters Section */}
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                <option key={st} value={st}>{st}</option>
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
                <option key={pst} value={pst}>{pst}</option>
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
      </Card>

      {/* Orders Table/List View */}
      {orders.length === 0 ? (
        <Card className="text-center py-12 flex flex-col items-center justify-center">
          <AlertCircle className="text-slate-300 mb-3" size={40} />
          <h3 className="text-lg font-bold text-slate-800">No recent orders synced</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm">
            Open the Hub Dashboard or sync with the button above to load active print orders.
          </p>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 shadow"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Sync orders
          </button>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="text-center py-12 text-slate-500 font-semibold">
          No orders match your active search filters.
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-4">Order Code</th>
                  <th className="px-6 py-4">Customer Details</th>
                  <th className="px-6 py-4">Document / Info</th>
                  <th className="px-6 py-4">Pricing</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Payment</th>
                  <th className="px-6 py-4">Pickup Code</th>
                </tr>
              </thead>
              <tbody className="divide-y text-sm font-medium text-slate-700">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/70 transition duration-150">
                    <td className="whitespace-nowrap px-6 py-4 font-bold text-slate-900">
                      {order.id}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900">{order.customerName}</div>
                      <div className="text-xs text-slate-400">{order.customerMobile || "No Mobile"}</div>
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate">
                      <div className="font-bold text-slate-900 truncate" title={order.document}>
                        {order.document}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {order.pages} pages · {order.copies} copies · {order.date}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-extrabold text-slate-950">
                      ₹{order.amount}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex">
                        <StatusBadge color={
                          order.status.toLowerCase() === "printed" || order.status.toLowerCase() === "completed" || order.status.toLowerCase() === "collected"
                            ? "green"
                            : order.status.toLowerCase().includes("pending")
                            ? "yellow"
                            : "slate"
                        }>
                          {order.status}
                        </StatusBadge>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex">
                        <StatusBadge color={
                          order.paymentStatus.toLowerCase() === "paid" || order.paymentStatus.toLowerCase() === "collected"
                            ? "green"
                            : "yellow"
                        }>
                          {order.paymentStatus}
                        </StatusBadge>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-bold text-slate-500">
                      {order.pickupCode || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
