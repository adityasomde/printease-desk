export default function InlineDocumentFrame({ url, title = "Document preview", className = "" }) {
  if (!url) return null;

  const previewUrl = url.startsWith("blob:") ? url : `${url}#toolbar=0&navpanes=0`;

  return (
    <div className={`overflow-hidden rounded-xl border bg-white ${className}`}>
      <object data={previewUrl} type="application/pdf" title={title} className="h-full min-h-[55vh] w-full bg-white">
        <iframe title={title} src={previewUrl} className="h-full min-h-[55vh] w-full bg-white" />
      </object>
      <p className="border-t bg-slate-50 px-3 py-2 text-xs text-slate-500">
        If your mobile browser cannot render this PDF inline, use Download original. The file is already loaded securely in this page.
      </p>
    </div>
  );
}
