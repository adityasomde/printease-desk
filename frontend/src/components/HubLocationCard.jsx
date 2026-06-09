/**
 * HubLocationCard — Desktop-only lightweight location settings for hub owners.
 * NO Leaflet. NO map UI. NO map library imports.
 * Hub can toggle location visibility, edit address fields, and open the web app for full map.
 */
import { useState } from "react";
import { MapPin, ToggleLeft, ToggleRight, Save, ExternalLink, Navigation, CheckCircle2, AlertCircle } from "lucide-react";
import { apiRequest } from "../services/api";
import { openExternalUrl, isDesktop } from "../utils/desktopBridge";

const WEB_APP_URL = "https://printhubdesi.vercel.app/";

export default function HubLocationCard({ currentCentre }) {
  const [locationEnabled, setLocationEnabled] = useState(
    currentCentre?.locationEnabled ?? false
  );
  const [latitude, setLatitude] = useState(
    currentCentre?.latitude != null ? String(currentCentre.latitude) : ""
  );
  const [longitude, setLongitude] = useState(
    currentCentre?.longitude != null ? String(currentCentre.longitude) : ""
  );
  const [addressText, setAddressText] = useState(currentCentre?.addressText ?? "");
  const [area, setArea] = useState(currentCentre?.area ?? "");
  const [city, setCity] = useState(currentCentre?.city ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [locating, setLocating] = useState(false);

  const lastUpdated = currentCentre?.mapUpdatedAt
    ? new Date(currentCentre.mapUpdatedAt).toLocaleString()
    : null;

  async function handleSave() {
    setSaving(true);
    setSaveMessage("");
    setSaveError("");

    try {
      const lat = latitude.trim() ? Number(latitude) : null;
      const lng = longitude.trim() ? Number(longitude) : null;

      const data = await apiRequest("/api/centres/me/location", {
        method: "PATCH",
        body: JSON.stringify({
          locationEnabled,
          latitude: lat,
          longitude: lng,
          addressText: addressText.trim() || null,
          area: area.trim() || null,
          city: city.trim() || null,
        }),
      });

      if (data?.success) {
        setSaveMessage("Location saved successfully.");
      } else {
        setSaveError(data?.message || "Failed to save location.");
      }
    } catch (err) {
      setSaveError(err.message || "Failed to save location.");
    } finally {
      setSaving(false);
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setSaveError("Geolocation not supported in this browser.");
      return;
    }
    setLocating(true);
    setSaveError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude.toFixed(7)));
        setLongitude(String(pos.coords.longitude.toFixed(7)));
        setLocating(false);
      },
      () => {
        setSaveError("Could not get your location. Enter coordinates manually.");
        setLocating(false);
      }
    );
  }

  async function handleOpenWebApp() {
    if (isDesktop()) {
      await openExternalUrl(WEB_APP_URL);
    } else {
      window.open(WEB_APP_URL, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <MapPin size={20} className="text-emerald-600" />
          <h3 className="text-lg font-bold text-slate-900">Shop Location Visibility</h3>
        </div>
        <button
          onClick={handleOpenWebApp}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
          title="Open full map on web"
        >
          <ExternalLink size={13} />
          See map on web ↗
        </button>
      </div>

      {/* Toggle */}
      <div className="mb-5 flex items-center justify-between rounded-xl border bg-slate-50 px-4 py-3">
        <div>
          <p className="font-semibold text-slate-800 text-sm">Show my shop on customer map</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {locationEnabled
              ? "Your shop is visible to customers on the map."
              : "Your shop is hidden from the customer map."}
          </p>
        </div>
        <button
          onClick={() => setLocationEnabled((v) => !v)}
          className={`ml-4 flex-shrink-0 transition-colors ${locationEnabled ? "text-emerald-600" : "text-slate-400"}`}
          title={locationEnabled ? "Disable location" : "Enable location"}
        >
          {locationEnabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
        </button>
      </div>

      {/* Address fields */}
      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Address / Landmark</label>
          <input
            type="text"
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            placeholder="Near college gate, Opp. hospital..."
            maxLength={300}
            className="w-full rounded-xl border bg-slate-50 px-4 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-200 transition"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Area / Locality</label>
            <input
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="College Road"
              maxLength={300}
              className="w-full rounded-xl border bg-slate-50 px-4 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-200 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Aurangabad"
              maxLength={300}
              className="w-full rounded-xl border bg-slate-50 px-4 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-200 transition"
            />
          </div>
        </div>

        {/* Coordinates */}
        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Latitude</label>
            <input
              type="number"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="e.g. 19.8762"
              step="0.0000001"
              min="-90"
              max="90"
              className="w-full rounded-xl border bg-slate-50 px-4 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-200 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Longitude</label>
            <input
              type="number"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="e.g. 75.3433"
              step="0.0000001"
              min="-180"
              max="180"
              className="w-full rounded-xl border bg-slate-50 px-4 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-200 transition"
            />
          </div>
        </div>
        <button
          onClick={handleUseMyLocation}
          disabled={locating}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          <Navigation size={13} className={locating ? "animate-spin" : ""} />
          {locating ? "Detecting location…" : "Use my current location (fills coordinates only)"}
        </button>
      </div>

      {/* Status row */}
      <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
        <span>
          <span className="font-semibold">Map exposure:</span>{" "}
          <span className={locationEnabled ? "text-emerald-700 font-semibold" : "text-slate-500"}>
            {locationEnabled ? "Enabled" : "Disabled"}
          </span>
        </span>
        {lastUpdated && (
          <span>
            <span className="font-semibold">Last updated:</span> {lastUpdated}
          </span>
        )}
        <span className="text-slate-400">Full map available on web app</span>
      </div>

      {/* Feedback */}
      {saveMessage && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={15} /> {saveMessage}
        </div>
      )}
      {saveError && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle size={15} /> {saveError}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition"
        >
          <Save size={15} />
          {saving ? "Saving…" : "Save Location"}
        </button>
        <button
          onClick={handleOpenWebApp}
          className="flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          <ExternalLink size={15} />
          Full Map Info on Web ↗
        </button>
      </div>
    </div>
  );
}
