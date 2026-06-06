import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import jsQR from "jsqr";

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

export default function QRScanner({
  onScan,
  onClose,
  inline = false,
  onError,
  active = true,
  previewOnly = false,
  className = "",
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanFrameRef = useRef(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function startScanner() {
      if (!active) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        if (mounted) { setError("Camera access is not available."); if (onError) onError(new Error("No camera access")); }
        return;
      }

      try {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (cameraError) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
        
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true"); // required for iOS Safari
          await videoRef.current.play();
        }

        if (previewOnly) return;

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          throw new Error("Camera scanner is not available in this browser.");
        }
        
        const scan = () => {
          if (!mounted || !videoRef.current || !streamRef.current) return;

          if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            canvas.height = videoRef.current.videoHeight;
            canvas.width = videoRef.current.videoWidth;
            context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });

            if (code) {
              const extractedCode = extractCentreCodeFromQr(code.data);
              if (extractedCode) {
                onScan?.(extractedCode);
                return; // Stop scanning once we found one
              }
            }
          }

          scanFrameRef.current = requestAnimationFrame(scan);
        };

        scanFrameRef.current = requestAnimationFrame(scan);
      } catch (err) {
        if (mounted) { setError(err.message || "Could not open camera."); if (onError) onError(err); }
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
        streamRef.current = null;
      }
    };
  }, [active, onError, onScan, previewOnly]);

  if (inline) {
    if (!active) return null;
    if (error) return null;
    return (
      <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-cover ${className}`} />
    );
  }

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
