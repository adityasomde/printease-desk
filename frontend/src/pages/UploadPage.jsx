import { useEffect, useState, useMemo, useRef } from "react";
import { FileText, Upload, IndianRupee, CheckSquare, Square, X, Settings2, Eye } from "lucide-react";
import Card from "../components/Card";
import DocumentPreviewModal from "../components/DocumentPreviewModal";
import Row from "../components/Row";
import { calculateTotalAmount, getPricePerPage, countSelectedPages } from "../utils/price";
import { countSelectedPagesPreview, estimatePrintablePages, estimateGuestLimitExceeded, estimateSheets, estimatePricePreview, estimatePrintBreakdown } from "../utils/printEstimate";
import { ALLOWED_UPLOAD_ACCEPT, isAllowedUploadFile } from "../constants/upload";
import { detectUploadFileKind } from "../utils/filePreparation/detectUploadFileKind";
import {
  PREPARATION_STATUS,
  prepareUploadPreview,
  revokePreparationPreview,
} from "../utils/filePreparation/prepareUploadPreview";

export default function UploadPage({
  currentUser,
  startLogin,
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
  setBackendPrice,
  preparePayment,
  paymentLoading,
  paymentError,
  navigate,
  multiFileConfigs,
  setMultiFileConfigs,
  reprintSourceDocuments,
  setReprintSourceDocuments,
  reprintDocumentExpired,
  setReprintDocumentExpired,
}) {
  const [selectedFileIndexes, setSelectedFileIndexes] = useState([]);
  const [modalFileIndex, setModalFileIndex] = useState(null);
  const longPressTimerRef = useRef(null);
  const preparationRunRef = useRef(0);
  const filePreparationStateRef = useRef({});

  const [localPreview, setLocalPreview] = useState(null);
  const [filePreparationState, setFilePreparationState] = useState({});
  const [uploadNotice, setUploadNotice] = useState("");

  function releasePreparationState(state = filePreparationState) {
    Object.values(state || {}).forEach(revokePreparationPreview);
  }

  function handleLocalPreview(index) {
    const prepared = filePreparationState[index];
    if (prepared?.status === PREPARATION_STATUS.PREPARING) {
      setLocalPreview({
        url: "",
        kind: prepared.previewKind || "pdf",
        name: displayFiles[index]?.name || "Preparing preview",
        type: "application/pdf",
        size: 0,
        textContent: "",
        loading: true,
        error: "",
      });
      return;
    }

    if (prepared?.status === PREPARATION_STATUS.FAILED) {
      setLocalPreview({
        url: "",
        kind: prepared.previewKind || "unsupported",
        name: displayFiles[index]?.name || "Document preview",
        type: "",
        size: 0,
        textContent: "",
        loading: false,
        error: prepared.errorMessage || prepared.message || "Preview is not ready yet.",
      });
      return;
    }

    if (prepared?.status === PREPARATION_STATUS.READY && prepared.previewPdfUrl) {
      setLocalPreview({
        url: prepared.previewPdfUrl,
        kind: prepared.previewKind || "pdf",
        name: displayFiles[index]?.name || "Prepared preview",
        type: prepared.previewKind === "pdf" ? "application/pdf" : "",
        size: documentFiles[index]?.size || 0,
        textContent: prepared.textContent || "",
        loading: false,
        error: "",
        skipRevoke: true,
      });
      return;
    }

    const fileObj = documentFiles[index] || (index === 0 && documentFile);
    if (!fileObj) return;

    const mime = (fileObj.type || "").toLowerCase();
    let kind = "unsupported";
    if (mime === "application/pdf" || fileObj.name.toLowerCase().endsWith(".pdf")) {
      kind = "pdf";
    } else if (mime.startsWith("image/")) {
      kind = "image";
    } else if (mime === "text/plain" || mime === "text/csv" || mime === "application/json" || fileObj.name.toLowerCase().endsWith(".txt")) {
      kind = "text";
    }

    const localUrl = URL.createObjectURL(fileObj);

    if (kind === "text") {
      const reader = new FileReader();
      reader.onload = (e) => {
        setLocalPreview({
          url: localUrl,
          kind,
          name: fileObj.name,
          type: fileObj.type || (fileObj.name.toLowerCase().endsWith(".txt") ? "text/plain" : ""),
          size: fileObj.size,
          textContent: e.target.result,
        });
      };
      reader.readAsText(fileObj);
    } else {
      setLocalPreview({
        url: localUrl,
        kind,
        name: fileObj.name,
        type: fileObj.type || (fileObj.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : ""),
        size: fileObj.size,
        textContent: "",
      });
    }
  }

  function closeLocalPreview() {
    if (localPreview?.url && !localPreview.skipRevoke) {
      URL.revokeObjectURL(localPreview.url);
    }
    setLocalPreview(null);
  }

  useEffect(() => {
    return () => {
      if (localPreview?.url && !localPreview.skipRevoke) {
        URL.revokeObjectURL(localPreview.url);
      }
    };
  }, [localPreview]);

  useEffect(() => {
    return () => {
      releasePreparationState(filePreparationStateRef.current);
    };
  }, []); // eslint-disable-line

  useEffect(() => {
    filePreparationStateRef.current = filePreparationState;
    
    // Check if any office file was prepared in the browser
    const hasBrowserOfficePreview = Object.values(filePreparationState).some(
      (item) => item?.status === PREPARATION_STATUS.READY && item?.fileKind === "office" && item?.previewKind === "pdf"
    );

    if (hasBrowserOfficePreview) {
      const warningKey = "printease_office_accuracy_warning_seen";
      if (!sessionStorage.getItem(warningKey)) {
        window.alert("Office document preview is browser-generated and may not be 100% accurate. For precise layout, please convert your file to PDF before uploading, or wait for hub review.");
        sessionStorage.setItem(warningKey, "true");
      }
    }
  }, [filePreparationState]);

  const displayFiles = useMemo(() => {
    return documentFiles.length
      ? documentFiles.map((file) => ({ name: file.name }))
      : (reprintSourceDocuments || []).map((document) => ({
          name: document.fileName || document.file_name || "Reprint document",
          pageCount: document.pageCount || document.page_count || document.originalPageCount || document.original_pages || document.pages || null,
        }));
  }, [documentFiles, reprintSourceDocuments]);

  const isMulti = displayFiles.length > 1;

  function handleTouchStart(index) {
    longPressTimerRef.current = window.setTimeout(() => {
      setModalFileIndex(index);
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
    const indices = [];
    files.forEach((f, index) => {
      indices.push(index);
      if (!newConfigs[index]) {
        const rawPages = f.pageCount ?? f.pages ?? f.originalPageCount ?? f.original_pages ?? null;
        const knownPages = Number(rawPages);
        newConfigs[index] = {
          pages: Number.isFinite(knownPages) && knownPages > 0 ? knownPages : "",
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
    setSelectedFileIndexes(indices);
  }

  function applyPreparedPageCount(index, pageCount) {
    if (!pageCount) return;
    if (index === 0) {
      setPages(pageCount);
    }
    setMultiFileConfigs((prev) => ({
      ...prev,
      [index]: {
        ...(prev[index] || {}),
        pages: Number(pageCount),
      },
    }));
  }

  async function startFilePreparation(files) {
    const runId = preparationRunRef.current + 1;
    preparationRunRef.current = runId;

    setFilePreparationState((prev) => {
      releasePreparationState(prev);
      return Object.fromEntries(files.map((file, index) => [
        index,
        {
          status: PREPARATION_STATUS.PREPARING,
          fileKind: detectUploadFileKind(file),
          pageCount: null,
          originalFile: file,
        },
      ]));
    });

    files.forEach(async (file, index) => {
      try {
        const prepared = await prepareUploadPreview(file, {
          paperSize: multiFileConfigs[index]?.paperSize || paperSize,
          orientation: multiFileConfigs[index]?.orientation || orientation,
          hubId: selectedCentre?.id || selectedCentre?.code,
          hubLoad: selectedCentre?.hubLoad || {
            queuedEstimatedSeconds: 0,
            queuedOfficeCount: 0,
            isOnline: selectedCentre?.printerOnline ?? true,
          },
        });
        if (preparationRunRef.current !== runId) {
          revokePreparationPreview(prepared);
          return;
        }

        setFilePreparationState((prev) => ({
          ...prev,
          [index]: {
            ...prepared,
            originalFile: file,
          },
        }));
        if (prepared.status === PREPARATION_STATUS.READY && prepared.pageCount) {
          applyPreparedPageCount(index, prepared.pageCount);
        }
      } catch (error) {
        if (preparationRunRef.current !== runId) return;
        setFilePreparationState((prev) => ({
          ...prev,
          [index]: {
            status: PREPARATION_STATUS.FAILED,
            fileKind: detectUploadFileKind(file),
            pageCount: null,
            originalFile: file,
            errorMessage: error.message || "Could not prepare preview or page count.",
          },
        }));
      }
    });
  }

  function handleFileChange(event) {
    setBackendPrice?.(null);
    if (setReprintSourceDocuments) setReprintSourceDocuments([]);
    if (setReprintDocumentExpired) setReprintDocumentExpired(false);
    const files = Array.from(event.target.files || []);
    const firstFile = files[0] || null;
    const hasOfficeFile = files.some((file) => detectUploadFileKind(file) === "office");
    setUploadNotice(hasOfficeFile
      ? "DOCX, PPTX and XLSX can take longer or fail in the web browser. For faster and more accurate results, export as PDF first or use the Android app when available."
      : "");
    setDocumentFiles(files);
    setDocumentFile(firstFile);
    if (!firstFile) {
      setDocumentName("");
      setSelectedFileIndexes([]);
      setModalFileIndex(null);
      setFilePreparationState((prev) => {
        releasePreparationState(prev);
        return {};
      });
      return;
    }
    if (files.length === 1) setDocumentName(firstFile.name);
    if (files.length > 1) setDocumentName(`${files.length} uploaded documents`);
    initConfigs(files);
    startFilePreparation(files);
  }

  useEffect(() => {
    if (displayFiles.length > 1 && Object.keys(multiFileConfigs).length === 0) {
      initConfigs(displayFiles);
    }

    const handlePaste = (e) => {
      const files = Array.from(e.clipboardData?.files || []).filter(isAllowedUploadFile);
      if (files.length > 0) {
        const hasOfficeFile = files.some((file) => detectUploadFileKind(file) === "office");
        setUploadNotice(hasOfficeFile
          ? "DOCX, PPTX and XLSX can take longer or fail in the web browser. For faster and more accurate results, export as PDF first or use the Android app when available."
          : "");
        setBackendPrice?.(null);
        if (setReprintSourceDocuments) setReprintSourceDocuments([]);
        if (setReprintDocumentExpired) setReprintDocumentExpired(false);
        setDocumentFiles(files);
        setDocumentFile(files[0]);
        if (files.length === 1) setDocumentName(files[0].name);
        if (files.length > 1) setDocumentName(`${files.length} uploaded documents`);
        initConfigs(files);
        startFilePreparation(files);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [multiFileConfigs, displayFiles]); // eslint-disable-line
  
  const activeConfig = modalFileIndex !== null ? multiFileConfigs[modalFileIndex] : isMulti && selectedFileIndexes.length > 0
    ? multiFileConfigs[selectedFileIndexes[0]]
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
    setBackendPrice?.(null);
    if (modalFileIndex !== null) {
      setMultiFileConfigs((prev) => ({
        ...prev,
        [modalFileIndex]: { ...prev[modalFileIndex], [key]: value },
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

      setMultiFileConfigs((prev) => {
        if (!prev?.[0]) return prev;
        return {
          ...prev,
          0: { ...prev[0], [key]: value },
        };
      });
    } else {
      setMultiFileConfigs((prev) => {
        const next = { ...prev };
        selectedFileIndexes.forEach((index) => {
          if (next[index]) {
            next[index] = { ...next[index], [key]: value };
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
        <input type="number" min="1" value={activeConfig?.pages ?? 1} onChange={(e) => setConfigVal("pages", e.target.value === "" ? "" : Number(e.target.value))} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
        Range
        <input value={activeConfig?.selectedPages || ""} onChange={(e) => setConfigVal("selectedPages", e.target.value)} placeholder="1,3-4" className="rounded-xl border px-2 py-1.5 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600 col-span-1">
        Copies
        <input type="number" min="1" value={activeConfig?.copies ?? 1} onChange={(e) => setConfigVal("copies", e.target.value === "" ? "" : Number(e.target.value))} className="rounded-xl border px-2 py-1.5 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
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
          <input type="number" min="8" max="72" value={activeConfig?.watermarkFontSize ?? 18} onChange={(e) => setConfigVal("watermarkFontSize", e.target.value === "" ? "" : Number(e.target.value))} placeholder="Size" className="rounded-xl border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-slate-300 col-span-2 md:col-span-2" />
        </div>
      )}
    </div>
  );

  const handlePaymentClick = () => {
    const blockingPreparation = Object.values(filePreparationState).find((item) =>
      [PREPARATION_STATUS.PREPARING, PREPARATION_STATUS.FAILED].includes(item?.status)
    );
    if (blockingPreparation) {
      window.alert(blockingPreparation.errorMessage || blockingPreparation.message || "Please wait until document pricing is ready.");
      return;
    }

    if (!isMulti) {
      if (copies === "" || Number(copies) <= 0) {
        window.alert("Please enter a valid number of copies (at least 1).");
        return;
      }
      if (pages === "" || Number(pages) <= 0) {
        window.alert("Please enter a valid number of pages (at least 1).");
        return;
      }
    } else {
      for (let i = 0; i < displayFiles.length; i++) {
        const conf = multiFileConfigs[i] || {};
        const fileCopies = conf.copies ?? 1;
        const prepared = filePreparationState[i];
        const filePages = conf.pages ?? "";
        if (fileCopies === "" || Number(fileCopies) <= 0) {
          window.alert(`Please enter a valid number of copies (at least 1) for document: "${displayFiles[i].name}".`);
          return;
        }
        if (filePages === "" || Number(filePages) <= 0) {
          window.alert(`Please enter a valid number of pages (at least 1) for document: "${displayFiles[i].name}".`);
          return;
        }
      }
    }

    if (!selectedCentre) {
      navigate("centre", { state: { autoStartScanner: true, fromUpload: true } });
      return;
    }
    preparePayment(filePreparationState);
  };

  const selectedFileCount = documentFiles.length || (documentFile ? 1 : 0) || (reprintSourceDocuments ? reprintSourceDocuments.length : 0);
  const selectedFileSize = documentFiles.reduce((acc, file) => acc + file.size, documentFile?.size || 0);

  const selectedFileLabel = isMulti
    ? `${displayFiles.length} documents selected`
    : displayFiles.length > 0
    ? displayFiles[0].name
    : "";

  const preparationItems = Object.values(filePreparationState);
  const hasPreparingFiles = preparationItems.some((item) => item?.status === PREPARATION_STATUS.PREPARING);
  const failedPreparation = preparationItems.find((item) => item?.status === PREPARATION_STATUS.FAILED);
  const readyPreparationCount = preparationItems.filter((item) => item?.status === PREPARATION_STATUS.READY).length;
  const activePreparationCount = preparationItems.filter((item) =>
    item?.status === PREPARATION_STATUS.PREPARING
  ).length;
  const preparationProgress = selectedFileCount
    ? Math.round((readyPreparationCount / selectedFileCount) * 100)
    : 0;
  const hasUsableCentrePricing = Boolean(selectedCentre) && Number(pricePerPage || 0) > 0;
  const priceReady = selectedFileCount > 0 && hasUsableCentrePricing && !hasPreparingFiles && !failedPreparation;
  const canContinueForPayment = selectedFileCount > 0 && hasUsableCentrePricing && !hasPreparingFiles && !failedPreparation;
  const priceSummaryLabel = hasPreparingFiles
    ? "Calculating price..."
    : failedPreparation
      ? "Price unavailable"
      : !hasUsableCentrePricing
        ? "Select centre for price"
      : backendPrice
        ? "Total"
        : "Total";
  const priceSummaryHelp = hasPreparingFiles
    ? "Converting and counting your selected files."
    : failedPreparation
      ? failedPreparation.errorMessage || "Remove the failed file or upload it as PDF."
      : !hasUsableCentrePricing
        ? "Select a print centre with pricing before checkout."
      : "Exact price verified based on uploaded files.";
  const singlePricePending = hasPreparingFiles || failedPreparation;
  const displayMoney = (value) => (value === null || value === undefined || Number.isNaN(Number(value)) ? "Pending" : `₹${value}`);
  const displayCount = (value) => (value === null || value === undefined || value === "" || Number.isNaN(Number(value)) ? "Pending" : value);

  const multiEstimatedFiles = useMemo(() => {
    if (!isMulti) return [];
    return displayFiles.map((file, index) => {
      const config = multiFileConfigs[index] || {};
      const prepared = filePreparationState[index];
      const rawFilePages = prepared?.pageCount ?? config.pages ?? file.pageCount ?? null;
      const filePages = Number(rawFilePages);
      const hasKnownPages = Number.isFinite(filePages) && filePages > 0;
      const selectedCount = hasKnownPages
        ? (countSelectedPagesPreview(config.selectedPages, filePages) || filePages)
        : null;
      const fileCopies = Number(config.copies || 1);
      const fileRate = getPricePerPage(selectedCentre, config.colorType || "bw", config.sideType || "single");
      const hasKnownRate = Number.isFinite(Number(fileRate)) && Number(fileRate) > 0;
      const breakdown = estimatePrintBreakdown({
        pages: selectedCount || 0,
        copies: fileCopies,
        sideType: config.sideType || "single",
        pagesPerSheet: config.pagesPerSheet || 1,
      });
      const fileTotal = hasKnownPages && hasKnownRate
        ? estimatePricePreview({
            pages: selectedCount,
            copies: fileCopies,
            pricePerPage: fileRate,
            sideType: config.sideType || "single",
            pagesPerSheet: config.pagesPerSheet || 1,
            watermark: Boolean(config.watermark),
            watermarkCharge: selectedCentre?.watermarkCharge,
          })
        : null;

      return {
        name: file.name,
        pages: hasKnownPages ? filePages : null,
        selectedPages: config.selectedPages || "All",
        selectedCount,
        copies: fileCopies,
        colorType: config.colorType || "bw",
        sideType: config.sideType || "single",
        rate: hasKnownRate ? fileRate : null,
        total: fileTotal,
        sheetSides: breakdown.sheetSides,
        physicalSheets: breakdown.physicalSheets,
        preparationStatus: prepared?.status || PREPARATION_STATUS.IDLE,
        preparationMessage: prepared?.message || prepared?.errorMessage || "",
      };
    });
  }, [displayFiles, isMulti, multiFileConfigs, selectedCentre, filePreparationState]);

  const localEstimatedTotal = useMemo(() => {
    if (!isMulti) {
      return estimatePricePreview({
        pages: estimatedSelectedPageCount,
        copies,
        pricePerPage,
        sideType,
        pagesPerSheet,
        watermark,
        watermarkCharge: selectedCentre?.watermarkCharge,
      });
    }
    if (multiEstimatedFiles.some((file) => file.total === null || file.total === undefined)) return null;
    return multiEstimatedFiles.reduce((sum, file) => sum + file.total, 0);
  }, [multiEstimatedFiles, isMulti, estimatedSelectedPageCount, copies, pricePerPage, sideType, pagesPerSheet, watermark, selectedCentre?.watermarkCharge]);

  const singleBreakdown = useMemo(() => estimatePrintBreakdown({
    pages: estimatedSelectedPageCount,
    copies,
    sideType,
    pagesPerSheet,
  }), [estimatedSelectedPageCount, copies, sideType, pagesPerSheet]);

  const guestEstimatedSelectedPages = useMemo(() => {
    if (!isMulti) return Number(estimatedSelectedPageCount || 0);
    return multiEstimatedFiles.reduce((sum, file) => sum + Number(file.selectedCount || 0), 0);
  }, [isMulti, estimatedSelectedPageCount, multiEstimatedFiles]);

  const toggleSelectAll = () => {
    if (selectedFileIndexes.length === displayFiles.length) {
      setSelectedFileIndexes([]);
    } else {
      setSelectedFileIndexes(displayFiles.map((_, i) => i));
    }
  };

  const toggleSelectFile = (index) => {
    setSelectedFileIndexes((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const regularConfigurationForm = (
    <div className="grid gap-2 sm:gap-4 grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-4">
      <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-1">
        Pages
        <input type="number" min="1" value={activeConfig?.pages ?? 1} onChange={(e) => setConfigVal("pages", e.target.value === "" ? "" : Number(e.target.value))} className="w-full min-w-0 rounded-2xl border px-2 sm:px-3 py-2 text-sm sm:text-base font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-1 sm:gap-2 text-sm font-semibold text-slate-600 col-span-1 min-w-0">
        Page range
        <input value={activeConfig?.selectedPages || ""} onChange={(e) => setConfigVal("selectedPages", e.target.value)} placeholder="All, or 1,3-4" className="w-full min-w-0 rounded-2xl border px-2 sm:px-3 py-2 text-sm sm:text-base font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-1 sm:gap-2 text-sm font-semibold text-slate-600 col-span-1 min-w-0">
        Copies
        <input type="number" min="1" value={activeConfig?.copies ?? 1} onChange={(e) => setConfigVal("copies", e.target.value === "" ? "" : Number(e.target.value))} className="w-full min-w-0 rounded-2xl border px-2 sm:px-3 py-2 text-sm sm:text-base font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
      </label>
      <label className="grid gap-1 sm:gap-2 text-sm font-semibold text-slate-600 col-span-1 min-w-0">
        Color mode
        <select value={activeConfig?.colorType || "bw"} onChange={(e) => setConfigVal("colorType", e.target.value)} className="w-full min-w-0 rounded-2xl border px-2 sm:px-3 py-2 text-sm sm:text-base font-normal text-slate-900">
          <option value="bw">Black & White</option>
          <option value="color">Color</option>
        </select>
      </label>
      <label className="grid gap-1 sm:gap-2 text-sm font-semibold text-slate-600 col-span-1 min-w-0">
        Sides
        <select value={activeConfig?.sideType || "single"} onChange={(e) => setConfigVal("sideType", e.target.value)} className="w-full min-w-0 rounded-2xl border px-2 sm:px-3 py-2 text-sm sm:text-base font-normal text-slate-900">
          <option value="single">Single side</option>
          <option value="double">Double side</option>
        </select>
      </label>
      <label className="grid gap-1 sm:gap-2 text-sm font-semibold text-slate-600 col-span-1 min-w-0">
        Paper size
        <select value={activeConfig?.paperSize || "A4"} onChange={(e) => setConfigVal("paperSize", e.target.value)} className="w-full min-w-0 rounded-2xl border px-2 sm:px-3 py-2 text-sm sm:text-base font-normal text-slate-900">
          <option value="A4">A4</option>
          <option value="A3">A3</option>
          <option value="Letter">Letter</option>
          <option value="Legal">Legal</option>
        </select>
      </label>
      <label className="grid gap-1 sm:gap-2 text-sm font-semibold text-slate-600 col-span-1 min-w-0">
        Orientation
        <select value={activeConfig?.orientation || "auto"} onChange={(e) => setConfigVal("orientation", e.target.value)} className="w-full min-w-0 rounded-2xl border px-2 sm:px-3 py-2 text-sm sm:text-base font-normal text-slate-900">
          <option value="auto">Auto</option>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      <label className="grid gap-1 sm:gap-2 text-sm font-semibold text-slate-600 col-span-1 min-w-0">
        Pages per sheet
        <select value={activeConfig?.pagesPerSheet || 1} onChange={(e) => setConfigVal("pagesPerSheet", Number(e.target.value))} className="w-full min-w-0 rounded-2xl border px-2 sm:px-3 py-2 text-sm sm:text-base font-normal text-slate-900">
          <option value={1}>1 page per sheet</option>
          <option value={2}>2 pages per sheet</option>
          <option value={4}>4 pages per sheet</option>
          <option value={6}>6 pages per sheet</option>
          <option value={9}>9 pages per sheet</option>
          <option value={16}>16 pages per sheet</option>
        </select>
      </label>
      <label className="grid gap-1 sm:gap-2 text-sm font-semibold text-slate-600 col-span-1 min-w-0">
        Print quality
        <select value={activeConfig?.printDpi || 300} onChange={(e) => setConfigVal("printDpi", Number(e.target.value))} className="w-full min-w-0 rounded-2xl border px-2 sm:px-3 py-2 text-sm sm:text-base font-normal text-slate-900">
          <option value={203}>Draft - 203 DPI</option>
          <option value={300}>Standard - 300 DPI</option>
          <option value={600}>High - 600 DPI</option>
        </select>
      </label>
      <label className="grid gap-1 sm:gap-2 text-sm font-semibold text-slate-600 col-span-1 min-w-0">
        Scale
        <select value={activeConfig?.scaleMode || "original"} onChange={(e) => setConfigVal("scaleMode", e.target.value)} className="w-full min-w-0 rounded-2xl border px-2 sm:px-3 py-2 text-sm sm:text-base font-normal text-slate-900">
          <option value="original">Original size</option>
          <option value="fit_to_page">Fit to page</option>
          <option value="fit_to_page_width">Fit to page width</option>
        </select>
      </label>
      <label className="grid gap-1 sm:gap-2 text-sm font-semibold text-slate-600 col-span-1 min-[380px]:col-span-2 md:col-span-4 min-w-0">
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
          <input type="number" min="8" max="72" value={activeConfig?.watermarkFontSize ?? 18} onChange={(e) => setConfigVal("watermarkFontSize", e.target.value === "" ? "" : Number(e.target.value))} placeholder="Font size" className="rounded-2xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300 col-span-2" />
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-3 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-6">
      <Card className="lg:col-span-2 p-3 sm:p-5">
        <h2 className="text-xl sm:text-2xl font-bold min-w-0">Upload Document</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-slate-600 text-sm sm:text-base">
          <span>Selected Centre: <b>{selectedCentre?.name || "Not selected yet"}</b></span>
          <button
            type="button"
            onClick={() => navigate("centre", { state: { fromUpload: true } })}
            className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 hover:text-slate-900 transition shadow-sm"
          >
            Change Centre
          </button>
        </div>

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

        {paymentLoading && reprintSourceDocuments && reprintSourceDocuments.length > 0 && documentFiles.length === 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/50 p-4 text-sm text-sky-800 shadow-sm backdrop-blur-sm animate-pulse">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-sky-600">
              <span className="h-2 w-2 rounded-full bg-sky-500 animate-ping"></span>
            </div>
            <div>
              <p className="font-semibold text-sky-900">Restoring original documents</p>
              <p className="text-xs text-sky-700 mt-0.5">Fetching and pre-loading files from your order history...</p>
            </div>
          </div>
        )}

        {reprintDocumentExpired && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-800 shadow-sm">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 font-bold text-xs">
              !
            </div>
            <div>
              <p className="font-semibold text-amber-900">Some or all documents have expired</p>
              <p className="text-xs text-amber-700 mt-0.5">
                The original files from this order could not be retrieved from history. Please upload the documents manually to configure your reprint.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 sm:mt-6">
          <label className="cursor-pointer rounded-2xl border border-dashed bg-slate-50 p-4 sm:p-6 text-center hover:bg-slate-100 flex flex-col mb-4">
            <input type="file" accept={ALLOWED_UPLOAD_ACCEPT} multiple onChange={handleFileChange} className="hidden" />
            {displayFiles.length > 0 ? <FileText className="mx-auto mb-3 text-slate-400" size={32} /> : <Upload className="mx-auto mb-3 text-slate-400" size={32} />}
            <p className="font-semibold text-sm sm:text-base px-2 leading-tight break-words">{selectedFileLabel || "Choose one or more documents"}</p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 px-2 leading-tight">{selectedFileCount ? (selectedFileSize ? `${Math.ceil(selectedFileSize / 1024)} KB selected` : "Documents selected from history") : "Select multiple supported files"}</p>
          </label>

          {uploadNotice && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">Office document preparation may take longer on web.</p>
              <p className="mt-1">{uploadNotice}</p>
            </div>
          )}

          {!isMulti && (
            <div className="mb-4">
              <label className="grid gap-2 text-sm font-semibold text-slate-600 col-span-2 md:col-span-2">
                Order document name
                <input value={documentName} onChange={(e) => setDocumentName(e.target.value)} placeholder="Assignment.pdf" className="rounded-2xl border px-4 py-3 font-normal text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
              </label>
            </div>
          )}

          {!isMulti && displayFiles.length === 1 && (
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="text-slate-600 shrink-0" size={20} />
                <div className="min-w-0">
                  <span className="block min-w-0 truncate font-semibold text-sm text-slate-700">{displayFiles[0].name}</span>
                  {filePreparationState[0]?.status && (
                    <span className="block truncate text-xs text-slate-500">
                      {filePreparationState[0].status === PREPARATION_STATUS.READY
                        ? `${filePreparationState[0].pageCount || pages} page${Number(filePreparationState[0].pageCount || pages) === 1 ? "" : "s"} ready`
                        : filePreparationState[0].message || filePreparationState[0].errorMessage || "Preparing..."}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleLocalPreview(0)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-sm transition"
              >
                <Eye size={14} /> Preview
              </button>
            </div>
          )}

          {isMulti && (
            <div className="mb-6 rounded-2xl border bg-white p-4 text-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold text-lg">Select Files to Configure</p>
                <button onClick={toggleSelectAll} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
                  {selectedFileIndexes.length === displayFiles.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="grid gap-2 max-h-64 overflow-y-auto pr-2">
                {displayFiles.map((file, index) => {
                  const isSelected = selectedFileIndexes.includes(index);
                  const conf = multiFileConfigs[index] || {};
                  return (
                    <div
                      key={index}
                      onClick={() => toggleSelectFile(index)}
                      onTouchStart={() => handleTouchStart(index)}
                      onTouchEnd={handleTouchEnd}
                      onMouseDown={() => handleTouchStart(index)}
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
                        {filePreparationState[index]?.status && (
                          <span className={`px-2 py-0.5 rounded ${
                            filePreparationState[index].status === PREPARATION_STATUS.READY
                              ? "bg-emerald-100 text-emerald-700"
                              : filePreparationState[index].status === PREPARATION_STATUS.FAILED
                                ? "bg-rose-100 text-rose-700"
                                : "bg-amber-100 text-amber-700"
                          }`}>
                            {filePreparationState[index].status === PREPARATION_STATUS.READY
                              ? `${filePreparationState[index].pageCount || conf.pages || "?"}p`
                              : filePreparationState[index].status === PREPARATION_STATUS.FAILED
                                  ? "failed"
                                  : "calc"}
                          </span>
                        )}
                        <span className="bg-slate-200 px-2 py-0.5 rounded text-slate-700">{conf.colorType === 'bw' ? 'B/W' : 'Color'}</span>
                        <span className="bg-slate-200 px-2 py-0.5 rounded text-slate-700">{conf.copies} copy</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleLocalPreview(index); }}
                          className="p-1 text-slate-400 hover:text-slate-900"
                        >
                          <Eye size={16} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setModalFileIndex(index); }} className="ml-1 p-1 text-slate-400 hover:text-slate-900">
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
                  {selectedFileIndexes.length === 0 
                    ? "Select files above to configure" 
                    : `Configuring ${selectedFileIndexes.length} file(s)`}
                </span>
                <span className="transition-transform group-open:rotate-180 md:hidden">▼</span>
              </summary>
              <div className="p-4 border-t opacity-100 transition-opacity">
                {selectedFileIndexes.length > 0 ? (
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
              <span className="text-sm text-slate-500">{priceSummaryLabel}</span>
              <span className="flex items-center text-xl text-emerald-600">
                {priceReady && localEstimatedTotal !== null ? <><IndianRupee size={20} />{backendPrice?.totalAmount ?? localEstimatedTotal}</> : "Pending"}
              </span>
            </div>
          </div>

          <div className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold md:mt-4 ${
            priceReady
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : failedPreparation
                ? "border-rose-100 bg-rose-50 text-rose-800"
                : "border-amber-100 bg-amber-50 text-amber-800"
          }`}>
            {priceSummaryHelp}
            {(hasPreparingFiles || activePreparationCount > 0) && (
              <div className="flex items-center gap-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <span>Preparing files</span>
                  <span className="flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span
                      className={`relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500`}
                    ></span>
                  </span>
                </p>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/70">
                  <div
                    className={`h-full rounded-full transition-all duration-500 bg-emerald-500`}
                    style={{ width: `${Math.max(8, preparationProgress)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <details className="group mb-2 md:hidden">
            <summary className="flex cursor-pointer items-center text-xs font-semibold text-slate-500 outline-none">
              <span>View Price Details</span>
              <span className="ml-1 transition-transform group-open:rotate-180">▼</span>
            </summary>
            <div className="mt-2 max-h-[30vh] space-y-2 overflow-y-auto pb-2 text-xs">
              {isMulti ? (
                multiEstimatedFiles.map((file) => (
                  <div key={file.name} className="rounded-xl border border-slate-100 bg-slate-50 p-2">
                    <p className="mb-1 truncate font-semibold text-slate-900">{file.name}</p>
                    <Row label="Pages" value={file.pages ? `${file.selectedCount}/${file.pages}` : "Pending"} />
                    <Row label="Physical sheets" value={file.pages ? file.physicalSheets : "Pending"} />
                    <Row label="Copies" value={file.copies} />
                    <Row label="Mode" value={`${file.colorType === "bw" ? "B/W" : "Color"} · ${file.sideType}`} />
                    <Row label="Rate" value={file.rate ? `₹${file.rate}` : "Pending"} />
                    <Row label="Estimate" value={file.total !== null && file.preparationStatus === PREPARATION_STATUS.READY ? `₹${file.total}` : "Pending"} />
                  </div>
                ))
              ) : (
                <>
                  <Row label="Original Pages" value={singlePricePending ? "Pending" : displayCount(backendPrice?.originalPageCount || pages)} />
                  <Row label="Selected Pages" value={singlePricePending ? "Pending" : (backendPrice?.selectedPageCount || selectedPages || "All")} />
                  <Row label="Copies" value={copies} />
                  <Row label="Printable Pages" value={singlePricePending ? "Pending" : (backendPrice?.printablePageCount || estimatePrintablePages(estimatedSelectedPageCount, copies))} />
                  <Row label="Physical Sheets" value={singlePricePending ? "Pending" : (backendPrice?.physicalSheetCount || singleBreakdown.physicalSheets)} />
                  <Row label="Sheet sides" value={singlePricePending ? "Pending" : (backendPrice?.sheetCount || singleBreakdown.sheetSides)} />
                  <Row label="Print Type" value={colorType === "bw" ? "B/W" : "Color"} />
                  <Row label="Side" value={sideType} />
                  <Row label="Pages/Sheet" value={pagesPerSheet} />
                  <Row label={backendPrice ? "Backend Rate" : "Estimated Rate"} value={singlePricePending ? "Pending" : displayMoney(backendPrice?.pricePerPage ?? pricePerPage)} />
                  {backendPrice?.files?.map((file) => (
                    <Row key={file.documentId || file.fileName} label={file.fileName || "File"} value={`₹${file.totalAmount}`} />
                  ))}
                </>
              )}
            </div>
          </details>

          <div className="hidden space-y-3 text-sm md:block md:mt-4">
            {isMulti ? (
               <div className="space-y-3">
                 {multiEstimatedFiles.map((file) => (
                   <div key={file.name} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                     <div className="mb-2 flex items-start justify-between gap-3">
                       <p className="truncate font-semibold text-slate-900">{file.name}</p>
                       <span className="flex shrink-0 items-center font-bold text-emerald-700">{file.total === null ? "Pending" : <><IndianRupee size={15} />{file.total}</>}</span>
                     </div>
                     <div className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                       <Row label="Pages" value={file.pages ? `${file.selectedCount}/${file.pages}` : "Pending"} />
                       <Row label="Physical sheets" value={file.pages ? file.physicalSheets : "Pending"} />
                       <Row label="Copies" value={file.copies} />
                       <Row label="Mode" value={`${file.colorType === "bw" ? "B/W" : "Color"} · ${file.sideType}`} />
                       <Row label="Rate" value={file.rate ? `₹${file.rate}` : "Pending"} />
                       <Row label="Status" value={file.preparationStatus === PREPARATION_STATUS.READY ? "Ready" : file.preparationStatus === PREPARATION_STATUS.FAILED ? "Failed" : "Calculating"} />
                     </div>
                   </div>
                 ))}
                 <p className="text-xs text-slate-500">Office files can continue for hub desktop preparation; payment unlocks after the converted page count confirms the bill.</p>
               </div>
            ) : (
               <>
                 <Row label="Original Pages" value={singlePricePending ? "Pending" : displayCount(backendPrice?.originalPageCount || pages)} />
                 <Row label="Selected Pages" value={singlePricePending ? "Pending" : (backendPrice?.selectedPageCount || selectedPages || "All")} />
                 <Row label="Copies" value={copies} />
                 <Row label="Printable Pages" value={singlePricePending ? "Pending" : (backendPrice?.printablePageCount || estimatePrintablePages(estimatedSelectedPageCount, copies))} />
                 <Row label="Physical Sheets" value={singlePricePending ? "Pending" : (backendPrice?.physicalSheetCount || singleBreakdown.physicalSheets)} />
                 <Row label="Sheet sides" value={singlePricePending ? "Pending" : (backendPrice?.sheetCount || singleBreakdown.sheetSides)} />
                 <Row label="Print Type" value={colorType === "bw" ? "B/W" : "Color"} />
                 <Row label="Side" value={sideType} />
                 <Row label="Orientation" value={orientation} />
                 <Row label="Pages/Sheet" value={pagesPerSheet} />
                 <Row label="Quality" value={`${printDpi} DPI`} />
                 <Row label="Scale" value={scaleMode.replaceAll("_", " ")} />
                 <Row label="Margins" value={marginMode} />
                 <Row label="Watermark" value={watermark ? "Yes" : "No"} />
                 <Row label={backendPrice ? "Backend Rate" : "Estimated Rate"} value={singlePricePending ? "Pending" : displayMoney(backendPrice?.pricePerPage ?? pricePerPage)} />
                 {backendPrice?.files?.map((file) => (
                   <Row key={file.documentId || file.fileName} label={file.fileName || "File"} value={`₹${file.totalAmount}`} />
                 ))}
               </>
            )}
            <hr />
            <div className="flex items-center justify-between text-lg font-bold">
              <span>{backendPrice ? "Backend Total" : "Estimated Total"}</span>
              <span className="flex items-center">{localEstimatedTotal === null || singlePricePending ? "Pending" : <><IndianRupee size={18} />{backendPrice?.totalAmount ?? localEstimatedTotal}</>}</span>
            </div>
          </div>

          {!currentUser && (
            <div className={`mb-4 rounded-xl border p-4 text-sm ${
              estimateGuestLimitExceeded(guestEstimatedSelectedPages, currentUser)
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}>
              {estimateGuestLimitExceeded(guestEstimatedSelectedPages, currentUser) ? (
                <>
                  <p className="font-semibold">Guest limit exceeded ({guestEstimatedSelectedPages} selected pages).</p>
                  <p className="mt-1">Please login to print more than 5 pages.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Continue without login for up to 5 selected pages.</p>
                  <p className="mt-1">Login for larger orders and saved print history.</p>
                </>
              )}
              <button onClick={() => startLogin("user")} className={`mt-3 rounded-xl px-4 py-2 font-semibold text-white ${
                estimateGuestLimitExceeded(guestEstimatedSelectedPages, currentUser)
                  ? "bg-rose-900 hover:bg-rose-800"
                  : "bg-amber-900 hover:bg-amber-800"
              }`}>Login instead</button>
            </div>
          )}


          <div className="flex flex-col sm:flex-row gap-2 md:block">
            {!selectedCentre && (
              <button onClick={() => navigate("centre", { state: { autoStartScanner: true, fromUpload: true } })} className="flex-1 rounded-2xl border bg-white px-2 py-3 text-sm font-semibold hover:bg-slate-50 md:mt-6 md:w-full md:px-4 md:text-base">
                Select Centre
              </button>
            )}

            <button onClick={handlePaymentClick} disabled={!canContinueForPayment || paymentLoading} className="flex-1 rounded-2xl bg-slate-900 px-2 py-3 text-sm font-semibold text-white disabled:opacity-40 md:mt-3 md:w-full md:px-4 md:text-base">
              {paymentLoading ? "Calculating..." : !priceReady ? "Calculating price..." : (!selectedCentre ? "Select & Continue" : "Continue to Payment")}
            </button>
          </div>
        </Card>
      </div>
    
      {modalFileIndex !== null && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4 transition-opacity" onClick={() => setModalFileIndex(null)}>
          <div className="w-full max-w-2xl md:rounded-2xl rounded-t-2xl bg-white p-4 shadow-xl animate-in slide-in-from-bottom-full md:slide-in-from-bottom-10" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-lg truncate pr-4 text-slate-900">Configure {displayFiles[modalFileIndex]?.name}</h3>
              <button onClick={() => setModalFileIndex(null)} className="text-slate-500 hover:text-slate-900 rounded-full p-1 hover:bg-slate-100 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto overscroll-contain pr-2 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
              {compactConfigurationForm}
            </div>
            <div className="pt-2">
              <button onClick={() => setModalFileIndex(null)} className="w-full rounded-xl bg-slate-900 py-3.5 font-semibold text-white shadow-md hover:bg-slate-800 transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {localPreview && (
        <DocumentPreviewModal
          isOpen={true}
          onClose={closeLocalPreview}
          blobUrl={localPreview.url}
          previewKind={localPreview.kind}
          fileName={localPreview.name}
          fileType={localPreview.type}
          fileSize={localPreview.size}
          textContent={localPreview.textContent}
          loading={false}
          error=""
          onDownload={() => {
            const a = window.document.createElement("a");
            a.href = localPreview.url;
            a.download = localPreview.name;
            window.document.body.appendChild(a);
            a.click();
            window.document.body.removeChild(a);
          }}
        />
      )}
</div>
  );
}
