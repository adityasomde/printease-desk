import { useState } from "react";
import { Download, FileText, X } from "lucide-react";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import { createDocumentSignedDownload, getOrderDocuments } from "../services/api";

export default function HistoryPage({ orders, currentUser, lastUpdatedAt }) {
  const [documentModalOrder, setDocumentModalOrder] = useState(null);
  const [orderDocuments, setOrderDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentError, setDocumentError] = useState("");

  async function openDocuments(order) {
    if (!currentUser) return;

    setDocumentModalOrder(order);
    setOrderDocuments([]);
    setDocumentError("");
    setDocumentsLoading(true);

    try {
      const data = await getOrderDocuments(order.backendId || order.id);
      setOrderDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch (error) {
      setDocumentError(error.message || "Could not load documents.");
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function downloadDocument(documentId) {
    try {
      const data = await createDocumentSignedDownload(documentId);
      if (data.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setDocumentError(error.message || "Could not create signed download link.");
    }
  }

  return (
    <Card>
      <h2 className="text-2xl font-bold">Usage History</h2>
      <p className="mt-2 text-sm text-slate-600">
        {currentUser ? `Showing records for ${currentUser.name}` : "Demo history. Login to connect this with user profile."}
        {lastUpdatedAt ? ` Last updated: ${new Date(lastUpdatedAt).toLocaleTimeString()}` : ""}
      </p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[750px] text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-3">Order ID</th>
              <th>Centre</th>
              <th>Document</th>
              <th>Pages</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Files</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="py-3 font-semibold">{item.id}</td>
                <td>{item.centre}</td>
                <td>{item.document}</td>
                <td>{item.pages} × {item.copies}</td>
                <td>₹{item.amount}</td>
                <td><StatusBadge color="green">{item.paymentStatus}</StatusBadge></td>
                <td><StatusBadge>{item.status}</StatusBadge></td>
                <td>
                  {currentUser ? (
                    <button type="button" onClick={() => openDocuments(item)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 font-semibold">
                      <FileText size={15} /> Documents
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">Login required</span>
                  )}
                </td>
                <td>{item.date}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-slate-500">
                  No print orders yet. Start a new upload when you are ready to print.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {documentModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold">Documents</h3>
                <p className="mt-1 text-sm text-slate-600">{documentModalOrder.id}</p>
              </div>
              <button type="button" onClick={() => setDocumentModalOrder(null)} className="rounded-full border p-2" aria-label="Close documents modal">
                <X size={18} />
              </button>
            </div>
            {documentError && <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{documentError}</p>}
            <div className="mt-5 grid gap-3">
              {documentsLoading && <p className="text-sm text-slate-500">Loading documents...</p>}
              {orderDocuments.map((document) => (
                <div key={document.documentId} className="rounded-2xl border p-4">
                  <p className="font-semibold">{document.fileName}</p>
                  <p className="mt-1 text-xs text-slate-500">{document.pageCount} pages · SHA-256 {document.fileSha256 || "Not available"}</p>
                  <button type="button" onClick={() => downloadDocument(document.documentId)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                    <Download size={15} /> Download original
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
