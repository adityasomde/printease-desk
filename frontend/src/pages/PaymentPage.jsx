import { useEffect, useMemo, useState } from "react";
import { Clock, CreditCard, IndianRupee, QrCode, ShieldCheck } from "lucide-react";
import Card from "../components/Card";
import Row from "../components/Row";
import { buildPaymentPriceFromOrder } from "../utils/paymentOrderPricing";

const paymentOptions = [
  {
    id: "manual",
    title: "Manual Request",
    description: "Pay cash or centre UPI. Hub owner confirms from dashboard.",
    icon: Clock,
  },
  {
    id: "razorpay",
    title: "Pay Online",
    description: "Use Razorpay Checkout when online payments are enabled.",
    icon: CreditCard,
  },
  {
    id: "upi_qr",
    title: "UPI QR",
    description: "Generate a Razorpay QR for this exact order amount.",
    icon: QrCode,
  },
];

function formatCurrency(value) {
  const num = Number(value);
  if (isNaN(num) || num <= 0) return "Pending";
  return `₹${num.toFixed(2)}`;
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
}

function hasPendingPricing(price, order) {
  const rawStatus = normalizeStatus(order?.rawStatus || order?.status);
  if (rawStatus === "cancelled") return false;
  if (rawStatus === "bill_confirmed") return false;

  const billStatus = normalizeStatus(order?.billStatus || order?.bill_status);
  const snapshot = order?.priceSnapshot || order?.price_snapshot || {};
  const files = Array.isArray(price?.files)
    ? price.files
    : Array.isArray(snapshot?.breakdown)
      ? snapshot.breakdown
      : [];

  return Boolean(
    price?.pricingPending ||
    order?.pricingPending ||
    snapshot?.pricingPending ||
    rawStatus === "awaiting_hub_bill_confirmation" ||
    billStatus === "awaiting_hub_confirmation" ||
    files.some((file) => file?.pricingPending || file?.reasonCode === "DESKTOP_PREPARATION_PENDING")
  );
}

