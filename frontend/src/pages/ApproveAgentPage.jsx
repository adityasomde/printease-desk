import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle, ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import Card from "../components/Card";
import { approveAgentPairing, getPairingApprovalSession, rejectAgentPairing } from "../services/api";

function useQueryParams() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function formatRelativeExpiry(expiresAt) {
  if (!expiresAt) return "";
  const expires = new Date(expiresAt).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.round((expires - now) / 1000));
  return seconds > 0 ? `${seconds} second${seconds === 1 ? "" : "s"} remaining` : "Expired";
}

export default function ApproveAgentPage({ currentUser }) {
  const params = useQueryParams();
  const sessionId = params.get("session") || "";
  const approvalToken = params.get("token") || "";

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canApprove = Boolean(sessionId && approvalToken && session);
  const needsLogin = !currentUser;
  const officialBackendUrl = "https://printease-backend-byex.onrender.com";

  useEffect(() => {
    if (!sessionId || !currentUser || currentUser.role !== "hub") return;

    let ignore = false;
    setLoading(true);
    setError("");
    setMessage("");

    getPairingApprovalSession(sessionId)
      .then((data) => {
        if (ignore) return;
        if (data?.session) {
          setSession(data.session);
        } else {
          setError(data?.message || "Could not load pairing request.");
        }
      })
      .catch((loadError) => {
        if (ignore) return;
        setError(loadError.message || "Could not load pairing request.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [sessionId, currentUser]);

  async function handleApprove() {
    setActionLoading(true);
    setError("");
    setMessage("");

    try {
      await approveAgentPairing(sessionId, approvalToken);
      setMessage("Device approved. Return to PrintEase Desktop.");
      setSession((prev) => ({ ...prev, status: "claimed" }));
    } catch (approveError) {
      setError(approveError.message || "Could not approve device.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    setActionLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await rejectAgentPairing(sessionId);
      setMessage(result.message || "Pairing request rejected.");
      setSession((prev) => ({ ...prev, status: "rejected" }));
    } catch (rejectError) {
      setError(rejectError.message || "Could not reject device.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <ShieldCheck size={24} className="text-slate-900" />
            <div>
              <h2 className="text-3xl font-bold">Approve desktop device?</h2>
              <p className="mt-1 text-slate-600">Authorize a local desktop device without sharing your hub password.</p>
            </div>
          </div>

          {needsLogin && (
            <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              Please login as a print hub to approve this desktop device.
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
          )}

          {message && (
            <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <p className="text-sm font-semibold text-slate-500">Pairing Session</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{sessionId || "Invalid session"}</p>
              <p className="mt-2 text-sm text-slate-600">Expires: {session?.approvalExpiresAt ? new Date(session.approvalExpiresAt).toLocaleString() : "Unknown"}</p>
              <p className="mt-1 text-sm text-slate-500">{formatRelativeExpiry(session?.approvalExpiresAt)}</p>
            </div>

            <div className="rounded-2xl border p-4">
              <p className="text-sm font-semibold text-slate-500">Desktop Device</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{session?.agentName || "Unknown device"}</p>
              <p className="mt-2 text-sm text-slate-600">Platform: {session?.platform || "Unknown"}</p>
              <p className="mt-1 text-sm text-slate-600">Version: {session?.version || "Unknown"}</p>
              <p className="mt-1 break-all text-sm text-slate-600">Official backend: {officialBackendUrl}</p>
              <p className="mt-1 text-sm text-slate-600">Approval token: {approvalToken ? "Available" : "Missing"}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!canApprove || actionLoading || needsLogin}
              onClick={handleApprove}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:bg-slate-300"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle size={16} />} Approve Device
            </button>
            <button
              type="button"
              disabled={!sessionId || actionLoading || needsLogin}
              onClick={handleReject}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border px-5 py-3 font-semibold text-slate-900 disabled:opacity-50"
            >
              <ShieldOff size={16} /> Reject Device
            </button>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold">Security note</p>
            <p className="mt-2">
              Only approve devices you trust. Approval links expire quickly and can only be used once. The desktop device does not receive your hub login credentials.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
