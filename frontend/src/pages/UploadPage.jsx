import { useEffect, useState, useMemo, useRef } from "react";
import { FileText, Upload, IndianRupee, CheckSquare, Square, X, Settings2 } from "lucide-react";
import Card from "../components/Card";
import Row from "../components/Row";
import { calculateTotalAmount, getPricePerPage, countSelectedPages } from "../utils/price";

export default function UploadPage({
  selectedCentre,
  documentFile,
  setDocumentFile,
  documentFiles,
  setDocumentFiles,
  documentName,
  setDocumentName,
  pages, setPages,
  selectedPages, setSelectedPages,
  copies, setCopies,
  colorType, setColorType,
  sideType, setSideType,
  paperSize, setPaperSize,
  pagesPerSheet, setPagesPerSheet,
  orientation, setOrientation,
  printDpi, setPrintDpi,
  scaleMode, setScaleMode,
  marginMode, setMarginMode,
  watermark, setWatermark,
  watermarkType, setWatermarkType,
  watermarkText, setWatermarkText,
  watermarkPosition, setWatermarkPosition,
  watermarkOpacity, setWatermarkOpacity,
  watermarkFontSize, setWatermarkFontSize,
  watermarkRotation, setWatermarkRotation,
  pricePerPage,
  estimatedSelectedPageCount,
  totalAmount,
  backendPrice,
  preparePayment,
  paymentLoading,
  paymentError,
  navigate,
  multiFileConfigs,
  setMultiFileConfigs,
}) {
  const [selectedFileNames, setSelectedFileNames] = useState([]);
  const [modalFile, setModalFile] = useState(null);
  const longPressTimerRef = useRef(null);

  const isMulti = documentFiles.length > 1;

  function handleTouchStart(fileName) {
    longPressTimerRef.current = window.setTimeout(() => {
      setModalFile(fileName);
    }, 500);
  }

  function handleTouchEnd() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function initConfigs(files) {
    const newConfigs = { ...multiFileConfigs };
    const names = [];
    files.forEach((f) => {
      names.push(f.name);
      if (!newConfigs[f.name]) {
        newConfigs[f.name] = {
          pages: 1,
          selectedPages: "",
          copies: 1,
          colorType: "bw",
          sideType: "single",
          paperSize: "A4",
          pagesPerSheet: 1,
          orientation: "auto",
          printDpi: 300,
          scaleMode: "original",
          marginMode: "default",
          watermark: false,
          watermarkType: "order_code",
          watermarkText: "",
          watermarkPosition: "bottom_right",
          watermarkOpacity: 0.18,
          watermarkFontSize: 18,
          watermarkRotation: 0,
        };
      }
    });
    setMultiFileConfigs(newConfigs);
    setSelectedFileNames(names);
  }

  function handleFileChange(event) {
    const files = Array.from(event.target.files || []);
    const firstFile = files[0] || null;
    setDocumentFiles(files);
    setDocumentFile(firstFile);
    if (!firstFile) {
      setDocumentName("");
      setSelectedFileNames([]);
      setModalFile(null);
      return;
    }
    if (files.length === 1) setDocumentName(firstFile.name);
    if (files.length > 1) setDocumentName(`${files.length} uploaded documents`);
    if (files.length > 1) initConfigs(files);
  }

  useEffect(() => {
    if (documentFiles.length > 1 && Object.keys(multiFileConfigs).length === 0) {
      initConfigs(documentFiles);
    }

    const handlePaste = (e) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type === "application/pdf");
      if (files.length > 0) {
        setDocumentFiles(files);
        setDocumentFile(files[0]);
        if (files.length === 1) setDocumentName(files[0].name);
        if (files.length > 1) {
          setDocumentName(`${files.length} uploaded documents`);
          initConfigs(files);
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [multiFileConfigs, documentFiles]); // eslint-disable-line
  
  const activeConfig = modalFile ? multiFileConfigs[modalFile] : isMulti && selectedFileNames.length > 0
    ? multiFileConfigs[selectedFileNames[0]]
    : {
        pages,
        selectedPages,
        copies,
        colorType,
        sideType,
        paperSize,
        pagesPerSheet,
        orientation,
        printDpi,
        scaleMode,
        marginMode,
        watermark,
        watermarkType,
        watermarkText,
        watermarkPosition,
        watermarkOpacity,
        watermarkFontSize,
        watermarkRotation,
      };

  const setConfigVal = (key, value) => {
    if (modalFile) {
      setMultiFileConfigs((prev) => ({
        ...prev,
        [modalFile]: { ...prev[modalFile], [key]: value },
      }));
      return;
    }
    if (!isMulti) {
      if (key === "pages") setPages(value);
      else if (key === "selectedPages") setSelectedPages(value);
      else if (key === "copies") setCopies(value);
      else if (key === "colorType") setColorType(value);
      else if (key === "sideType") setSideType(value);
      else if (key === "paperSize") setPaperSize(value);
      else if (key === "pagesPerSheet") setPagesPerSheet(value);
      else if (key === "orientation") setOrientation(value);
      else if (key === "printDpi") setPrintDpi(value);
      else if (key === "scaleMode") setScaleMode(value);
      else if (key === "marginMode") setMarginMode(value);
      else if (key === "watermark") setWatermark(value);
      else if (key === "watermarkType") setWatermarkType(value);
      else if (key === "watermarkText") setWatermarkText(value);
      else if (key === "watermarkPosition") setWatermarkPosition(value);
      else if (key === "watermarkOpacity") setWatermarkOpacity(value);
      else if (key === "watermarkFontSize") setWatermarkFontSize(value);
      else if (key === "watermarkRotation") setWatermarkRotation(value);
    } else {
      setMultiFileConfigs((prev) => {
        const next = { ...prev };
        selectedFileNames.forEach((name) => {
          if (next[name]) {
            next[name] = { ...next[name], [key]: value };
          }
        });
        return next;
      });
    }
  };

  const compactConfigurationForm = (
    <div className="grid gap-2 grid-cols-2 md:grid-cols-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
        Pages
        <input type="number" min="1" value={activeConfig?.pages || 1} onChange={(e) => setConfigVal("pages", Number(e.target.value))} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
        Range
        <input value={activeConfig?.selectedPages || ""} onChange={(e) => setConfigVal("selectedPages", e.target.value)} placeholder="1,3-4" className="rounded-xl border px-2 py-1.5 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
        Copies
        <input type="number" min="1" value={activeConfig?.copies || 1} onChange={(e) => setConfigVal("copies", Number(e.target.value))} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
        Color
        <select value={activeConfig?.colorType || "bw"} onChange={(e) => setConfigVal("colorType", e.target.value)} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value="bw">B & W</option>
          <option value="color">Color</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
        Sides
        <select value={activeConfig?.sideType || "single"} onChange={(e) => setConfigVal("sideType", e.target.value)} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value="single">Single side</option>
          <option value="double">Double side</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
        Size
        <select value={activeConfig?.paperSize || "A4"} onChange={(e) => setConfigVal("paperSize", e.target.value)} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value="A4">A4</option>
          <option value="A3">A3</option>
          <option value="Letter">Letter</option>
          <option value="Legal">Legal</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
        Layout
        <select value={activeConfig?.orientation || "auto"} onChange={(e) => setConfigVal("orientation", e.target.value)} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value="auto">Auto</option>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
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
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
        DPI
        <select value={activeConfig?.printDpi || 300} onChange={(e) => setConfigVal("printDpi", Number(e.target.value))} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900">
          <option value={203}>203</option>
          <option value={300}>300</option>
          <option value={600}>600</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
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
          <select value={activeConfig?.watermarkType || "order_code"} onChange={(e) => setConfigVal("watermarkType", e.target.value)} className="rounded-xl border px-2 py-1.5 text-xs col-span-1">
            <option value="order_code">Order code</option>
            <option value="pickup_code">Pickup code</option>
            <option value="date_time">Date/time</option>
            <option value="custom_text">Custom text</option>
          </select>
          <select value={activeConfig?.watermarkPosition || "bottom_right"} onChange={(e) => setConfigVal("watermarkPosition", e.target.value)} className="rounded-xl border px-2 py-1.5 text-xs col-span-1">
            <option value="bottom_right">Bottom right</option>
            <option value="center">Center</option>
            <option value="top_left">Top left</option>
          </select>
          {activeConfig?.watermarkType === "custom_text" && (
            <input value={activeConfig?.watermarkText || ""} onChange={(e) => setConfigVal("watermarkText", e.target.value)} placeholder="Text" className="rounded-xl border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-slate-300 col-span-2 md:col-span-2" />
          )}
          <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
            Opacity
            <input type="range" min="0.05" max="0.6" step="0.01" value={activeConfig?.watermarkOpacity || 0.18} onChange={(e) => setConfigVal("watermarkOpacity", Number(e.target.value))} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
            Rotation
            <input type="range" min="-90" max="90" step="5" value={activeConfig?.watermarkRotation || 0} onChange={(e) => setConfigVal("watermarkRotation", Number(e.target.value))} />
          </label>
          <input type="number" min="8" max="72" value={activeConfig?.watermarkFontSize || 18} onChange={(e) => setConfigVal("watermarkFontSize", Number(e.target.value))} placeholder="Size" className="rounded-xl border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-slate-300 col-span-2 md:col-span-2" />
        </div>
      )}
    </div>
  );

  const handlePaymentClick = () => {
    if (!selectedCentre) {
      navigate("centre");
      return;
    }
    preparePayment();
  };

  const selectedFileCount = documentFiles?.length || (documentFile ? 1 : 0);
  const selectedFileLabel = selectedFileCount > 1 ? `${selectedFileCount} PDFs selected` : documentFile?.name;
  const selectedFileSize = (documentFiles || []).reduce((sum, file) => sum + file.size, 0) || documentFile?.size || 0;

  const localEstimatedTotal = useMemo(() => {
    if (!isMulti) return totalAmount;
    let total = 0;
    for (const f of documentFiles) {
      const c = multiFileConfigs[f.name];
      if (!c) continue;
      const ppp = getPricePerPage(selectedCentre, c.colorType, c.sideType);
      const estPages = countSelectedPages(c.selectedPages, c.pages) || c.pages;
      total += calculateTotalAmount({
        pages: estPages,
        copies: c.copies,
        pricePerPage: ppp,
        watermark: c.watermark,
        watermarkCharge: selectedCentre?.watermarkCharge,
      });
    }
    return total;
  }, [documentFiles, multiFileConfigs, selectedCentre, totalAmount, isMulti]);



  const toggleSelectAll = () => {
    if (selectedFileNames.length === documentFiles.length) {
      setSelectedFileNames([]);
    } else {
      setSelectedFileNames(documentFiles.map((f) => f.name));
    }
  };

  const toggleSelectFile = (name) => {
    setSelectedFileNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const regularConfigurationForm = (
    <div className="grid gap-2 md:gap-4 grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-1">
        Estimated pages
        <input type="number" min="1" value={activeConfig?.pages || 1} onChange={(e) => setConfigVal("pages", Number(e.target.value))} className="rounded-2xl border px-4 py-3 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-1">
        Page range
        <input value={activeConfig?.selectedPages || ""} onChange={(e) => setConfigVal("selectedPages", e.target.value)} placeholder="All, or 1,3-4" className="rounded-2xl border px-4 py-3 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-1">
        Copies
        <input type="number" min="1" value={activeConfig?.copies || 1} onChange={(e) => setConfigVal("copies", Number(e.target.value))} className="rounded-2xl border px-4 py-3 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-1">
        Color mode
        <select value={activeConfig?.colorType || "bw"} onChange={(e) => setConfigVal("colorType", e.target.value)} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
          <option value="bw">Black & White</option>
          <option value="color">Color</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-1">
        Sides
        <select value={activeConfig?.sideType || "single"} onChange={(e) => setConfigVal("sideType", e.target.value)} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
          <option value="single">Single side</option>
          <option value="double">Double side</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-1">
        Paper size
        <select value={activeConfig?.paperSize || "A4"} onChange={(e) => setConfigVal("paperSize", e.target.value)} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
          <option value="A4">A4</option>
          <option value="A3">A3</option>
          <option value="Letter">Letter</option>
          <option value="Legal">Legal</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-1">
        Orientation
        <select value={activeConfig?.orientation || "auto"} onChange={(e) => setConfigVal("orientation", e.target.value)} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
          <option value="auto">Auto</option>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-1">
        Pages per sheet
        <select value={activeConfig?.pagesPerSheet || 1} onChange={(e) => setConfigVal("pagesPerSheet", Number(e.target.value))} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
          <option value={1}>1 page per sheet</option>
          <option value={2}>2 pages per sheet</option>
          <option value={4}>4 pages per sheet</option>
          <option value={6}>6 pages per sheet</option>
          <option value={9}>9 pages per sheet</option>
          <option value={16}>16 pages per sheet</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-1">
        Print quality
        <select value={activeConfig?.printDpi || 300} onChange={(e) => setConfigVal("printDpi", Number(e.target.value))} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
          <option value={203}>Draft - 203 DPI</option>
          <option value={300}>Standard - 300 DPI</option>
          <option value={600}>High - 600 DPI</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-1">
        Scale
        <select value={activeConfig?.scaleMode || "original"} onChange={(e) => setConfigVal("scaleMode", e.target.value)} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
          <option value="original">Original size</option>
          <option value="fit_to_page">Fit to page</option>
          <option value="fit_to_page_width">Fit to page width</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-2">
        Margins
        <select value={activeConfig?.marginMode || "default"} onChange={(e) => setConfigVal("marginMode", e.target.value)} className="rounded-2xl border px-4 py-3 font-normal text-slate-900">
          <option value="default">Default</option>
          <option value="minimum">Minimum</option>
          <option value="none">None</option>
        </select>
      </label>
      <label className="flex items-center gap-3 rounded-2xl border px-4 py-3 col-span-2">
        <input type="checkbox" checked={activeConfig?.watermark || false} onChange={(e) => setConfigVal("watermark", e.target.checked)} />
        Add watermark to printable PDF
      </label>
      {activeConfig?.watermark && (
        <div className="grid gap-3 rounded-2xl border bg-slate-50 p-4 col-span-2 md:grid-cols-2">
          <select value={activeConfig?.watermarkType || "order_code"} onChange={(e) => setConfigVal("watermarkType", e.target.value)} className="rounded-2xl border px-4 py-3">
            <option value="order_code">Order code</option>
            <option value="pickup_code">Pickup code</option>
            <option value="date_time">Date/time</option>
            <option value="custom_text">Custom text</option>
          </select>
          <select value={activeConfig?.watermarkPosition || "bottom_right"} onChange={(e) => setConfigVal("watermarkPosition", e.target.value)} className="rounded-2xl border px-4 py-3">
            <option value="bottom_right">Bottom right</option>
            <option value="bottom_center">Bottom center</option>
            <option value="bottom_left">Bottom left</option>
            <option value="center">Center</option>
            <option value="top_left">Top left</option>
            <option value="top_center">Top center</option>
            <option value="top_right">Top right</option>
          </select>
          {activeConfig?.watermarkType === "custom_text" && (
            <input value={activeConfig?.watermarkText || ""} onChange={(e) => setConfigVal("watermarkText", e.target.value)} placeholder="Watermark text" className="rounded-2xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300 md:col-span-2" />
          )}
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Opacity
            <input type="range" min="0.05" max="0.6" step="0.01" value={activeConfig?.watermarkOpacity || 0.18} onChange={(e) => setConfigVal("watermarkOpacity", Number(e.target.value))} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Rotation
            <input type="range" min="-90" max="90" step="5" value={activeConfig?.watermarkRotation || 0} onChange={(e) => setConfigVal("watermarkRotation", Number(e.target.value))} />
          </label>
          <input type="number" min="8" max="72" value={activeConfig?.watermarkFontSize || 18} onChange={(e) => setConfigVal("watermarkFontSize", Number(e.target.value))} placeholder="Font size" className="rounded-2xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300 col-span-2" />
        </div>
      )}
    </div>
  );

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

        <div className="mt-6">
          <label className="cursor-pointer rounded-2xl border border-dashed bg-slate-50 p-6 text-center hover:bg-slate-100 flex flex-col mb-4">
            <input type="file" accept="application/pdf" multiple onChange={handleFileChange} className="hidden" />
            {documentFile ? <FileText className="mx-auto mb-3" size={36} /> : <Upload className="mx-auto mb-3" size={36} />}
            <p className="font-semibold">{selectedFileLabel || "Choose one or more PDFs"}</p>
            <p className="text-sm text-slate-500">{selectedFileCount ? `${Math.ceil(selectedFileSize / 1024)} KB selected` : "Select multiple PDF files from your file manager"}</p>
          </label>

          {!isMulti && (
            <div className="mb-4">
              <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-2 md:col-span-2">
                Order document name
                <input value={documentName} onChange={(e) => setDocumentName(e.target.value)} placeholder="Assignment.pdf" className="rounded-2xl border px-4 py-3 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
              </label>
            </div>
          )}

          {isMulti && (
            <div className="mb-6 rounded-2xl border bg-white p-4 text-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold text-lg">Select Files to Configure</p>
                <button onClick={toggleSelectAll} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
                  {selectedFileNames.length === documentFiles.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="grid gap-2 max-h-64 overflow-y-auto pr-2">
                {documentFiles.map((file) => {
                  const isSelected = selectedFileNames.includes(file.name);
                  const conf = multiFileConfigs[file.name] || {};
                  return (
                    <div
                      key={file.name}
                      onClick={() => toggleSelectFile(file.name)}
                      onTouchStart={() => handleTouchStart(file.name)}
                      onTouchEnd={handleTouchEnd}
                      onMouseDown={() => handleTouchStart(file.name)}
                      onMouseUp={handleTouchEnd}
                      onMouseLeave={handleTouchEnd}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition ${
                        isSelected ? "border-slate-400 bg-slate-100" : "border-transparent bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isSelected ? <CheckSquare className="text-slate-900 shrink-0" size={18} /> : <Square className="text-slate-400 shrink-0" size={18} />}
                        <span className="min-w-0 truncate font-medium">{file.name}</span>
                      </div>
                      <div className="shrink-0 flex items-center gap-2 text-slate-500 text-xs">
                        <span className="bg-slate-200 px-2 py-0.5 rounded text-slate-700">{conf.colorType === 'bw' ? 'B/W' : 'Color'}</span>
                        <span className="bg-slate-200 px-2 py-0.5 rounded text-slate-700">{conf.copies} copy</span>
                        <button onClick={(e) => { e.stopPropagation(); setModalFile(file.name); }} className="ml-1 p-1 text-slate-400 hover:text-slate-900">
                          <Settings2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isMulti ? (
            <details className="group rounded-2xl border bg-white [&_summary::-webkit-details-marker]:hidden" open>
              <summary className="flex cursor-pointer items-center justify-between p-4 outline-none">
                <span className="font-bold text-lg">
                  {selectedFileNames.length === 0 
                    ? "Select files above to configure" 
                    : `Configuring ${selectedFileNames.length} file(s)`}
                </span>
                <span className="transition-transform group-open:rotate-180 md:hidden">▼</span>
              </summary>
              <div className="p-4 border-t opacity-100 transition-opacity">
                {selectedFileNames.length > 0 ? (
                  compactConfigurationForm
                ) : (
                  <p className="text-slate-500 text-sm italic">No files selected. Check the boxes above to apply configuration.</p>
                )}
              </div>
            </details>
          ) : (
            <div className="mt-4">
              {isMulti ? compactConfigurationForm : regularConfigurationForm}
            </div>
          )}
        </div>
      </Card>
      
      {/* Spacer to prevent form hiding under sticky footer on mobile */}
      <div className="h-28 md:hidden"></div>

      <div className="fixed bottom-[68px] left-0 right-0 z-40 border-t bg-white p-3 shadow-[0_-8px_15px_rgba(0,0,0,0.08)] md:static md:bottom-auto md:z-auto md:block md:border-t-0 md:bg-transparent md:p-0 md:shadow-none">
        <Card className="rounded-none border-0 p-0 shadow-none md:rounded-2xl md:border md:p-6 md:shadow-sm">
          
          <div className="mb-2 flex items-center justify-between md:mb-0 md:block">
            <h3 className="hidden text-xl font-bold md:block">Price Summary</h3>
            
            <div className="flex w-full items-center justify-between font-bold md:hidden">
              <span className="text-sm text-slate-500">{backendPrice ? "Total" : "Est. Total"}</span>
              <span className="flex items-center text-xl text-emerald-600"><IndianRupee size={20} />{backendPrice?.totalAmount ?? localEstimatedTotal}</span>
            </div>
          </div>

          <details className="group mb-2 md:hidden">
            <summary className="flex cursor-pointer items-center text-xs font-semibold text-slate-500 outline-none">
              <span>View Price Details</span>
              <span className="ml-1 transition-transform group-open:rotate-180">▼</span>
            </summary>
            <div className="mt-2 max-h-[30vh] space-y-2 overflow-y-auto pb-2 text-xs">
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
            {isMulti ? (
               <p className="text-slate-500 italic mb-2">Detailed pricing for multiple files will be calculated at checkout.</p>
            ) : (
               <>
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
               </>
            )}
            <hr />
            <div className="flex items-center justify-between text-lg font-bold">
              <span>{backendPrice ? "Backend Total" : "Estimated Total"}</span>
              <span className="flex items-center"><IndianRupee size={18} />{backendPrice?.totalAmount ?? localEstimatedTotal}</span>
            </div>
          </div>

          <div className="flex gap-2 md:block">
            {!selectedCentre && (
              <button onClick={() => navigate("centre")} className="flex-1 rounded-2xl border bg-white px-2 py-3 text-sm font-semibold hover:bg-slate-50 md:mt-6 md:w-full md:px-4 md:text-base">
                Select Centre
              </button>
            )}

            <button onClick={handlePaymentClick} disabled={!selectedFileCount || paymentLoading} className="flex-1 rounded-2xl bg-slate-900 px-2 py-3 text-sm font-semibold text-white disabled:opacity-40 md:mt-3 md:w-full md:px-4 md:text-base">
              {paymentLoading ? "Calculating..." : (!selectedCentre ? "Select & Continue" : "Continue to Payment")}
            </button>
          </div>
        </Card>
      </div>
    
      {modalFile && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4 transition-opacity" onClick={() => setModalFile(null)}>
          <div className="w-full max-w-2xl md:rounded-2xl rounded-t-2xl bg-white p-4 shadow-xl animate-in slide-in-from-bottom-full md:slide-in-from-bottom-10" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-lg truncate pr-4 text-slate-900">Configure {modalFile}</h3>
              <button onClick={() => setModalFile(null)} className="text-slate-500 hover:text-slate-900 rounded-full p-1 hover:bg-slate-100 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto pr-2 pb-4">
              {compactConfigurationForm}
            </div>
            <div className="pt-2">
              <button onClick={() => setModalFile(null)} className="w-full rounded-xl bg-slate-900 py-3.5 font-semibold text-white shadow-md hover:bg-slate-800 transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
</div>
  );
}