function OrderSummaryRow({ label, value, highlight = false }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${highlight ? "text-base font-bold" : ""}`}>
      <span className={highlight ? "text-slate-900" : "text-slate-500"}>{label}</span>
      <span className={`text-right font-semibold capitalize ${highlight ? "text-emerald-700" : ""}`}>{value}</span>
    </div>
  );
}

export default function PaymentPage({
  currentUser,
  startLogin,
  selectedCentre,
  documentName,
  pages,
  copies,
  backendPrice,
  order,
  refreshActivePaymentOrder,
  paymentMethod = "manual",
  setPaymentMethod,
  handlePayment,
  paymentLoading,
  paymentError,
}) {
  const [liveOrder, setLiveOrder] = useState(order);
  const [livePrice, setLivePrice] = useState(backendPrice);
  const [refreshError, setRefreshError] = useState("");
  const [refreshingBill, setRefreshingBill] = useState(false);

  useEffect(() => {
    setLiveOrder(order);
  }, [order]);

  useEffect(() => {
    setLivePrice(backendPrice);
  }, [backendPrice]);

  const effectiveOrder = liveOrder || order;
  const effectivePrice = useMemo(
    () => buildPaymentPriceFromOrder(effectiveOrder, livePrice || backendPrice),
    [backendPrice, effectiveOrder, livePrice]
  );
  const isPricingPending = hasPendingPricing(effectivePrice, effectiveOrder);
  const amount = isPricingPending ? null : (effectivePrice?.totalAmount ?? effectiveOrder?.amount ?? null);
  const rate = isPricingPending ? null : (effectivePrice?.pricePerPage ?? effectivePrice?.files?.[0]?.pricePerPage ?? null);
  const selectedPageCount = Number(effectivePrice?.selectedPageCount || effectiveOrder?.selectedPageCount || pages || 0);
  const centreUpi = selectedCentre?.upiId || "";
  const upiQrUrl = selectedCentre?.upiQrImageUrl || "";
  const isMultiFileOrder = Array.isArray(effectivePrice?.files) && effectivePrice.files.length > 1;
  const isCancelled = normalizeStatus(effectiveOrder?.rawStatus || effectiveOrder?.status) === "cancelled";
  const cancellationReason = effectiveOrder?.priceSnapshot?.message || effectiveOrder?.price_snapshot?.message || null;
  const failedDocument = effectiveOrder?.documents?.find((document) => (
    document?.preparationStatus === "failed" || document?.preparation_status === "failed"
  ));
  const conversionFailed = Boolean(failedDocument);
  const conversionFailedMessage =
    failedDocument?.preparationErrorMessage ||
    failedDocument?.preparation_error_message ||
    "Document conversion failed. Please save as PDF and try again or do it from mobile app.";
  const displayValue = (value) => (isPricingPending ? "Pending" : (value || value === 0 ? value : "Pending"));
  const displayMoney = (value) => (isPricingPending ? "Pending" : formatCurrency(value));

  useEffect(() => {
    if (!effectiveOrder?.backendId || !isPricingPending || conversionFailed || !refreshActivePaymentOrder) return;

    let cancelled = false;

    async function refreshBill() {
      setRefreshingBill(true);
      try {
        const refreshed = await refreshActivePaymentOrder(effectiveOrder.backendId);
        if (cancelled || !refreshed) return;
        if (refreshed.order) setLiveOrder(refreshed.order);
        if (refreshed.price) setLivePrice(refreshed.price);
        setRefreshError("");
      } catch (error) {
        if (!cancelled) setRefreshError(error.message || "Could not refresh the converted bill yet.");
      } finally {
        if (!cancelled) setRefreshingBill(false);
      }
    }

    refreshBill();
    const interval = window.setInterval(refreshBill, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [conversionFailed, effectiveOrder?.backendId, isPricingPending, refreshActivePaymentOrder]);

  const handlePaymentClick = () => {
    const printablePages = effectivePrice?.printablePageCount || (selectedPageCount * (copies || 1));
    if (!currentUser && printablePages > 5) {
      startLogin("user");
      return;
    }
    handlePayment();
  };

  const buttonLabel =
    isPricingPending
      ? "Preparing verified bill..."
      : paymentMethod === "razorpay"
      ? `Pay ${formatCurrency(amount)}`
      : paymentMethod === "upi_qr"
        ? `Generate UPI QR · ${formatCurrency(amount)}`
        : `Request Payment · ${formatCurrency(amount)}`;
  const loadingLabel =
    paymentMethod === "razorpay"
      ? "Opening Razorpay..."
      : paymentMethod === "upi_qr"
        ? "Creating QR..."
        : "Creating request...";
  const ButtonIcon = paymentMethod === "razorpay" ? CreditCard : paymentMethod === "upi_qr" ? QrCode : Clock;

  const isDisabled = paymentLoading || isPricingPending || !amount || amount <= 0 || isCancelled;

  if (isCancelled) {
    return (
      <div className="mx-auto max-w-2xl pb-6 sm:pb-8">
        <Card className="p-6 border-red-200 bg-red-50 text-center">
          <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-red-100 text-red-600 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
          </div>
          <h2 className="text-xl font-bold text-red-900">Order Cancelled</h2>
          <p className="mt-2 text-red-700 max-w-md mx-auto">
            {cancellationReason || "This order was cancelled by the printing hub."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl pb-6 sm:pb-8">
      <Card className="p-3 sm:p-5">
        <h2 className="text-xl sm:text-2xl font-bold min-w-0">Payment</h2>
        <p className="mt-2 text-slate-600">
          Choose manual collection for shop-owner confirmation, or use Razorpay when online payments are enabled.
        </p>

        {/* Order summary */}
        <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4">
          <Row label="Centre" value={selectedCentre?.name || "N/A"} />
          <Row label="Document" value={documentName || "Uploaded Document"} />
          <Row label="Original Pages" value={displayValue(effectivePrice?.originalPageCount || pages)} />
          <Row label="Selected Pages" value={displayValue(effectivePrice?.selectedPageCount || pages)} />
          <Row label="Printable Pages" value={displayValue(effectivePrice?.printablePageCount || (Number(pages || 0) > 0 ? Number(pages || 0) * Number(copies || 0) : null))} />
          <Row label="Sheets" value={displayValue(effectivePrice?.sheetCount)} />
          {isMultiFileOrder ? (
            <Row label="Copies / Rate" value="Shown per file below" />
          ) : (
            <>
              <Row label="Copies" value={copies} />
              <Row label="Rate" value={displayMoney(rate)} />
            </>
          )}
          <div className="border-t pt-3">
            <OrderSummaryRow label="Total Amount" value={displayMoney(amount)} highlight />
          </div>
        </div>

        {/* Multi-file breakdown */}
        {isMultiFileOrder && (
          <div className="mt-4 space-y-2 rounded-2xl border p-4 text-sm">
            <p className="font-semibold">Files</p>
            {effectivePrice.files.map((file) => (
              <Row
                key={file.documentId || file.fileName}
                label={`${file.fileName || "Document"} — ${file.pricingPending ? "pending" : `${file.selectedPageCount}p × ${file.copies}`}`}
                value={file.pricingPending ? "Pending" : formatCurrency(file.totalAmount)}
              />
            ))}
          </div>
        )}

        {/* Payment method selector */}
        <div className="mt-5 grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-3">
          {paymentOptions.map((option) => {
            const Icon = option.icon;
            const active = paymentMethod === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  if (!currentUser && option.id !== "manual") {
                    startLogin("user");
                  } else {
                    setPaymentMethod?.(option.id);
                  }
                }}
                className={`rounded-2xl border p-4 text-left transition ${
                  active ? "border-slate-900 bg-slate-900 text-white shadow-lg" : "bg-white hover:border-slate-400 hover:shadow-sm"
                }`}
              >
                <Icon size={20} />
                <p className="mt-3 font-semibold">{option.title}</p>
                <p className={`mt-1 text-xs ${active ? "text-slate-200" : "text-slate-500"}`}>{option.description}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
            <div className="min-w-0">
              <p className="font-semibold">UPI ID</p>
              <p className="mt-1 break-words text-sm text-slate-600">{centreUpi || "This centre has not added a UPI ID."}</p>
            </div>
            <ShieldCheck className="text-emerald-600" size={24} />
          </div>

          {upiQrUrl && (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-center">
              <img src={upiQrUrl} alt="Centre UPI QR" className="mx-auto h-48 w-48 object-contain" />
              <p className="mt-2 text-xs text-slate-500">Scan the centre QR. The hub owner confirms payment from their dashboard.</p>
            </div>
          )}
        </div>

        {/* Warning notice */}
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Manual confirmation</p>
          <p className="mt-1">This does not mark payment successful. It only opens a pending request. The print hub must collect/verify payment and click Cash Collected.</p>
        </div>

        {/* Validation: zero amount */}
        {conversionFailed && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-bold">Conversion Failed</p>
            <p className="mt-1">{conversionFailedMessage}</p>
          </div>
        )}

        {isPricingPending && !conversionFailed && !paymentLoading && (
          <p className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
            {refreshingBill
              ? "Preparing the verified bill from the converted document. This page refreshes automatically."
              : "Waiting for the desktop agent to return the verified bill. The payment request unlocks automatically after that."}
          </p>
        )}

        {refreshError && isPricingPending && !conversionFailed && (
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {refreshError}
          </p>
        )}

        {amount <= 0 && !isPricingPending && !paymentLoading && (
          <p className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700">
            The order price is unavailable. Please check your print settings and try again.
          </p>
        )}

        {/* Error display */}
        {paymentError && (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {paymentError}
          </p>
        )}
      </Card>

      {/* Spacer to prevent form hiding under sticky footer on mobile */}
      <div className="h-24 md:hidden"></div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-2 right-2 sm:left-4 sm:right-4 z-40 rounded-2xl border bg-white/90 p-2 shadow-2xl backdrop-blur md:static md:bottom-auto md:z-auto md:mt-6 md:block md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
        <button
          disabled={isDisabled || conversionFailed}
          onClick={handlePaymentClick}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 sm:px-4 py-3 text-sm sm:text-base font-semibold whitespace-normal leading-tight text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-70 md:rounded-2xl"
        >
          <ButtonIcon size={18} className="shrink-0" /> <span className="break-words">{paymentLoading ? loadingLabel : buttonLabel}</span>
        </button>
      </div>
    </div>
  );
}
