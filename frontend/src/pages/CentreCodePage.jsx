import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Search, QrCode, X } from "lucide-react";
import Card from "../components/Card";
import CentrePriceCard from "../components/CentrePriceCard";

import QRScanner from "../components/QRScanner";

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
  const [cameraError, setCameraError] = useState(false);
  const [cameraGranted, setCameraGranted] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const checkCameraPermission = useCallback(async () => {
    setCameraError(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraGranted(false);
      return;
    }

    if (navigator.permissions?.query) {
      try {
        const result = await navigator.permissions.query({ name: "camera" });
        if (result.state === "granted") {
          setCameraGranted(true);
        }
        if (result.state === "denied") {
          setCameraGranted(false);
        }
        result.onchange = () => setCameraGranted(result.state === "granted");
      } catch (e) {
        // Some browsers do not support querying camera permission.
      }
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices?.();
      const cameras = Array.isArray(devices) ? devices.filter((device) => device.kind === "videoinput") : [];
      if (cameras.some((camera) => camera.label)) {
        setCameraGranted(true);
      }
    } catch (e) {
      // Device labels are often hidden until the user grants camera access.
    }
  }, []);

  useEffect(() => {
    checkCameraPermission();
  }, [checkCameraPermission]);

  const startScanner = useCallback(() => {
    setCameraError(false);
    setScannerOpen(true);
  }, []);

  const stopScanner = useCallback(() => {
    setScannerOpen(false);
    setTimeout(checkCameraPermission, 500);
  }, [checkCameraPermission]);

  const handleScan = useCallback(async (code) => {
    setCentreCode(code);
    stopScanner();
    await selectCentreByCode(code);
  }, [selectCentreByCode, setCentreCode, stopScanner]);

  const handlePreviewError = useCallback(() => {
    setCameraError(true);
    setCameraGranted(false);
  }, []);

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

  const cameraPreviewReady = cameraGranted && !scannerOpen && !cameraError;

  return (
    <div className="space-y-8">
      <Card className="text-center sm:text-left sm:p-8">
        <h2 className="text-3xl font-bold text-slate-900">Find a Printing Centre</h2>

        <div className="mt-6 grid gap-6 md:grid-cols-[45%_1fr]">
          <button
            type="button"
            onClick={startScanner}
            className={`group relative flex h-full min-h-[185px] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 p-6 transition ${
              cameraPreviewReady
                ? "border-white/20 bg-slate-950/85 text-white shadow-inner"
                : "border-slate-200 bg-white/75 text-slate-800 shadow-sm backdrop-blur hover:border-slate-300 hover:bg-white"
            }`}
            title="Scan QR Code"
            aria-label="Scan centre QR code"
          >
            {cameraPreviewReady && (
               <div className="absolute inset-0 z-0 bg-slate-900">
                  <QRScanner
                    inline
                    active={cameraPreviewReady}
                    previewOnly
                    onError={handlePreviewError}
                  />
               </div>
            )}
            {cameraPreviewReady && <div className="pointer-events-none absolute inset-0 z-10 bg-slate-950/35" />}
            <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden opacity-35">
               <div className="absolute left-[10%] h-[3px] w-[80%] rounded-full bg-emerald-500 shadow-[0_0_12px_3px_rgba(16,185,129,0.7)] animate-scan" />
            </div>
            <QrCode size={54} className={`z-30 transition-transform group-hover:scale-110 ${cameraPreviewReady ? "text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" : "text-slate-900"}`} />
            <span className={`z-30 text-lg font-bold ${cameraPreviewReady ? "text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" : ""}`}>Scan QR</span>
            <span className={`z-30 max-w-[16rem] text-center text-xs font-semibold ${cameraPreviewReady ? "text-white/85" : "text-slate-500"}`}>
              {cameraPreviewReady ? "Camera ready. Tap to scan." : "Tap to open camera scanner."}
            </span>
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
        <QRScanner onScan={handleScan} onClose={stopScanner} />
      )}
    </div>
  );
}
