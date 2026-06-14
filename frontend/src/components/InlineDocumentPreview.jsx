import { Download, FileText, Image, FileCode } from "lucide-react";
import InlineDocumentFrame from "./InlineDocumentFrame";

function getPreviewKind({ fileType, fileName, kind }) {
  if (kind) return kind;
  const type = String(fileType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();

  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(name)) return "image";
  if (type.startsWith("text/") || type === "application/json" || /\.(txt|csv|json)$/.test(name)) return "text";
  return "unsupported";
}

export default function InlineDocumentPreview({
  url,
  fileName,
  fileType,
  kind,
  textContent,
  onDownload,
  className = "",
}) {
  const previewKind = getPreviewKind({ fileType, fileName, kind });

  if (!url && previewKind !== "text") return null;

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white ${className}`}>
      {previewKind === "pdf" && (
        <InlineDocumentFrame
          title={fileName || "PDF preview"}
          url={url}
          className="h-[62vh] min-h-[420px] w-full rounded-none border-0 sm:h-[70vh]"
        />
      )}

      {previewKind === "image" && (
        <div className="flex max-h-[70vh] min-h-[320px] items-center justify-center overflow-auto bg-slate-50 p-3">
          <img src={url} alt={fileName || "Document preview"} className="max-h-full max-w-full rounded-xl object-contain shadow-sm" />
        </div>
      )}

      {previewKind === "text" && (
        <pre className="max-h-[70vh] min-h-[320px] overflow-auto bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
          <code>{textContent || "Text preview is unavailable. Download the file to view it."}</code>
        </pre>
      )}

      {previewKind === "unsupported" && (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
          <FileText className="h-10 w-10 text-slate-400" />
          <div>
            <p className="font-semibold text-slate-900">Inline preview is not available</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              This file type cannot be rendered safely in the browser container. Download it to view locally.
            </p>
          </div>
          {onDownload && (
            <button type="button" onClick={onDownload} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              <Download size={15} /> Download file
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t bg-white px-3 py-2 text-xs text-slate-500">
        <span className="inline-flex min-w-0 items-center gap-1 truncate">
          {previewKind === "image" ? <Image size={14} /> : previewKind === "text" ? <FileCode size={14} /> : <FileText size={14} />}
          <span className="truncate">{fileName || "Document"}</span>
        </span>
        {onDownload && previewKind !== "unsupported" && (
          <button type="button" onClick={onDownload} className="shrink-0 font-semibold text-slate-800 hover:text-slate-950">
            Download
          </button>
        )}
      </div>
    </div>
  );
}
