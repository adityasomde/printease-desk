import { useMemo, useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

import { User, Upload, Store, Plus, Building2, Search, Download, QrCode, X } from "lucide-react";
import Card from "../components/Card";
import CentrePriceCard from "../components/CentrePriceCard";

import QRScanner from "../components/QRScanner";

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
  const startScanner = () => setScannerOpen(true);
  const stopScanner = () => setScannerOpen(false);

  const handleScan = async (code) => {
    stopScanner();
    await selectCentreByCode(code);
  };

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

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
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col justify-between gap-5 rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
          <div className="space-y-3">
            <div className="inline-flex rounded-full bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
              QR based web printing platform
            </div>
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Print documents securely.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                Scan QR or enter code to select a centre, upload your document, pay, and collect your print.
              </p>
            </div>
          </div>
          <div className="grid gap-3">
            <button
              onClick={startDirectUpload}
              className="flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-slate-900 px-6 py-5 text-lg font-bold text-white shadow-lg transition hover:bg-slate-800"
            >
              <Upload size={30} />
              Upload Documents
            </button>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={startScanner}
                className="group relative overflow-hidden flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-2xl border bg-white px-4 py-3 font-bold text-slate-950 shadow-sm hover:bg-slate-50"
              >
                <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-30">
                   <div className="absolute left-[10%] h-[3px] w-[80%] rounded-full bg-emerald-500 shadow-[0_0_12px_3px_rgba(16,185,129,0.7)] animate-scan" />
                </div>
                <QrCode size={40} className="z-10 text-slate-950" />
                <span className="z-10 text-center text-sm">Scan / Select Centre</span>
              </button>

              <button
                onClick={() => startLogin("user")}
                className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 font-semibold shadow-sm hover:bg-slate-50"
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
