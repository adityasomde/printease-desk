import { Component, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import BackendStatus from "./components/BackendStatus";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import UserDashboard from "./pages/UserDashboard";
import HubDashboard from "./pages/HubDashboard";
import HubPricingPage from "./pages/HubPricingPage";
import HubPrinterAgentPage from "./pages/HubPrinterAgentPage";
import ApproveAgentPage from "./pages/ApproveAgentPage";
import DesktopAgentPage from "./pages/DesktopAgentPage";
import CentreCodePage from "./pages/CentreCodePage";
import UploadPage from "./pages/UploadPage";
import PaymentPage from "./pages/PaymentPage";
import TrackPage from "./pages/TrackPage";
import HistoryPage from "./pages/HistoryPage";
import { initialCentres, initialOrders } from "./data/demoData";
import { calculateTotalAmount, countSelectedPages, getPricePerPage } from "./utils/price";
import { clearStoredAuth, getStoredAuth, isDesktop, onPrintersUpdated, saveStoredAuth } from "./utils/desktopBridge";
import { apiRequest } from "./services/api";
import { loadRazorpayCheckout } from "./utils/razorpay";

const ROUTES = {
  home: "/",
  auth: "/auth",
  userDashboard: "/user/dashboard",
  hubDashboard: "/hub/dashboard",
  hubPricing: "/hub/pricing",
  hubPrinters: "/hub/printers",
  approveAgent: "/hub/printers/approve-agent",
  desktopAgent: "/desktop-agent",
  centre: "/centre",
  upload: "/upload",
  payment: "/payment",
  track: "/track",
  history: "/history",
};

function getPageFromPath(pathname) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const foundRoute = Object.entries(ROUTES).find(([, path]) => path === normalizedPath);
  return foundRoute?.[0] || "home";
}

function RouteNotice({ title, message, actionLabel, onAction }) {
  return (
    <section className="mx-auto max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-slate-600">{message}</p>
      {actionLabel && (
        <button onClick={onAction} className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white">
          {actionLabel}
        </button>
      )}
    </section>
  );
}

class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[PrintEase route render failed]", error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const showDetail =
      typeof window !== "undefined" &&
      (window.location.protocol === "file:" ||
        window.location.protocol === "app:" ||
        window.printeaseDesktop?.isDesktop ||
        import.meta.env.DEV);

    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-rose-700">Page failed to load</h2>
        <p className="mt-2 text-slate-600">PrintEase hit a renderer error while opening this page.</p>
        {showDetail && (
          <pre className="mt-4 overflow-x-auto rounded-xl bg-rose-50 p-4 text-xs text-rose-800">
            {this.state.error?.message || String(this.state.error)}
          </pre>
        )}
      </section>
    );
  }
}

