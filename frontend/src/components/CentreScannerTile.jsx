import { useCallback, useState } from "react";
import { QrCode, X } from "lucide-react";
import QRScanner from "./QRScanner";

export default function CentreScannerTile({
  onScan,
  className = "",
  minHeightClass = "min-h-[160px]",
  iconSize = 40,
  idleLabel = "Scan / Select Centre",
  activeLabel = "Point at centre QR",
  idleHint = "Tap to open camera here.",
  activeHint = "Camera runs inside this tile.",
}) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  const start = useCallback(() => {
    setError("");
    setActive(true);
  }, []);

  const stop = useCallback(() => {
    setActive(false);
  }, []);

  const handleScan = useCallback(async (code) => {
    setActive(false);
    await onScan?.(code);
  }, [onScan]);

  const handleError = useCallback((scanError) => {
    setError(scanError?.message || "Camera preview is not available.");
    setActive(false);
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-white/75 shadow-sm backdrop-blur ${minHeightClass} ${className}`}>
      <button
        type="button"
        onClick={active ? undefined : start}
        className={`group relative flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden px-4 py-3 font-bold transition ${minHeightClass} ${
          active ? "text-white" : "text-slate-950 hover:bg-slate-50"
        }`}
        aria-label="Scan or select print centre"
      >
        {active && (
          <>
            <QRScanner onScan={handleScan} inline active={active} onError={handleError} />
            <div className="pointer-events-none absolute inset-0 z-10 bg-slate-950/30" />
          </>
        )}
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden opacity-35">
          <div className="absolute left-[10%] h-[3px] w-[80%] rounded-full bg-emerald-500 shadow-[0_0_12px_3px_rgba(16,185,129,0.7)] animate-scan" />
        </div>
        <QrCode size={iconSize} className={`z-30 ${active ? "text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" : "text-slate-950"}`} />
        <span className={`z-30 text-center text-sm ${active ? "text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" : ""}`}>
          {active ? activeLabel : idleLabel}
        </span>
        <span className={`z-30 max-w-[12rem] text-center text-[11px] font-semibold ${active ? "text-white/85" : "text-slate-500"}`}>
          {active ? activeHint : idleHint}
        </span>
      </button>
      {active && (
        <button
          type="button"
          onClick={stop}
          className="absolute right-2 top-2 z-40 rounded-full bg-white/90 p-2 text-slate-900 shadow-sm"
          aria-label="Close camera preview"
        >
          <X size={16} />
        </button>
      )}
      {error && (
        <div className="absolute inset-x-3 bottom-3 z-40 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-800">
          {error}
        </div>
      )}
    </div>
  );
}
