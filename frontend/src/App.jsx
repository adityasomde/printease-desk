import { Component, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { emitOrderChanged } from "./utils/appEvents";
import Navbar from "./components/Navbar";
import BackendStatus from "./components/BackendStatus";
import { RouteNotice } from "./components/RouteNotice";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { hubActivityStore } from "./state/hubActivityStore";

const HubHistoryPage = lazy(() => import("./pages/HubHistoryPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const HubDashboard = lazy(() => import("./pages/HubDashboard"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const HubPricingPage = lazy(() => import("./pages/HubPricingPage"));
const HubPrinterAgentPage = lazy(() => import("./pages/HubPrinterAgentPage"));
const ApproveAgentPage = lazy(() => import("./pages/ApproveAgentPage"));
const DesktopAgentPage = lazy(() => import("./pages/DesktopAgentPage"));
const CentreCodePage = lazy(() => import("./pages/CentreCodePage"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
const PaymentPage = lazy(() => import("./pages/PaymentPage"));
const TrackPage = lazy(() => import("./pages/TrackPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const PlatformStatsPage = lazy(() => import("./pages/PlatformStatsPage"));
import { initialCentres, initialOrders } from "./data/demoData";
import { calculateTotalAmount, countSelectedPages, getPricePerPage } from "./utils/price";
import { countSelectedPagesPreview, estimatePricePreview } from "./utils/printEstimate";
import { clearStoredAuth, getStoredAuth, isDesktop, onPrintersUpdated, saveStoredAuth } from "./utils/desktopBridge";
import { apiRequest, invalidateUserHistory, createDocumentSignedDownload, getOrderDetail, reprintOrder } from "./services/api";
import { loadRazorpayCheckout } from "./utils/razorpay";
import { saveOrderToLocalHistory } from "./utils/localHistory";
import {
  clearSupabaseUrlSession,
  getSupabaseUser,
  readSupabaseSessionFromUrl,
} from "./utils/supabaseAuth";
import { handleDesktopAutoRegistration } from "./utils/desktopAutoRegistration";
import { prepareBrowserPrintReadyFile } from "./utils/filePreparation/prepareBrowserPrintReadyFile";

const ROUTES = {
  home: "/",
  auth: "/auth",
  userDashboard: "/user/dashboard",
  hubDashboard: "/hub/dashboard",
  hubPricing: "/hub/pricing",
  hubPrinters: "/hub/printers",
  approveAgent: "/hub/printers/approve-agent",
  desktopAgent: "/desktop-agent",
  profile: "/profile",
  centre: "/centre",
  upload: "/upload",
  payment: "/payment",
  track: "/track",
  history: "/history",
  orderHistory: "/order-history",
  usageHistory: "/usage-history",
  platformStats: "/platform-metrics-dashboard",
  hubHistory: "/hub/history",
};

function getPageFromPath(pathname) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const foundRoute = Object.entries(ROUTES).find(([, path]) => path === normalizedPath);
  return foundRoute?.[0] || "home";
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
  orientation = "auto",
  printDpi = 300,
  scaleMode = "original",
  marginMode = "default",
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
    orientation,
    colorMode: colorType === "color" ? "color" : "black_white",
    paperSize: paperSize || "A4",
    sides: sideType === "double" ? "two_sided_long_edge" : "one_sided",
    scale: {
      mode: scaleMode || "original",
      percent: null,
    },
    pagesPerSheet: Number(pagesPerSheet) || 1,
    margins: {
      mode: marginMode || "default",
    },
    quality: {
      dpi: Number(printDpi) || 300,
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
    upiQrImageUrl: centre.upiQrImageUrl || centre.upi_qr_image_url || "",
    bwSingle: pricing.bwSingle ?? centre.bwSingle ?? null,
    bwDouble: pricing.bwDouble ?? centre.bwDouble ?? null,
    colorSingle: pricing.colorSingle ?? centre.colorSingle ?? null,
    colorDouble: pricing.colorDouble ?? centre.colorDouble ?? null,
    watermarkCharge: pricing.watermarkCharge ?? centre.watermarkCharge ?? 0,
    pricing: {
      bwSingle: pricing.bwSingle ?? centre.bwSingle ?? null,
      bwDouble: pricing.bwDouble ?? centre.bwDouble ?? null,
      colorSingle: pricing.colorSingle ?? centre.colorSingle ?? null,
      colorDouble: pricing.colorDouble ?? centre.colorDouble ?? null,
      watermarkCharge: pricing.watermarkCharge ?? centre.watermarkCharge ?? 0,
    },
    printerOnline: centre.printerOnline ?? centre.isOnline ?? false,
    // Location fields (safe to be undefined/null when not provided)
    locationEnabled: centre.locationEnabled ?? false,
    latitude: centre.latitude ?? null,
    longitude: centre.longitude ?? null,
    addressText: centre.addressText ?? null,
    area: centre.area ?? null,
    city: centre.city ?? null,
    mapUpdatedAt: centre.mapUpdatedAt ?? null,
    afterOrderSettings: centre.afterOrderSettings ?? centre.after_order_settings ?? {},
  };
}

function normalizeReprintSourceDocument(document = {}) {
  const printOptions = document.printOptions || document.print_options || {};
  const rawPageCount = document.pageCount ?? document.page_count ?? document.originalPageCount ?? document.original_pages ?? document.pages ?? null;
  const pageCount = Number(rawPageCount);
  return {
    ...document,
    documentId: document.documentId || document.document_id || document.id || "",
    fileName: document.fileName || document.file_name || document.name || "document.pdf",
    pageCount: Number.isFinite(pageCount) && pageCount > 0 ? pageCount : null,
    originalPageCount: Number.isFinite(pageCount) && pageCount > 0 ? pageCount : null,
    copies: Number(document.copies || printOptions.copies || 1),
    selectedPages: document.selectedPages || document.selected_pages || printOptions.pages?.range || "",
    printOptions,
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
    ...user,
    ...(centre || {}),
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

function normalizeUsername(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getUsernameBaseCandidates(name, email) {
  const nameParts = String(name || "")
    .trim()
    .split(/\s+/)
    .map(normalizeUsername)
    .filter(Boolean);

  if (nameParts.length) {
    const firstName = nameParts[0];
    const withSurname = normalizeUsername(nameParts.join(""));
    return [...new Set([firstName, withSurname].filter(Boolean))];
  }

  const emailName = String(email || "").split("@")[0];
  const fromEmail = normalizeUsername(emailName);
  if (fromEmail) return [fromEmail];

  return ["user"];
}

function getSupabaseDisplayName(user) {
  const metadata = user?.user_metadata || {};
  return metadata.full_name || metadata.name || metadata.display_name || "";
}

function generateStrongPasswordValue() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const symbols = "!@#$%&*?";
  const bytes = new Uint32Array(18);
  window.crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
  return `${body.slice(0, 6)}${symbols[bytes[0] % symbols.length]}${body.slice(6, 12)}${bytes[1] % 10}${body.slice(12)}`;
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

function extractCustomerName(order) {
  if (!order) return null;
  // common direct fields
  if (order.customerName) return order.customerName;
  if (order.customer_name) return order.customer_name;
  if (order.userName) return order.userName;
  if (order.user_name) return order.user_name;
  if (order.name) return order.name;

  const customer = order.customer || {};
  const user = order.user || {};

  const candidates = [
    customer.name,
    customer.full_name,
    customer.fullName,
    customer.displayName,
    customer.username,
    user.name,
    user.full_name,
    user.fullName,
    user.displayName,
    user.username,
  ];

  // try first/last name combinations
  if (customer.firstName && customer.lastName) candidates.unshift(`${customer.firstName} ${customer.lastName}`);
  if (customer.first_name && customer.last_name) candidates.unshift(`${customer.first_name} ${customer.last_name}`);
  if (user.firstName && user.lastName) candidates.unshift(`${user.firstName} ${user.lastName}`);
  if (user.first_name && user.last_name) candidates.unshift(`${user.first_name} ${user.last_name}`);

  return candidates.find((v) => v && String(v).trim()) || null;
}

function normalizeOrder(order, centreList = []) {
  const centreId = order.centreId || order.centre_id;
  const centreCodeFromOrder = order.centreCode || order.centre_code;
  const centre = centreList.find((item) => item.id === centreId || item.code === centreCodeFromOrder);
  const orderCode = order.orderCode || order.order_code || order.id;
  const rawStatus = order.status || "";
  const rawBillStatus = order.billStatus || order.bill_status || "";
  const rawPages = order.pages ?? order.printablePageCount ?? order.printable_page_count ?? order.selectedPageCount ?? order.selected_page_count ?? null;
  const normalizedPages = Number(rawPages);
  const priceSnapshot = order.priceSnapshot || order.price_snapshot || null;
  const pricingPending = Boolean(
    order.pricingPending ||
    order.pricing_pending ||
    priceSnapshot?.pricingPending ||
    String(rawStatus).toLowerCase() === "awaiting_hub_bill_confirmation" ||
    String(rawBillStatus).toLowerCase() === "awaiting_hub_confirmation"
  );

  return {
    id: orderCode,
    backendId: order.backendId || order.id,
    centreId: centreId || centre?.id,
    centreCode: centreCodeFromOrder || centre?.code || "",
    centre: order.centre || centre?.name || "Selected centre",
    customerName: extractCustomerName(order) || "Customer",
    customerMobile: order.customerMobile || order.customer_mobile || order.userMobile || order.user_mobile || order.customer?.mobile || order.user?.mobile || order.mobile || "",
    document: order.documentName || order.document_name || order.document || "Uploaded Document",
    pages: Number.isFinite(normalizedPages) && normalizedPages > 0 ? normalizedPages : null,
    copies: Number(order.copies || 1),
    amount: Number(order.amount ?? (order.totalAmountPaise || order.total_amount_paise ? Number(order.totalAmountPaise || order.total_amount_paise) / 100 : 0)),
    rawStatus,
    status: toDisplayLabel(rawStatus || "Payment Pending"),
    billStatus: rawBillStatus,
    pricingPending,
    date: formatOrderDate(order.createdAt || order.created_at || order.date),
    paymentStatus: toDisplayLabel(order.paymentStatus || order.payment_status || "Pending"),
    pickupCode: order.pickupCode || order.pickup_code || "",
    configVersion: order.configVersion || order.config_version || null,
    latestConfiguredByRole: order.latestConfiguredByRole || order.latest_configured_by_role || null,
    latestConfiguredAt: order.latestConfiguredAt || order.latest_configured_at || null,
    latestConfigSource: order.latestConfigSource || order.latest_config_source || null,
    priceSnapshot,
    printConfigSnapshot: order.printConfigSnapshot || order.print_config_snapshot || order.printOptions || order.print_options || null,
  };
}

function upsertOrder(orderList, nextOrder) {
  const existingIndex = orderList.findIndex((item) => item.id === nextOrder.id || item.backendId === nextOrder.backendId);

  if (existingIndex === -1) return [nextOrder, ...orderList];

  return orderList.map((item, index) => (index === existingIndex ? nextOrder : item));
}

async function persistAuthSession(token, user, authMeta = {}) {
  localStorage.setItem("printease_token", token);
  localStorage.setItem("printease_user", JSON.stringify(user));
  if (authMeta.refreshToken) localStorage.setItem("printease_supabase_refresh_token", authMeta.refreshToken);

  const result = await saveStoredAuth({ token, user, refreshToken: authMeta.refreshToken || null });
  if (result?.success === false && isDesktop()) {
    console.warn("[PrintEase desktop auth save failed]", result.error || result.message);
  }
}

function clearAuthSession() {
  localStorage.removeItem("printease_token");
  localStorage.removeItem("printease_user");
  localStorage.removeItem("printease_supabase_refresh_token");

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
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsernameState] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState(null); // null, 'checking', 'available', 'taken'
  const usernameCache = useRef({});
  const usernameAbortController = useRef(null);
  const usernameSuggestionRequest = useRef(0);
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
  const [reprintSourceDocuments, setReprintSourceDocuments] = useState([]);
  const [reprintDocumentExpired, setReprintDocumentExpired] = useState(false);
  const [multiFileConfigs, setMultiFileConfigs] = useState({});
  const [documentName, setDocumentName] = useState("");
  const [pages, setPages] = useState(1);
  const [selectedPages, setSelectedPages] = useState("");
  const [copies, setCopies] = useState(1);
  const [colorType, setColorType] = useState("bw");
  const [sideType, setSideType] = useState("single");
  const [paperSize, setPaperSize] = useState("A4");
  const [pagesPerSheet, setPagesPerSheet] = useState(1);
  const [orientation, setOrientation] = useState("auto");
  const [printDpi, setPrintDpi] = useState(300);
  const [scaleMode, setScaleMode] = useState("original");
  const [marginMode, setMarginMode] = useState("default");
  const [watermark, setWatermark] = useState(false);
  const [watermarkType, setWatermarkType] = useState("order_code");
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkPosition, setWatermarkPosition] = useState("bottom_right");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.18);
  const [watermarkFontSize, setWatermarkFontSize] = useState(18);
  const [watermarkRotation, setWatermarkRotation] = useState(45);
  const [order, setOrder] = useState(null);
  const [backendPrice, setBackendPrice] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [pendingPayment, setPendingPayment] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("manual");
  const [upiQr, setUpiQr] = useState(null);
  const [orderAccessToken, setOrderAccessToken] = useState(() => localStorage.getItem("printease_order_access_token") || "");
  const demoPaymentEnabled = import.meta.env.VITE_DEMO_PAYMENT_ENABLED === "true";

  const [centres, setCentres] = useState(initialCentres);
  const [orders, setOrders] = useState(initialOrders);
  const [lastOrdersUpdatedAt, setLastOrdersUpdatedAt] = useState("");
  const handledCentreLinkRef = useRef("");

  useEffect(() => {
    setDesktopAvailable(isDesktop());
    return onPrintersUpdated(() => {
      setDesktopAvailable(true);
    });
  }, []);

  useEffect(() => {
    let sessionId = sessionStorage.getItem("printease_session_id");
    if (!sessionId) {
      sessionId = window.crypto.randomUUID();
      sessionStorage.setItem("printease_session_id", sessionId);
    }

    const key = "printease_visit_sent";
    if (!sessionStorage.getItem(key)) {
      apiRequest("/api/stats/visit", {
        method: "POST",
        body: JSON.stringify({ sessionId, isPageView: false }),
      })
        .then(() => {
          sessionStorage.setItem(key, "1");
        })
        .catch(() => {});
    }
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
    const session = readSupabaseSessionFromUrl();
    if (!session) return;

    clearSupabaseUrlSession();
    setAuthLoading(true);
    setAuthError("");

    finishBackendLogin(session)
      .catch((error) => {
        setAuthError(error.message || "Could not finish Google login.");
        navigate("auth", { replace: true });
      })
      .finally(() => setAuthLoading(false));
  }, []);

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
                ...signedInCentre,
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
        if (error.status === 428 || error.details?.profileRequired) {
          setAuthMode("profile");
          navigate("auth", { replace: true });
          return;
        }

        // Only clear auth on definitive auth failures (401/403 = token is invalid).
        // For transient errors (5xx, network down, cold-start), keep the stored
        // token and fall back to the locally-cached user so the app stays usable.
        const isAuthFailure = error.status === 401 || error.status === 403;

        if (isAuthFailure) {
          console.warn("Session restore: token rejected by server, clearing auth.", error?.message || error);
          clearAuthSession();
          setCurrentUser(null);
        } else {
          console.warn("Session restore: transient error, keeping stored auth.", error?.message || error);

          // Fall back to locally-cached user so the UI is not blank
          const cachedUserJson = localStorage.getItem("printease_user");
          if (cachedUserJson) {
            try {
              const cachedUser = JSON.parse(cachedUserJson);
              setCurrentUser(cachedUser);
            } catch {
              // corrupt cache — still don't clear auth, let user retry
            }
          }
        }
      }
    }

    restoreSession();
  }, []);

  useEffect(() => {
    if (desktopAvailable) {
      handleDesktopAutoRegistration(currentUser);
    }
  }, [desktopAvailable, currentUser]);

  const pricePerPage = useMemo(
    () => getPricePerPage(selectedCentre, colorType, sideType),
    [selectedCentre, colorType, sideType]
  );

  const estimatedSelectedPageCount = useMemo(
    () => countSelectedPagesPreview(selectedPages, pages) || pages,
    [selectedPages, pages]
  );

  const totalAmount = useMemo(
    () =>
      estimatePricePreview({
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

  useEffect(() => {
    hubActivityStore.setState({
      hubOrders,
      lastLoadedAt: lastOrdersUpdatedAt
    });
  }, [hubOrders, lastOrdersUpdatedAt]);

  useEffect(() => {
    hubActivityStore.refresh = () => loadOrdersForSession(currentUser, centres);
  }, [currentUser, centres]);

  const prioritizedCentres = useMemo(() => {
    const usageByCentre = new Map();

    for (const item of orders) {
      const keys = [item.centreId, item.centreCode].filter(Boolean);
      for (const key of keys) {
        usageByCentre.set(String(key), (usageByCentre.get(String(key)) || 0) + 1);
      }
    }

    return [...centres].sort((left, right) => {
      const rightUsage = (usageByCentre.get(String(right.id)) || 0) + (usageByCentre.get(String(right.code)) || 0);
      const leftUsage = (usageByCentre.get(String(left.id)) || 0) + (usageByCentre.get(String(left.code)) || 0);
      if (rightUsage !== leftUsage) return rightUsage - leftUsage;

      const rightAvailable = right.printerOnline || String(right.status || "").toLowerCase() === "available" ? 1 : 0;
      const leftAvailable = left.printerOnline || String(left.status || "").toLowerCase() === "available" ? 1 : 0;
      if (rightAvailable !== leftAvailable) return rightAvailable - leftAvailable;

      return String(left.name || "").localeCompare(String(right.name || ""));
    });
  }, [centres, orders]);

  useEffect(() => {
    if (authMode !== "register" && authMode !== "profile") return;
    if (usernameEdited) return;

    const immediateUsername = getUsernameBaseCandidates(name, email)[0];
    setUsernameState(immediateUsername);
    const timer = setTimeout(() => suggestUniqueUsername(name, email), 250);
    return () => clearTimeout(timer);
  }, [authMode, name, email, usernameEdited]);

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

  async function suggestUniqueUsername(nextName = name, nextEmail = email, force = false) {
    const requestId = usernameSuggestionRequest.current + 1;
    usernameSuggestionRequest.current = requestId;
    const bases = getUsernameBaseCandidates(nextName, nextEmail);
    const candidates = [];

    for (const base of bases) {
      candidates.push(base);
      candidates.push(`${base}1`);
      candidates.push(`${base}2`);
      candidates.push(`${base}3`);
      const randDigits = Math.floor(10 + Math.random() * 90);
      candidates.push(`${base}${randDigits}`);
    }

    const uniqueCandidates = [...new Set(candidates)];

    for (const candidate of uniqueCandidates) {
      try {
        const data = await apiRequest(`/api/auth/username-available?username=${encodeURIComponent(candidate)}`);
        if (usernameSuggestionRequest.current !== requestId || (!force && usernameEdited)) return;
        if (data.available) {
          setUsernameState(data.username || candidate);
          return;
        }
      } catch {
        if (usernameSuggestionRequest.current === requestId && (force || !usernameEdited)) {
          setUsernameState("");
        }
        return;
      }
    }

    if (usernameSuggestionRequest.current === requestId && (force || !usernameEdited)) {
      setUsernameState("");
    }
  }

  function updateEmail(value) {
    setEmail(value);
    if (!usernameEdited) {
      setUsernameState(getUsernameBaseCandidates(name, value)[0]);
      // Backend availability check is handled by the debounced useEffect (250ms)
    }
  }

  function updateName(value) {
    setName(value);
    if (!usernameEdited) {
      setUsernameState(getUsernameBaseCandidates(value, email)[0]);
      // Backend availability check is handled by the debounced useEffect (250ms)
    }
  }

  function updateUsername(value) {
    setUsernameEdited(true);
    setUsernameState(normalizeUsername(value));
  }

  useEffect(() => {
    if (authMode !== "register" && authMode !== "profile") {
      setUsernameStatus(null);
      return;
    }

    if (!usernameEdited) {
      setUsernameStatus(null);
      return;
    }

    const cleaned = username.trim().toLowerCase();

    if (cleaned.length < 4) {
      setUsernameStatus(null);
      return;
    }

    if (!/^[a-z0-9]+$/.test(cleaned)) {
      setUsernameStatus("taken");
      return;
    }

    if (usernameCache.current[cleaned] !== undefined) {
      setUsernameStatus(usernameCache.current[cleaned] ? "available" : "taken");
      return;
    }

    setUsernameStatus("checking");

    const timer = setTimeout(async () => {
      if (usernameAbortController.current) {
        usernameAbortController.current.abort();
      }
      usernameAbortController.current = new AbortController();
      const { signal } = usernameAbortController.current;

      try {
        const data = await apiRequest(
          `/api/auth/username-available?username=${encodeURIComponent(cleaned)}`,
          { signal }
        );
        usernameCache.current[cleaned] = data.available;
        setUsernameStatus(data.available ? "available" : "taken");
      } catch (err) {
        if (err.name === "AbortError") {
          return;
        }
        setUsernameStatus(null);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      if (usernameAbortController.current) {
        usernameAbortController.current.abort();
      }
    };
  }, [username, authMode, usernameEdited]);

  function generateStrongPassword() {
    const nextPassword = generateStrongPasswordValue();
    setPassword(nextPassword);
    setShowPassword(true);
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
    setUsernameEdited(false);
    setUsernameStatus(null);
    suggestUniqueUsername(name, email, true);
    setAuthError("");
    navigate("auth");
  }

  function changeAuthRole(role) {
    setAuthRole(role);
    setAuthError("");
  }

  function changeAuthMode(mode) {
    setAuthMode(mode);
    if (mode === "register" || mode === "profile") {
      setUsernameEdited(false);
      setUsernameStatus(null);
      suggestUniqueUsername(name, email, true);
    }
    setAuthError("");
  }

  function openProfile() {
    navigate(ROUTES.profile);
  }

  async function updateProfile(updates) {
    const { name, username, email, mobile, hubName, hubCode } = updates;
    const trimmedName = name?.trim();
    const trimmedEmail = email?.trim();
    const trimmedUsername = username?.trim();
    const trimmedMobile = mobile?.trim();
    const trimmedHubName = hubName?.trim();
    const trimmedHubCode = hubCode?.trim();

    if (!trimmedName) throw new Error("Enter your name.");
    if (trimmedName.length > 50) throw new Error("Name must be 50 characters or less.");
    if (trimmedEmail && !/^\S+@\S+\.\S+$/.test(trimmedEmail)) throw new Error("Enter a valid email address.");
    if (!trimmedUsername || !/^[a-z0-9]+$/.test(trimmedUsername)) throw new Error("Username can use only lowercase letters and numbers.");
    if (currentUser?.role === "hub") {
      if (!trimmedHubName || !trimmedHubCode) throw new Error("Enter print hub name and centre code.");
      if (trimmedHubCode.length > 8) throw new Error("Centre code must be 8 characters or less.");
    }

    const data = await apiRequest("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify({
        name: trimmedName,
        role: currentUser?.role,
        username: trimmedUsername,
        displayHandle: trimmedUsername,
        mobile: trimmedMobile || null,
        hubName: trimmedHubName,
        centreCode: trimmedHubCode,
      }),
    });

    const nextUser = { ...currentUser, ...data.user, centre: data.centre || currentUser?.centre };
    setCurrentUser(nextUser);
    localStorage.setItem("printease_user", JSON.stringify(nextUser));
    
    await refreshCentres();
    return nextUser;
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
      emitOrderChanged();
      return nextOrders;
    } catch (error) {
      return [];
    }
  }

  async function finishBackendLogin(session, redirectOverride = null) {
    if (!session?.access_token) {
      throw new Error("Supabase did not return a login session.");
    }

    localStorage.setItem("printease_token", session.access_token);
    if (session.refresh_token) localStorage.setItem("printease_supabase_refresh_token", session.refresh_token);

    let data = null;
    try {
      data = await apiRequest("/api/auth/me");
    } catch (error) {
      if (error.status === 428 || error.details?.profileRequired) {
        const supabaseUser = session.user || await getSupabaseUser(session.access_token).catch(() => null);
        const nextEmail = supabaseUser?.email || email;
        const nextName = getSupabaseDisplayName(supabaseUser) || name;
        if (nextEmail) setEmail(nextEmail);
        if (nextName) setName(nextName);
        if (!usernameEdited) suggestUniqueUsername(nextName, nextEmail);
        setAuthMode("profile");
        setPassword("");
        setConfirmPassword("");
        navigate("auth", { replace: true });
        return { profileRequired: true };
      }
      throw error;
    }

    const signedInRole = toFrontendRole(data.user.role);
    let signedInCentre = findCentreForUser(data.user, centres, data.centre);

    if (signedInRole === "hub" && !signedInCentre) {
      const freshCentres = await refreshCentres();
      signedInCentre = findCentreForUser(data.user, freshCentres, data.centre);
    }

    if (signedInRole === "hub" && !signedInCentre) {
      clearAuthSession();
      setCurrentUser(null);
      throw new Error("No print hub is linked to this account. Complete hub setup first.");
    }

    const nextUser = toCurrentUser(data.user, signedInCentre);
    const nextCentres = signedInCentre ? upsertCentre(centres, signedInCentre) : centres;
    await persistAuthSession(session.access_token, nextUser, { refreshToken: session.refresh_token });
    if (signedInCentre) setCentres((prev) => upsertCentre(prev, signedInCentre));
    setCurrentUser(nextUser);
    await loadOrdersForSession(nextUser, nextCentres);
    const destination = redirectOverride || postAuthRedirect || (signedInRole === "hub" ? "hubDashboard" : "userDashboard");
    setPostAuthRedirect(null);
    if (destination === "payment") setPaymentError("");
    navigate(destination, { replace: true });
    return { profileRequired: false, user: nextUser };
  }

  async function finishPasswordAuth(data, redirectOverride = null) {
    if (!data?.token || !data?.user) {
      throw new Error("Invalid login response.");
    }

    const centre = data.centre ? normalizeCentre(data.centre) : null;
    const signedInRole = toFrontendRole(data.user.role);
    const nextUser = toCurrentUser(data.user, centre);
    const nextCentres = centre ? upsertCentre(centres, centre) : centres;

    localStorage.setItem("printease_token", data.token);
    localStorage.setItem("printease_user", JSON.stringify(nextUser));
    localStorage.removeItem("printease_supabase_refresh_token");
    await persistAuthSession(data.token, nextUser);
    if (centre) setCentres((prev) => upsertCentre(prev, centre));
    setCurrentUser(nextUser);
    await loadOrdersForSession(nextUser, nextCentres);

    const destination = redirectOverride || postAuthRedirect || (signedInRole === "hub" ? "hubDashboard" : "userDashboard");
    setPostAuthRedirect(null);
    if (destination === "payment") setPaymentError("");
    navigate(destination, { replace: true });
    return nextUser;
  }

  async function completeProfile() {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const trimmedMobile = mobile.trim();
    const trimmedHubName = hubName.trim();
    const trimmedHubCode = hubCode.trim();

    if (!trimmedName) {
      setAuthError("Enter your name.");
      return;
    }

    if (trimmedName.length > 50) {
      setAuthError("Name must be 50 characters or less.");
      return;
    }

    if (trimmedEmail && !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setAuthError("Enter a valid email address.");
      return;
    }

    if (!trimmedUsername || !/^[a-z0-9]+$/.test(trimmedUsername)) {
      setAuthError("Username can use only lowercase letters and numbers.");
      return;
    }

    if (authRole === "hub" && (!trimmedHubName || !trimmedHubCode)) {
      setAuthError("Enter print hub name and centre code.");
      return;
    }

    const data = await apiRequest("/api/auth/profile", {
      method: "POST",
      body: JSON.stringify({
        name: trimmedName,
        role: authRole,
        username: trimmedUsername,
        displayHandle: trimmedUsername,
        mobile: trimmedMobile || null,
        hubName: trimmedHubName,
        centreCode: trimmedHubCode,
      }),
    });

    const centre = data.centre ? normalizeCentre(data.centre) : null;
    const nextUser = toCurrentUser(data.user, centre);
    const token = localStorage.getItem("printease_token");
    const refreshToken = localStorage.getItem("printease_supabase_refresh_token");
    await persistAuthSession(token, nextUser, { refreshToken });
    if (centre) setCentres((prev) => upsertCentre(prev, centre));
    setCurrentUser(nextUser);
    await loadOrdersForSession(nextUser, centre ? upsertCentre(centres, centre) : centres);
    navigate(nextUser.role === "hub" ? "hubDashboard" : "userDashboard", { replace: true });
  }

  async function handleAuthSubmit() {
    const trimmedIdentifier = email.trim();
    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    const trimmedMobile = mobile.trim();
    const trimmedHubName = hubName.trim();
    const trimmedHubCode = hubCode.trim();

    setAuthError("");

    if (authMode === "profile") {
      setAuthLoading(true);
      try {
        await completeProfile();
      } catch (error) {
        setAuthError(error.message || "Could not save profile.");
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    if (authMode === "register" && !trimmedName) {
      setAuthError("Enter your name.");
      return;
    }

    if (authMode === "register" && trimmedName.length > 50) {
      setAuthError("Name must be 50 characters or less.");
      return;
    }

    if (authMode === "register" && (!trimmedUsername || !/^[a-z0-9]+$/.test(trimmedUsername))) {
      setAuthError("Username can use only lowercase letters and numbers.");
      return;
    }

    if (authMode === "register" && usernameStatus === "taken") {
      setAuthError("Username is already taken.");
      return;
    }

    if (authMode === "login" && !trimmedIdentifier) {
      setAuthError("Enter your username or email.");
      return;
    }

    if (authMode === "register" && trimmedIdentifier && !/^\S+@\S+\.\S+$/.test(trimmedIdentifier)) {
      setAuthError("Enter a valid email address or leave it blank.");
      return;
    }

    if (authMode === "register" && authRole === "hub") {
      if (!trimmedHubName || !trimmedHubCode) {
        setAuthError("Enter print hub name and centre code.");
        return;
      }
      if (trimmedHubCode.length > 8) {
        setAuthError("Centre code must be 8 characters or less.");
        return;
      }
    }

    if (!password) {
      setAuthError("Enter your password.");
      return;
    }

    if (password.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }

    setAuthLoading(true);

    try {
      if (authMode === "register") {
        const endpoint = authRole === "hub" ? "/api/auth/register-centre" : "/api/auth/register-user";
        const data = await apiRequest(endpoint, {
          method: "POST",
          body: JSON.stringify({
            name: trimmedName,
            ownerName: trimmedName,
            email: trimmedIdentifier || null,
            username: trimmedUsername,
            displayHandle: trimmedUsername,
            mobile: trimmedMobile || null,
            password,
            hubName: trimmedHubName,
            centreName: trimmedHubName,
            centreCode: trimmedHubCode,
          }),
        });
        await finishPasswordAuth(data);
      } else {
        const data = await apiRequest("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ identifier: trimmedIdentifier, password }),
        });
        await finishPasswordAuth(data);
      }
    } catch (error) {
      setAuthError(error.message || "Authentication failed. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setAuthError("");
    setAuthError("Google login is coming later. Use username/email and password for now.");
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

  async function selectCentreByCode(rawCode, options = {}) {
    const code = String(rawCode || "").trim();
    setCentreLookupError("");

    if (!code) {
      setCentreLookupError("Enter a centre code.");
      return false;
    }

    const localCentre = centres.find(
      (c) => String(c.code || "").toLowerCase() === code.toLowerCase() || String(c.id || "") === code
    );
    if (localCentre) {
      setSelectedCentre(localCentre);
      navigate("upload", options);
      return true;
    }

    setCentreLookupLoading(true);

    try {
      const data = await apiRequest(`/api/centres/${encodeURIComponent(code)}`);
      const centre = normalizeCentre(data.centre);
      setCentres((prev) => upsertCentre(prev, centre));
      setSelectedCentre(centre);
      navigate("upload", options);
      return true;
    } catch (error) {
      setCentreLookupError(error.message || "Centre not found.");
      return false;
    } finally {
      setCentreLookupLoading(false);
    }
  }

  async function handleCentreCode() {
    await selectCentreByCode(centreCode);
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("centre") || params.get("code") || params.get("centreCode");
    const trimmedCode = String(code || "").trim();
    if (!trimmedCode) return;

    const requestKey = `${location.pathname}:${trimmedCode}`;
    if (handledCentreLinkRef.current === requestKey) return;
    handledCentreLinkRef.current = requestKey;

    setCentreCode(trimmedCode);
    selectCentreByCode(trimmedCode, { replace: true });
  }, [location.pathname, location.search, centres]);

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

  async function preparePayment(preparedFilesByIndex = {}) {
    if (!selectedCentre) {
      setPaymentError("Please select a printing centre first.");
      navigate("centre");
      return;
    }

    const filesToUpload = documentFiles.length ? documentFiles : documentFile ? [documentFile] : [];
    if (reprintDocumentExpired) {
      setPaymentError("One or more documents for this reprint have expired. Please upload the PDF files manually.");
      navigate("upload");
      return;
    }
    if (!filesToUpload.length && !reprintSourceDocuments.length) {
      setPaymentError("Please upload a supported document first.");
      navigate("upload");
      return;
    }

    setPaymentLoading(true);
    setPaymentError("");
    setBackendPrice(null);

    try {
      const uploadedDocuments = [];
      if (filesToUpload.length) {
        for (let index = 0; index < filesToUpload.length; index += 1) {
          const file = filesToUpload[index];
          const preparedState = preparedFilesByIndex?.[index];
          const isDesktopPreparationPending = preparedState?.status === "pending_desktop";
          if (preparedState?.status && preparedState.status !== "ready" && !isDesktopPreparationPending) {
            throw new Error(preparedState.errorMessage || preparedState.message || "Document is not ready for payment yet.");
          }

          let printReadyFile = null;
          let fileMeta = null;
          if (preparedState) {
            printReadyFile = preparedState.printReadyFile || null;
            fileMeta = {
              conversionSource: preparedState.conversionSource || (printReadyFile ? "browser" : "none"),
              conversionPlacement: preparedState.conversionPlacement || (printReadyFile ? "browser" : "none"),
              decision: preparedState.decision || { reasonCode: "PREPARED_BEFORE_PAYMENT", kind: preparedState.fileKind },
              fileKind: preparedState.fileKind,
            };
          } else {
            try {
            const prepResult = await prepareBrowserPrintReadyFile(file, {
              hubId: selectedCentre?.id || selectedCentre?.code,
              hubLoad: selectedCentre?.hubLoad || {
                queuedEstimatedSeconds: 0,
                queuedOfficeCount: 0,
                isOnline: selectedCentre?.printerOnline ?? true
              },
              userPreference: 'auto'
            });
            if (prepResult?.printReadyFile) {
               printReadyFile = prepResult.printReadyFile;
            }
            fileMeta = prepResult;
            } catch (e) {
             if (import.meta.env.DEV) {
               console.debug("Browser preparation skipped; uploading original file.", e);
             }
            }
          }

          /*
           * Browser-safe files may upload a verified print-ready PDF immediately.
           * Office files intentionally upload the original and carry
           * requiresDesktopPreparation=true. The paired hub desktop then converts
           * them with LibreOffice, uploads the PDF, and the backend verifies page
           * count/hash before confirming the final bill.
           */
          const formData = new FormData();
          
          if (printReadyFile) {
             formData.append("document", printReadyFile);
             formData.append("printReadyFileType", "application/pdf");
          } else {
             formData.append("document", file);
          }
          if (fileMeta) {
             formData.append("conversionSource", fileMeta.conversionSource || 'none');
             formData.append("conversionPlacement", fileMeta.conversionPlacement || 'none');
             formData.append("conversionReasonCode", fileMeta.decision?.reasonCode || 'unknown');
             formData.append("fileKind", fileMeta.fileKind || fileMeta.decision?.kind || 'unknown');
             formData.append("requiresDesktopPreparation", isDesktopPreparationPending ? "true" : "false");
             if (printReadyFile) {
               formData.append("printReadyFileType", "application/pdf");
             }
          }

          const uploadData = await apiRequest("/api/uploads", {
            method: "POST",
            body: formData,
          });

          uploadedDocuments.push(uploadData.document);
        }
      } else if (reprintSourceDocuments.length) {
        reprintSourceDocuments.map(normalizeReprintSourceDocument).forEach((doc) => {
          uploadedDocuments.push({
            id: doc.documentId,
            fileName: doc.fileName,
            pageCount: doc.pageCount,
          });
        });
      }

      let totalPagesSum = 0;
      for (const doc of uploadedDocuments) {
        if (doc.pageCount) totalPagesSum += Number(doc.pageCount);
      }
      const hasDesktopPreparationUploads = uploadedDocuments.some((document) => document.requiresDesktopPreparation);
      const trustedPageCount = totalPagesSum > 0
        ? totalPagesSum
        : hasDesktopPreparationUploads
          ? 0
          : pages;

      if (trustedPageCount !== pages) {
        setPages(trustedPageCount);
      }

      const defaultPrintOptions = buildPrintOptions({
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
      });

      const orderData = await apiRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          centreCode: selectedCentre.code,
          documentIds: uploadedDocuments.map((document) => document.id),
          files: uploadedDocuments.map((document, index) => {
            const config = multiFileConfigs?.[index] || {
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

            return {
              documentId: document.id,
              documentName: document.fileName,
              pages: document.pageCount || (document.requiresDesktopPreparation ? 0 : config.pages),
              selectedPages: config.selectedPages,
              copies: config.copies,
              colorType: config.colorType,
              sideType: config.sideType,
              paperSize: config.paperSize,
              pagesPerSheet: config.pagesPerSheet,
              orientation: config.orientation,
              printDpi: config.printDpi,
              scaleMode: config.scaleMode,
              marginMode: config.marginMode,
              watermarkEnabled: config.watermark,
              printOptions: multiFileConfigs?.[index] ? buildPrintOptions(config) : defaultPrintOptions,
            };
          }),
          documentName: uploadedDocuments.length === 1
            ? uploadedDocuments[0]?.fileName || documentName || filesToUpload[0]?.name
            : `${uploadedDocuments.length} uploaded documents`,
          pages: trustedPageCount,
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
          watermarkEnabled: watermark,
          printOptions: defaultPrintOptions,
        }),
      });

      const returnedOrderFiles = Array.isArray(orderData.orderFiles) ? orderData.orderFiles : [];
      if (returnedOrderFiles.length !== uploadedDocuments.length) {
        throw new Error("Order configuration was not saved for every document. Please try again before payment.");
      }

      const nextOrder = normalizeOrder(orderData.order, centres);
      setOrder(nextOrder);
      setBackendPrice(orderData.price || null);
      
      saveOrderToLocalHistory(nextOrder, defaultPrintOptions, orderData.price, uploadedDocuments);
      invalidateUserHistory(currentUser?.id || "me");

      if (orderData.orderAccessToken) {
        setOrderAccessToken(orderData.orderAccessToken);
        localStorage.setItem("printease_order_access_token", orderData.orderAccessToken);
      } else {
        setOrderAccessToken("");
        localStorage.removeItem("printease_order_access_token");
      }
      setDocumentFile(null);
      setDocumentFiles([]);
      navigate("payment");
    } catch (error) {
      if (error.status === 403 && error.details?.code === 'LOGIN_REQUIRED_FOR_MORE_THAN_5_PAGES') {
        const confirmLogin = window.confirm("You can only print up to 5 pages as a guest. Please log in to print larger documents.");
        if (confirmLogin) {
          setPostAuthRedirect("upload");
          navigate("auth");
        } else {
          setPaymentError(error.message);
        }
      } else {
        setPaymentError(error.message || "Could not upload document and calculate final price.");
      }
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

    if (paymentMethod === "manual" && pendingPayment?.orderId === order.backendId && pendingPayment?.method === "MANUAL_UPI_OR_CASH") {
      navigate("track");
      return;
    }

    setPaymentLoading(true);
    setPaymentError("");

    if (paymentMethod === "manual") {
      try {
        const paymentData = await apiRequest("/api/payments/manual-request", {
          method: "POST",
          headers: orderAccessToken ? { "x-order-access-token": orderAccessToken } : {},
          body: JSON.stringify({ orderId: order.backendId, orderAccessToken: orderAccessToken || undefined }),
        });
        const requestedOrder = normalizeOrder(paymentData.order || order, centres);
        setOrder(requestedOrder);
        setOrders((prev) => upsertOrder(prev, requestedOrder));
        setLastOrdersUpdatedAt(new Date().toISOString());
        emitOrderChanged();
        invalidateUserHistory(currentUser?.id || "me");
        setPendingPayment(paymentData.payment || {
          id: `manual-${order.backendId}`,
          orderId: order.backendId,
          amount: order.amount,
          method: "MANUAL_UPI_OR_CASH",
          status: "pending",
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        setPaymentError(error.message || "Could not create pending payment request.");
        setPaymentLoading(false);
        return;
      }

      setUpiQr(selectedCentre?.upiQrImageUrl ? { imageUrl: selectedCentre.upiQrImageUrl, source: "centre" } : null);
      setPaymentLoading(false);
      navigate("track");
      return;
    }

    try {
      let paymentData = null;

      if (paymentMethod === "upi_qr") {
        paymentData = await apiRequest("/api/payments/razorpay/upi-qr", {
          method: "POST",
          headers: orderAccessToken ? { "x-order-access-token": orderAccessToken } : {},
          body: JSON.stringify({ orderId: order.backendId, orderAccessToken: orderAccessToken || undefined }),
        });
      } else {
        paymentData = await apiRequest("/api/payments/razorpay/order", {
          method: "POST",
          headers: orderAccessToken ? { "x-order-access-token": orderAccessToken } : {},
          body: JSON.stringify({ orderId: order.backendId, orderAccessToken: orderAccessToken || undefined }),
        });
      }

      setPendingPayment(paymentData.payment || null);
      setUpiQr(paymentData.qr || null);
      if (paymentData.order) {
        const requestedOrder = normalizeOrder(paymentData.order, centres);
        setOrder(requestedOrder);
        setOrders((prev) => upsertOrder(prev, requestedOrder));
        setLastOrdersUpdatedAt(new Date().toISOString());
      emitOrderChanged();
        invalidateUserHistory(currentUser?.id || "me");
      }

      if (paymentMethod === "razorpay" && paymentData.razorpay?.orderId) {
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
              setPaymentError("");

              const verifiedData = await apiRequest("/api/payments/razorpay/verify", {
                method: "POST",
                headers: orderAccessToken ? { "x-order-access-token": orderAccessToken } : {},
                body: JSON.stringify({
                  paymentId: paymentData.payment.id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  orderAccessToken: orderAccessToken || undefined,
                }),
              });

              const verifiedOrder = normalizeOrder(verifiedData.order || order, centres);
              setOrder(verifiedOrder);
              setOrders((prev) => upsertOrder(prev, verifiedOrder));
              setLastOrdersUpdatedAt(new Date().toISOString());
      emitOrderChanged();
              invalidateUserHistory(currentUser?.id || "me");
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
              setPaymentLoading(false);
            },
          },
        });

        razorpay.open();
      } else if (paymentMethod === "upi_qr") {
        navigate("track");
      }
    } catch (error) {
      setPaymentError(error.message || "Could not initialize payment. Manual payment is still available.");
    } finally {
      if (paymentMethod !== "razorpay") {
        setPaymentLoading(false);
      }
    }
  }

  function openPaymentRequest(existingOrder) {
    if (!existingOrder) return;
    const nextCentre = centres.find((centre) => (
      centre.id === existingOrder.centreId ||
      centre.id === existingOrder.hub?.id ||
      centre.code === existingOrder.centreCode ||
      centre.code === existingOrder.hub?.code ||
      centre.name === existingOrder.centre
    ));
    const paymentOrder = existingOrder.backendId
      ? existingOrder
      : {
          ...existingOrder,
          id: existingOrder.order_code || existingOrder.id,
          backendId: existingOrder.id,
          centreId: existingOrder.hub?.id || existingOrder.centreId,
          centreCode: existingOrder.hub?.code || existingOrder.centreCode,
          centre: existingOrder.hub?.name || existingOrder.centre,
          paymentStatus: existingOrder.payment_status || existingOrder.payment?.status,
        };
    setOrder(paymentOrder);
    if (nextCentre) setSelectedCentre(nextCentre);
    setPendingPayment({
      id: `manual-${paymentOrder.backendId || paymentOrder.id}`,
      orderId: paymentOrder.backendId || paymentOrder.id,
      amount: paymentOrder.amount,
      method: "MANUAL_UPI_OR_CASH",
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    setUpiQr(nextCentre?.upiQrImageUrl ? { imageUrl: nextCentre.upiQrImageUrl } : null);
    setPaymentError("");
    navigate("track");
  }

  async function reprintWithSettings(historyOrder) {
    if (!currentUser || currentUser.role !== "user" || !historyOrder) return;

    setPaymentLoading(true);
    let orderDetails = historyOrder;
    if (!historyOrder.document && (!historyOrder.documents || historyOrder.documents.length === 0)) {
      try {
        orderDetails = await getOrderDetail(historyOrder.id);
        if (!orderDetails) throw new Error("Order details not found");
      } catch (err) {
        alert(err.message || "Failed to load order details for reprint.");
        setPaymentLoading(false);
        return;
      }
    }

    const config = orderDetails.print_config || {};
    const document = orderDetails.document || {};
    const nextCentre = centres.find((centre) => (
      centre.id === orderDetails.hub?.id ||
      centre.code === orderDetails.hub?.code ||
      centre.name === orderDetails.hub?.name
    ));

    if (nextCentre) setSelectedCentre(nextCentre);

    // Pre-fill all print settings from original order (same as before)
    setDocumentName(document.file_name || orderDetails.documentName || orderDetails.document_name || "");
    setPages(Number(document.original_pages || orderDetails.pages || 1));
    setSelectedPages(config.page_range && config.page_range !== "all" ? config.page_range : "");
    setCopies(Number(config.copies || document.copies || orderDetails.copies || 1));
    setColorType(config.color_mode === "color" ? "color" : "bw");
    setSideType(config.duplex ? "double" : "single");
    setPaperSize(config.paper_size || "A4");
    setPagesPerSheet(Number(config.pages_per_sheet || 1));
    setOrientation(config.orientation || "auto");
    setPrintDpi(Number(config.quality_dpi || 300));
    setScaleMode(config.scaling || "original");
    setMarginMode(config.margins || "default");
    setWatermark(Boolean(config.watermark?.enabled));
    setWatermarkType(config.watermark?.type || "order_code");
    setWatermarkText(config.watermark?.text || "");
    setWatermarkPosition(config.watermark?.position || "bottom_right");
    setWatermarkOpacity(Number(config.watermark?.opacity || 0.18));
    setWatermarkFontSize(Number(config.watermark?.fontSize || 18));
    setWatermarkRotation(Number(config.watermark?.rotation || 45));
    setBackendPrice(null);
    setPaymentError("");
    setOrder(null);
    setPendingPayment(null);
    setUpiQr(null);

    const docs = (orderDetails.documents?.length ? orderDetails.documents : [orderDetails.document].filter(Boolean))
      .map(normalizeReprintSourceDocument);
    const docsWithId = docs.filter((document) => document.documentId);

    // Reset previous reprint state
    setDocumentFile(null);
    setDocumentFiles([]);
    
    const initialConfigs = {};
    docsWithId.forEach((doc, idx) => {
      if (doc) {
        const opts = doc.printOptions;
        if (opts) {
          const pagesMode = opts.pages?.mode;
          const pageRange = opts.pages?.range;
          const isCustomRange = pagesMode === "custom";

          initialConfigs[idx] = {
            selectedPages: isCustomRange ? pageRange : "",
            copies: Number(opts.copies || 1),
            colorType: opts.colorMode === "color" ? "color" : "bw",
            sideType: (opts.sides === "two_sided_long_edge" || opts.sides === "double") ? "double" : "single",
            paperSize: opts.paperSize || "A4",
            pagesPerSheet: Number(opts.pagesPerSheet || 1),
            orientation: opts.orientation || "auto",
            printDpi: Number(opts.quality?.dpi || 300),
            scaleMode: opts.scale?.mode || "original",
            marginMode: opts.margins?.mode || "default",
            watermark: Boolean(opts.watermark?.enabled),
            watermarkType: opts.watermark?.type || "order_code",
            watermarkText: opts.watermark?.text || "",
            watermarkPosition: opts.watermark?.position || "bottom_right",
            watermarkOpacity: Number(opts.watermark?.opacity || 0.18),
            watermarkFontSize: Number(opts.watermark?.fontSize || 18),
            watermarkRotation: Number(opts.watermark?.rotation || 0),
          };
        }
      }
    });
    setMultiFileConfigs(initialConfigs);
    if (docsWithId.length === 1 && initialConfigs[0]) {
      const restored = initialConfigs[0];
      setPages(Number(restored.pages || docsWithId[0].pageCount || pages || 1));
      setSelectedPages(restored.selectedPages || "");
      setCopies(Number(restored.copies || 1));
      setColorType(restored.colorType || "bw");
      setSideType(restored.sideType || "single");
      setPaperSize(restored.paperSize || "A4");
      setPagesPerSheet(Number(restored.pagesPerSheet || 1));
      setOrientation(restored.orientation || "auto");
      setPrintDpi(Number(restored.printDpi || 300));
      setScaleMode(restored.scaleMode || "original");
      setMarginMode(restored.marginMode || "default");
      setWatermark(Boolean(restored.watermark));
      setWatermarkType(restored.watermarkType || "order_code");
      setWatermarkText(restored.watermarkText || "");
      setWatermarkPosition(restored.watermarkPosition || "bottom_right");
      setWatermarkOpacity(Number(restored.watermarkOpacity || 0.18));
      setWatermarkFontSize(Number(restored.watermarkFontSize || 18));
      setWatermarkRotation(Number(restored.watermarkRotation || 0));
    }
    setReprintSourceDocuments(docs);
    setReprintDocumentExpired(false);

    if (docsWithId.length === 0) {
      // No document IDs available — can't fetch from Supabase
      setReprintDocumentExpired(true);
      setPaymentLoading(false);
      navigate("upload");
      return;
    }

    // Try to fetch each document from Supabase as a Blob → File
    setPaymentLoading(true);
    try {
      const results = await Promise.allSettled(
        docsWithId.map(async (doc) => {
          const { signedUrl } = await createDocumentSignedDownload(doc.documentId);
          if (!signedUrl) throw new Error("No signed URL");
          const response = await fetch(signedUrl);
          if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
          const blob = await response.blob();
          const fileName = doc.fileName || "document.pdf";
          return new File([blob], fileName, { type: blob.type || "application/pdf" });
        })
      );

      const succeededFiles = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);

      const failedCount = results.filter((r) => r.status === "rejected").length;

      if (succeededFiles.length > 0) {
        setDocumentFiles(succeededFiles);
        setDocumentFile(succeededFiles[0]);
        if (succeededFiles.length === 1) {
          setDocumentName(succeededFiles[0].name);
        } else {
          setDocumentName(`${succeededFiles.length} uploaded documents`);
        }
        setReprintSourceDocuments([]);
        // Partial expiry: some docs loaded, some didn't
        if (failedCount > 0) setReprintDocumentExpired(true);
      } else {
        // All fetches failed — doc expired
        setReprintDocumentExpired(true);
      }
    } catch {
      setReprintDocumentExpired(true);
    } finally {
      setPaymentLoading(false);
    }

    navigate("upload");
  }

  async function reprintWithSameSettings(historyOrder) {
    if (!currentUser || currentUser.role !== "user" || !historyOrder) return;

    setPaymentLoading(true);
    setPaymentError("");

    let orderDetails = historyOrder;
    if (!historyOrder.document && (!historyOrder.documents || historyOrder.documents.length === 0)) {
      try {
        orderDetails = await getOrderDetail(historyOrder.id);
        if (!orderDetails) throw new Error("Order details not found");
      } catch (err) {
        alert(err.message || "Failed to load order details for reprint.");
        setPaymentLoading(false);
        return;
      }
    }

    const nextCentre = centres.find((centre) => (
      centre.id === orderDetails.hub?.id ||
      centre.code === orderDetails.hub?.code ||
      centre.name === orderDetails.hub?.name
    ));

    if (!nextCentre) {
      alert("The printing centre for this order is no longer available.");
      setPaymentLoading(false);
      return;
    }

    try {
      const response = await reprintOrder(historyOrder.backendId || historyOrder.id, { allowDocumentReuse: true });
      
      if (!response.success && response.nextAction === "document_reupload_required") {
        alert(response.message || "Original document is no longer available. Please upload it again to reprint.");
        // We could redirect to upload with prefill here, but for now we fallback to the old reprintWithSettings
        // which fetches the file locally (and will likely also fail and ask for reupload).
        return reprintWithSettings(historyOrder);
      }

      if (!response.success) {
        throw new Error(response.message || "Failed to recreate order");
      }

      const createdOrder = normalizeOrder(response.order, centres);
      setOrder(createdOrder);
      setOrders((prev) => upsertOrder(prev, createdOrder));
      setLastOrdersUpdatedAt(new Date().toISOString());
      emitOrderChanged();
      invalidateUserHistory(currentUser?.id || "me");

      setSelectedCentre(nextCentre);
      setPendingPayment(null);
      setUpiQr(null);
      
      if (response.nextAction === "payment_required") {
        navigate("payment");
      } else {
        navigate("track");
      }
    } catch (err) {
      alert(err.message || "Could not reprint order. You may need to upload the file again.");
    } finally {
      setPaymentLoading(false);
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
        headers: orderAccessToken ? { "x-order-access-token": orderAccessToken } : {},
        body: JSON.stringify({ orderId: existingOrder.backendId, orderAccessToken: orderAccessToken || undefined }),
      });

      setPendingPayment(paymentData.payment || null);
      if (paymentData.order) {
        const requestedOrder = normalizeOrder(paymentData.order, centres);
        setOrder(requestedOrder);
        setOrders((prev) => upsertOrder(prev, requestedOrder));
        setLastOrdersUpdatedAt(new Date().toISOString());
      emitOrderChanged();
        invalidateUserHistory(currentUser?.id || "me");
      }
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
            setPaymentError("");
            const verifiedData = await apiRequest("/api/payments/razorpay/verify", {
              method: "POST",
              headers: orderAccessToken ? { "x-order-access-token": orderAccessToken } : {},
              body: JSON.stringify({
                paymentId: paymentData.payment.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                orderAccessToken: orderAccessToken || undefined,
              }),
            });

            const nextOrder = normalizeOrder(verifiedData.order || existingOrder, centres);
            setOrder(nextOrder);
            setOrders((prev) => upsertOrder(prev, nextOrder));
            setLastOrdersUpdatedAt(new Date().toISOString());
      emitOrderChanged();
            invalidateUserHistory(currentUser?.id || "me");
            setPendingPayment(null);
            setUpiQr(null);
          } catch (error) {
            setPaymentError(error.message || "Payment verification failed.");
          } finally {
            setPaymentLoading(false);
          }
        },
        modal: {
          ondismiss: function () {
            setPaymentError("Payment was not completed. You can retry or pay manually at the shop.");
            setPaymentLoading(false);
          },
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
        headers: orderAccessToken ? { "x-order-access-token": orderAccessToken } : {},
        body: JSON.stringify({ orderId: existingOrder.backendId, orderAccessToken: orderAccessToken || undefined }),
      });

      setPendingPayment(paymentData.payment || null);
      setUpiQr(paymentData.qr || null);
      if (paymentData.order) {
        const requestedOrder = normalizeOrder(paymentData.order, centres);
        setOrder(requestedOrder);
        setOrders((prev) => upsertOrder(prev, requestedOrder));
        setLastOrdersUpdatedAt(new Date().toISOString());
      emitOrderChanged();
        invalidateUserHistory(currentUser?.id || "me");
      }
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
      emitOrderChanged();
      invalidateUserHistory(currentUser?.id || "me");
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
        emitOrderChanged();
        invalidateUserHistory(currentUser?.id || "me");
        if (order?.id === orderId || order?.backendId === existingOrder.backendId) setOrder(savedOrder);
        return;
      }
    } catch (error) {
      alert(error.message || "Could not update order status.");
      return;
    }

    setOrders((prev) => prev.map((item) => (item.id === orderId ? { ...item, status: nextStatus } : item)));
    setLastOrdersUpdatedAt(new Date().toISOString());
    emitOrderChanged();
    if (order?.id === orderId) setOrder((prev) => ({ ...prev, status: nextStatus }));
  }

  function applySavedOrderUpdate(orderData) {
    if (!orderData) return null;

    const savedOrder = normalizeOrder(orderData, centres);
    setOrders((prev) => upsertOrder(prev, savedOrder));
    setLastOrdersUpdatedAt(new Date().toISOString());
    emitOrderChanged();

    if (order?.id === savedOrder.id || order?.backendId === savedOrder.backendId) {
      setOrder(savedOrder);
    }

    return savedOrder;
  }

  useEffect(() => {
    if (!currentUser) return;

    const shouldPollHistory = false; // Never poll user history page
    const shouldPollTrack = page === "track" && order?.backendId;
    const shouldPollHub = currentUser?.role === "hub";
    if (!shouldPollHistory && !shouldPollTrack && !shouldPollHub) return;

    async function refreshVisibleOrders() {
      const nextOrders = await loadOrdersForSession(currentUser, centres);
      if (shouldPollTrack && order?.backendId) {
        const nextOrder = nextOrders.find((item) => item.backendId === order.backendId || item.id === order.id);
        if (nextOrder) setOrder(nextOrder);
      }
    }

    const intervalMs = shouldPollHistory ? 7000 : 3000;
    const interval = setInterval(refreshVisibleOrders, intervalMs);
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") refreshVisibleOrders();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [page, currentUser?.id, currentUser?.role, order?.backendId, centres]);

  async function updateCentrePrice(field, value) {
    if (!currentHub) return;

    const numericValue = Number(value);
    if (isNaN(numericValue) || numericValue < 0 || numericValue > 10000) {
      throw new Error("Price must be a number between 0 and 10,000.");
    }

    const data = await apiRequest("/api/centres/me/pricing", {
      method: "PATCH",
      body: JSON.stringify({ [field]: numericValue }),
    });
    const centre = normalizeCentre(data.centre);
    setCentres((prev) => upsertCentre(prev, centre));
  }

  async function updateCentrePayment(field, value) {
    if (!currentHub) return;

    const data = await apiRequest("/api/centres/me/payment-method", {
      method: "PATCH",
      body: JSON.stringify({ [field]: value }),
    });
    const centre = normalizeCentre(data.centre);
    setCentres((prev) => upsertCentre(prev, centre));
  }

  function updateCentreAfterOrderSettings(settings) {
    if (!currentHub) return;
    setCentres((prev) =>
      prev.map((centre) =>
        centre.id === currentHub.id || centre.code === currentHub.code
          ? { ...centre, afterOrderSettings: settings || {} }
          : centre
      )
    );
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
        openProfile={openProfile}
      />

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-8 md:pb-8">
        <BackendStatus />
        <RouteErrorBoundary>
          <Suspense fallback={
            <div className="flex h-full min-h-[50vh] w-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"></div>
            </div>
          }>
            <Routes>
              <Route
                path={ROUTES.home}
                element={<HomePage currentUser={currentUser} navigate={navigate} startLogin={startLogin} handleSignOut={logout} prioritizedCentres={prioritizedCentres} selectCentreByCode={selectCentreByCode} selectCentreAndUpload={selectCentreAndUpload} />}
              />
              <Route path={ROUTES.auth} element={<AuthPage authMode={authMode} setAuthMode={setAuthMode} onLoginSuccess={handleLoginSuccess} returnPath={authReturnPath} />} />
              <Route
                path={ROUTES.userDashboard}
                element={
                  currentUser?.role === "user" ? (
                    <UserDashboard currentUser={currentUser} recentOrders={orders} onSignOut={logout} navigate={navigate} startLogin={startLogin} prioritizedCentres={prioritizedCentres} selectCentreByCode={selectCentreByCode} selectCentreAndUpload={selectCentreAndUpload} />
                  ) : (
                    <RouteNotice title="User Login Required" message="Please login as a user to view your dashboard." actionLabel="Login as User" onAction={() => startLogin("user")} />
                  )
                }
              />
              <Route
                path={ROUTES.hubDashboard}
                element={
                  currentUser?.role === "hub" ? (
                    <HubDashboard currentHub={currentHub} onSignOut={logout} updateCentreStatus={updateCentreStatus} updateCentrePrice={updateCentrePrice} />
                  ) : (
                    <RouteNotice title="Print Hub Login Required" message="Please login as a print hub to access the hub dashboard." actionLabel="Login as Print Hub" onAction={() => startLogin("hub")} />
                  )
                }
              />
              <Route
                path={ROUTES.profile}
                element={
                  currentUser ? (
                    <ProfilePage currentUser={currentUser} onProfileUpdate={handleProfileUpdate} onSignOut={logout} />
                  ) : (
                    <RouteNotice title="Login Required" message="Please login to view your profile." actionLabel="Login" onAction={() => startLogin("user")} />
                  )
                }
              />
              <Route
                path={ROUTES.platformStats}
                element={
                  currentUser?.role === "admin" ? (
                    <PlatformStatsPage currentUser={currentUser} />
                  ) : (
                    <RouteNotice title="Admin Access Required" message="You do not have permission to view platform metrics." actionLabel="Return Home" onAction={() => navigate("/")} />
                  )
                }
              />
              <Route
                path={ROUTES.hubHistory}
                element={
                  currentUser?.role === "hub" ? (
                    <HubHistoryPage
                      currentHub={currentHub}
                      orders={orders}
                      updateOrderStatus={updateOrderStatus}
                      refreshOrders={() => loadOrdersForSession(currentUser, centres)}
                      onOrderSaved={applySavedOrderUpdate}
                      navigate={navigate}
                    />
                  ) : (
                    <RouteNotice title="Print Hub Login Required" message="Please login as a print hub to view history." actionLabel="Login as Print Hub" onAction={() => startLogin("hub")} />
                  )
                }
              />
              <Route
                path={ROUTES.hubPricing}
                element={
                  currentUser?.role === "hub" ? (
                    <HubPricingPage currentHub={currentHub} updateCentrePrice={updateCentrePrice} updateCentrePayment={updateCentrePayment} onAfterOrderSettingsUpdate={updateCentreAfterOrderSettings} />
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
              <Route path={ROUTES.desktopAgent} element={<DesktopAgentPage currentUser={currentUser} />} />
              <Route path={ROUTES.centre} element={<CentreCodePage centreCode={centreCode} setCentreCode={setCentreCode} handleCentreCode={handleCentreCode} selectCentreByCode={selectCentreByCode} centres={prioritizedCentres} selectCentreAndUpload={selectCentreAndUpload} lookupLoading={centreLookupLoading} lookupError={centreLookupError} autoStartScanner={Boolean(location.state?.autoStartScanner)} />} />
              <Route path={ROUTES.upload} element={<UploadPage currentUser={currentUser} startLogin={startLogin} selectedCentre={selectedCentre} documentFile={documentFile} setDocumentFile={setDocumentFile} documentFiles={documentFiles} setDocumentFiles={setDocumentFiles} reprintSourceDocuments={reprintSourceDocuments} setReprintSourceDocuments={setReprintSourceDocuments} reprintDocumentExpired={reprintDocumentExpired} setReprintDocumentExpired={setReprintDocumentExpired} multiFileConfigs={multiFileConfigs} setMultiFileConfigs={setMultiFileConfigs} documentName={documentName} setDocumentName={setDocumentName} pages={pages} setPages={setPages} selectedPages={selectedPages} setSelectedPages={setSelectedPages} copies={copies} setCopies={setCopies} colorType={colorType} setColorType={setColorType} sideType={sideType} setSideType={setSideType} paperSize={paperSize} setPaperSize={setPaperSize} pagesPerSheet={pagesPerSheet} setPagesPerSheet={setPagesPerSheet} orientation={orientation} setOrientation={setOrientation} printDpi={printDpi} setPrintDpi={setPrintDpi} scaleMode={scaleMode} setScaleMode={setScaleMode} marginMode={marginMode} setMarginMode={setMarginMode} watermark={watermark} setWatermark={setWatermark} watermarkType={watermarkType} setWatermarkType={setWatermarkType} watermarkText={watermarkText} setWatermarkText={setWatermarkText} watermarkPosition={watermarkPosition} setWatermarkPosition={setWatermarkPosition} watermarkOpacity={watermarkOpacity} setWatermarkOpacity={setWatermarkOpacity} watermarkFontSize={watermarkFontSize} setWatermarkFontSize={setWatermarkFontSize} watermarkRotation={watermarkRotation} setWatermarkRotation={setWatermarkRotation} pricePerPage={pricePerPage} estimatedSelectedPageCount={estimatedSelectedPageCount} totalAmount={totalAmount} backendPrice={backendPrice} setBackendPrice={setBackendPrice} preparePayment={preparePayment} paymentLoading={paymentLoading} paymentError={paymentError} navigate={navigate} />} />
              <Route
                path={ROUTES.payment}
                element={
                  selectedCentre && order ? (
                    <PaymentPage currentUser={currentUser} startLogin={startLogin} selectedCentre={selectedCentre} documentName={documentName} pages={pages} copies={copies} backendPrice={backendPrice} order={order} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} handlePayment={handlePayment} paymentLoading={paymentLoading} paymentError={paymentError} />
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
                    centreUpiId={selectedCentre?.upiId}
                    centreUpiQrImageUrl={selectedCentre?.upiQrImageUrl}
                    onPayOnline={startRazorpayForExistingOrder}
                    onCreateUpiQr={createUpiQrForExistingOrder}
                    onSimulateVerifiedPayment={demoPaymentEnabled ? handleVerifyDemoPayment : null}
                    paymentLoading={paymentLoading}
                    paymentError={paymentError}
                  />
                }
              />
              <Route path={ROUTES.history} element={<HistoryPage orders={orders} currentUser={currentUser} lastUpdatedAt={lastOrdersUpdatedAt} onOpenPayment={openPaymentRequest} onReprintOrder={reprintWithSameSettings} onReprintWithSettings={reprintWithSettings} isReprinting={paymentLoading} />} />
              <Route path={ROUTES.orderHistory} element={<Navigate to={ROUTES.history} replace />} />
              <Route path={ROUTES.usageHistory} element={<Navigate to={ROUTES.history} replace />} />
              <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
            </Routes>
          </Suspense>
        </RouteErrorBoundary>
      </main>
    </div>
  );
}
