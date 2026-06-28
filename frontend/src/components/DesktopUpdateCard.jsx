import { useEffect, useState } from "react";
import { DownloadCloud, RefreshCw, Rocket } from "lucide-react";
import {
  checkForUpdates,
  getUpdateStatus,
  installUpdateNow,
  onUpdateStatus,
} from "../utils/desktopBridge";

export default function DesktopUpdateCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    getUpdateStatus()
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch(() => {});

    const unsubscribe = onUpdateStatus((payload) => {
      setStatus(payload);
      if (payload?.message) setMessage(payload.message);
      if (payload?.error) setError(payload.error);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function runCheck() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await checkForUpdates();
      setStatus(result);
      if (result?.success === false) setError(result.error || result.message || "Could not check for updates.");
      else setMessage(result?.message || "Update check completed.");
    } catch (checkError) {
      setError(checkError.message || "Could not check for updates.");
    } finally {
      setBusy(false);
    }
  }

  async function runInstall() {
    setBusy(true);
    setError("");
    try {
      const result = await installUpdateNow();
      if (result?.success === false) setError(result.error || result.message || "Could not install update.");
    } catch (installError) {
      setError(installError.message || "Could not install update.");
    } finally {
      setBusy(false);
    }
  }

  const downloaded = Boolean(status?.downloaded || status?.updateDownloaded || status?.canInstall);

  return (
    <section className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Rocket size={20} />
            <h3 className="text-lg font-bold">Desktop Updates</h3>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Check for the latest PrintEase Desktop release and install it after download.
          </p>
          {(message || error) && (
            <p className={`mt-2 text-sm font-semibold ${error ? "text-rose-700" : "text-emerald-700"}`}>
              {error || message}
            </p>
          )}
          {status?.version && <p className="mt-2 text-xs text-slate-500">Current version: {status.version}</p>}
          {status?.latestVersion && <p className="text-xs text-slate-500">Latest version: {status.latestVersion}</p>}
        </div>

        <div className="grid gap-2 sm:min-w-48">
          <button
            type="button"
            onClick={runCheck}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
            Check Updates
          </button>

          {downloaded && (
            <button
              type="button"
              onClick={runInstall}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            >
              <DownloadCloud size={16} />
              Install Update
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

