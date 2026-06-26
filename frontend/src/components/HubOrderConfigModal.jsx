import React, { useState, useEffect } from "react";
import { X, FileText, Settings2, ShieldAlert, Sparkles, Loader2 } from "lucide-react";

// Client-side pricing calculation mirroring the backend logic
export function calculatePrintPricingLocal({
  pricing,
  originalPageCount,
  selectedPagesMode,
  selectedPagesRange,
  copies,
  colorMode,
  sides,
  pagesPerSheet = 1,
  watermarkEnabled = false
}) {
  const pageCount = Number(originalPageCount);
  if (!Number.isFinite(pageCount) || pageCount <= 0) {
    return {
      pending: true,
      reason: "PAGE_COUNT_PENDING",
      selectedPageCount: null,
      printablePageCount: null,
      sheetCount: null,
      physicalSheetCount: null,
      pricePerPage: null,
      watermarkCharge: null,
      totalAmount: null,
      totalAmountPaise: null
    };
  }

  const copyCount = Math.max(1, parseInt(copies || 1, 10));
  
  let selectedPageCount = pageCount;
  if (selectedPagesMode === "custom" && selectedPagesRange) {
    try {
      const parts = selectedPagesRange.split(",").map(p => p.trim()).filter(Boolean);
      let count = 0;
      const parsedPages = new Set();
      
      for (const part of parts) {
        if (/^\d+$/.test(part)) {
          const pNum = parseInt(part, 10);
          if (pNum >= 1 && pNum <= pageCount) {
            parsedPages.add(pNum);
          }
        } else {
          const match = part.match(/^(\d+)\s*-\s*(\d+)$/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = parseInt(match[2], 10);
            if (start <= end && start >= 1 && end <= pageCount) {
              for (let page = start; page <= end; page++) {
                parsedPages.add(page);
              }
            }
          }
        }
      }
      if (parsedPages.size > 0) {
        selectedPageCount = parsedPages.size;
      }
    } catch (e) {
      // Fail-silent fallback to full pages
    }
  }

  const printablePageCount = selectedPageCount * copyCount;
  const sheetCount = Math.ceil(printablePageCount / pagesPerSheet);
  const physicalSheetCount = (sides === "two_sided" || sides === "two_sided_long_edge" || sides === "two_sided_short_edge")
    ? Math.ceil(sheetCount / 2)
    : sheetCount;

  const isColor = colorMode === "color";
  const isDouble = sides === "two_sided" || sides === "two_sided_long_edge" || sides === "two_sided_short_edge";

  let pricePerPage;
  if (!isColor && !isDouble) pricePerPage = pricing.bwSingle;
  else if (!isColor && isDouble) pricePerPage = pricing.bwDouble;
  else if (isColor && !isDouble) pricePerPage = pricing.colorSingle;
  else pricePerPage = pricing.colorDouble;

  const rate = Number(pricePerPage);
  if (!Number.isFinite(rate) || rate <= 0) {
    return {
      pending: true,
      reason: "PRICE_RATE_PENDING",
      selectedPageCount,
      printablePageCount,
      sheetCount,
      physicalSheetCount,
      pricePerPage: null,
      watermarkCharge: null,
      totalAmount: null,
      totalAmountPaise: null
    };
  }

  const base = printablePageCount * rate;
  const watermarkCharge = watermarkEnabled ? Number(pricing.watermarkCharge || 0) : 0;
  const totalAmount = base + watermarkCharge;

  return {
    selectedPageCount,
    printablePageCount,
    sheetCount,
    physicalSheetCount,
    pricePerPage: rate,
    watermarkCharge,
    totalAmount,
    totalAmountPaise: Math.round(totalAmount * 100)
  };
}

