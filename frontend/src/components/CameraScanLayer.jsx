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
    </div>
  );
}
