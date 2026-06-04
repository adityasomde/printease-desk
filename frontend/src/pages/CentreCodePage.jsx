import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Search, QrCode, X } from "lucide-react";
import Card from "../components/Card";
import CentrePriceCard from "../components/CentrePriceCard";

function extractCentreCodeFromQr(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return url.searchParams.get("centre") || url.searchParams.get("code") || url.searchParams.get("centreCode") || "";
  } catch {
    return raw;
  }
}

export default function CentreCodePage({
  centreCode,
  setCentreCode,
  handleCentreCode,
  selectCentreByCode,
  centres,
  selectCentreAndUpload,
  lookupLoading,
  lookupError,
}) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanFrameRef = useRef(0);

  const filteredCentres = useMemo(() => {
    const query = String(centreCode || "").trim().toLowerCase();
    if (!query) return centres;

    return centres.filter((centre) =>
      [centre.name, centre.code, centre.owner, centre.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [centreCode, centres]);

  function stopScanner() {
    if (scanFrameRef.current) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = 0;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setScannerOpen(false);
  }

  async function startScanner() {
    setScannerMessage("");

    if (!("BarcodeDetector" in window)) {
      setScannerMessage("QR camera scan is not supported in this browser. Use your phone camera or search by centre name/code.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage("Camera access is not available. Search by centre name/code instead.");
      return;
    }

    try {
      setScannerOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return;

        try {
          const codes = await detector.detect(videoRef.current);
          const code = extractCentreCodeFromQr(codes[0]?.rawValue);
          if (code) {
            setCentreCode(code);
            stopScanner();
            await selectCentreByCode(code);
            return;
          }
        } catch {
          // Continue scanning while the camera is active.
        }

        scanFrameRef.current = requestAnimationFrame(scan);
      };

      scanFrameRef.current = requestAnimationFrame(scan);
    } catch (error) {
      stopScanner();
      setScannerMessage(error.message || "Could not open camera. Search by centre name/code instead.");
    }
  }

  useEffect(() => stopScanner, []);

  return (
    <div className="space-y-8">
      <Card className="text-center sm:text-left sm:p-8">
        <h2 className="text-3xl font-bold text-slate-900">Find a Printing Centre</h2>

        <div className="mt-6 grid gap-6 md:grid-cols-[45%_1fr]">
          <button
            type="button"
            onClick={startScanner}
            className="group relative overflow-hidden flex h-full min-h-[185px] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-slate-200 bg-slate-50 p-6 text-slate-700 transition hover:bg-slate-100 hover:border-slate-300"
            title="Scan QR Code"
          >
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-30">
               <div className="absolute left-[10%] h-[3px] w-[80%] rounded-full bg-emerald-500 shadow-[0_0_12px_3px_rgba(16,185,129,0.7)] animate-scan" />
            </div>
            <QrCode size={54} className="z-10 text-slate-900" />
            <span className="z-10 font-bold text-lg">Scan QR</span>
          </button>

          <div className="flex flex-col gap-4 justify-center">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={22} />
              <input
                value={centreCode}
                onChange={(e) => setCentreCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCentreCode();
                  }
                }}
                placeholder="Search by name or code (e.g. 2045)"
                className="w-full rounded-2xl border bg-slate-50 py-4 pl-14 pr-6 text-lg outline-none focus:bg-white focus:ring-2 focus:ring-slate-300 transition-all"
              />
            </div>
            <button
              onClick={handleCentreCode}
              disabled={lookupLoading || !String(centreCode).trim()}
              className="inline-flex w-full sm:w-fit items-center justify-center gap-2 rounded-2xl bg-slate-900 px-8 py-4 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              Search Online
            </button>
          </div>
        </div>

        {lookupError && <p className="mt-4 text-sm font-medium text-red-600">{lookupError}</p>}
        {lookupLoading && <p className="mt-4 text-sm text-slate-500">Checking centre code online...</p>}
        {scannerMessage && <p className="mt-4 text-sm font-medium text-amber-700">{scannerMessage}</p>}
      </Card>

      <div>
        <div className="mb-4">
          <h3 className="text-xl font-bold">Centre List With Prices</h3>
          <p className="text-sm text-slate-600">Frequently used centres appear first.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredCentres.map((centre) => (
            <CentrePriceCard key={centre.id} centre={centre} onUpload={() => selectCentreAndUpload(centre)} />
          ))}
        </div>
        {filteredCentres.length === 0 && (
          <div className="mt-6 rounded-3xl border border-dashed bg-slate-50 p-12 text-center">
            <Search className="mx-auto text-slate-400 mb-3" size={40} />
            <p className="text-lg font-medium text-slate-700">No centre matches locally</p>
            <p className="text-sm text-slate-500 mt-1">If you have an exact code, click "Search Online".</p>
          </div>
        )}
      </div>

      {scannerOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/90 p-4 text-white">
          <div className="mx-auto flex max-w-lg flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">Scan centre QR</h3>
                <p className="text-sm text-slate-300">Point camera at the PrintEase centre QR.</p>
              </div>
              <button onClick={stopScanner} className="rounded-full bg-white/10 p-2">
                <X size={22} />
              </button>
            </div>
            <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full rounded-3xl border border-white/20 bg-black object-cover" />
          </div>
        </div>
      )}
    </div>
  );
}
