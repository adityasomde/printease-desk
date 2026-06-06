import QRScanner from "./QRScanner";

export default function CameraScanLayer({ active, onScan, onError, className = "" }) {
  if (!active) return null;

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <QRScanner
        onScan={onScan}
        inline
        active={active}
        onError={onError}
        className={className}
      />
      <div className="pointer-events-none absolute inset-0 z-10 bg-slate-950/35" />
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden opacity-35">
        <div className="absolute left-[10%] h-[3px] w-[80%] rounded-full bg-emerald-500 shadow-[0_0_12px_3px_rgba(16,185,129,0.7)] animate-scan" />
      </div>
    </div>
  );
}
