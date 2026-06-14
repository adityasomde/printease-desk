import { Upload, MapPin } from "lucide-react";
import Row from "./Row";

export default function CentrePriceCard({ centre, onUpload, onOpenMap }) {
  const hasLocation = centre.locationEnabled && centre.latitude != null && centre.longitude != null;

  return (
    <div className="rounded-3xl border bg-slate-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="text-lg font-bold">{centre.name}</h4>
          <p className="text-sm text-slate-600">Centre Code: {centre.code}</p>
          <p className="text-xs text-slate-500">UPI: {centre.upiId}</p>
          {centre.upiQrImageUrl && <p className="text-xs text-slate-500">UPI QR available</p>}
          {hasLocation && (
            <p className="mt-1 text-xs text-slate-500 flex items-center gap-1">
              <MapPin size={11} className="text-emerald-600 flex-shrink-0" />
              <span className="truncate">{[centre.city, centre.area].filter(Boolean).join(", ") || "Location shared"}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${centre.printerOnline ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
            {centre.printerOnline ? "Available" : "Unavailable"}
          </span>
          {hasLocation && onOpenMap ? (
            <button
              onClick={() => onOpenMap(centre)}
              title="View on map"
              className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
            >
              <MapPin size={12} /> Map
            </button>
          ) : (
            <button
              disabled
              title="This centre has not shared location."
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-400 cursor-not-allowed"
            >
              <MapPin size={12} /> Map
            </button>
          )}
        </div>
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
