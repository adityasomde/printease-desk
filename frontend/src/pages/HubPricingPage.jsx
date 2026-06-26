import { useState } from "react";
import { Check, CreditCard, Loader2, ShieldCheck, X } from "lucide-react";
import Card from "../components/Card";
import Input from "../components/Input";
import NumberInput from "../components/NumberInput";
import HubAfterOrderSettingsCard from "../components/HubAfterOrderSettingsCard";

function SaveStatus({ status }) {
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Loader2 size={14} className="animate-spin" /> Saving…
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
        <Check size={14} /> Saved
      </span>
    );
  }

  if (status?.startsWith("error:")) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
        <X size={14} /> {status.slice(6)}
      </span>
    );
  }

  return null;
}

export default function HubPricingPage({ currentHub, updateCentrePrice, updateCentrePayment, onAfterOrderSettingsUpdate }) {
  const [pricingStatus, setPricingStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");

  if (!currentHub) return <Card>Please login as print hub.</Card>;

  async function handlePriceChange(field, value) {
    setPricingStatus("saving");
    try {
      await updateCentrePrice(field, value);
      setPricingStatus("saved");
      setTimeout(() => setPricingStatus(""), 2500);
    } catch (error) {
      setPricingStatus(`error:${error.message || "Could not save price"}`);
      setTimeout(() => setPricingStatus(""), 4000);
    }
  }

  async function handlePaymentChange(field, value) {
    setPaymentStatus("saving");
    try {
      await updateCentrePayment(field, value);
      setPaymentStatus("saved");
      setTimeout(() => setPaymentStatus(""), 2500);
    } catch (error) {
      setPaymentStatus(`error:${error.message || "Could not save"}`);
      setTimeout(() => setPaymentStatus(""), 4000);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Centre Pricing</h2>
              <p className="mt-2 text-sm text-slate-600">Set your own price per page. Changes save when you leave the field.</p>
            </div>
            <SaveStatus status={pricingStatus} />
          </div>
          <div className="mt-6 space-y-4">
            <NumberInput label="A4 B/W Single Side" value={currentHub.bwSingle} onChange={(value) => handlePriceChange("bwSingle", value)} helperText="Most common" />
            <NumberInput label="A4 B/W Double Side" value={currentHub.bwDouble} onChange={(value) => handlePriceChange("bwDouble", value)} />
            <NumberInput label="A4 Color Single Side" value={currentHub.colorSingle} onChange={(value) => handlePriceChange("colorSingle", value)} />
            <NumberInput label="A4 Color Double Side" value={currentHub.colorDouble} onChange={(value) => handlePriceChange("colorDouble", value)} />
            <NumberInput label="Watermark Charge" value={currentHub.watermarkCharge} onChange={(value) => handlePriceChange("watermarkCharge", value)} helperText="Per-order surcharge" />
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Payment Method</h2>
              <p className="mt-2 text-sm text-slate-600">Customers see these details for manual payment. Only the hub dashboard can confirm collection.</p>
            </div>
            <SaveStatus status={paymentStatus} />
          </div>
          <div className="mt-6 space-y-4">
            <Input label="UPI ID" icon={<CreditCard size={18} />} value={currentHub.upiId} setValue={(value) => handlePaymentChange("upiId", value)} placeholder="example@upi" />
            <Input label="UPI QR Image URL" icon={<CreditCard size={18} />} value={currentHub.upiQrImageUrl || ""} setValue={(value) => handlePaymentChange("upiQrImageUrl", value)} placeholder="https://.../qr.png" />
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 text-green-600" />
                <p className="text-sm text-slate-600">
                  Security: customers cannot mark payment successful. Keep QR images public-only and never paste payment gateway secrets, API keys, or private tokens here.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <HubAfterOrderSettingsCard currentCentre={currentHub} onSettingsUpdate={onAfterOrderSettingsUpdate} />
    </div>
  );
}
