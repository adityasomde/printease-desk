export default function InlineDocumentFrame({ url, title = "Document preview", className = "" }) {
  if (!url) return null;

  const separator = url.includes("#") ? "&" : "#";
  const previewUrl = `${url}${separator}toolbar=0&navpanes=0&view=FitH`;

  return (
    <div className={`flex min-h-[360px] flex-col overflow-hidden rounded-xl border bg-white ${className}`}>
      <iframe
        key={previewUrl}
        title={title}
        src={previewUrl}
        className="h-[65dvh] min-h-[360px] w-full flex-1 border-0 bg-white"
        loading="lazy"
      />
      <p className="shrink-0 border-t bg-slate-50 px-3 py-2 text-xs text-slate-600">
        If this PDF does not render inline, use the Download button. The file is already loaded securely.
      </p>
    </div>
  );
}
