import { useState, useEffect } from "react";
import { User, Mail, QrCode, Store, Edit2, CheckCircle, XCircle, Phone } from "lucide-react";
import Card from "../components/Card";
import Input from "../components/Input";
import { apiRequest } from "../services/api";

export default function ProfilePage({ currentUser, updateProfile, navigate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(currentUser?.name || "");
  const [username, setUsername] = useState(currentUser?.username || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [mobile, setMobile] = useState(currentUser?.mobile || "");
  const [hubName, setHubName] = useState(currentUser?.hubName || currentUser?.centre?.name || "");
  const [hubCode, setHubCode] = useState(currentUser?.hubCode || currentUser?.centreCode || "");

  const isHub = currentUser?.role === "hub";

  useEffect(() => {
    setName(currentUser?.name || "");
    setUsername(currentUser?.username || "");
    setEmail(currentUser?.email || "");
    setMobile(currentUser?.mobile || "");
    setHubName(currentUser?.hubName || currentUser?.centre?.name || "");
    setHubCode(currentUser?.hubCode || currentUser?.centreCode || "");
  }, [currentUser]);

  async function handleSave() {
    setError("");
    setLoading(true);
    try {
      await updateProfile({ name, username, email, mobile, hubName, hubCode });
      setIsEditing(false);
    } catch (err) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setIsEditing(false);
    setError("");
    setName(currentUser?.name || "");
    setUsername(currentUser?.username || "");
    setEmail(currentUser?.email || "");
    setMobile(currentUser?.mobile || "");
    setHubName(currentUser?.hubName || currentUser?.centre?.name || "");
    setHubCode(currentUser?.hubCode || currentUser?.centreCode || "");
  }

  async function handleDeleteHub() {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this print hub? This action cannot be undone.\n\nNote: For this to work, ensure the backend DELETE /api/centres endpoint is implemented."
    );
    if (!confirmDelete) return;

    try {
      await apiRequest('/api/centres', { method: 'DELETE' });
      alert("Hub deleted successfully.");
      window.location.reload();
    } catch (error) {
      alert("Failed to delete hub: " + (error.message || "Endpoint not implemented."));
    }
  }

  function renderField(label, value, icon, editable, setter, placeholder, maxLength) {
    if (isEditing) {
      return (
        <Input
          label={label}
          icon={icon}
          value={editable}
          setValue={setter}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={loading}
        />
      );
    }

    return (
      <div className="mb-4">
        <span className="block text-sm font-semibold text-slate-700">{label}</span>
        <div className="mt-1 flex items-center gap-2 text-slate-900">
          <span className="text-slate-400">{icon}</span>
          <span className="font-medium">{value || "Not provided"}</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Card>Please login to view your profile.</Card>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Your Profile</h2>
          <p className="text-sm text-slate-600">View and manage your account details.</p>
        </div>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
          >
            <Edit2 size={16} /> Edit Profile
          </button>
        ) : (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              onClick={handleCancel}
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 sm:flex-none"
            >
              <XCircle size={16} /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 sm:flex-none"
            >
              <CheckCircle size={16} /> {loading ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      <Card>
        <div className="grid gap-6">
          {error && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {renderField("Name", currentUser.name, <User size={18} />, name, setName, "Your name", 50)}
            {renderField("PrintEase Username", currentUser.username, <User size={18} />, username, setUsername, "Username", 50)}
            {renderField("Email Address", currentUser.email, <Mail size={18} />, email, setEmail, "Email", 100)}
            {renderField("Mobile Number", currentUser.mobile, <Phone size={18} />, mobile, setMobile, "Mobile number", 20)}
          </div>

          {isHub && (
            <div className="mt-4 border-t pt-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800">Hub Details</h3>
                <button
                  onClick={handleDeleteHub}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  Delete Hub
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {renderField("Hub Name", currentUser.hubName || currentUser.centre?.name, <Store size={18} />, hubName, setHubName, "Hub Name", 100)}
                {renderField("Centre Code", currentUser.hubCode || currentUser.centreCode, <QrCode size={18} />, hubCode, setHubCode, "Centre Code", 8)}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
