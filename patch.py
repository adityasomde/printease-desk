import os

filepath = "/home/chaitanya/Downloads/printhub/desk/frontend/src/pages/UploadPage.jsx"

with open(filepath, "r") as f:
    content = f.read()

# Rename configurationForm to regularConfigurationForm
content = content.replace("const configurationForm = (", "const regularConfigurationForm = (")

# Now insert compactConfigurationForm right after the end of regularConfigurationForm
compact_form = """
  const compactConfigurationForm = (
    <div className="grid gap-2 grid-cols-2 md:grid-cols-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
        Pages
        <input type="number" min="1" value={activeConfig?.pages || 1} onChange={(e) => setConfigVal("pages", Number(e.target.value))} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
        Range
        <input value={activeConfig?.selectedPages || ""} onChange={(e) => setConfigVal("selectedPages", e.target.value)} placeholder="1,3-4" className="rounded-xl border px-2 py-1.5 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
        Copies
        <input type="number" min="1" value={activeConfig?.copies || 1} onChange={(e) => setConfigVal("copies", Number(e.target.value))} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
        Color
        <select value={activeConfig?.colorType || "bw"} onChange={(e) => setConfigVal("colorType", e.target.value)} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value="bw">B & W</option>
          <option value="color">Color</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
        Sides
        <select value={activeConfig?.sideType || "single"} onChange={(e) => setConfigVal("sideType", e.target.value)} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value="single">Single side</option>
          <option value="double">Double side</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
        Size
        <select value={activeConfig?.paperSize || "A4"} onChange={(e) => setConfigVal("paperSize", e.target.value)} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value="A4">A4</option>
          <option value="A3">A3</option>
          <option value="Letter">Letter</option>
          <option value="Legal">Legal</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
        Layout
        <select value={activeConfig?.orientation || "auto"} onChange={(e) => setConfigVal("orientation", e.target.value)} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value="auto">Auto</option>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
        Pages/Sheet
        <select value={activeConfig?.pagesPerSheet || 1} onChange={(e) => setConfigVal("pagesPerSheet", Number(e.target.value))} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={4}>4</option>
          <option value={6}>6</option>
          <option value={9}>9</option>
          <option value={16}>16</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
        DPI
        <select value={activeConfig?.printDpi || 300} onChange={(e) => setConfigVal("printDpi", Number(e.target.value))} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value={203}>203</option>
          <option value={300}>300</option>
          <option value={600}>600</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
        Scale
        <select value={activeConfig?.scaleMode || "original"} onChange={(e) => setConfigVal("scaleMode", e.target.value)} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value="original">Original</option>
          <option value="fit_to_page">Fit page</option>
          <option value="fit_to_page_width">Fit width</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-2">
        Margins
        <select value={activeConfig?.marginMode || "default"} onChange={(e) => setConfigVal("marginMode", e.target.value)} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value="default">Default</option>
          <option value="minimum">Minimum</option>
          <option value="none">None</option>
        </select>
      </label>
      <label className="flex items-center gap-2 rounded-xl border px-3 py-1.5 col-span-2 md:col-span-4 bg-white">
        <input type="checkbox" checked={activeConfig?.watermark || false} onChange={(e) => setConfigVal("watermark", e.target.checked)} />
        <span className="text-xs font-semibold">Add watermark</span>
      </label>
      {activeConfig?.watermark && (
        <div className="grid gap-2 rounded-xl border bg-white p-3 col-span-2 md:col-span-4 md:grid-cols-4">
          <select value={activeConfig?.watermarkType || "order_code"} onChange={(e) => setConfigVal("watermarkType", e.target.value)} className="rounded-xl border px-2 py-1.5 text-xs col-span-2 md:col-span-1">
            <option value="order_code">Order code</option>
            <option value="pickup_code">Pickup code</option>
            <option value="date_time">Date/time</option>
            <option value="custom_text">Custom text</option>
          </select>
          <select value={activeConfig?.watermarkPosition || "bottom_right"} onChange={(e) => setConfigVal("watermarkPosition", e.target.value)} className="rounded-xl border px-2 py-1.5 text-xs col-span-2 md:col-span-1">
            <option value="bottom_right">Bottom right</option>
            <option value="center">Center</option>
            <option value="top_left">Top left</option>
          </select>
          {activeConfig?.watermarkType === "custom_text" && (
            <input value={activeConfig?.watermarkText || ""} onChange={(e) => setConfigVal("watermarkText", e.target.value)} placeholder="Text" className="rounded-xl border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-slate-300 col-span-2 md:col-span-2" />
          )}
          <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
            Opacity
            <input type="range" min="0.05" max="0.6" step="0.01" value={activeConfig?.watermarkOpacity || 0.18} onChange={(e) => setConfigVal("watermarkOpacity", Number(e.target.value))} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-2 md:col-span-1">
            Rotation
            <input type="range" min="-90" max="90" step="5" value={activeConfig?.watermarkRotation || 0} onChange={(e) => setConfigVal("watermarkRotation", Number(e.target.value))} />
          </label>
          <input type="number" min="8" max="72" value={activeConfig?.watermarkFontSize || 18} onChange={(e) => setConfigVal("watermarkFontSize", Number(e.target.value))} placeholder="Size" className="rounded-xl border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-slate-300 col-span-2 md:col-span-2" />
        </div>
      )}
    </div>
  );
"""

# Insert compactConfigurationForm after the end of regularConfigurationForm
idx = content.find("  const compactConfigurationForm = (")
if idx == -1: # prevent double inserting
    end_of_regular = content.find("  return (")
    content = content[:end_of_regular] + compact_form + "\n" + content[end_of_regular:]

# Now replace the usage of configurationForm
content = content.replace("{configurationForm}", "{isMulti ? compactConfigurationForm : regularConfigurationForm}")
# Wait, my logic for multi select is already separated:
# it has:
#                {selectedFileNames.length > 0 ? (
#                  configurationForm
#                ) : (
# and
#          ) : (
#            <div className="mt-4">
#              {configurationForm}
#            </div>
#          )}

# I should explicitly replace the two instances.
# Instance 1: Inside isMulti details
# Instance 2: Inside single file
# Let's just string replace them. 
# Wait, I already replaced `{configurationForm}` with `{isMulti ? compactConfigurationForm : regularConfigurationForm}`
# But in `isMulti ? ... : ...`, using `isMulti ? compactConfigurationForm : regularConfigurationForm` will work perfectly in both spots because `isMulti` will just evaluate to true in one and false in another. 
# Actually, I can just replace `{configurationForm}` with `{isMulti ? compactConfigurationForm : regularConfigurationForm}`.

with open(filepath, "w") as f:
    f.write(content)

