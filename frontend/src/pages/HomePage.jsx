import { useCallback, useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";

import { User, Upload, Store, Plus, Building2, Search, Download, QrCode } from "lucide-react";
import Card from "../components/Card";
import CentrePriceCard from "../components/CentrePriceCard";
import CameraScanLayer from "../components/CameraScanLayer";
import CentreScannerTile from "../components/CentreScannerTile";

import QRScanner from "../components/QRScanner";

const SCANNER_MODE_KEY = "printease_scanner_mode";
const SCANNER_MODES = new Set(["ready", "transparent", "classic"]);

function getSavedScannerMode() {
  if (typeof window === "undefined") return "ready";

  try {
    const savedMode = window.localStorage.getItem(SCANNER_MODE_KEY);
    return SCANNER_MODES.has(savedMode) ? savedMode : "ready";
  } catch {
    return "ready";
  }
}

export default function HomePage({
  currentUser,
  navigate,
  centres,
  startLogin,
  startRegister,
  startDirectUpload,
  selectCentreAndUpload,
  selectCentreByCode,
}) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [centreSearch, setCentreSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [heroScannerActive, setHeroScannerActive] = useState(false);
  const [heroScannerError, setHeroScannerError] = useState("");
  const [heroScannerAutoUsed, setHeroScannerAutoUsed] = useState(false);
  const [scannerMode, setScannerMode] = useState(getSavedScannerMode);
  const startScanner = useCallback(() => setScannerOpen(true), []);
  const stopScanner = useCallback(() => setScannerOpen(false), []);

  const handleScan = useCallback(async (code) => {
    setHeroScannerActive(false);
    stopScanner();
    await selectCentreByCode(code);
  }, [selectCentreByCode, stopScanner]);

  const startHeroScanner = useCallback(() => {
    setHeroScannerError("");
    setHeroScannerActive(true);
  }, []);

  const startSelectedScanner = useCallback(() => {
    if (scannerMode === "classic") {
      setHeroScannerActive(false);
      startScanner();
      return;
    }

    if (scannerMode === "ready") {
      setScannerMode("transparent");
    }

    startHeroScanner();
  }, [scannerMode, startHeroScanner, startScanner]);

  const stopHeroScanner = useCallback(() => {
    setHeroScannerActive(false);
  }, []);

  const handleHeroScannerError = useCallback((error) => {
    setHeroScannerError(error?.message || "Camera is not available. You can still search by centre name or code.");
    setHeroScannerActive(false);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SCANNER_MODE_KEY, scannerMode);
    } catch {
      // Scanner preference is optional.
    }
  }, [scannerMode]);

  useEffect(() => {
    if (scannerMode !== "transparent") return undefined;
    if (heroScannerAutoUsed) return undefined;

    setHeroScannerAutoUsed(true);
    let cancelled = false;
    let timer;

    async function startIfCameraAlreadyAllowed() {
      if (!navigator.mediaDevices?.getUserMedia || !navigator.permissions?.query) return;

      try {
        const permission = await navigator.permissions.query({ name: "camera" });
        if (!cancelled && permission.state === "granted") {
          setHeroScannerActive(true);
          timer = window.setTimeout(() => {
            setHeroScannerActive(false);
          }, 30000);
        }
      } catch {
        // First-time users should not get an automatic camera prompt.
      }
    }

    startIfCameraAlreadyAllowed();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [heroScannerAutoUsed, scannerMode]);

  useEffect(() => {
    if (!heroScannerActive) return undefined;

    const timer = window.setTimeout(() => {
      setHeroScannerActive(false);
    }, 30000);

    return () => window.clearTimeout(timer);
  }, [heroScannerActive]);

  const handleDownloadApp = async () => {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isAndroid = /android/i.test(ua);
    const isWindows = /Win/i.test(ua);
    const isLinux = /Linux/i.test(ua) && !isAndroid;

    if (isAndroid) {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          setDeferredPrompt(null);
        }
      } else {
        alert("To install the app, please use the 'Add to Home Screen' option in your browser menu.");
      }
    } else {
      let downloadUrl = "";
      if (isWindows) {
        downloadUrl = "https://github.com/adityasomde/printease-desk/releases/download/desktop-v0.1.30/PrintEase-Desktop-Setup-0.1.30.exe";
      } else if (isLinux) {
        downloadUrl = "https://github.com/adityasomde/printease-desk/releases/download/desktop-v0.1.30/PrintEase-Desktop-0.1.30-x86_64.AppImage";
      } else {
        const choice = window.prompt("Which OS are you using? Type 'win' for Windows or 'linux' for Linux:", "win");
        if (choice?.toLowerCase().includes("win")) {
          downloadUrl = "https://github.com/adityasomde/printease-desk/releases/download/desktop-v0.1.30/PrintEase-Desktop-Setup-0.1.30.exe";
        } else if (choice?.toLowerCase().includes("linux")) {
          downloadUrl = "https://github.com/adityasomde/printease-desk/releases/download/desktop-v0.1.30/PrintEase-Desktop-0.1.30-x86_64.AppImage";
        }
      }
      if (downloadUrl) {
        window.location.href = downloadUrl;
      }
    }
  };

  const isAndroid = typeof navigator !== "undefined" ? /android/i.test(navigator.userAgent || navigator.vendor || window.opera) : false;
  const filteredCentres = useMemo(() => {
    const query = centreSearch.trim().toLowerCase();
    if (!query) return centres;

    return centres.filter((centre) => {
      return [centre.name, centre.code, centre.owner, centre.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [centreSearch, centres]);

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-stretch">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className={`relative isolate flex flex-col justify-between gap-5 overflow-hidden rounded-3xl border p-5 shadow-sm transition sm:p-6 ${
            heroScannerActive ? "border-white/20 bg-transparent text-white" : "bg-white"
          }`}
        >
          <CameraScanLayer active={heroScannerActive} onScan={handleScan} onError={handleHeroScannerError} />
          <div className="pointer-events-none absolute inset-0 z-20 bg-transparent" />
          <div className="absolute right-4 top-4 z-40 flex rounded-full border border-slate-200 bg-white/85 p-1 text-xs font-bold text-slate-700 shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={() => {
                setScannerMode("ready");
                setHeroScannerActive(false);
              }}
              className={`rounded-full px-3 py-1.5 ${scannerMode === "ready" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
            >
              Ready
            </button>
            <button
              type="button"
              onClick={() => setScannerMode("transparent")}
              className={`rounded-full px-3 py-1.5 ${scannerMode === "transparent" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
            >
              Transparent
            </button>
            <button
              type="button"
              onClick={() => {
                setScannerMode("classic");
                setHeroScannerActive(false);
              }}
              className={`rounded-full px-3 py-1.5 ${scannerMode === "classic" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
            >
              Classic
            </button>
          </div>
          <div className="relative z-30 space-y-3">
            <div className={`inline-flex rounded-full px-4 py-2 text-sm font-medium ${heroScannerActive ? "bg-white/15 text-white backdrop-blur" : "bg-slate-200 text-slate-700"}`}>
              QR based web printing platform
            </div>
            <div>
              <h2 className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${heroScannerActive ? "text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" : "text-slate-950"}`}>
                Print documents securely.
              </h2>
              <p className={`mt-2 max-w-xl text-sm leading-6 sm:text-base ${heroScannerActive ? "text-white/85" : "text-slate-600"}`}>
                Scan QR or enter code to select a centre, upload your document, pay, and collect your print.
              </p>
              {heroScannerActive && (
                <p className="mt-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur">
                  Scanner preview closes automatically in 30 seconds.
                </p>
              )}
            </div>
          </div>
          <div className="relative z-30 grid gap-3">
            <button
              onClick={startDirectUpload}
              className={`flex min-h-20 items-center justify-center gap-3 rounded-2xl px-6 py-5 text-lg font-bold shadow-lg transition ${
                heroScannerActive ? "bg-white/90 text-slate-950 hover:bg-white" : "bg-slate-900 text-white hover:bg-slate-800"
              }`}
            >
              <Upload size={30} />
              Upload Documents
            </button>

            <div className="grid gap-3 sm:grid-cols-2">
              <CentreScannerTile
                onScan={handleScan}
                active={scannerMode === "transparent" ? heroScannerActive : false}
                onStart={startSelectedScanner}
                onStop={stopHeroScanner}
                onError={handleHeroScannerError}
                externalCamera
                idleLabel={scannerMode === "classic" ? "Classic QR Scanner" : scannerMode === "ready" ? "Ready to Scan" : "Scan / Select Centre"}
                idleHint={heroScannerError || (scannerMode === "classic" ? "Tap to open full scanner." : scannerMode === "ready" ? "Tap to start transparent scanner." : "Tap to show transparent scanner.")}
              />

              <button
                onClick={() => startLogin("user")}
                className={`flex min-h-16 items-center justify-center gap-2 rounded-2xl border px-4 py-3 font-semibold shadow-sm ${
                  heroScannerActive ? "border-white/25 bg-white/85 text-slate-950 hover:bg-white" : "bg-white hover:bg-slate-50"
                }`}
              >
                <User size={18} />
                Login / My Orders
              </button>
            </div>
          </div>
        </motion.section>

        {currentUser ? (
          <Card>
            <h3 className="text-xl font-bold">Welcome back, {currentUser.name || "PrintEase user"}</h3>
            <p className="mt-2 text-sm text-slate-600">
              Download our app to get started.
            </p>
            <div className="mt-5 grid gap-3">
              <button onClick={handleDownloadApp} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 font-semibold text-white transition hover:bg-slate-800">
                <Download size={20} />
                {isAndroid ? "Install Android App" : "Download Desktop App"}
              </button>
            </div>
          </Card>
        ) : (
          <Card>
            <h3 className="text-xl font-bold">Login / Register</h3>
            <p className="mt-2 text-sm text-slate-600">Choose your role before login.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button onClick={() => startLogin("user")} className="rounded-2xl bg-slate-900 p-4 text-left text-white">
                <User className="mb-3" />
                <b>User Login</b>
                <p className="text-sm text-slate-300">For print history and profile.</p>
              </button>
              <button onClick={() => startLogin("hub")} className="rounded-2xl bg-slate-900 p-4 text-left text-white">
                <Store className="mb-3" />
                <b>Print Hub Login</b>
                <p className="text-sm text-slate-300">For orders, pricing, payment.</p>
              </button>
              <button onClick={() => startRegister("user")} className="rounded-2xl border bg-white p-4 text-left hover:bg-slate-50">
                <Plus className="mb-3" />
                <b>Register User</b>
                <p className="text-sm text-slate-500">Username/password account.</p>
              </button>
              <button onClick={() => startRegister("hub")} className="rounded-2xl border bg-white p-4 text-left hover:bg-slate-50">
                <Building2 className="mb-3" />
                <b>Register Print Hub</b>
                <p className="text-sm text-slate-500">Create centre code and pricing.</p>
              </button>
            </div>
          </Card>
        )}
      </div>

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-2xl font-bold">Available Printing Centres</h3>
            <p className="text-sm text-slate-600">Select a centre directly and upload your document.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:w-[560px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                value={centreSearch}
                onChange={(event) => setCentreSearch(event.target.value)}
                placeholder="Search centre by name, code, or area"
                className="w-full rounded-2xl border bg-white py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-slate-300"
              />
            </label>
            <button onClick={startScanner} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">
              <QrCode size={17} />
              Scan / Code
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {filteredCentres.map((centre) => (
            <CentrePriceCard key={centre.id} centre={centre} onUpload={() => selectCentreAndUpload(centre)} />
          ))}
          {filteredCentres.length === 0 && (
            <div className="rounded-2xl border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-500 md:col-span-2">
              No centre matches this search. Try the centre code or shop name.
            </div>
          )}
        </div>
      </Card>

      {scannerOpen && (
        <QRScanner onScan={handleScan} onClose={stopScanner} />
      )}
    </div>
  );
}
