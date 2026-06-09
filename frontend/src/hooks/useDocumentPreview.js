import { useState, useEffect, useRef, useCallback } from "react";
import { getDocumentPreviewBlob, getDocumentDownloadBlob } from "../services/api";

export function useDocumentPreview() {
  const [documentId, setDocumentId] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [previewKind, setPreviewKind] = useState("unsupported");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [textContent, setTextContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeUrlRef = useRef(null);

  const revokeActive = useCallback(() => {
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }
  }, []);

  const closePreview = useCallback(() => {
    revokeActive();
    setDocumentId(null);
    setBlobUrl(null);
    setPreviewKind("unsupported");
    setFileName("");
    setFileType("");
    setFileSize(0);
    setTextContent("");
    setError("");
  }, [revokeActive]);

  useEffect(() => {
    return () => {
      revokeActive();
    };
  }, [revokeActive]);

  const openPreview = useCallback(async (docId, name, type, size) => {
    closePreview();
    setLoading(true);
    setDocumentId(docId);
    setFileName(name || "Document");
    setFileType(type || "");
    setFileSize(size || 0);

    try {
      const blob = await getDocumentPreviewBlob(docId);
      const mime = blob.type.toLowerCase();
      let kind = "unsupported";

      if (mime === "application/pdf") {
        kind = "pdf";
      } else if (mime.startsWith("image/")) {
        kind = "image";
      } else if (mime === "text/plain" || mime === "text/csv" || mime === "application/json") {
        kind = "text";
      }

      if (kind === "text") {
        const text = await blob.text();
        setTextContent(text);
      } else {
        setTextContent("");
      }

      const url = URL.createObjectURL(blob);
      activeUrlRef.current = url;
      setBlobUrl(url);
      setPreviewKind(kind);
    } catch (err) {
      setError(err.message || "Failed to load document preview.");
    } finally {
      setLoading(false);
    }
  }, [closePreview]);

  const downloadDocument = useCallback(async (docId, name) => {
    try {
      const blob = await getDocumentDownloadBlob(docId);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = name || "document";
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || "Failed to download document.");
    }
  }, []);

  return {
    documentId,
    openPreview,
    closePreview,
    downloadDocument,
    blobUrl,
    previewKind,
    fileName,
    fileType,
    fileSize,
    textContent,
    loading,
    error
  };
}
