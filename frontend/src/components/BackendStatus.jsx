import { useEffect, useState } from "react";
import API_BASE_URL, { checkBackendHealth } from "../services/api";

export default function BackendStatus() {
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Checking backend connection...");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function checkConnection() {
      try {
        const data = await checkBackendHealth();

        if (ignore) return;

        setStatus("connected");
        setMessage(data.message || "Backend connected successfully");
        setErrorMessage("");
      } catch (error) {
        if (ignore) return;

        console.error("[BACKEND HEALTH CHECK FAILED]", {
          apiBaseUrl: API_BASE_URL,
          message: error.message,
          status: error.status,
        });

        setStatus("failed");
        setMessage("Backend unreachable");
        setErrorMessage(error.message || "Unknown backend connection error");
      }
    }

    checkConnection();

    return () => {
      ignore = true;
    };
  }, []);

  const isConnected = status === "connected";
  const isLoading = status === "loading";

  if (isConnected || isLoading) return null;

  return (
    <section
      className={`mb-6 rounded-lg border px-4 py-3 text-sm shadow-sm ${
        isConnected
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : isLoading
            ? "border-slate-200 bg-white text-slate-700"
            : "border-red-200 bg-red-50 text-red-950"
      }`}
      aria-live="polite"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">
            Status: {isConnected ? "Connected" : isLoading ? "Checking" : "Failed"}
          </p>
          <p>{message}</p>
        </div>
        <p className="break-all font-mono text-xs">Backend URL: {API_BASE_URL}</p>
      </div>

      {errorMessage && (
        <div className="mt-3 space-y-1">
          <p>
            <span className="font-semibold">Error:</span> {errorMessage}
          </p>
          <p>
            <span className="font-semibold">Suggested fix:</span> Verify Vercel VITE_API_URL, Render FRONTEND_URL, CORS, and deployment logs.
          </p>
        </div>
      )}
    </section>
  );
}
