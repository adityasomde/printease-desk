import { Clock, CreditCard, QrCode, ShieldCheck } from "lucide-react";
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
      ? "Pay Online"
      : paymentMethod === "upi_qr"
        ? "Generate UPI QR"
        : "Create Pending Payment Request";
  const loadingLabel =
    paymentMethod === "razorpay"
      ? "Opening Razorpay..."
      : paymentMethod === "upi_qr"
        ? "Creating QR..."
        : "Creating request...";
  const ButtonIcon = paymentMethod === "razorpay" ? CreditCard : paymentMethod === "upi_qr" ? QrCode : Clock;

  return (
    <div className="mx-auto max-w-2xl pb-6">
      <Card>
        <h2 className="text-2xl font-bold">Payment</h2>
        <p className="mt-2 text-slate-600">
          Choose manual collection for shop-owner confirmation, or use Razorpay when online payments are enabled.
        </p>

        <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4">
          <Row label="Centre" value={selectedCentre?.name || "N/A"} />
          <Row label="Document" value={documentName || "Uploaded Document"} />
          <Row label="Original Pages" value={backendPrice?.originalPageCount || pages} />
          <Row label="Selected Pages" value={backendPrice?.selectedPageCount || pages} />
          <Row label="Printable Pages" value={backendPrice?.printablePageCount || Number(pages || 0) * Number(copies || 0)} />
          <Row label="Sheets" value={backendPrice?.sheetCount || "-"} />
          <Row label="Copies" value={copies} />
          <Row label="Rate" value={`₹${rate}`} />
          <Row label="Amount" value={`₹${amount}`} />
          <Row label="Centre UPI ID" value={centreUpi || "N/A"} />
        </div>

        {backendPrice?.files?.length > 1 && (
          <div className="mt-4 space-y-2 rounded-2xl border p-4 text-sm">
            <p className="font-semibold">Files</p>
            {backendPrice.files.map((file) => (
              <Row
                key={file.documentId || file.fileName}
                label={`${file.fileName || "PDF"} - ${file.selectedPageCount}p x ${file.copies}`}
                value={`₹${file.totalAmount}`}
              />
            ))}
          </div>
        )}

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
                  active ? "border-slate-900 bg-slate-900 text-white" : "bg-white hover:border-slate-400"
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

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Manual confirmation</p>
          <p className="mt-1">This does not mark payment successful. It only opens a pending request. The print hub must collect/verify payment and click Cash Collected.</p>
        </div>

        {paymentError && (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {paymentError}
          </p>
        )}
      </Card>

      {/* Spacer to prevent form hiding under sticky footer on mobile */}
      <div className="h-24 md:hidden"></div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-[68px] left-0 right-0 z-40 border-t bg-white p-4 shadow-[0_-8px_15px_rgba(0,0,0,0.08)] md:static md:bottom-auto md:z-auto md:mt-6 md:block md:border-t-0 md:bg-transparent md:p-0 md:shadow-none">
        <button disabled={paymentLoading} onClick={handlePayment} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-70">
          <ButtonIcon size={18} /> {paymentLoading ? loadingLabel : buttonLabel}
        </button>
      </div>
    </div>
  );
}
