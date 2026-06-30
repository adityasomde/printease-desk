export default function FileSettingsPanel({ activeConfig, setConfigVal, isCompact = false }) {
  const containerClass = isCompact
    ? "grid gap-2 grid-cols-2 md:grid-cols-4 bg-slate-50 p-3 rounded-2xl border border-slate-100"
    : "grid gap-2 sm:gap-4 grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-4";
    
  const labelClass = isCompact
    ? "grid gap-1 text-xs font-semibold text-slate-600 col-span-1"
    : "grid gap-1 sm:gap-2 text-sm font-semibold text-slate-600 col-span-1 min-w-0";
    
  const inputClass = isCompact
    ? "rounded-xl border px-2 py-1.5 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
    : "w-full min-w-0 rounded-2xl border px-2 sm:px-3 py-2 text-sm sm:text-base font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300";

  const selectClass = isCompact
    ? "rounded-xl border px-2 py-1.5 font-normal text-slate-900"
    : "w-full min-w-0 rounded-2xl border px-2 sm:px-3 py-2 text-sm sm:text-base font-normal text-slate-900";

  return (
    <div className={containerClass}>

      <label className={labelClass}>
        {isCompact ? "Range" : "Page range"}
        <input value={activeConfig?.selectedPages || ""} onChange={(e) => setConfigVal("selectedPages", e.target.value)} placeholder={isCompact ? "1,3-4" : "All, or 1,3-4"} className={inputClass} />
      </label>
      <label className={labelClass}>
        Copies
        <input type="number" min="1" value={activeConfig?.copies ?? 1} onChange={(e) => setConfigVal("copies", e.target.value === "" ? "" : Number(e.target.value))} className={inputClass} />
      </label>
      <label className={labelClass}>
        {isCompact ? "Color" : "Color mode"}
        <select value={activeConfig?.colorType || "bw"} onChange={(e) => setConfigVal("colorType", e.target.value)} className={selectClass}>
          <option value="bw">{isCompact ? "B & W" : "Black & White"}</option>
          <option value="color">Color</option>
        </select>
      </label>
      <label className={labelClass}>
        Sides
        <select value={activeConfig?.sideType || "single"} onChange={(e) => setConfigVal("sideType", e.target.value)} className={selectClass}>
          <option value="single">Single side</option>
          <option value="double">Double side</option>
        </select>
      </label>
      <label className={labelClass}>
        {isCompact ? "Size" : "Paper size"}
        <select value={activeConfig?.paperSize || "A4"} onChange={(e) => setConfigVal("paperSize", e.target.value)} className={selectClass}>
          <option value="A4">A4</option>
          <option value="A3">A3</option>
          <option value="Letter">Letter</option>
          <option value="Legal">Legal</option>
        </select>
      </label>
      <label className={labelClass}>
        {isCompact ? "Layout" : "Orientation"}
        <select value={activeConfig?.orientation || "auto"} onChange={(e) => setConfigVal("orientation", e.target.value)} className={selectClass}>
          <option value="auto">Auto</option>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      <label className={labelClass}>
        Pages per sheet
        <select value={activeConfig?.pagesPerSheet || 1} onChange={(e) => setConfigVal("pagesPerSheet", Number(e.target.value))} className={selectClass}>
          <option value={1}>{isCompact ? "1" : "1 page per sheet"}</option>
          <option value={2}>{isCompact ? "2" : "2 pages per sheet"}</option>
          <option value={4}>{isCompact ? "4" : "4 pages per sheet"}</option>
          <option value={6}>{isCompact ? "6" : "6 pages per sheet"}</option>
          <option value={9}>{isCompact ? "9" : "9 pages per sheet"}</option>
          <option value={16}>{isCompact ? "16" : "16 pages per sheet"}</option>
        </select>
      </label>
      <label className={labelClass}>
        {isCompact ? "DPI" : "Print quality"}
        <select value={activeConfig?.printDpi || 300} onChange={(e) => setConfigVal("printDpi", Number(e.target.value))} className={selectClass}>
          <option value={203}>{isCompact ? "203" : "Draft - 203 DPI"}</option>
          <option value={300}>{isCompact ? "300" : "Standard - 300 DPI"}</option>
          <option value={600}>{isCompact ? "600" : "High - 600 DPI"}</option>
        </select>
      </label>
      <label className={labelClass}>
        Scale
        <select value={activeConfig?.scaleMode || "original"} onChange={(e) => setConfigVal("scaleMode", e.target.value)} className={selectClass}>
          <option value="original">{isCompact ? "Original" : "Original size"}</option>
          <option value="fit_to_page">{isCompact ? "Fit page" : "Fit to page"}</option>
          <option value="fit_to_page_width">{isCompact ? "Fit width" : "Fit to page width"}</option>
        </select>
      </label>
      <label className={isCompact ? "grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-2" : "grid gap-1 sm:gap-2 text-sm font-semibold text-slate-600 col-span-1 min-[380px]:col-span-2 md:col-span-4 min-w-0"}>
        Margins
        <select value={activeConfig?.marginMode || "default"} onChange={(e) => setConfigVal("marginMode", e.target.value)} className={isCompact ? "rounded-xl border px-2 py-1.5 font-normal text-slate-900" : "rounded-2xl border px-4 py-3 font-normal text-slate-900"}>
          <option value="default">Default</option>
          <option value="minimum">Minimum</option>
          <option value="none">None</option>
        </select>
      </label>
      <label className={isCompact ? "flex items-center gap-2 rounded-xl border px-3 py-1.5 col-span-2 md:col-span-4 bg-white" : "flex items-center gap-3 rounded-2xl border px-4 py-3 col-span-2"}>
        <input type="checkbox" checked={activeConfig?.watermark || false} onChange={(e) => setConfigVal("watermark", e.target.checked)} />
        <span className={isCompact ? "text-xs font-semibold" : ""}>{isCompact ? "Add watermark" : "Add watermark to printable PDF"}</span>
      </label>
      {activeConfig?.watermark && (
        <div className={isCompact ? "grid gap-2 rounded-xl border bg-white p-3 col-span-2 md:col-span-4 md:grid-cols-4" : "grid gap-3 rounded-2xl border bg-slate-50 p-4 col-span-2 md:grid-cols-2"}>
          <select value={activeConfig?.watermarkType || "order_code"} onChange={(e) => setConfigVal("watermarkType", e.target.value)} className={isCompact ? "rounded-xl border px-2 py-1.5 text-xs col-span-1" : "rounded-2xl border px-4 py-3"}>
            <option value="order_code">Order code</option>
            <option value="pickup_code">Pickup code</option>
            <option value="date_time">Date/time</option>
            <option value="custom_text">Custom text</option>
          </select>
          <select value={activeConfig?.watermarkPosition || "bottom_right"} onChange={(e) => setConfigVal("watermarkPosition", e.target.value)} className={isCompact ? "rounded-xl border px-2 py-1.5 text-xs col-span-1" : "rounded-2xl border px-4 py-3"}>
            <option value="bottom_right">Bottom right</option>
            <option value="bottom_center">Bottom center</option>
            <option value="bottom_left">Bottom left</option>
            <option value="center">Center</option>
            <option value="top_left">Top left</option>
            <option value="top_center">Top center</option>
            <option value="top_right">Top right</option>
          </select>
          {activeConfig?.watermarkType === "custom_text" && (
            <input value={activeConfig?.watermarkText || ""} onChange={(e) => setConfigVal("watermarkText", e.target.value)} placeholder="Text" className={isCompact ? "rounded-xl border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-slate-300 col-span-2 md:col-span-2" : "rounded-2xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300 md:col-span-2"} />
          )}
          <label className={isCompact ? "grid gap-1 text-xs font-semibold text-slate-600 col-span-1" : "grid gap-2 text-sm font-semibold text-slate-600"}>
            Opacity
            <input type="range" min="0.05" max="0.6" step="0.01" value={activeConfig?.watermarkOpacity || 0.18} onChange={(e) => setConfigVal("watermarkOpacity", Number(e.target.value))} />
          </label>
          <label className={isCompact ? "grid gap-1 text-xs font-semibold text-slate-600 col-span-1" : "grid gap-2 text-sm font-semibold text-slate-600"}>
            Rotation
            <input type="range" min="-90" max="90" step="5" value={activeConfig?.watermarkRotation || 0} onChange={(e) => setConfigVal("watermarkRotation", Number(e.target.value))} />
          </label>
          <input type="number" min="8" max="72" value={activeConfig?.watermarkFontSize ?? 18} onChange={(e) => setConfigVal("watermarkFontSize", e.target.value === "" ? "" : Number(e.target.value))} placeholder={isCompact ? "Size" : "Font size"} className={isCompact ? "rounded-xl border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-slate-300 col-span-2 md:col-span-2" : "rounded-2xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300 col-span-2"} />
        </div>
      )}
    </div>
  );
}
