import { Component, useEffect, useMemo, useRef, useState } from "react";
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
import {
  clearSupabaseUrlSession,
  getSupabaseUser,
  readSupabaseSessionFromUrl,
} from "./utils/supabaseAuth";

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

  return {
    id: orderCode,
    backendId: order.backendId || order.id,
    centreId: centreId || centre?.id,
    centreCode: centreCodeFromOrder || centre?.code || "",
    centre: order.centre || centre?.name || "Selected centre",
    customerName: extractCustomerName(order) || "Customer",
    customerMobile: order.customerMobile || order.customer_mobile || order.userMobile || order.user_mobile || order.customer?.mobile || order.user?.mobile || order.mobile || "",
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
  const [watermarkRotation, setWatermarkRotation] = useState(0);
  const [order, setOrder] = useState(null);
  const [backendPrice, setBackendPrice] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [pendingPayment, setPendingPayment] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("manual");
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

  async function suggestUniqueUsername(nextName = name, nextEmail = email, force = false) {
    const requestId = usernameSuggestionRequest.current + 1;
    usernameSuggestionRequest.current = requestId;
    const bases = getUsernameBaseCandidates(nextName, nextEmail);
    const candidates = [];

    for (const [baseIndex, base] of bases.entries()) {
      candidates.push(base);
      const maxSerial = baseIndex === 0 ? 9999 : 999;
      for (let index = 0; index <= maxSerial; index += 1) {
        candidates.push(`${base}${index}`);
      }
    }

    for (const candidate of candidates) {
      try {
        const data = await apiRequest(`/api/auth/username-available?username=${encodeURIComponent(candidate)}`);
        if (usernameSuggestionRequest.current !== requestId || (!force && usernameEdited)) return;
        if (data.available) {
          setUsernameState(data.username || candidate);
          return;
        }
      } catch {
        if (usernameSuggestionRequest.current === requestId && (force || !usernameEdited)) {
          setUsernameState(candidates[0]);
        }
        return;
      }
    }

    if (usernameSuggestionRequest.current === requestId && (force || !usernameEdited)) {
      setUsernameState(candidates[0]);
    }
  }

  function updateEmail(value) {
    setEmail(value);
    if (!usernameEdited) {
      suggestUniqueUsername(name, value);
    }
  }

  function updateName(value) {
    setName(value);
    if (!usernameEdited) {
      suggestUniqueUsername(value, email);
    }
  }

  function updateUsername(value) {
    setUsernameEdited(true);
    setUsernameState(normalizeUsername(value));
  }

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
      suggestUniqueUsername(name, email, true);
    }
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

    if (authMode === "register" && (!trimmedUsername || !/^[a-z0-9]+$/.test(trimmedUsername))) {
      setAuthError("Username can use only lowercase letters and numbers.");
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

    if (authMode === "register" && authRole === "hub" && (!trimmedHubName || !trimmedHubCode)) {
      setAuthError("Enter print hub name and centre code.");
      return;
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
          files: uploadedDocuments.map((document) => ({
            documentId: document.id,
            documentName: document.fileName,
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
          orientation,
          printDpi,
          scaleMode,
          marginMode,
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

    if (paymentMethod === "manual") {
      setPendingPayment({
        id: `manual-${order.backendId}`,
        orderId: order.backendId,
        amount: order.amount,
        method: "MANUAL_UPI_OR_CASH",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
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
      centre.code === existingOrder.centreCode ||
      centre.name === existingOrder.centre
    ));
    setOrder(existingOrder);
    if (nextCentre) setSelectedCentre(nextCentre);
    setPendingPayment({
      id: `manual-${existingOrder.backendId || existingOrder.id}`,
      orderId: existingOrder.backendId || existingOrder.id,
      amount: existingOrder.amount,
      method: "MANUAL_UPI_OR_CASH",
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    setUpiQr(nextCentre?.upiQrImageUrl ? { imageUrl: nextCentre.upiQrImageUrl } : null);
    setPaymentError("");
    navigate("track");
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
                  currentUser={currentUser}
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
                email={email}
                setEmail={updateEmail}
                password={password}
                setPassword={setPassword}
                showPassword={showPassword}
                setShowPassword={setShowPassword}
                username={username}
                setUsername={updateUsername}
                name={name}
                setName={updateName}
                mobile={mobile}
                setMobile={setMobile}
                hubName={hubName}
                setHubName={setHubName}
                hubCode={hubCode}
                setHubCode={setHubCode}
                generateStrongPassword={generateStrongPassword}
                handleAuthSubmit={handleAuthSubmit}
                handleGoogleLogin={handleGoogleLogin}
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
          <Route path={ROUTES.desktopAgent} element={<DesktopAgentPage currentUser={currentUser} />} />
          <Route path={ROUTES.centre} element={<CentreCodePage centreCode={centreCode} setCentreCode={setCentreCode} handleCentreCode={handleCentreCode} centres={centres} selectCentreAndUpload={selectCentreAndUpload} lookupLoading={centreLookupLoading} lookupError={centreLookupError} />} />
          <Route path={ROUTES.upload} element={<UploadPage selectedCentre={selectedCentre} documentFile={documentFile} setDocumentFile={setDocumentFile} documentFiles={documentFiles} setDocumentFiles={setDocumentFiles} documentName={documentName} setDocumentName={setDocumentName} pages={pages} setPages={setPages} selectedPages={selectedPages} setSelectedPages={setSelectedPages} copies={copies} setCopies={setCopies} colorType={colorType} setColorType={setColorType} sideType={sideType} setSideType={setSideType} paperSize={paperSize} setPaperSize={setPaperSize} pagesPerSheet={pagesPerSheet} setPagesPerSheet={setPagesPerSheet} orientation={orientation} setOrientation={setOrientation} printDpi={printDpi} setPrintDpi={setPrintDpi} scaleMode={scaleMode} setScaleMode={setScaleMode} marginMode={marginMode} setMarginMode={setMarginMode} watermark={watermark} setWatermark={setWatermark} watermarkType={watermarkType} setWatermarkType={setWatermarkType} watermarkText={watermarkText} setWatermarkText={setWatermarkText} watermarkPosition={watermarkPosition} setWatermarkPosition={setWatermarkPosition} watermarkOpacity={watermarkOpacity} setWatermarkOpacity={setWatermarkOpacity} watermarkFontSize={watermarkFontSize} setWatermarkFontSize={setWatermarkFontSize} watermarkRotation={watermarkRotation} setWatermarkRotation={setWatermarkRotation} pricePerPage={pricePerPage} estimatedSelectedPageCount={estimatedSelectedPageCount} totalAmount={totalAmount} backendPrice={backendPrice} preparePayment={preparePayment} paymentLoading={paymentLoading} paymentError={paymentError} navigate={navigate} />} />
          <Route
            path={ROUTES.payment}
            element={
              selectedCentre && order ? (
                <PaymentPage selectedCentre={selectedCentre} documentName={documentName} pages={pages} copies={copies} backendPrice={backendPrice} order={order} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} handlePayment={handlePayment} paymentLoading={paymentLoading} paymentError={paymentError} />
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
            <Route path={ROUTES.history} element={<HistoryPage orders={orders} currentUser={currentUser} lastUpdatedAt={lastOrdersUpdatedAt} onOpenPayment={openPaymentRequest} />} />
            <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
          </Routes>
        </RouteErrorBoundary>
      </main>
    </div>
  );
}