function formatStatus(status) {
  if (!status) return "Available";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function buildPrintOptions({
  selectedPages,
  copies,
  colorType,
  sideType,
  paperSize,
  pagesPerSheet,
  watermark,
  watermarkType = "order_code",
  watermarkText = "",
  watermarkPosition = "bottom_right",
  watermarkOpacity = 0.18,
  watermarkFontSize = 18,
  watermarkRotation = 0,
}) {
  const range = String(selectedPages || "").trim();
  const hasCustomRange = range && range.toLowerCase() !== "all";

  return {
    destination: {
      selectedHubId: null,
      preferredAgentId: null,
      preferredPrinterName: null,
    },
    pages: {
      mode: hasCustomRange ? "custom" : "all",
      range: hasCustomRange ? range : "",
    },
    copies: Number(copies) || 1,
    orientation: "auto",
    colorMode: colorType === "color" ? "color" : "black_white",
    paperSize: paperSize || "A4",
    sides: sideType === "double" ? "two_sided_long_edge" : "one_sided",
    scale: {
      mode: "original",
      percent: null,
    },
    pagesPerSheet: Number(pagesPerSheet) || 1,
    margins: {
      mode: "default",
    },
    format: "original",
    headersFooters: false,
    backgrounds: true,
    watermark: {
      enabled: Boolean(watermark),
      type: watermarkType || "order_code",
      text: watermarkText || "",
      position: watermarkPosition || "bottom_right",
      opacity: Number(watermarkOpacity) || 0.18,
      fontSize: Number(watermarkFontSize) || 18,
      rotation: Number(watermarkRotation) || 0,
    },
  };
}

function normalizeCentre(centre) {
  const pricing = centre.pricing || {};

  return {
    id: centre.id,
    ownerId: centre.ownerId,
    code: centre.centreCode || centre.code,
    name: centre.name || centre.hubName,
    owner: centre.owner || "Hub Owner",
    mobile: centre.mobile || "",
    status: formatStatus(centre.status),
    upiId: centre.upiId || "",
    bwSingle: pricing.bwSingle ?? centre.bwSingle ?? 1,
    bwDouble: pricing.bwDouble ?? centre.bwDouble ?? 1.5,
    colorSingle: pricing.colorSingle ?? centre.colorSingle ?? 2,
    colorDouble: pricing.colorDouble ?? centre.colorDouble ?? 3,
    watermarkCharge: pricing.watermarkCharge ?? centre.watermarkCharge ?? 2,
  };
}

function upsertCentre(centreList, centre) {
  if (!centre) return centreList;

  const nextCentre = normalizeCentre(centre);
  const existingIndex = centreList.findIndex((item) => item.id === nextCentre.id || item.code === nextCentre.code);

  if (existingIndex === -1) return [...centreList, nextCentre];

  return centreList.map((item, index) => (index === existingIndex ? nextCentre : item));
}

function toFrontendRole(role) {
  return role;
}

function findCentreForUser(user, centreList, responseCentre) {
  if (responseCentre) return normalizeCentre(responseCentre);

  return centreList.find((centre) => centre.id === user.centreId || centre.ownerId === user.id);
}

function toCurrentUser(user, centre) {
  const role = toFrontendRole(user.role);
  const hubId = user.hubId || user.centreId || centre?.id || null;

  return {
    id: user.id,
    role,
    name: user.name,
    mobile: user.mobile,
    centreId: hubId,
    hubId,
    hubName: user.hubName || centre?.name || null,
    centreCode: user.centreCode || centre?.code || null,
    hubCode: role === "hub" ? user.centreCode || centre?.code : undefined,
  };
}

function toDisplayLabel(value) {
  if (!value) return "";
  return String(value)
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatOrderDate(value) {
  if (!value || value === "Today") return value || "Today";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function normalizeOrder(order, centreList = []) {
  const centreId = order.centreId || order.centre_id;
  const centreCodeFromOrder = order.centreCode || order.centre_code;
  const centre = centreList.find((item) => item.id === centreId || item.code === centreCodeFromOrder);
  const orderCode = order.orderCode || order.order_code || order.id;

  return {
    id: orderCode,
    backendId: order.backendId || order.id,
    centreId: centreId || centre?.id,
    centreCode: centreCodeFromOrder || centre?.code || "",
    centre: order.centre || centre?.name || "Selected centre",
    document: order.documentName || order.document_name || order.document || "Uploaded Document",
    pages: Number(order.pages || 1),
    copies: Number(order.copies || 1),
    amount: Number(order.amount || 0),
    status: toDisplayLabel(order.status || "Payment Pending"),
    date: formatOrderDate(order.createdAt || order.created_at || order.date),
    paymentStatus: toDisplayLabel(order.paymentStatus || order.payment_status || "Pending"),
    pickupCode: order.pickupCode || order.pickup_code || "",
  };
}

function upsertOrder(orderList, nextOrder) {
  const existingIndex = orderList.findIndex((item) => item.id === nextOrder.id || item.backendId === nextOrder.backendId);

  if (existingIndex === -1) return [nextOrder, ...orderList];

  return orderList.map((item, index) => (index === existingIndex ? nextOrder : item));
}

async function persistAuthSession(token, user) {
  localStorage.setItem("printease_token", token);
  localStorage.setItem("printease_user", JSON.stringify(user));

  const result = await saveStoredAuth({ token, user });
  if (result?.success === false && isDesktop()) {
    console.warn("[PrintEase desktop auth save failed]", result.error || result.message);
  }
}

function clearAuthSession() {
  localStorage.removeItem("printease_token");
  localStorage.removeItem("printease_user");

  clearStoredAuth().then((result) => {
    if (result?.success === false && isDesktop()) {
      console.warn("[PrintEase desktop auth clear failed]", result.error || result.message);
    }
  });
}

export default function App() {
  const routerNavigate = useNavigate();
  const location = useLocation();
  const page = getPageFromPath(location.pathname);
  const [profileOpen, setProfileOpen] = useState(false);
  const [desktopAvailable, setDesktopAvailable] = useState(() => isDesktop());
  const [authRole, setAuthRole] = useState("user");
  const [authMode, setAuthMode] = useState("login");
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem("printease_user");

    if (!savedUser) return null;

    try {
      return JSON.parse(savedUser);
    } catch (error) {
      localStorage.removeItem("printease_user");
      localStorage.removeItem("printease_token");
      return null;
    }
  });
  const [postAuthRedirect, setPostAuthRedirect] = useState(null);
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [hubName, setHubName] = useState("");
  const [hubCode, setHubCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [centreCode, setCentreCode] = useState("");
  const [centreLookupLoading, setCentreLookupLoading] = useState(false);
  const [centreLookupError, setCentreLookupError] = useState("");
  const [selectedCentre, setSelectedCentre] = useState(null);
  const [documentFile, setDocumentFile] = useState(null);
  const [documentFiles, setDocumentFiles] = useState([]);
  const [documentName, setDocumentName] = useState("");
  const [pages, setPages] = useState(1);
  const [selectedPages, setSelectedPages] = useState("");
  const [copies, setCopies] = useState(1);
  const [colorType, setColorType] = useState("bw");
  const [sideType, setSideType] = useState("single");
  const [paperSize, setPaperSize] = useState("A4");
  const [pagesPerSheet, setPagesPerSheet] = useState(1);
  const [watermark, setWatermark] = useState(false);
  const [watermarkType, setWatermarkType] = useState("order_code");
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkPosition, setWatermarkPosition] = useState("bottom_right");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.18);
  const [watermarkFontSize, setWatermarkFontSize] = useState(18);
  const [watermarkRotation, setWatermarkRotation] = useState(0);
  const [order, setOrder] = useState(null);
  const [backendPrice, setBackendPrice] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [pendingPayment, setPendingPayment] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("razorpay");
  const [upiQr, setUpiQr] = useState(null);
  const demoPaymentEnabled = import.meta.env.VITE_DEMO_PAYMENT_ENABLED === "true";

  const [centres, setCentres] = useState(initialCentres);
  const [orders, setOrders] = useState(initialOrders);
  const [lastOrdersUpdatedAt, setLastOrdersUpdatedAt] = useState("");

  useEffect(() => {
    setDesktopAvailable(isDesktop());
    return onPrintersUpdated(() => {
      setDesktopAvailable(true);
    });
  }, []);

  useEffect(() => {
    let ignore = false;

    apiRequest("/api/centres")
      .then((data) => {
        if (!ignore && Array.isArray(data.centres)) {
          setCentres(data.centres.map(normalizeCentre));
        }
      })
      .catch(() => {
        // Keep demo centres visible if the production API is temporarily unavailable.
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (page !== "approveAgent" || currentUser) return;

    setPostAuthRedirect(`${location.pathname}${location.search}`);
    setAuthRole("hub");
    setAuthMode("login");
    setAuthError("");
    navigate("auth", { replace: true });
  }, [page, currentUser, location.pathname, location.search]);

  useEffect(() => {
    async function restoreSession() {
      let token = localStorage.getItem("printease_token");

      if (!token && isDesktop()) {
        const stored = await getStoredAuth();
        const storedAuth = stored?.auth;

        if (stored?.success && storedAuth?.token && storedAuth?.user) {
          token = storedAuth.token;
          localStorage.setItem("printease_token", storedAuth.token);
          localStorage.setItem("printease_user", JSON.stringify(storedAuth.user));
          setCurrentUser(storedAuth.user);
        }
      }

      if (!token) return;

      try {
        const data = await apiRequest("/api/auth/me");

        if (!data || !data.user) throw new Error("Invalid session response");

        const restoredUser = data.user;

        // Always attempt to fetch fresh centres to avoid stale closures
        let freshCentres = [];
        try {
          freshCentres = await refreshCentres();
        } catch (centreError) {
          console.error("Could not refresh centres during session restore:", centreError?.message || centreError);
        }

        let signedInCentre = null;

        if (restoredUser?.role === "hub") {
          // Prefer centre info returned from the backend, otherwise search fresh centres
          signedInCentre = findCentreForUser(restoredUser, freshCentres, data.centre);
          if (!signedInCentre && data.centre) {
            signedInCentre = normalizeCentre(data.centre);
          }
        }

        if (restoredUser?.role === "hub" && !signedInCentre) {
          // If a hub user isn't linked to a centre, invalidate session
          clearAuthSession();
          setCurrentUser(null);
          return;
        }

        const finalUser = {
          ...restoredUser,
          ...(signedInCentre
            ? {
                centreId: signedInCentre.id,
                hubId: signedInCentre.id,
                centreCode: signedInCentre.code,
                hubName: signedInCentre.name,
              }
            : {}),
        };

        await persistAuthSession(token, finalUser);
        setCurrentUser(finalUser);

        if (signedInCentre) {
          setCentres((prev) => upsertCentre(prev, signedInCentre));
          setSelectedCentre(signedInCentre);
        }

        const centresForOrders = freshCentres && freshCentres.length ? freshCentres : centres;
        await loadOrdersForSession(finalUser, centresForOrders);
      } catch (error) {
        console.error("Session restore failed:", error?.message || error);

        clearAuthSession();
        setCurrentUser(null);
      }
    }

    restoreSession();
  }, []);

  const pricePerPage = useMemo(
    () => getPricePerPage(selectedCentre, colorType, sideType),
    [selectedCentre, colorType, sideType]
  );

  const estimatedSelectedPageCount = useMemo(
    () => countSelectedPages(selectedPages, pages) || pages,
    [selectedPages, pages]
  );

  const totalAmount = useMemo(
    () =>
      calculateTotalAmount({
        pages: estimatedSelectedPageCount,
        copies,
        pricePerPage,
        watermark,
        watermarkCharge: selectedCentre?.watermarkCharge,
      }),
    [estimatedSelectedPageCount, copies, pricePerPage, watermark, selectedCentre?.watermarkCharge]
  );

  const currentHub = useMemo(() => {
    if (!currentUser || currentUser.role !== "hub") return null;
    return (
      centres.find(
        (centre) =>
          centre.id === currentUser.hubId ||
          centre.id === currentUser.centreId ||
          centre.code === currentUser.hubCode ||
          centre.code === currentUser.centreCode
      ) || null
    );
  }, [currentUser, centres]);

  const hubOrders = useMemo(() => {
    if (!currentHub) return [];
    return orders.filter((item) => item.centreCode === currentHub.code || item.centreId === currentHub.id);
  }, [orders, currentHub]);

  function navigate(nextPage, options = {}) {
    if (typeof nextPage === "number") {
      routerNavigate(nextPage);
      setProfileOpen(false);
      return;
    }

    const path = ROUTES[nextPage] || nextPage || ROUTES.home;
    routerNavigate(path, options);
    setProfileOpen(false);
  }

  function startLogin(role, redirect = null) {
    if (redirect) {
      setPostAuthRedirect(redirect);
    } else if (page !== "payment") {
      setPostAuthRedirect(null);
    }
    setAuthRole(role);
    setAuthMode("login");
    setAuthError("");
    navigate("auth");
  }

  function startRegister(role) {
    setPostAuthRedirect(null);
    setAuthRole(role);
    setAuthMode("register");
    setAuthError("");
    navigate("auth");
  }

  function changeAuthRole(role) {
    setAuthRole(role);
    setAuthError("");
  }

  function changeAuthMode(mode) {
    setAuthMode(mode);
    setAuthError("");
  }

  async function refreshCentres() {
    const data = await apiRequest("/api/centres");
    const nextCentres = Array.isArray(data.centres) ? data.centres.map(normalizeCentre) : [];
    setCentres(nextCentres);
    return nextCentres;
  }

  async function loadOrdersForSession(user = currentUser, centreList = centres) {
    if (!user) return [];

    try {
      const data = await apiRequest(user.role === "hub" ? "/api/orders/centre/mine" : "/api/orders/mine");
      const nextOrders = Array.isArray(data.orders) ? data.orders.map((item) => normalizeOrder(item, centreList)) : [];
      setOrders(nextOrders);
      setLastOrdersUpdatedAt(new Date().toISOString());
      return nextOrders;
    } catch (error) {
      return [];
    }
  }

  async function handleAuthSubmit() {
    const trimmedMobile = mobile.trim();
    const trimmedName = name.trim();
    const trimmedHubName = hubName.trim();
    const trimmedHubCode = hubCode.trim();

    setAuthError("");

    if (!/^\d{10}$/.test(trimmedMobile)) {
      setAuthError("Enter a valid 10 digit mobile number.");
      return;
    }

    if (!password) {
      setAuthError("Enter your password.");
      return;
    }

    if (authMode === "register" && !trimmedName) {
      setAuthError("Enter your name.");
      return;
    }

    setAuthLoading(true);

    try {
      if (authMode === "register" && authRole === "user") {
        const data = await apiRequest("/api/auth/register-user", {
          method: "POST",
          body: JSON.stringify({ name: trimmedName, mobile: trimmedMobile, password }),
        });

        const nextUser = toCurrentUser(data.user);
        await persistAuthSession(data.token, nextUser);
        setCurrentUser(nextUser);
        await loadOrdersForSession(nextUser);
        navigate("userDashboard", { replace: true });
        return;
      }

      if (authMode === "register") {
        if (!trimmedHubName) {
          setAuthError("Enter print hub name.");
          return;
        }

        if (!trimmedHubCode) {
          setAuthError("Enter centre code.");
          return;
        }

        const data = await apiRequest("/api/auth/register-hub", {
          method: "POST",
          body: JSON.stringify({
            ownerName: trimmedName,
            mobile: trimmedMobile,
            password,
            hubName: trimmedHubName,
            centreCode: trimmedHubCode,
          }),
        });

        const centre = normalizeCentre(data.centre);
        const nextUser = toCurrentUser(data.user, centre);
        const nextCentres = upsertCentre(centres, centre);
        await persistAuthSession(data.token, nextUser);
        setCentres((prev) => upsertCentre(prev, centre));
        setCurrentUser(nextUser);
        await loadOrdersForSession(nextUser, nextCentres);
        navigate("hubDashboard", { replace: true });
        return;
      }

      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ mobile: trimmedMobile, password }),
      });

      const signedInRole = toFrontendRole(data.user.role);
      if (signedInRole !== authRole) {
        setAuthError(`This account is registered as ${signedInRole === "hub" ? "a print hub" : "a user"}. Switch the role and try again.`);
        return;
      }

      let signedInCentre = findCentreForUser(data.user, centres, data.centre);

      if (signedInRole === "hub" && !signedInCentre) {
        const freshCentres = await refreshCentres();
        signedInCentre = findCentreForUser(data.user, freshCentres);
      }

      if (signedInRole === "hub" && !signedInCentre) {
        setAuthError("No print hub is linked to this account.");
        return;
      }

      const nextUser = toCurrentUser(data.user, signedInCentre);
      await persistAuthSession(data.token, nextUser);
      const nextCentres = signedInCentre ? upsertCentre(centres, signedInCentre) : centres;
      if (signedInCentre) setCentres((prev) => upsertCentre(prev, signedInCentre));
      setCurrentUser(nextUser);
      await loadOrdersForSession(nextUser, nextCentres);
      const destination = postAuthRedirect || (signedInRole === "hub" ? "hubDashboard" : "userDashboard");
      setPostAuthRedirect(null);
      if (destination === "payment") setPaymentError("");
      navigate(destination, { replace: true });
    } catch (error) {
      setAuthError(error.message || "Authentication failed. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    clearAuthSession();
    setCurrentUser(null);
    setPostAuthRedirect(null);
    setDocumentFile(null);
    setPendingPayment(null);
    navigate("home");
  }

  const approvalReturnPath = `${location.pathname}${location.search}`;

  async function handleCentreCode() {
    const code = centreCode.trim();
    setCentreLookupError("");

    if (!code) {
      setCentreLookupError("Enter a centre code.");
      return;
    }

    const localCentre = centres.find((c) => c.code === code);
    if (localCentre) {
      setSelectedCentre(localCentre);
      navigate("upload");
      return;
    }

    setCentreLookupLoading(true);

    try {
      const data = await apiRequest(`/api/centres/${encodeURIComponent(code)}`);
      const centre = normalizeCentre(data.centre);
      setCentres((prev) => upsertCentre(prev, centre));
      setSelectedCentre(centre);
      navigate("upload");
    } catch (error) {
      setCentreLookupError(error.message || "Centre not found.");
    } finally {
      setCentreLookupLoading(false);
    }
  }

  function startDirectUpload() {
    setSelectedCentre(null);
    setPaymentError("");
    navigate("upload");
  }

  function selectCentreAndUpload(centre) {
    setSelectedCentre(centre);
    setPaymentError("");
    navigate("upload");
  }

  async function preparePayment() {
    if (!selectedCentre) {
      setPaymentError("Please select a printing centre first.");
      navigate("centre");
      return;
    }

    const filesToUpload = documentFiles.length ? documentFiles : documentFile ? [documentFile] : [];
    if (!filesToUpload.length) {
      setPaymentError("Please upload a PDF document first.");
      navigate("upload");
      return;
    }

    if (!currentUser) {
      setPaymentError("Please login before payment.");
      setPostAuthRedirect("payment");
      startLogin("user");
      return;
    }

    setPaymentLoading(true);
    setPaymentError("");
    setBackendPrice(null);

    try {
      const uploadedDocuments = [];
      for (const file of filesToUpload) {
        const formData = new FormData();
        formData.append("document", file);

        const uploadData = await apiRequest("/api/uploads", {
          method: "POST",
          body: formData,
        });

        uploadedDocuments.push(uploadData.document);
      }

      const trustedPageCount = Number(uploadedDocuments[0]?.pageCount) || pages;
      if (trustedPageCount !== pages) {
        setPages(trustedPageCount);
      }

      const printOptions = buildPrintOptions({
        selectedPages,
        copies,
        colorType,
        sideType,
        paperSize,
        pagesPerSheet,
        watermark,
        watermarkType,
        watermarkText,
        watermarkPosition,
        watermarkOpacity,
        watermarkFontSize,
        watermarkRotation,
      });

      const orderData = await apiRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          centreCode: selectedCentre.code,
          documentIds: uploadedDocuments.map((document) => document.id),
          files: uploadedDocuments.map((document) => ({
            documentId: document.id,
            documentName: document.fileName,
            selectedPages,
            copies,
            colorType,
            sideType,
            paperSize,
            pagesPerSheet,
            watermarkEnabled: watermark,
            printOptions,
          })),
          documentName: uploadedDocuments.length === 1
            ? uploadedDocuments[0]?.fileName || documentName || filesToUpload[0].name
            : `${uploadedDocuments.length} uploaded documents`,
          pages: trustedPageCount,
          selectedPages,
          copies,
          colorType,
          sideType,
          paperSize,
          pagesPerSheet,
          watermarkEnabled: watermark,
          printOptions,
        }),
      });

      const nextOrder = normalizeOrder(orderData.order, centres);
      setOrder(nextOrder);
      setOrders((prev) => upsertOrder(prev, nextOrder));
      setLastOrdersUpdatedAt(new Date().toISOString());
      setBackendPrice(orderData.price || null);
      setDocumentFile(null);
      setDocumentFiles([]);
      navigate("payment");
    } catch (error) {
      setPaymentError(error.message || "Could not upload document and calculate final price.");
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handlePayment() {
    if (!order?.backendId) {
      setPaymentError("Create a pending order before payment.");
      navigate("upload");
      return;
    }

    setPaymentLoading(true);
    setPaymentError("");

    try {
      let paymentData = null;

      if (paymentMethod === "upi_qr") {
        paymentData = await apiRequest("/api/payments/razorpay/upi-qr", {
          method: "POST",
          body: JSON.stringify({ orderId: order.backendId }),
        });
      } else {
        paymentData = await apiRequest("/api/payments/razorpay/order", {
          method: "POST",
          body: JSON.stringify({ orderId: order.backendId }),
        });
      }

      setPendingPayment(paymentData.payment || null);
      setUpiQr(paymentData.qr || null);

      if (paymentMethod === "razorpay" && paymentData.razorpay?.orderId) {
        await loadRazorpayCheckout();

        const options = {
          key: paymentData.razorpay.keyId,
          amount: paymentData.razorpay.amount,
          currency: paymentData.razorpay.currency,
          name: paymentData.razorpay.name || "PrintEase",
          description: paymentData.razorpay.description || "PrintEase order payment",
          order_id: paymentData.razorpay.orderId,
          prefill: paymentData.razorpay.prefill || {},
          notes: paymentData.razorpay.notes || {},
          handler: async function (response) {
            try {
              setPaymentLoading(true);
              setPaymentError("");

              const verifiedData = await apiRequest("/api/payments/razorpay/verify", {
                method: "POST",
                body: JSON.stringify({
                  paymentId: paymentData.payment.id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });

              const verifiedOrder = normalizeOrder(verifiedData.order || order, centres);
              setOrder(verifiedOrder);
              setOrders((prev) => upsertOrder(prev, verifiedOrder));
              setLastOrdersUpdatedAt(new Date().toISOString());
              setPendingPayment(null);
              setUpiQr(null);
              navigate("track");
            } catch (error) {
              setPaymentError(error.message || "Payment verification failed.");
            } finally {
              setPaymentLoading(false);
            }
          },
          modal: {
            ondismiss: function () {
              setPaymentError("Payment was not completed. You can retry from tracking page or pay at the shop.");
            },
          },
        };

        const razorpay = new window.Razorpay(options);
        razorpay.open();
      } else if (paymentMethod === "upi_qr") {
        navigate("track");
      }
    } catch (error) {
      setPaymentError(error.message || "Could not initialize payment.");
    } finally {
      if (paymentMethod !== "razorpay") {
        setPaymentLoading(false);
      }
    }
  }

  async function startRazorpayForExistingOrder(existingOrder = order) {
    if (!existingOrder?.backendId) {
      setPaymentError("No backend order available for payment.");
      return;
    }

    setPaymentLoading(true);
    setPaymentError("");

    try {
      const paymentData = await apiRequest("/api/payments/razorpay/order", {
        method: "POST",
        body: JSON.stringify({ orderId: existingOrder.backendId }),
      });

      setPendingPayment(paymentData.payment || null);
      await loadRazorpayCheckout();

      const razorpay = new window.Razorpay({
        key: paymentData.razorpay.keyId,
        amount: paymentData.razorpay.amount,
        currency: paymentData.razorpay.currency,
        name: paymentData.razorpay.name || "PrintEase",
        description: paymentData.razorpay.description || "PrintEase order payment",
        order_id: paymentData.razorpay.orderId,
        prefill: paymentData.razorpay.prefill || {},
        notes: paymentData.razorpay.notes || {},
        handler: async function (response) {
          try {
            setPaymentLoading(true);
            const verifiedData = await apiRequest("/api/payments/razorpay/verify", {
              method: "POST",
              body: JSON.stringify({
                paymentId: paymentData.payment.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const nextOrder = normalizeOrder(verifiedData.order || existingOrder, centres);
            setOrder(nextOrder);
            setOrders((prev) => upsertOrder(prev, nextOrder));
            setLastOrdersUpdatedAt(new Date().toISOString());
            setPendingPayment(null);
            setUpiQr(null);
          } catch (error) {
             setPaymentError(error.message || "Payment verification failed.");
          } finally {
             setPaymentLoading(false);
          }
        },
      });

      razorpay.open();
    } catch (error) {
      setPaymentError(error.message || "Could not start Razorpay payment.");
      setPaymentLoading(false);
    }
  }

  async function createUpiQrForExistingOrder(existingOrder = order) {
    if (!existingOrder?.backendId) {
      setPaymentError("No backend order available for UPI QR.");
      return;
    }

    setPaymentLoading(true);
    setPaymentError("");

    try {
      const paymentData = await apiRequest("/api/payments/razorpay/upi-qr", {
        method: "POST",
        body: JSON.stringify({ orderId: existingOrder.backendId }),
      });

      setPendingPayment(paymentData.payment || null);
      setUpiQr(paymentData.qr || null);
    } catch (error) {
      setPaymentError(error.message || "Could not create UPI QR.");
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleVerifyDemoPayment() {
    if (!pendingPayment?.id) return;
    setPaymentLoading(true);
    setPaymentError("");
    try {
      const data = await apiRequest("/api/payments/verify-demo", {
        method: "POST",
        body: JSON.stringify({ paymentId: pendingPayment.id, demoSuccess: true })
      });
      const verifiedOrder = normalizeOrder(data.order || order, centres);
      setOrder(verifiedOrder);
      setOrders(prev => upsertOrder(prev, verifiedOrder));
      setLastOrdersUpdatedAt(new Date().toISOString());
      setPendingPayment(null);
      setUpiQr(null);
    } catch (error) {
      setPaymentError(error.message || "Demo verification failed");
    } finally {
      setPaymentLoading(false);
    }
  }

  async function updateOrderStatus(orderId, nextStatus) {
    const existingOrder = orders.find((item) => item.id === orderId || item.backendId === orderId);

    try {
      if (existingOrder?.backendId) {
        const data = await apiRequest(`/api/orders/${existingOrder.backendId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        });
        const savedOrder = normalizeOrder(data.order, centres);
        setOrders((prev) => upsertOrder(prev, savedOrder));
        setLastOrdersUpdatedAt(new Date().toISOString());
        if (order?.id === orderId || order?.backendId === existingOrder.backendId) setOrder(savedOrder);
        return;
      }
    } catch (error) {
      alert(error.message || "Could not update order status.");
      return;
    }

    setOrders((prev) => prev.map((item) => (item.id === orderId ? { ...item, status: nextStatus } : item)));
    setLastOrdersUpdatedAt(new Date().toISOString());
    if (order?.id === orderId) setOrder((prev) => ({ ...prev, status: nextStatus }));
  }

  useEffect(() => {
    if (!currentUser) return;

    const shouldPollHistory = page === "history";
    const shouldPollTrack = page === "track" && order?.backendId;
    if (!shouldPollHistory && !shouldPollTrack) return;

    const intervalMs = shouldPollHistory ? 25000 : 10000;
    const interval = setInterval(async () => {
      const nextOrders = await loadOrdersForSession(currentUser, centres);
      if (shouldPollTrack && order?.backendId) {
        const nextOrder = nextOrders.find((item) => item.backendId === order.backendId || item.id === order.id);
        if (nextOrder) setOrder(nextOrder);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [page, currentUser?.id, order?.backendId]);

  async function updateCentrePrice(field, value) {
    if (!currentHub) return;

    try {
      const data = await apiRequest("/api/centres/me/pricing", {
        method: "PATCH",
        body: JSON.stringify({ [field]: Number(value) }),
      });
      const centre = normalizeCentre(data.centre);
      setCentres((prev) => upsertCentre(prev, centre));
    } catch (error) {
      alert(error.message || "Could not update pricing.");
    }
  }

  async function updateCentrePayment(field, value) {
    if (!currentHub) return;

    try {
      const data = await apiRequest("/api/centres/me/payment-method", {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      });
      const centre = normalizeCentre(data.centre);
      setCentres((prev) => upsertCentre(prev, centre));
    } catch (error) {
      alert(error.message || "Could not update payment method.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar
        page={page}
        navigate={navigate}
        profileOpen={profileOpen}
        setProfileOpen={setProfileOpen}
        currentUser={currentUser}
        desktopAvailable={desktopAvailable}
        startLogin={startLogin}
        startRegister={startRegister}
        logout={logout}
      />

      <div className={`border-b px-4 py-2 text-center text-xs font-semibold ${desktopAvailable ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        PrintEase local dev · frontend may run locally · backend Render cloud only · desktop bridge {desktopAvailable ? "connected" : "not connected"}
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <BackendStatus />

        <RouteErrorBoundary>
          <Routes>
            <Route
              path={ROUTES.home}
              element={
                <HomePage
                  navigate={navigate}
                  centres={centres}
                  startLogin={startLogin}
                  startRegister={startRegister}
                  startDirectUpload={startDirectUpload}
                  selectCentreAndUpload={selectCentreAndUpload}
                />
              }
            />

          <Route
            path={ROUTES.auth}
            element={
              <AuthPage
                authRole={authRole}
                setAuthRole={changeAuthRole}
                authMode={authMode}
                setAuthMode={changeAuthMode}
                mobile={mobile}
                setMobile={setMobile}
                password={password}
                setPassword={setPassword}
                name={name}
                setName={setName}
                hubName={hubName}
                setHubName={setHubName}
                hubCode={hubCode}
                setHubCode={setHubCode}
                handleAuthSubmit={handleAuthSubmit}
                authError={authError}
                authLoading={authLoading}
              />
            }
          />

          <Route
            path={ROUTES.userDashboard}
            element={
              currentUser?.role === "user" ? (
                <UserDashboard currentUser={currentUser} navigate={navigate} orders={orders} />
              ) : (
                <RouteNotice title="Login Required" message="Please login as a user to view your dashboard." actionLabel="Login as User" onAction={() => startLogin("user")} />
              )
            }
          />
          <Route
            path={ROUTES.hubDashboard}
            element={
              currentUser?.role === "hub" ? (
                <HubDashboard
                  currentHub={currentHub}
                  hubOrders={hubOrders}
                  updateOrderStatus={updateOrderStatus}
                  refreshOrders={() => loadOrdersForSession(currentUser, centres)}
                  navigate={navigate}
                />
              ) : (
                <RouteNotice title="Print Hub Login Required" message="Please login as a print hub to view this dashboard." actionLabel="Login as Print Hub" onAction={() => startLogin("hub")} />
              )
            }
          />
          <Route
            path={ROUTES.hubPricing}
            element={
              currentUser?.role === "hub" ? (
                <HubPricingPage currentHub={currentHub} updateCentrePrice={updateCentrePrice} updateCentrePayment={updateCentrePayment} />
              ) : (
                <RouteNotice title="Print Hub Login Required" message="Please login as a print hub to manage pricing and payment details." actionLabel="Login as Print Hub" onAction={() => startLogin("hub")} />
              )
            }
          />
          <Route
            path={ROUTES.hubPrinters}
            element={
              currentUser?.role === "hub" ? (
                <HubPrinterAgentPage navigate={navigate} />
              ) : (
                <RouteNotice title="Print Hub Login Required" message="Please login as a print hub to manage printer agents." actionLabel="Login as Print Hub" onAction={() => startLogin("hub")} />
              )
            }
          />
          <Route
            path={ROUTES.approveAgent}
            element={
              currentUser?.role === "hub" ? (
                <ApproveAgentPage currentUser={currentUser} navigate={navigate} />
              ) : currentUser ? (
                <RouteNotice title="Only Hub Accounts" message="Only hub accounts can approve desktop agents." />
              ) : (
                <RouteNotice title="Print Hub Login Required" message="Please login as a print hub to approve desktop devices." actionLabel="Login as Print Hub" onAction={() => startLogin("hub", approvalReturnPath)} />
              )
            }
          />
          <Route path={ROUTES.desktopAgent} element={<DesktopAgentPage />} />
          <Route path={ROUTES.centre} element={<CentreCodePage centreCode={centreCode} setCentreCode={setCentreCode} handleCentreCode={handleCentreCode} centres={centres} selectCentreAndUpload={selectCentreAndUpload} lookupLoading={centreLookupLoading} lookupError={centreLookupError} />} />
          <Route path={ROUTES.upload} element={<UploadPage selectedCentre={selectedCentre} documentFile={documentFile} setDocumentFile={setDocumentFile} documentFiles={documentFiles} setDocumentFiles={setDocumentFiles} documentName={documentName} setDocumentName={setDocumentName} pages={pages} setPages={setPages} selectedPages={selectedPages} setSelectedPages={setSelectedPages} copies={copies} setCopies={setCopies} colorType={colorType} setColorType={setColorType} sideType={sideType} setSideType={setSideType} paperSize={paperSize} setPaperSize={setPaperSize} pagesPerSheet={pagesPerSheet} setPagesPerSheet={setPagesPerSheet} watermark={watermark} setWatermark={setWatermark} watermarkType={watermarkType} setWatermarkType={setWatermarkType} watermarkText={watermarkText} setWatermarkText={setWatermarkText} watermarkPosition={watermarkPosition} setWatermarkPosition={setWatermarkPosition} watermarkOpacity={watermarkOpacity} setWatermarkOpacity={setWatermarkOpacity} watermarkFontSize={watermarkFontSize} setWatermarkFontSize={setWatermarkFontSize} watermarkRotation={watermarkRotation} setWatermarkRotation={setWatermarkRotation} pricePerPage={pricePerPage} estimatedSelectedPageCount={estimatedSelectedPageCount} totalAmount={totalAmount} backendPrice={backendPrice} preparePayment={preparePayment} paymentLoading={paymentLoading} paymentError={paymentError} navigate={navigate} />} />
          <Route
            path={ROUTES.payment}
            element={
              selectedCentre && order ? (
                <PaymentPage selectedCentre={selectedCentre} documentName={documentName} pages={pages} copies={copies} backendPrice={backendPrice} order={order} handlePayment={handlePayment} createUpiQr={createUpiQrForExistingOrder} paymentLoading={paymentLoading} paymentError={paymentError} />
              ) : (
                <RouteNotice title="Payment Not Ready" message="Please select a centre and upload a document first." actionLabel="Select Centre" onAction={() => navigate("centre")} />
              )
            }
          />
          <Route
            path={ROUTES.track}
            element={
              <TrackPage
                order={order}
                lastUpdatedAt={lastOrdersUpdatedAt}
                pendingPayment={pendingPayment}
                upiQr={upiQr}
                onPayOnline={startRazorpayForExistingOrder}
                onCreateUpiQr={createUpiQrForExistingOrder}
                onSimulateVerifiedPayment={demoPaymentEnabled ? handleVerifyDemoPayment : null}
                paymentLoading={paymentLoading}
                paymentError={paymentError}
              />
            }
          />
            <Route path={ROUTES.history} element={<HistoryPage orders={orders} currentUser={currentUser} lastUpdatedAt={lastOrdersUpdatedAt} />} />
            <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
          </Routes>
        </RouteErrorBoundary>
      </main>
    </div>
  );
}
