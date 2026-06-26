import { CheckCircle, Clock, CreditCard, QrCode, XCircle } from "lucide-react";
import Card from "../components/Card";
import Row from "../components/Row";

const orderStatuses = [
  "Awaiting Hub Bill Confirmation",
  "Bill Confirmed",
  "Payment Requested",
  "Payment Collected",
  "Queued for Printing",
  "Printing",
  "Completed",
];

const statusMap = {
  draft_uploaded: "Draft Uploaded",
  awaiting_hub_bill_confirmation: "Awaiting Hub Bill Confirmation",
  bill_confirmed: "Bill Confirmed",
  payment_requested: "Payment Requested",
  payment_collected: "Payment Collected",
  queued_for_print: "Queued for Printing",
  printing: "Printing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function normalizeStatus(status) {
  if (!status) return "";

  const key = String(status).trim().toLowerCase().replace(/\s+/g, "_");
  return statusMap[key] || status;
}

function isPaymentPending(order) {
  const value = String(order?.status || "").toLowerCase();
  return ["bill_confirmed", "payment_requested"].includes(value);
}

function isAwaitingHub(order) {
  const value = String(order?.status || "").toLowerCase();
  return ["awaiting_hub_bill_confirmation"].includes(value);
}

export default function TrackPage({
  order,
  lastUpdatedAt,
  pendingPayment,
  upiQr,
  centreUpiId,
  centreUpiQrImageUrl,
  onPayOnline,
  onCreateUpiQr,
  onSimulateVerifiedPayment,
  paymentLoading,
  paymentError,
}) {
  if (!order) return <Card>No active order found.</Card>;

  const currentStatus = normalizeStatus(order.status);
  const activeIndex = orderStatuses.indexOf(currentStatus);
  const paymentPending = isPaymentPending(order);
  const awaitingHub = isAwaitingHub(order);
  const isCancelled = String(order.status).toLowerCase() === "cancelled";
  const razorpayQrImageUrl = upiQr?.source === "centre" ? "" : upiQr?.imageUrl || upiQr?.image_url || "";
  const centreQrImageUrl = centreUpiQrImageUrl || (upiQr?.source === "centre" ? upiQr?.imageUrl || upiQr?.image_url : "");

  return (
    <Card className="mx-auto max-w-2xl">
      <h2 className="text-2xl font-bold">Order Tracking</h2>
      {lastUpdatedAt && <p className="mt-1 text-xs text-slate-500">Last updated: {new Date(lastUpdatedAt).toLocaleTimeString()}</p>}
      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <Row label="Order ID" value={order.id} />
        <Row label="Centre" value={order.centre} />
        <Row label="Document" value={order.document} />
        <Row label="Copies" value={order.copies || order.printConfigSnapshot?.copies || 1} />
        <Row label="Color" value={String(order.printConfigSnapshot?.colorMode || order.colorType).toLowerCase() === 'color' ? 'Color' : 'Black & White'} />
        <Row label="Sides" value={String(order.printConfigSnapshot?.sides || order.sideType).toLowerCase().includes('double') || String(order.printConfigSnapshot?.sides || order.sideType).toLowerCase().includes('two') ? 'Double-sided' : 'Single-sided'} />
        <Row label={paymentPending ? "Amount Due" : "Amount Paid"} value={"₹" + order.amount} />
        <Row label="Payment" value={order.paymentStatus || "Pending"} />
        <Row label="Pickup Code" value={order.pickupCode} />
        {activeIndex === -1 && <Row label="Current Status" value={order.status || "Unknown"} />}
      </div>

      {isCancelled && (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 text-rose-600" size={20} />
            <div>
              <p className="font-semibold text-rose-700">Order Cancelled</p>
              <p className="mt-1">This order was cancelled. Please check with the printing centre for details or register a new print job.</p>
            </div>
          </div>
        </div>
      )}

      {awaitingHub && !isCancelled && (
        <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 text-blue-600" size={20} />
            <div>
              <p className="font-semibold text-blue-700">Awaiting Hub Bill Confirmation</p>
              <p className="mt-1">Your document has been uploaded. Please wait for the hub to review the document complexity and confirm the final print bill. You can proceed with payment once the hub confirms the total.</p>
            </div>
          </div>
        </div>
      )}

      {paymentPending && !isCancelled && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5" size={20} />
            <div>
              <p className="font-semibold">Payment request pending</p>
              <p className="mt-1">Pay via centre UPI, cash at the counter, or Razorpay. The print hub owner can manually confirm collection before printing starts.</p>
              {pendingPayment?.createdAt && <p className="mt-2 text-xs">Request opened: {new Date(pendingPayment.createdAt).toLocaleString()}</p>}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onPayOnline && onPayOnline()}
              disabled={paymentLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white disabled:bg-slate-400"
            >
              <CreditCard size={16} /> {paymentLoading ? "Starting..." : "Pay Online"}
            </button>

            <button
              type="button"
              onClick={() => onCreateUpiQr && onCreateUpiQr()}
              disabled={paymentLoading}
              className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 font-semibold text-slate-900 disabled:opacity-50"
            >
              <QrCode size={16} /> Generate UPI QR
            </button>

            {onSimulateVerifiedPayment && pendingPayment?.id && (
              <button
                type="button"
                onClick={onSimulateVerifiedPayment}
                disabled={paymentLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-dashed bg-white px-4 py-2 font-semibold text-slate-700 disabled:opacity-50"
              >
                Dev Only: Simulate Verified Payment
              </button>
            )}
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-4">
            <p className="font-semibold">Centre UPI</p>
            <p className="mt-1 break-all text-slate-700">{centreUpiId || "UPI ID not added by this centre."}</p>
            {centreQrImageUrl && (
              <div className="mt-4 text-center">
                <img src={centreQrImageUrl} alt="Centre UPI QR" className="mx-auto h-48 w-48 object-contain" />
                <p className="mt-2 text-xs text-slate-500">Scan and pay, then ask the hub to confirm payment collected.</p>
              </div>
            )}
          </div>

          {razorpayQrImageUrl && (
            <div className="mt-4 rounded-2xl border bg-white p-4 text-center">
              <img src={razorpayQrImageUrl} alt="Razorpay UPI QR" className="mx-auto h-48 w-48 object-contain" />
              <p className="mt-2 text-xs text-slate-500">Scan this QR to pay. Status updates after Razorpay confirms payment.</p>
            </div>
          )}

          {paymentError && <p className="mt-3 font-semibold text-rose-700">{paymentError}</p>}
        </div>
      )}

      {!paymentPending && !awaitingHub && !isCancelled && (
        <p className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          Payment completed. Print job queued/sent to desktop agent when an online printer is available.
        </p>
      )}

      <div className="mt-6 space-y-3">
        {orderStatuses.map((status, index) => (
          <div key={status} className="flex items-center gap-3 rounded-2xl border p-4">
            <CheckCircle className={activeIndex >= 0 && index <= activeIndex ? "text-green-600" : "text-slate-300"} />
            <span className={activeIndex >= 0 && index <= activeIndex ? "font-bold text-green-700" : "text-slate-500"}>{status}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