export default function HubOrderConfigModal({
  isOpen,
  onClose,
  order,
  files = [],
  pricing = {},
  onSave,
  isLoading = false
}) {
  const [formFiles, setFormFiles] = useState([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Prevent background scrolling when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Normalize legacy color values
  function normalizeColorMode(value) {
    if (value === "black_white" || value === "black-white" || value === "bw") return "bw";
    if (value === "color") return "color";
    return "bw";
  }

  // Normalize legacy scale values
  function normalizeScaleMode(value) {
    if (value === "fit-to-page" || value === "fit_to_page") return "fit_to_page";
    if (value === "actual-size" || value === "original") return "original";
    if (value === "shrink-to-fit" || value === "fit_to_page_width") return "fit_to_page_width";
    return "original";
  }

  // Load and prefill file options
  useEffect(() => {
    if (isOpen && Array.isArray(files)) {
      const initial = files.map(file => {
        const printOptions = file.printOptions || {};
        const wm = printOptions.watermark || {};
        return {
          id: file.id,
          fileName: file.fileName,
          originalPageCount: file.originalPageCount || file.pageCount || "",
          copies: file.copies || 1,
          colorMode: normalizeColorMode(printOptions.colorMode),
          sideType: printOptions.sideType || (printOptions.sides?.startsWith('two') ? 'double' : 'single'),
          duplexBinding: printOptions.duplexBinding || (printOptions.sides?.includes('short') ? 'short-edge' : printOptions.sides?.includes('long') ? 'long-edge' : 'auto'),
          orientation: printOptions.orientation || "auto",
          backSideRotation: printOptions.backSideRotation || "auto",
          pageOrder: printOptions.pageOrder || "normal",
          scaleMode: normalizeScaleMode(printOptions.scaleMode),
          paperSize: printOptions.paperSize || "A4",
          pagesPerSheet: Number(printOptions.pagesPerSheet) || 1,
          printDpi: Number(printOptions.printDpi || printOptions.dpi) || 300,
          marginMode: printOptions.marginMode || "default",
          pagesMode: printOptions.pages?.mode || "all",
          pagesRange: printOptions.pages?.range || "",
          watermarkEnabled: Boolean(wm.enabled),
          watermarkType: wm.type || "order_code",
          watermarkPosition: wm.position || "bottom_right",
          watermarkOpacity: Number(wm.opacity) || 0.18,
          watermarkFontSize: Number(wm.fontSize) || 18,
          watermarkRotation: Number(wm.rotation) || 0,
          watermarkText: wm.text || "",
        };
      });
      setFormFiles(initial);
      setNote("");
      setErrorMsg("");
    }
  }, [isOpen, files]);

  if (!isOpen || !order) return null;

  // Handler to update attributes of a single file in the form state
  const handleUpdateFile = (fileId, key, value) => {
    setFormFiles(prev =>
      prev.map(f => (f.id === fileId ? { ...f, [key]: value } : f))
    );
  };

  // Compile calculations for each file in the state
  const calculatedFiles = formFiles.map(file => {
    const calc = calculatePrintPricingLocal({
      pricing,
      originalPageCount: file.originalPageCount,
      selectedPagesMode: file.pagesMode,
      selectedPagesRange: file.pagesRange,
      copies: file.copies,
      colorMode: file.colorMode === "bw" ? "black_white" : file.colorMode,
      sides: file.sideType === 'double' ? 'two_sided' : 'one_sided',
      pagesPerSheet: file.pagesPerSheet || 1,
      watermarkEnabled: file.watermarkEnabled
    });
    return { ...file, calc };
  });

  const hasPendingCalculation = calculatedFiles.some((file) => file.calc?.pending);
  const totalCalculatedAmount = hasPendingCalculation
    ? null
    : calculatedFiles.reduce((sum, f) => sum + f.calc.totalAmount, 0);
  const totalPreviousAmount = Number(order.totalAmountPaise || 0) / 100;
  const isPriceDifferent = !hasPendingCalculation && Math.abs(totalCalculatedAmount - totalPreviousAmount) > 0.01;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");

    const payload = {
      note: note.trim(),
      files: calculatedFiles.map(f => ({
        id: f.id,
        copies: parseInt(f.copies, 10),
        printOptions: {
          colorMode: f.colorMode,
          sideType: f.sideType,
          duplexBinding: f.duplexBinding,
          orientation: f.orientation,
          backSideRotation: f.backSideRotation,
          pageOrder: f.pageOrder,
          scaleMode: f.scaleMode,
          paperSize: f.paperSize,
          pagesPerSheet: f.pagesPerSheet,
          printDpi: f.printDpi,
          marginMode: f.marginMode,
          pages: {
            mode: f.pagesMode,
            range: f.pagesMode === "custom" ? f.pagesRange : ""
          },
          watermark: {
            enabled: f.watermarkEnabled,
            type: f.watermarkType,
            position: f.watermarkPosition,
            opacity: f.watermarkOpacity,
            fontSize: f.watermarkFontSize,
            rotation: f.watermarkRotation,
            text: f.watermarkType === "custom_text" ? f.watermarkText : "",
          }
        }
      }))
    };

    if (hasPendingCalculation) {
      setErrorMsg("Page count or hub pricing is still pending. Confirm the bill after preparation finishes.");
      setSubmitting(false);
      return;
    }

    try {
      await onSave(payload);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Failed to update configuration.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-2 sm:items-center sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex h-auto max-h-[92dvh] sm:max-h-[90vh] w-full max-w-3xl flex-col rounded-t-3xl sm:rounded-3xl border border-slate-200/80 bg-white shadow-2xl transition-all duration-300 dark:border-slate-800/80 dark:bg-slate-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              <Settings2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Override Print Settings
              </h3>
              <p className="text-xs text-slate-400">
                Configuring Order #{order.orderCode}
              </p>
            </div>
          </div>
          
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 bg-slate-50/50 dark:bg-slate-950/20" style={{ WebkitOverflowScrolling: "touch" }}>
          {errorMsg && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-rose-50 p-4 text-sm font-medium text-rose-600 dark:bg-rose-950/20 dark:text-rose-400">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-3" />
              <p className="text-sm font-medium">Loading order details & documents...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {calculatedFiles.map((file, idx) => (
                <div
                  key={file.id}
                  className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900"
                >
                  <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <FileText className="h-5 w-5 text-indigo-500 shrink-0" />
                    <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                      File {idx + 1}: {file.fileName}
                    </span>
                    <span className="ml-auto text-xs font-semibold text-slate-400">
                      ({file.originalPageCount} pages original)
                    </span>
                  </div>

                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Copies */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Copies
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={file.copies}
                        onChange={(e) => handleUpdateFile(file.id, "copies", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        required
                      />
                    </div>

                    {/* Color Mode */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Color mode
                      </label>
                      <select
                        value={file.colorMode}
                        onChange={(e) => handleUpdateFile(file.id, "colorMode", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="bw">Black & White</option>
                        <option value="color">Color</option>
                      </select>
                    </div>

                    {/* Side Type */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Sides
                      </label>
                      <select
                        value={file.sideType}
                        onChange={(e) => handleUpdateFile(file.id, "sideType", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="single">Single side</option>
                        <option value="double">Double side</option>
                      </select>
                    </div>

                    {/* Paper Size */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Paper size
                      </label>
                      <select
                        value={file.paperSize}
                        onChange={(e) => handleUpdateFile(file.id, "paperSize", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="A4">A4</option>
                        <option value="A3">A3</option>
                        <option value="Letter">Letter</option>
                        <option value="Legal">Legal</option>
                      </select>
                    </div>

                    {/* Orientation */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Orientation
                      </label>
                      <select
                        value={file.orientation}
                        onChange={(e) => handleUpdateFile(file.id, "orientation", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="auto">Auto</option>
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </div>

                    {/* Pages per Sheet */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Pages per sheet
                      </label>
                      <select
                        value={file.pagesPerSheet}
                        onChange={(e) => handleUpdateFile(file.id, "pagesPerSheet", Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value={1}>1 page per sheet</option>
                        <option value={2}>2 pages per sheet</option>
                        <option value={4}>4 pages per sheet</option>
                        <option value={6}>6 pages per sheet</option>
                        <option value={9}>9 pages per sheet</option>
                        <option value={16}>16 pages per sheet</option>
                      </select>
                    </div>

                    {/* Print Quality / DPI */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Print quality
                      </label>
                      <select
                        value={file.printDpi}
                        onChange={(e) => handleUpdateFile(file.id, "printDpi", Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value={203}>Draft — 203 DPI</option>
                        <option value={300}>Standard — 300 DPI</option>
                        <option value={600}>High — 600 DPI</option>
                      </select>
                    </div>

                    {/* Scale */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Scale
                      </label>
                      <select
                        value={file.scaleMode}
                        onChange={(e) => handleUpdateFile(file.id, "scaleMode", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="original">Original size</option>
                        <option value="fit_to_page">Fit to page</option>
                        <option value="fit_to_page_width">Fit to page width</option>
                      </select>
                    </div>

                    {/* Margins */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Margins
                      </label>
                      <select
                        value={file.marginMode}
                        onChange={(e) => handleUpdateFile(file.id, "marginMode", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="default">Default</option>
                        <option value="minimum">Minimum</option>
                        <option value="none">None</option>
                      </select>
                    </div>

                    {/* Page Selection */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Page selection
                      </label>
                      <select
                        value={file.pagesMode}
                        onChange={(e) => handleUpdateFile(file.id, "pagesMode", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="all">All Pages</option>
                        <option value="custom">Custom Range</option>
                      </select>
                    </div>

                    {/* Custom Page Range Input */}
                    {file.pagesMode === "custom" && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                          Page range (e.g. 1-3,5)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 1-3, 5"
                          value={file.pagesRange}
                          onChange={(e) => handleUpdateFile(file.id, "pagesRange", e.target.value)}
                          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                          required
                        />
                      </div>
                    )}

                    {/* Page Order — hub-only advanced */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1 text-amber-600">
                        <Settings2 className="h-3 w-3"/> Page order
                      </label>
                      <select
                        value={file.pageOrder}
                        onChange={(e) => handleUpdateFile(file.id, "pageOrder", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      >
                        <option value="normal">Normal (1 to N)</option>
                        <option value="reverse">Reverse (N to 1)</option>
                      </select>
                    </div>

                    {/* Advanced Controls (Only if Double Sided) */}
                    {file.sideType === 'double' && (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1 text-amber-600">
                            <Settings2 className="h-3 w-3"/> Duplex binding
                          </label>
                          <select
                            value={file.duplexBinding}
                            onChange={(e) => handleUpdateFile(file.id, "duplexBinding", e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                          >
                            <option value="auto">Auto (Profile default)</option>
                            <option value="long-edge">Long Edge (Book)</option>
                            <option value="short-edge">Short Edge (Calendar)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1 text-amber-600">
                            <Settings2 className="h-3 w-3"/> Back-side rotation
                          </label>
                          <select
                            value={file.backSideRotation}
                            onChange={(e) => handleUpdateFile(file.id, "backSideRotation", e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                          >
                            <option value="auto">Auto</option>
                            <option value="normal">Normal</option>
                            <option value="rotate-180">Rotate 180°</option>
                          </select>
                        </div>
                      </>
                    )}

                    {/* Watermark toggle */}
                    <div className="flex items-center gap-2 col-span-full mt-1">
                      <input
                        type="checkbox"
                        id={`watermark-${file.id}`}
                        checked={file.watermarkEnabled}
                        onChange={(e) => handleUpdateFile(file.id, "watermarkEnabled", e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label
                        htmlFor={`watermark-${file.id}`}
                        className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        Add watermark to printable PDF
                      </label>
                    </div>

                    {/* Expanded watermark options */}
                    {file.watermarkEnabled && (
                      <div className="col-span-full grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
                          <select
                            value={file.watermarkType}
                            onChange={(e) => handleUpdateFile(file.id, "watermarkType", e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                          >
                            <option value="order_code">Order code</option>
                            <option value="pickup_code">Pickup code</option>
                            <option value="date_time">Date/time</option>
                            <option value="custom_text">Custom text</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Position</label>
                          <select
                            value={file.watermarkPosition}
                            onChange={(e) => handleUpdateFile(file.id, "watermarkPosition", e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                          >
                            <option value="bottom_right">Bottom right</option>
                            <option value="bottom_center">Bottom center</option>
                            <option value="bottom_left">Bottom left</option>
                            <option value="center">Center</option>
                            <option value="top_left">Top left</option>
                            <option value="top_center">Top center</option>
                            <option value="top_right">Top right</option>
                          </select>
                        </div>
                        {file.watermarkType === "custom_text" && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Custom text</label>
                            <input
                              value={file.watermarkText}
                              onChange={(e) => handleUpdateFile(file.id, "watermarkText", e.target.value)}
                              placeholder="Watermark text"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Opacity — {Math.round(file.watermarkOpacity * 100)}%</label>
                          <input type="range" min="0.05" max="0.6" step="0.01" value={file.watermarkOpacity} onChange={(e) => handleUpdateFile(file.id, "watermarkOpacity", Number(e.target.value))} className="w-full accent-indigo-600" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Rotation — {file.watermarkRotation}°</label>
                          <input type="range" min="-90" max="90" step="5" value={file.watermarkRotation} onChange={(e) => handleUpdateFile(file.id, "watermarkRotation", Number(e.target.value))} className="w-full accent-indigo-600" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Font size</label>
                          <input type="number" min="8" max="72" value={file.watermarkFontSize} onChange={(e) => handleUpdateFile(file.id, "watermarkFontSize", e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* File Pricing Summary */}
                  <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-500 dark:bg-slate-950/40 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Selected: <strong>{file.calc.pending ? "Pending" : file.calc.selectedPageCount}</strong> pgs</span>
                    <span>Printable: <strong>{file.calc.pending ? "Pending" : file.calc.printablePageCount}</strong> pgs</span>
                    <span>Sheets: <strong>{file.calc.pending ? "Pending" : file.calc.physicalSheetCount}</strong> sheets</span>
                    <span className="ml-auto text-indigo-600 dark:text-indigo-400">
                      File total: <strong>{file.calc.pending ? "Pending" : `₹${file.calc.totalAmount.toFixed(2)}`}</strong>
                    </span>
                  </div>
                </div>
              ))}

              {/* Note/Audit Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Note / Reason for configuration override (Required)
                </label>
                <textarea
                  placeholder="Describe why you are overrides configurations (e.g. User requested double sided, user wanted 2 copies)..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full h-20 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 resize-none"
                  required
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-100 px-6 py-4 dark:border-slate-800 gap-4 bg-slate-50/50 dark:bg-slate-900">
          <div className="text-left">
            <span className="text-xs text-slate-400 font-medium block">Total Price Summary</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {hasPendingCalculation ? "Pending" : `₹${totalCalculatedAmount.toFixed(2)}`}
              </span>
              {isPriceDifferent && (
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Was ₹{totalPreviousAmount.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200"
              disabled={submitting || !note.trim() || isLoading || formFiles.length === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving Changes
                </>
              ) : (
                "Save Configuration"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
