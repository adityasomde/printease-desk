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

      if (locationEnabled && (lat === null || lng === null)) {
        setSaveError("Latitude and longitude are required when map exposure is enabled.");
        setSaving(false);
        return;
      }

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
        // If parent centre state exists, update it too so refresh is not required
        if (currentCentre && currentCentre.onLocationUpdate) {
          currentCentre.onLocationUpdate({
            locationEnabled,
            latitude: lat,
            longitude: lng,
            addressText: addressText.trim() || null,
            area: area.trim() || null,
            city: city.trim() || null,
            mapUpdatedAt: data.centre?.mapUpdatedAt || new Date().toISOString()
          });
        }
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
      setSaveError("Geolocation is not supported by this browser.");
      return;
    }
    setLocating(true);
    setSaveError("");
    setSaveMessage("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude.toFixed(7)));
        setLongitude(String(pos.coords.longitude.toFixed(7)));
        setLocating(false);
        setSaveMessage("Current coordinates retrieved successfully.");
      },
      (error) => {
        let msg = "Could not get your location. Enter coordinates manually.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "Location permission denied. Please allow location permissions in browser settings.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = "Location position is unavailable. Check your device GPS/network connection.";
        } else if (error.code === error.TIMEOUT) {
          msg = "Location request timed out. Please try again.";
        }
        setSaveError(msg);
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md max-w-4xl">
      {/* Header & Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shadow-inner">
            <MapPin size={16} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800">Map Exposure Settings</h3>
            <p className="text-[10px] text-slate-400">Manage customer map visibility and coordinates</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border transition-all ${
            locationEnabled 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse" 
              : "bg-slate-50 text-slate-500 border-slate-200"
          }`}>
            {locationEnabled ? "Live on Map" : "Hidden"}
          </span>
          <button
            onClick={() => setLocationEnabled((v) => !v)}
            className={`transition-all duration-300 transform active:scale-90 ${
              locationEnabled ? "text-emerald-600" : "text-slate-300 hover:text-slate-400"
            }`}
          >
            {locationEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
          </button>
        </div>
      </div>

      {/* Grid: 2 columns on desktop to utilize horizontal space */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Left Column: Shop Address */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 flex flex-col justify-between">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Shop Address</span>
            <div className="space-y-2">
              <input
                type="text"
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                placeholder="Landmark (e.g. Near college gate...)"
                maxLength={300}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="Area / Locality"
                  maxLength={300}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                />
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  maxLength={300}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: GPS Coordinates */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 flex flex-col justify-between">
          <div className="flex flex-col h-full justify-between gap-3">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">GPS Coordinates</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5 ml-1">Latitude</label>
                  <input
                    type="number"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="e.g. 19.8762"
                    step="0.0000001"
                    min="-90"
                    max="90"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5 ml-1">Longitude</label>
                  <input
                    type="number"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="e.g. 75.3433"
                    step="0.0000001"
                    min="-180"
                    max="180"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                  />
                </div>
              </div>
            </div>
            
            {/* Prominent Use Current Location button moved below coordinates inputs */}
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={locating}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white w-full py-3.5 text-sm font-bold active:scale-[0.98] disabled:opacity-50 transition-all shadow-md hover:shadow-lg mt-auto"
            >
              <Navigation size={15} className={locating ? "animate-spin" : ""} />
              {locating ? "Detecting Coordinates..." : "Use Current Location"}
            </button>
          </div>
        </div>
      </div>

      {/* Footer Actions & Feedbacks */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 mt-3">
        <div className="flex items-center gap-4">
          <button
            onClick={handleOpenWebApp}
            className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
            title="Open web app to view full map"
          >
            <ExternalLink size={10} />
            View full map details ↗
          </button>
          {lastUpdated && (
            <span className="text-[9px] text-slate-400">
              Last saved: {lastUpdated}
            </span>
          )}
        </div>

        {/* Save button (aligned right or spanning if narrow) */}
        <div className="w-full sm:w-auto">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition duration-200 shadow-md hover:shadow active:scale-[0.98] w-full sm:w-64"
          >
            <Save size={15} />
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Alert Feedbacks */}
      {(saveMessage || saveError) && (
        <div className="mt-3">
          {saveMessage && (
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700 border border-emerald-100">
              <CheckCircle2 size={12} className="flex-shrink-0" />
              <span className="truncate">{saveMessage}</span>
            </div>
          )}
          {saveError && (
            <div className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 border border-rose-100">
              <AlertCircle size={12} className="flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
