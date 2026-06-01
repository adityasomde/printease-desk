import { CreditCard, ExternalLink, QrCode } from "lucide-react";
import Card from "../components/Card";
import Row from "../components/Row";

export default function PaymentPage({ selectedCentre, documentName, pages, copies, backendPrice, order, handlePayment, createUpiQr, paymentLoading, paymentError }) {
  const amount = backendPrice?.totalAmount ?? order?.amount ?? 0;
  const rate = backendPrice?.pricePerPage ?? backendPrice?.files?.[0]?.pricePerPage ?? 0;

  return (
    <Card className="mx-auto max-w-xl">
      <h2 className="text-2xl font-bold">Secure Payment</h2>
      <p className="mt-2 text-slate-600">Final page count and pricing were calculated by the backend. Printer agent will receive the document only after payment is collected or verified.</p>
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
        <Row label="Centre UPI" value={selectedCentre?.upiId || "N/A"} />
      </div>
      {backendPrice?.files?.length > 1 && (
        <div className="mt-4 space-y-2 rounded-2xl border p-4 text-sm">
          <p className="font-semibold">Files</p>
          {backendPrice.files.map((file) => (
            <Row
              key={file.documentId || file.fileName}
              label={`${file.fileName || "PDF"} · ${file.selectedPageCount}p × ${file.copies}`}
              value={`₹${file.totalAmount}`}
            />
          ))}
        </div>
      )}
      <div className="mt-6 rounded-2xl border p-4 text-center">
        <QrCode className="mx-auto" size={80} />
        <p className="mt-3 font-semibold">Razorpay UPI / Payment Link</p>
        <p className="text-sm text-slate-500">Payment is marked complete only after Razorpay confirms it.</p>
      </div>
      {paymentError && (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {paymentError}
        </p>
      )}
      <button disabled={paymentLoading} onClick={handlePayment} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400">
        <CreditCard size={18} /> {paymentLoading ? "Opening Razorpay..." : "Pay Online"}
      </button>
      <button disabled={paymentLoading} onClick={createUpiQr} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50">
        <ExternalLink size={18} /> Create UPI Payment Link
      </button>
    </Card>
  );
}
