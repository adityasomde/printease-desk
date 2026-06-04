import { FileText, Upload, IndianRupee } from "lucide-react";
import Card from "../components/Card";
import Row from "../components/Row";

export default function UploadPage({
  selectedCentre,
  documentFile,
  setDocumentFile,
  documentFiles,
  setDocumentFiles,
  documentName,
  setDocumentName,
  pages,
  setPages,
  selectedPages,
  setSelectedPages,
  copies,
  setCopies,
  colorType,
  setColorType,
  sideType,
  setSideType,
  paperSize,
  setPaperSize,
  pagesPerSheet,
  setPagesPerSheet,
  orientation,
  setOrientation,
  printDpi,
  setPrintDpi,
  scaleMode,
  setScaleMode,
  marginMode,
  setMarginMode,
  watermark,
  setWatermark,
  watermarkType,
  setWatermarkType,
  watermarkText,
  setWatermarkText,
  watermarkPosition,
  setWatermarkPosition,
  watermarkOpacity,
  setWatermarkOpacity,
  watermarkFontSize,
  setWatermarkFontSize,
  watermarkRotation,
  setWatermarkRotation,
  pricePerPage,
  estimatedSelectedPageCount,
  totalAmount,
  backendPrice,
  preparePayment,
  paymentLoading,
  paymentError,
  navigate,
}) {
  function handleFileChange(event) {
    const files = Array.from(event.target.files || []);
    const firstFile = files[0] || null;
    setDocumentFiles(files);
    setDocumentFile(firstFile);
    if (files.length === 1) setDocumentName(firstFile.name);
    if (files.length > 1) setDocumentName(`${files.length} uploaded documents`);
  }

  const selectedFileCount = documentFiles?.length || (documentFile ? 1 : 0);
  const selectedFileLabel = selectedFileCount > 1
    ? `${selectedFileCount} PDFs selected`
    : documentFile?.name;
  const selectedFileSize = (documentFiles || []).reduce((sum, file) => sum + file.size, 0) || documentFile?.size || 0;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <h2 className="text-2xl font-bold">Upload Document</h2>
        <p className="mt-2 text-slate-600">Selected Centre: <b>{selectedCentre?.name || "Not selected yet"}</b></p>

        {!selectedCentre && (
          <div className="mt-4 rounded-2xl bg-orange-50 p-4 text-sm text-orange-700">
            Direct upload started. Please select a centre before payment.
          </div>
        )}

        {paymentError && (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {paymentError}
          </p>
        )}

        <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-2">
          <label className="cursor-pointer rounded-2xl border border-dashed bg-slate-50 p-6 text-center hover:bg-slate-100 col-span-2 md:col-span-2">
            <input type="file" accept="application/pdf" multiple onChange={handleFileChange} className="hidden" />
            {documentFile ? <FileText className="mx-auto mb-3" size={36} /> : <Upload className="mx-auto mb-3" size={36} />}
            <p className="font-semibold">{selectedFileLabel || "Choose one or more PDFs"}</p>
            <p className="text-sm text-slate-500">{selectedFileCount ? `${Math.ceil(selectedFileSize / 1024)} KB selected` : "Select multiple PDF files from your file manager"}</p>
          </label>

          {selectedFileCount > 1 && (
            <div className="rounded-2xl border bg-white p-4 text-sm col-span-2 md:col-span-2">
              <p className="font-semibold">Files in this order</p>
              <div className="mt-3 grid gap-2">
                {documentFiles.map((file) => (
                  <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <span className="min-w-0 truncate">{file.name}</span>
                    <span className="shrink-0 text-slate-500">{Math.ceil(file.size / 1024)} KB</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-2 md:col-span-2">
            Order document name
            <input value={documentName} onChange={(e) => setDocumentName(e.target.value)} placeholder="Assignment.pdf" className="rounded-2xl border px-4 py-3 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Estimated pages
            <input type="number" min="1" value={pages} onChange={(e) => setPages(Number(e.target.value))} className="rounded-2xl border px-4 py-3 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Page range
            <input value={selectedPages} onChange={(e) => setSelectedPages(e.target.value)} placeholder="All, or 1,3-4" className="rounded-2xl border px-4 py-3 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Copies
            <input type="number" min="1" value={copies} onChange={(e) => setCopies(Number(e.target.value))} className="rounded-2xl border px-4 py-3 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Color mode
            <select value={colorType} onChange={(e) => setColorType(e.target.value)} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
              <option value="bw">Black & White</option>
              <option value="color">Color</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Sides
            <select value={sideType} onChange={(e) => setSideType(e.target.value)} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
              <option value="single">Single side</option>
              <option value="double">Double side</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Paper size
            <select value={paperSize} onChange={(e) => setPaperSize(e.target.value)} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="Letter">Letter</option>
              <option value="Legal">Legal</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Orientation
            <select value={orientation} onChange={(e) => setOrientation(e.target.value)} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
              <option value="auto">Auto</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Pages per sheet
            <select value={pagesPerSheet} onChange={(e) => setPagesPerSheet(Number(e.target.value))} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
              <option value={1}>1 page per sheet</option>
              <option value={2}>2 pages per sheet</option>
              <option value={4}>4 pages per sheet</option>
              <option value={6}>6 pages per sheet</option>
              <option value={9}>9 pages per sheet</option>
              <option value={16}>16 pages per sheet</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Print quality
            <select value={printDpi} onChange={(e) => setPrintDpi(Number(e.target.value))} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
              <option value={203}>Draft - 203 DPI</option>
              <option value={300}>Standard - 300 DPI</option>
              <option value={600}>High - 600 DPI</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Scale
            <select value={scaleMode} onChange={(e) => setScaleMode(e.target.value)} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
              <option value="original">Original size</option>
              <option value="fit_to_page">Fit to page</option>
              <option value="fit_to_page_width">Fit to page width</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Margins
            <select value={marginMode} onChange={(e) => setMarginMode(e.target.value)} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
              <option value="default">Default</option>
              <option value="minimum">Minimum</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="flex items-center gap-3 rounded-2xl border px-4 py-3 col-span-2 md:col-span-2">
            <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />
            Add watermark to printable PDF
          </label>
          {watermark && (
            <div className="grid gap-3 rounded-2xl border bg-slate-50 p-4 col-span-2 md:col-span-2 md:grid-cols-2">
              <select value={watermarkType} onChange={(e) => setWatermarkType(e.target.value)} className="rounded-2xl border px-4 py-3">
                <option value="order_code">Order code</option>
                <option value="pickup_code">Pickup code</option>
                <option value="date_time">Date/time</option>
                <option value="custom_text">Custom text</option>
              </select>
              <select value={watermarkPosition} onChange={(e) => setWatermarkPosition(e.target.value)} className="rounded-2xl border px-4 py-3">
                <option value="bottom_right">Bottom right</option>
                <option value="bottom_center">Bottom center</option>
                <option value="bottom_left">Bottom left</option>
                <option value="center">Center</option>
                <option value="top_left">Top left</option>
                <option value="top_center">Top center</option>
                <option value="top_right">Top right</option>
              </select>
              {watermarkType === "custom_text" && (
                <input value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} placeholder="Watermark text" className="rounded-2xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300 md:col-span-2" />
              )}
              <label className="grid gap-2 text-sm font-semibold text-slate-600">
                Opacity
                <input type="range" min="0.05" max="0.6" step="0.01" value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(Number(e.target.value))} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-600">
                Rotation
                <input type="range" min="-90" max="90" step="5" value={watermarkRotation} onChange={(e) => setWatermarkRotation(Number(e.target.value))} />
              </label>
              <input type="number" min="8" max="72" value={watermarkFontSize} onChange={(e) => setWatermarkFontSize(Number(e.target.value))} placeholder="Font size" className="rounded-2xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
          )}
        </div>
      </Card>

      <div className="fixed bottom-[68px] left-0 right-0 z-40 border-t bg-white p-4 pb-3 shadow-[0_-8px_15px_rgba(0,0,0,0.08)] md:static md:bottom-auto md:z-auto md:block md:border-t-0 md:bg-transparent md:p-0 md:shadow-none">
        <Card className="rounded-none border-0 p-0 shadow-none md:rounded-2xl md:border md:p-6 md:shadow-sm">
          
          <div className="mb-3 flex items-center justify-between md:mb-0 md:block">
            <h3 className="hidden text-xl font-bold md:block">Price Summary</h3>
            
            <div className="flex w-full items-center justify-between font-bold md:hidden">
              <span className="text-sm text-slate-500">{backendPrice ? "Total" : "Est. Total"}</span>
              <span className="flex items-center text-xl text-emerald-600"><IndianRupee size={20} />{backendPrice?.totalAmount ?? totalAmount}</span>
            </div>
          </div>

          <details className="group mb-3 md:hidden">
            <summary className="flex cursor-pointer items-center text-xs font-semibold text-slate-500 outline-none">
              <span>View Price Details</span>
              <span className="ml-1 transition-transform group-open:rotate-180">▼</span>
            </summary>
            <div className="mt-3 max-h-[30vh] space-y-2 overflow-y-auto pb-2 text-xs">
              <Row label="Original Pages" value={backendPrice?.originalPageCount || pages} />
              <Row label="Selected Pages" value={backendPrice?.selectedPageCount || selectedPages || "All"} />
              <Row label="Copies" value={copies} />
              <Row label="Printable Pages" value={backendPrice?.printablePageCount || Number(estimatedSelectedPageCount || pages || 0) * Number(copies || 0)} />
              <Row label="Sheets" value={backendPrice?.sheetCount || "-"} />
              <Row label="Print Type" value={colorType === "bw" ? "B/W" : "Color"} />
              <Row label="Side" value={sideType} />
              <Row label="Pages/Sheet" value={pagesPerSheet} />
              <Row label={backendPrice ? "Backend Rate" : "Estimated Rate"} value={`₹${backendPrice?.pricePerPage ?? pricePerPage ?? 0}`} />
              {backendPrice?.files?.map((file) => (
                <Row key={file.documentId || file.fileName} label={file.fileName || "File"} value={`₹${file.totalAmount}`} />
              ))}
            </div>
          </details>

          <div className="hidden space-y-3 text-sm md:block md:mt-4">
            <Row label="Original Pages" value={backendPrice?.originalPageCount || pages} />
            <Row label="Selected Pages" value={backendPrice?.selectedPageCount || selectedPages || "All"} />
            <Row label="Copies" value={copies} />
            <Row label="Printable Pages" value={backendPrice?.printablePageCount || Number(estimatedSelectedPageCount || pages || 0) * Number(copies || 0)} />
            <Row label="Sheets" value={backendPrice?.sheetCount || "-"} />
            <Row label="Print Type" value={colorType === "bw" ? "B/W" : "Color"} />
            <Row label="Side" value={sideType} />
            <Row label="Orientation" value={orientation} />
            <Row label="Pages/Sheet" value={pagesPerSheet} />
            <Row label="Quality" value={`${printDpi} DPI`} />
            <Row label="Scale" value={scaleMode.replaceAll("_", " ")} />
            <Row label="Margins" value={marginMode} />
            <Row label="Watermark" value={watermark ? "Yes" : "No"} />
            <Row label={backendPrice ? "Backend Rate" : "Estimated Rate"} value={`₹${backendPrice?.pricePerPage ?? pricePerPage ?? 0}`} />
            {backendPrice?.files?.map((file) => (
              <Row key={file.documentId || file.fileName} label={file.fileName || "File"} value={`₹${file.totalAmount}`} />
            ))}
            <hr />
            <div className="flex items-center justify-between text-lg font-bold">
              <span>{backendPrice ? "Backend Total" : "Estimated Total"}</span>
              <span className="flex items-center"><IndianRupee size={18} />{backendPrice?.totalAmount ?? totalAmount}</span>
            </div>
          </div>

          <div className="flex gap-2">
            {!selectedCentre && (
              <button onClick={() => navigate("centre")} className="w-1/3 rounded-2xl border bg-white px-3 py-3 text-sm font-semibold hover:bg-slate-50 md:mt-6 md:w-full md:px-4 md:text-base">
                Select Centre
              </button>
            )}

            <button onClick={preparePayment} disabled={!selectedCentre || !selectedFileCount || paymentLoading} className="w-full flex-1 rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-40 md:mt-3">
              {paymentLoading ? "Calculating..." : "Continue to Payment"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
