import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function extractCentreCodeFromQr(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return url.searchParams.get("centre") || url.searchParams.get("code") || url.searchParams.get("centreCode") || "";
  } catch {
    return raw;
  }
}

export default function QRScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanFrameRef = useRef(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function startScanner() {
      if (!("BarcodeDetector" in window)) {
        if (mounted) setError("QR camera scan is not supported in this browser. Use your phone camera or search by centre name/code.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        if (mounted) setError("Camera access is not available. Search by centre name/code instead.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        
        const scan = async () => {
          if (!mounted || !videoRef.current || !streamRef.current) return;

          try {
            const codes = await detector.detect(videoRef.current);
            const code = extractCentreCodeFromQr(codes[0]?.rawValue);
            if (code) {
              onScan(code);
              return; // Stop scanning once we found one
            }
          } catch {
            // Continue scanning
          }

          scanFrameRef.current = requestAnimationFrame(scan);
        };

        scanFrameRef.current = requestAnimationFrame(scan);
      } catch (err) {
        if (mounted) setError(err.message || "Could not open camera. Search by centre name/code instead.");
      }
    }

    startScanner();

    return () => {
      mounted = false;
      if (scanFrameRef.current) {
        cancelAnimationFrame(scanFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/90 p-4 text-white">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold">Scan centre QR</h3>
            <p className="text-sm text-slate-300">Point camera at the PrintEase centre QR.</p>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-2">
            <X size={22} />
          </button>
        </div>
        {error ? (
          <div className="rounded-3xl border border-white/20 bg-slate-900 p-8 text-center text-amber-500">
            {error}
          </div>
        ) : (
          <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full rounded-3xl border border-white/20 bg-black object-cover" />
        )}
      </div>
    </div>
  );
}
