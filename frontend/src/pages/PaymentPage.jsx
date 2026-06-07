import { Clock, CreditCard, IndianRupee, QrCode, ShieldCheck } from "lucide-react";
import Card from "../components/Card";
import Row from "../components/Row";

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
  if (isNaN(num) || num === 0) return "₹0.00";
  return `₹${num.toFixed(2)}`;
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
  selectedCentre,
  documentName,
  pages,
  copies,
  backendPrice,
  order,
  paymentMethod = "manual",
  setPaymentMethod,
  handlePayment,
  paymentLoading,
  paymentError,
}) {
  const amount = backendPrice?.totalAmount ?? order?.amount ?? 0;
  const rate = backendPrice?.pricePerPage ?? backendPrice?.files?.[0]?.pricePerPage ?? 0;
  const centreUpi = selectedCentre?.upiId || "";
  const upiQrUrl = selectedCentre?.upiQrImageUrl || "";

  const buttonLabel =
    paymentMethod === "razorpay"
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

  const isDisabled = paymentLoading || amount <= 0;

  return (
    <div className="mx-auto max-w-2xl pb-6">
      <Card>
        <h2 className="text-2xl font-bold">Payment</h2>
        <p className="mt-2 text-slate-600">
          Choose manual collection for shop-owner confirmation, or use Razorpay when online payments are enabled.
        </p>

        {/* Order summary */}
        <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4">
          <Row label="Centre" value={selectedCentre?.name || "N/A"} />
          <Row label="Document" value={documentName || "Uploaded Document"} />
          <Row label="Original Pages" value={backendPrice?.originalPageCount || pages} />
          <Row label="Selected Pages" value={backendPrice?.selectedPageCount || pages} />
          <Row label="Printable Pages" value={backendPrice?.printablePageCount || Number(pages || 0) * Number(copies || 0)} />
          <Row label="Sheets" value={backendPrice?.sheetCount || "-"} />
          <Row label="Copies" value={copies} />
          <Row label="Rate" value={formatCurrency(rate)} />
          <div className="border-t pt-3">
            <OrderSummaryRow label="Total Amount" value={formatCurrency(amount)} highlight />
          </div>
        </div>

        {/* Multi-file breakdown */}
        {backendPrice?.files?.length > 1 && (
          <div className="mt-4 space-y-2 rounded-2xl border p-4 text-sm">
            <p className="font-semibold">Files</p>
            {backendPrice.files.map((file) => (
              <Row
                key={file.documentId || file.fileName}
                label={`${file.fileName || "PDF"} — ${file.selectedPageCount}p × ${file.copies}`}
                value={formatCurrency(file.totalAmount)}
              />
            ))}
          </div>
        )}

        {/* Payment method selector */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {paymentOptions.map((option) => {
            const Icon = option.icon;
            const active = paymentMethod === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setPaymentMethod?.(option.id)}
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

        {/* Centre UPI details */}
        <div className="mt-4 rounded-2xl border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">UPI ID</p>
              <p className="mt-1 break-all text-sm text-slate-600">{centreUpi || "This centre has not added a UPI ID."}</p>
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
        {amount <= 0 && !paymentLoading && (
          <p className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700">
            Order amount is ₹0. Please check your print settings and try again.
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
      <div className="fixed bottom-[84px] left-4 right-4 z-40 rounded-2xl border bg-white/90 p-2 shadow-2xl backdrop-blur md:static md:bottom-auto md:z-auto md:mt-6 md:block md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
        <button
          disabled={isDisabled}
          onClick={handlePayment}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-70 md:rounded-2xl"
        >
          <ButtonIcon size={18} /> {paymentLoading ? loadingLabel : buttonLabel}
        </button>
      </div>
    </div>
  );
}
