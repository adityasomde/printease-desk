import { useCallback, useState } from "react";
import { QrCode, X } from "lucide-react";
import CameraScanLayer from "./CameraScanLayer";

export default function CentreScannerTile({
  onScan,
  active,
  onStart,
  onStop,
  onError,
  externalCamera = false,
  className = "",
  minHeightClass = "min-h-[160px]",
  iconSize = 40,
  idleLabel = "Scan / Select Centre",
  activeLabel = "Point at centre QR",
  idleHint = "Tap to open camera here.",
  activeHint = "Camera runs inside this tile.",
}) {
  const controlled = typeof active === "boolean";
  const [internalActive, setInternalActive] = useState(false);
  const [error, setError] = useState("");
  const isActive = controlled ? active : internalActive;

  const start = useCallback(() => {
    setError("");
    if (controlled) onStart?.();
    else setInternalActive(true);
  }, [controlled, onStart]);

  const stop = useCallback(() => {
    if (controlled) onStop?.();
    else setInternalActive(false);
  }, [controlled, onStop]);

  const handleScan = useCallback(async (code) => {
    if (controlled) onStop?.();
    else setInternalActive(false);
    await onScan?.(code);
  }, [controlled, onScan, onStop]);

  const handleError = useCallback((scanError) => {
    setError(scanError?.message || "Camera preview is not available.");
    if (controlled) {
      onError?.(scanError);
      onStop?.();
    } else {
      setInternalActive(false);
    }
  }, [controlled, onError, onStop]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-white/75 shadow-sm backdrop-blur ${minHeightClass} ${className}`}>
      <button
        type="button"
        onClick={isActive ? undefined : start}
        className={`group relative flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden px-4 py-3 font-bold transition ${minHeightClass} ${
          isActive ? "text-white" : "text-slate-950 hover:bg-slate-50"
        }`}
        aria-label="Scan or select print centre"
      >
        {isActive && !externalCamera && (
          <CameraScanLayer active={isActive} onScan={handleScan} onError={handleError} />
        )}
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden opacity-35">
          <div className="absolute left-[10%] h-[3px] w-[80%] rounded-full bg-emerald-500 shadow-[0_0_12px_3px_rgba(16,185,129,0.7)] animate-scan" />
        </div>
        <QrCode size={iconSize} className={`z-30 ${isActive ? "text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" : "text-slate-950"}`} />
        <span className={`z-30 text-center text-sm ${isActive ? "text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" : ""}`}>
          {isActive ? activeLabel : idleLabel}
        </span>
        <span className={`z-30 max-w-[12rem] text-center text-[11px] font-semibold ${isActive ? "text-white/85" : "text-slate-500"}`}>
          {isActive ? activeHint : idleHint}
        </span>
      </button>
      {isActive && (
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
