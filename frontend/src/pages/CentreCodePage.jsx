import { Search, QrCode } from "lucide-react";
import Card from "../components/Card";
import CentrePriceCard from "../components/CentrePriceCard";

export default function CentreCodePage({
  centreCode,
  setCentreCode,
  handleCentreCode,
  centres,
  selectCentreAndUpload,
  lookupLoading,
  lookupError,
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="text-2xl font-bold">Select Printing Centre</h2>
        <p className="mt-2 text-slate-600">Enter the 4 digit centre code shown at the printing shop.</p>
        <div className="mt-6 flex gap-3">
          <input
            value={centreCode}
            onChange={(e) => setCentreCode(e.target.value)}
            placeholder="Example: 2045"
            className="w-full rounded-2xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300"
          />
          <button
            onClick={handleCentreCode}
            disabled={lookupLoading}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            <Search size={20} />
          </button>
        </div>
        {lookupError && <p className="mt-3 text-sm font-medium text-red-600">{lookupError}</p>}
        {lookupLoading && <p className="mt-3 text-sm text-slate-500">Checking centre code...</p>}

        <div className="mt-6 rounded-2xl border border-dashed bg-slate-50 p-5 text-center text-slate-500">
          <QrCode className="mx-auto" size={70} />
          <p className="mt-3 font-semibold text-slate-700">QR scanner coming soon</p>
          <p className="text-sm">For now, enter the centre code or select a centre from the list.</p>
        </div>
      </Card>

      <Card>
        <h3 className="text-xl font-bold">Centre List With Prices</h3>
        <div className="mt-4 space-y-3">
          {centres.map((centre) => (
            <CentrePriceCard key={centre.id} centre={centre} onUpload={() => selectCentreAndUpload(centre)} />
          ))}
        </div>
      </Card>
    </div>
  );
}
