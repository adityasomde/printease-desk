export default function InlineDocumentFrame({ url, title = "Document preview", className = "" }) {
  if (!url) return null;

  const previewUrl = url.startsWith("blob:") ? url : `${url}#toolbar=0&navpanes=0`;

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border bg-white ${className}`}>
      <iframe
        title={title}
        src={previewUrl}
        className="w-full flex-1 border-0 bg-white"
        style={{ minHeight: "55vh" }}
      />
      <p className="shrink-0 border-t bg-slate-50 px-3 py-2 text-xs text-slate-500">
        If your browser cannot render this PDF inline, use the Download button. The file is already loaded securely.
      </p>
    </div>
  );
}
