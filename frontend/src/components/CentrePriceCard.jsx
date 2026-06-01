import { Upload } from "lucide-react";
import Row from "./Row";

export default function CentrePriceCard({ centre, onUpload }) {
  return (
    <div className="rounded-3xl border bg-slate-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-bold">{centre.name}</h4>
          <p className="text-sm text-slate-600">Centre Code: {centre.code}</p>
          <p className="text-xs text-slate-500">UPI: {centre.upiId}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${centre.status === "Available" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
          {centre.status}
        </span>
      </div>

      <div className="mt-4 space-y-2 rounded-2xl bg-white p-4 text-sm">
        <Row label="A4 B/W Single Side" value={`₹${centre.bwSingle}/page`} />
        <Row label="A4 B/W Double Side" value={`₹${centre.bwDouble}/page`} />
        <Row label="A4 Color Single Side" value={`₹${centre.colorSingle}/page`} />
        <Row label="A4 Color Double Side" value={`₹${centre.colorDouble}/page`} />
      </div>

      <button
        onClick={onUpload}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800"
      >
        <Upload size={18} /> Upload to this Centre
      </button>
    </div>
  );
}
