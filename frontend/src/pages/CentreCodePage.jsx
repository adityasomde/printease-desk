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
  const [centreSearch, setCentreSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanFrameRef = useRef(0);

  const filteredCentres = useMemo(() => {
    const query = centreSearch.trim().toLowerCase();
    if (!query) return centres;

    return centres.filter((centre) =>
      [centre.name, centre.code, centre.owner, centre.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [centreSearch, centres]);

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
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="text-2xl font-bold">Scan or Select Printing Centre</h2>
        <p className="mt-2 text-slate-600">Scan the shop QR, enter the centre code, or search by shop name.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={centreCode}
            onChange={(e) => setCentreCode(e.target.value)}
            placeholder="Enter centre code, like 2045"
            className="w-full rounded-2xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300"
          />
          <button
            onClick={handleCentreCode}
            disabled={lookupLoading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            <Search size={20} />
            Find
          </button>
        </div>
        {lookupError && <p className="mt-3 text-sm font-medium text-red-600">{lookupError}</p>}
        {lookupLoading && <p className="mt-3 text-sm text-slate-500">Checking centre code...</p>}

        <div className="mt-6 rounded-2xl border bg-slate-50 p-5 text-center">
          <QrCode className="mx-auto text-slate-900" size={70} />
          <p className="mt-3 font-semibold text-slate-800">Scan centre QR</p>
          <p className="text-sm text-slate-500">Camera scan works on supported mobile browsers. Phone camera links open the same upload page.</p>
          <button
            type="button"
            onClick={startScanner}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white"
          >
            <Camera size={18} />
            Open Scanner
          </button>
          {scannerMessage && <p className="mt-3 text-sm font-medium text-amber-700">{scannerMessage}</p>}
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
      </Card>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xl font-bold">Centre List With Prices</h3>
            <p className="text-sm text-slate-600">Frequently used centres appear first.</p>
          </div>
          <label className="relative block sm:w-72">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={centreSearch}
              onChange={(event) => setCentreSearch(event.target.value)}
              placeholder="Search name or code"
              className="w-full rounded-2xl border bg-white py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>
        </div>
        <div className="mt-4 space-y-3">
          {filteredCentres.map((centre) => (
            <CentrePriceCard key={centre.id} centre={centre} onUpload={() => selectCentreAndUpload(centre)} />
          ))}
          {filteredCentres.length === 0 && (
            <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-500">
              No centre matches this search.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
