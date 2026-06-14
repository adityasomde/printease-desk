import React, { useEffect } from "react";
import { X, Download, FileText, Image, FileCode, AlertCircle, Loader2 } from "lucide-react";
import InlineDocumentFrame from "./InlineDocumentFrame";

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  blobUrl,
  previewKind,
  fileName,
  fileType,
  fileSize,
  textContent,
  loading,
  error,
  onDownload,
}) {
  // Prevent body scrolling when modal is open
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

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Render file icon based on kind
  const renderIcon = () => {
    switch (previewKind) {
      case "image":
        return <Image className="h-12 w-12 text-blue-500" />;
      case "text":
        return <FileCode className="h-12 w-12 text-green-500" />;
      case "pdf":
        return <FileText className="h-12 w-12 text-rose-500" />;
      default:
        return <FileText className="h-12 w-12 text-slate-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto p-2 sm:items-center sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative z-10 flex max-h-[96dvh] w-full max-w-4xl flex-col rounded-3xl border border-slate-200/80 bg-white shadow-2xl transition-all duration-300 dark:border-slate-800/80 dark:bg-slate-900 sm:max-h-[90vh]">
        
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-600 dark:text-slate-400" />
              ) : (
                renderIcon()
              )}
            </div>
            <div className="truncate">
              <h3 className="truncate text-base font-semibold text-slate-800 dark:text-slate-100">
                {fileName}
              </h3>
              <p className="text-xs text-slate-400">
                {fileSize > 0 ? `${formatSize(fileSize)} • ` : ""}
                {fileType || "Unknown Type"}
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/50 p-3 dark:bg-slate-950/20 sm:p-6" style={{ WebkitOverflowScrolling: "touch" }}>
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Streaming secure preview...
              </p>
            </div>
          ) : error ? (
            <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  Preview Unavailable
                </h4>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {error}
                </p>
              </div>
              <button
                onClick={onDownload}
                className="mt-2 flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
              >
                <Download className="h-4 w-4" />
                Download Document
              </button>
            </div>
          ) : (
            <div className="flex min-h-[45vh] items-center justify-center">
              {previewKind === "pdf" && blobUrl && (
                <InlineDocumentFrame url={blobUrl} title="PDF Document Preview" className="h-[62vh] min-h-[420px] w-full shadow-inner dark:border-slate-800" />
              )}

              {previewKind === "image" && blobUrl && (
                <img
                  src={blobUrl}
                  alt={fileName}
                  className="max-h-[55vh] max-w-full rounded-xl object-contain shadow-md"
                />
              )}

              {previewKind === "text" && (
                <div className="w-full">
                  <pre className="max-h-[55vh] w-full overflow-auto rounded-xl border border-slate-200/80 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-200 shadow-inner dark:border-slate-800">
                    <code>{textContent}</code>
                  </pre>
                </div>
              )}

              {previewKind === "unsupported" && (
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                    {renderIcon()}
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                      Cannot Preview Inline
                    </h4>
                    <p className="mt-1 max-w-xs text-xs text-slate-400">
                      This file type doesn't support direct in-browser previews. You can safely download it to view locally.
                    </p>
                  </div>
                  <button
                    onClick={onDownload}
                    className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    <Download className="h-4 w-4" />
                    Download File
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-6 sm:py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Close
          </button>
          {!loading && !error && (
            <button
              onClick={onDownload}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
