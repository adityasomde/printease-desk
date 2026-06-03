import { CreditCard, ShieldCheck } from "lucide-react";
import Card from "../components/Card";
import Input from "../components/Input";
import NumberInput from "../components/NumberInput";

export default function HubPricingPage({ currentHub, updateCentrePrice, updateCentrePayment }) {
  if (!currentHub) return <Card>Please login as print hub.</Card>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="text-2xl font-bold">Centre Pricing</h2>
        <p className="mt-2 text-sm text-slate-600">Set your own price per page.</p>
        <div className="mt-6 space-y-4">
          <NumberInput label="A4 B/W Single Side" value={currentHub.bwSingle} onChange={(value) => updateCentrePrice("bwSingle", value)} />
          <NumberInput label="A4 B/W Double Side" value={currentHub.bwDouble} onChange={(value) => updateCentrePrice("bwDouble", value)} />
          <NumberInput label="A4 Color Single Side" value={currentHub.colorSingle} onChange={(value) => updateCentrePrice("colorSingle", value)} />
          <NumberInput label="A4 Color Double Side" value={currentHub.colorDouble} onChange={(value) => updateCentrePrice("colorDouble", value)} />
          <NumberInput label="Watermark Charge" value={currentHub.watermarkCharge} onChange={(value) => updateCentrePrice("watermarkCharge", value)} />
        </div>
      </Card>

      <Card>
        <h2 className="text-2xl font-bold">Payment Method</h2>
        <p className="mt-2 text-sm text-slate-600">Customers see these details for manual payment. Only the hub dashboard can confirm collection.</p>
        <div className="mt-6 space-y-4">
          <Input label="UPI ID" icon={<CreditCard size={18} />} value={currentHub.upiId} setValue={(value) => updateCentrePayment("upiId", value)} placeholder="example@upi" />
          <Input label="UPI QR Image URL" icon={<CreditCard size={18} />} value={currentHub.upiQrImageUrl || ""} setValue={(value) => updateCentrePayment("upiQrImageUrl", value)} placeholder="https://.../qr.png" />
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
  );
}
