import { useEffect, useMemo, useRef, useState } from "react";
import { PREPARATION_STATUS } from "../utils/filePreparation/prepareUploadPreview";

const INITIAL_AUTO_PREPARATION = {
  status: "idle",
  runId: 0,
  orderId: "",
  uploadedDocuments: [],
  message: "",
  error: "",
  startedAt: "",
  updatedAt: "",
  hasPendingDesktopFiles: false,
  configurationKey: "",
};

function fileSignature(file) {
  return `${file?.name || "file"}:${file?.size || 0}:${file?.lastModified || 0}`;
}

function buildAutoPrepareKey({ files, centre }) {
  const centreKey = centre?.id || centre?.code || "no-centre";
  const fileKey = files.map(fileSignature).join("|");
  return `${centreKey}|${fileKey}`;
}

function getOrderId(result) {
  return result?.order?.backendId || result?.order?.id || result?.raw?.order?.id || "";
}

export function useAutoUploadPreparation({
  files,
  centre,
  filePreparationState,
  preparePayment,
  configurationKey = "",
  enabled = true,
}) {
  const [autoPreparation, setAutoPreparation] = useState(INITIAL_AUTO_PREPARATION);
  const keyRef = useRef("");
  const runRef = useRef(0);

  const filesKey = useMemo(() => (files || []).map(fileSignature).join("|"), [files]);
  const preparationKey = useMemo(
    () =>
      Object.entries(filePreparationState || {})
        .map(([index, item]) => `${index}:${item?.status || "missing"}:${item?.pageCount || 0}:${item?.errorMessage || ""}`)
        .join("|"),
    [filePreparationState]
  );

  useEffect(() => {
    const selectedFiles = Array.isArray(files) ? files.filter(Boolean) : [];

    if (!enabled || !selectedFiles.length) {
      keyRef.current = "";
      setAutoPreparation(INITIAL_AUTO_PREPARATION);
      return;
    }

    if (!centre) {
      keyRef.current = "";
      setAutoPreparation((previous) => ({
        ...INITIAL_AUTO_PREPARATION,
        runId: previous.runId,
        status: "waiting_for_centre",
        message: "Files selected. Upload will start after centre selection.",
        updatedAt: new Date().toISOString(),
      }));
      return;
    }

    const preparationItems = selectedFiles.map((_, index) => filePreparationState?.[index]);
    const hasMissingPreparation = preparationItems.some((item) => !item?.status);
    const hasLocalPreparing = preparationItems.some((item) => item?.status === PREPARATION_STATUS.PREPARING);
    const failedPreparation = preparationItems.find((item) => item?.status === PREPARATION_STATUS.FAILED);

    if (hasMissingPreparation || hasLocalPreparing) {
      setAutoPreparation((previous) => ({
        ...previous,
        status: "local_preparing",
        message: "Preparing previews and page counts before hub upload.",
        error: "",
        updatedAt: new Date().toISOString(),
      }));
      return;
    }

    if (failedPreparation) {
      keyRef.current = "";
      setAutoPreparation((previous) => ({
        ...previous,
        status: "failed",
        message: "",
        error: failedPreparation.errorMessage || failedPreparation.message || "A selected file could not be prepared.",
        updatedAt: new Date().toISOString(),
      }));
      return;
    }

    const nextKey = buildAutoPrepareKey({ files: selectedFiles, centre });
    if (keyRef.current === nextKey) return;

    keyRef.current = nextKey;
    const runId = runRef.current + 1;
    runRef.current = runId;
    const startedAt = new Date().toISOString();

    setAutoPreparation({
      ...INITIAL_AUTO_PREPARATION,
      runId,
      status: "uploading",
      message: "Uploading documents so the hub desktop can prepare them early.",
      startedAt,
      updatedAt: startedAt,
      configurationKey,
    });

    let cancelled = false;

    preparePayment(filePreparationState, {
      endpoint: "/api/orders/preparation",
      navigateToPayment: false,
      clearSelectedFiles: false,
      silent: true,
    })
      .then((result) => {
        if (cancelled || runRef.current !== runId) return;
        const uploadedDocuments = Array.isArray(result?.uploadedDocuments) ? result.uploadedDocuments : [];
        const hasPendingDesktopFiles = Boolean(result?.price?.pricingPending) ||
          uploadedDocuments.some((document) => document?.requiresDesktopPreparation);

        setAutoPreparation({
          status: hasPendingDesktopFiles ? "hub_converting" : "ready",
          runId,
          orderId: getOrderId(result),
          uploadedDocuments,
          message: hasPendingDesktopFiles
            ? "Documents are with the hub desktop for conversion. Continue opens the live bill screen."
            : "Documents are uploaded and ready for payment.",
          error: "",
          startedAt,
          updatedAt: new Date().toISOString(),
          hasPendingDesktopFiles,
          configurationKey,
        });
      })
      .catch((error) => {
        if (cancelled || runRef.current !== runId) return;

        const backendMissing = error?.status === 404 || error?.status === 405;
        setAutoPreparation({
          status: backendMissing ? "idle" : "failed",
          runId,
          orderId: "",
          uploadedDocuments: [],
          message: backendMissing
            ? "Automatic hub preparation is not enabled yet. You can continue normally."
            : "",
          error: backendMissing ? "" : error?.message || "Automatic preparation failed.",
          startedAt,
          updatedAt: new Date().toISOString(),
          hasPendingDesktopFiles: false,
          configurationKey,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [centre, enabled, files, filesKey, filePreparationState, preparationKey, preparePayment]);

  return autoPreparation;
}
