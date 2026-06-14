import { useState } from "react";
import { FilePlus, ToggleLeft, ToggleRight, Save, CheckCircle2, AlertCircle, Sliders, Type, Grid } from "lucide-react";
import { updateAfterOrderSettings } from "../services/api";

export default function HubAfterOrderSettingsCard({ currentCentre, onSettingsUpdate }) {
  const settings = currentCentre?.afterOrderSettings || {};

  const [enabled, setEnabled] = useState(settings.enabled ?? false);
  const [type, setType] = useState(settings.type ?? "blank");
  const [customText, setCustomText] = useState(settings.customText ?? "");
  
  const [watermarkMetadata, setWatermarkMetadata] = useState({
    printerId: settings.watermarkMetadata?.printerId ?? true,
    pickupCode: settings.watermarkMetadata?.pickupCode ?? true,
    clientName: settings.watermarkMetadata?.clientName ?? true,
    serialNo: settings.watermarkMetadata?.serialNo ?? true,
  });

  const [layout, setLayout] = useState({
    fontSize: settings.layout?.fontSize ?? 14,
    opacity: settings.layout?.opacity ?? 0.8,
    location: {
      x: settings.layout?.location?.x ?? 50,
      y: settings.layout?.location?.y ?? 100,
    },
    orientation: settings.layout?.orientation ?? 0,
    shape: settings.layout?.shape ?? "text",
  });

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const handleMetadataChange = (key) => {
    setWatermarkMetadata((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleLayoutChange = (key, value) => {
    setLayout((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleLocationChange = (coord, value) => {
    setLayout((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        [coord]: Number(value),
      },
    }));
  };

  async function handleSave() {
    setSaving(true);
    setSaveMessage("");
    setSaveError("");

    try {
      const payload = {
        enabled,
        type,
        customText: type === "custom" ? customText.trim() : "",
        watermarkMetadata,
        layout: {
          fontSize: Number(layout.fontSize),
          opacity: Number(layout.opacity),
          location: {
            x: Number(layout.location.x),
            y: Number(layout.location.y),
          },
          orientation: Number(layout.orientation),
          shape: layout.shape,
        },
      };

      const data = await updateAfterOrderSettings(payload);

      if (data?.success) {
        setSaveMessage("Settings saved successfully.");
        if (onSettingsUpdate) {
          onSettingsUpdate(data.centre?.afterOrderSettings || payload);
        }
      } else {
        setSaveError(data?.message || "Failed to save settings.");
      }
    } catch (err) {
      setSaveError(err.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 shadow-inner">
            <FilePlus size={18} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800">Auto Banner / Slip Page Settings</h3>
            <p className="text-[10px] text-slate-400">Append an extra customizable summary page after each printed order</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border transition-all ${
            enabled 
              ? "bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse" 
              : "bg-slate-50 text-slate-500 border-slate-200"
          }`}>
            {enabled ? "Enabled" : "Disabled"}
          </span>
          <button
            onClick={() => setEnabled((v) => !v)}
            className={`transition-all duration-300 transform active:scale-90 ${
              enabled ? "text-indigo-600" : "text-slate-300 hover:text-slate-400"
            }`}
          >
            {enabled ? <ToggleRight size={30} /> : <ToggleLeft size={30} />}
          </button>
        </div>
      </div>

      {enabled && (
        <div className="space-y-4 mb-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Left Box: Configuration Type */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Page Insertion Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-slate-400 transition-all font-semibold text-slate-700"
                >
                  <option value="blank">Normal Blank Page</option>
                  <option value="custom">Custom Text / Message Slip</option>
                  <option value="watermark">Watermark / Meta Summary Page</option>
                </select>
              </div>

              {type === "custom" && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Custom Content (Text/Message)</label>
                  <textarea
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="Enter message to display on the extra page..."
                    maxLength={500}
                    rows={4}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-slate-400 transition-all text-slate-700 placeholder-slate-400 resize-none"
                  />
                </div>
              )}

              {type === "watermark" && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Display Meta Checkboxes</label>
                  <div className="grid grid-cols-2 gap-2 text-xs font-medium text-slate-700">
                    <label className="flex items-center gap-2 hover:bg-slate-100/60 p-1.5 rounded-md cursor-pointer transition-all">
                      <input
                        type="checkbox"
                        checked={watermarkMetadata.clientName}
                        onChange={() => handleMetadataChange("clientName")}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span>Client Name</span>
                    </label>
                    <label className="flex items-center gap-2 hover:bg-slate-100/60 p-1.5 rounded-md cursor-pointer transition-all">
                      <input
                        type="checkbox"
                        checked={watermarkMetadata.pickupCode}
                        onChange={() => handleMetadataChange("pickupCode")}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span>Pickup Code</span>
                    </label>
                    <label className="flex items-center gap-2 hover:bg-slate-100/60 p-1.5 rounded-md cursor-pointer transition-all">
                      <input
                        type="checkbox"
                        checked={watermarkMetadata.printerId}
                        onChange={() => handleMetadataChange("printerId")}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span>Printer Name</span>
                    </label>
                    <label className="flex items-center gap-2 hover:bg-slate-100/60 p-1.5 rounded-md cursor-pointer transition-all">
                      <input
                        type="checkbox"
                        checked={watermarkMetadata.serialNo}
                        onChange={() => handleMetadataChange("serialNo")}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span>Serial / Job Code</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Right Box: Layout & Styling (only visible if type is NOT blank) */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
              {type !== "blank" ? (
                <>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Layout Constraints</span>
                  
                  {/* Font Size & Opacity */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 flex justify-between">
                        <span>Font Size</span>
                        <span className="text-indigo-600">{layout.fontSize}px</span>
                      </span>
                      <input
                        type="range"
                        min="8"
                        max="48"
                        value={layout.fontSize}
                        onChange={(e) => handleLayoutChange("fontSize", Number(e.target.value))}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-1 accent-indigo-600"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 flex justify-between">
                        <span>Opacity</span>
                        <span className="text-indigo-600">{Math.round(layout.opacity * 100)}%</span>
                      </span>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={layout.opacity}
                        onChange={(e) => handleLayoutChange("opacity", Number(e.target.value))}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-1 accent-indigo-600"
                      />
                    </div>
                  </div>

                  {/* Location (X & Y) */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 flex justify-between">
                        <span>X Coordinate</span>
                        <span className="text-indigo-600">{layout.location.x}pt</span>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="500"
                        value={layout.location.x}
                        onChange={(e) => handleLocationChange("x", e.target.value)}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-1 accent-indigo-600"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 flex justify-between">
                        <span>Y Coordinate</span>
                        <span className="text-indigo-600">{layout.location.y}pt</span>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="700"
                        value={layout.location.y}
                        onChange={(e) => handleLocationChange("y", e.target.value)}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-1 accent-indigo-600"
                      />
                    </div>
                  </div>

                  {/* Orientation Angle & Shape style */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 flex justify-between">
                        <span>Orientation</span>
                        <span className="text-indigo-600">{layout.orientation}°</span>
                      </span>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        value={layout.orientation}
                        onChange={(e) => handleLayoutChange("orientation", Number(e.target.value))}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-1 accent-indigo-600"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500">Shape Border Style</span>
                      <select
                        value={layout.shape}
                        onChange={(e) => handleLayoutChange("shape", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none mt-1 focus:border-slate-400 font-semibold text-slate-600"
                      >
                        <option value="text">Plain Text</option>
                        <option value="box">Text in Box</option>
                        <option value="circle">Text in Circle</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 py-6">
                  <Sliders size={24} className="stroke-1 mb-1" />
                  <p className="text-[10px] text-center font-medium">Layout controls disabled for blank pages.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Message feedback alerts */}
      {saveMessage && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 p-2.5 text-xs text-emerald-800 animate-fadeIn">
          <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}

      {saveError && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-100 p-2.5 text-xs text-rose-800 animate-fadeIn">
          <AlertCircle size={15} className="text-rose-600 flex-shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Action footer */}
      <div className="flex justify-end border-t border-slate-100 pt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold px-4 py-1.5 text-xs shadow-sm hover:shadow transition-all disabled:opacity-50"
        >
          <Save size={14} className={saving ? "animate-spin" : ""} />
          <span>{saving ? "Saving Changes..." : "Save Settings"}</span>
        </button>
      </div>
    </div>
  );
}
