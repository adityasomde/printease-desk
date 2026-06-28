import AppRouter from "./AppRouter";
import { Component, useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { emitOrderChanged } from "./utils/appEvents";
import Navbar from "./components/Navbar";
import BackendStatus from "./components/BackendStatus";
import { hubActivityStore } from "./state/hubActivityStore";
import { initialCentres, initialOrders } from "./data/demoData";
import { calculateTotalAmount, countSelectedPages, getPricePerPage } from "./utils/price";
import { countSelectedPagesPreview, estimatePricePreview } from "./utils/printEstimate";
import { clearStoredAuth, getStoredAuth, isDesktop, onPrintersUpdated, saveStoredAuth } from "./utils/desktopBridge";
import { apiRequest, invalidateUserHistory, createDocumentSignedDownload, getOrderDetail, getOrderStatus, reprintOrder } from "./services/api";
import { loadRazorpayCheckout } from "./utils/razorpay";
import { saveOrderToLocalHistory } from "./utils/localHistory";
import {
  clearSupabaseUrlSession,
  getSupabaseUser,
  readSupabaseSessionFromUrl,
} from "./utils/supabaseAuth";
import { handleDesktopAutoRegistration } from "./utils/desktopAutoRegistration";
import { prepareBrowserPrintReadyFile } from "./utils/filePreparation/prepareBrowserPrintReadyFile";
import { buildPaymentPriceFromOrder } from "./utils/paymentOrderPricing";

import { persistAuthSession, getPageFromPath, RouteNotice, formatStatus, buildPrintOptions, normalizeCentre, normalizeReprintSourceDocument, upsertCentre, toFrontendRole, findCentreForUser, toCurrentUser, toDisplayLabel, normalizeUsername, getUsernameBaseCandidates, getSupabaseDisplayName, generateStrongPasswordValue, formatOrderDate, extractCustomerName, normalizeOrder, upsertOrder, clearAuthSession, ROUTES } from "./utils/appHelpers.jsx";

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

        console.error("Session restore failed:", error?.message || error);

        clearAuthSession();
        setCurrentUser(null);
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

  useEffect(() => {
    async function restoreActiveOrder() {
      const params = new URLSearchParams(location.search);
      const urlOrderId = params.get("order") || params.get("orderId") || params.get("order_id");
      
      const isPaymentOrTrackPage = ["payment", "track"].includes(page);
      const activeOrderId = urlOrderId || (isPaymentOrTrackPage ? localStorage.getItem("printease_active_order_id") : null);

      if (!activeOrderId) return;

      try {
        const data = await getOrderStatus(activeOrderId, { orderAccessToken });
        if (data && data.order) {
          const refreshedOrder = normalizeOrder(data.order, centres);
          const refreshedPrice = buildPaymentPriceFromOrder(data.order, backendPrice);

          setOrder(refreshedOrder);
          setBackendPrice(refreshedPrice);
          
          const centre = centres.find((c) => c.id === refreshedOrder.centreId || c.code === refreshedOrder.centreCode);
          if (centre) {
            setSelectedCentre(centre);
          }
          
          localStorage.setItem("printease_active_order_id", activeOrderId);
        }
      } catch (err) {
        console.error("Failed to restore active order:", err);
      }
    }

    restoreActiveOrder();
  }, [location.search, centres, page]);

  function startDirectUpload() {
    setSelectedCentre(null);
    setOrder(null);
    setBackendPrice(null);
    localStorage.removeItem("printease_active_order_id");
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
          
          if (selectedCentre) {
            formData.append("hubId", selectedCentre.id || selectedCentre.code);
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
      
      localStorage.setItem("printease_active_order_id", nextOrder.backendId || nextOrder.id);
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

  const refreshActivePaymentOrder = useCallback(async (orderId = order?.backendId || order?.id) => {
    if (!orderId) return null;

    const data = await getOrderStatus(orderId, { orderAccessToken });
    const rawOrder = data.order;
    if (!rawOrder) return null;

    const refreshedOrder = normalizeOrder(rawOrder, centres);
    const refreshedPrice = buildPaymentPriceFromOrder(rawOrder, backendPrice);

    setOrder(refreshedOrder);
    setBackendPrice(refreshedPrice);
    setOrders((prev) => upsertOrder(prev, refreshedOrder));
    setLastOrdersUpdatedAt(new Date().toISOString());
    emitOrderChanged();
    invalidateUserHistory(currentUser?.id || "me");

    return { order: refreshedOrder, price: refreshedPrice, rawOrder };
  }, [backendPrice, centres, currentUser?.id, order?.backendId, order?.id, orderAccessToken]);

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
    <AppRouter {...{
      page, navigate, profileOpen, setProfileOpen, currentUser, desktopAvailable,
      logout, openProfile, authMode, authRole, changeAuthMode, changeAuthRole,
      authError, authLoading, handleAuthSubmit, handleGoogleLogin, email, updateEmail,
      password, setPassword, name, updateName, mobile, setMobile, confirmPassword, setConfirmPassword,
      showPassword, setShowPassword, username, updateUsername, usernameEdited, usernameStatus,
      hubName, setHubName, hubCode, setHubCode, startLogin, startRegister,
      centreCode, setCentreCode, handleCentreCode, centreLookupError, centreLookupLoading,
      selectedCentre, documentFiles, setDocumentFiles, multiFileConfigs, setMultiFileConfigs,
      documentName, setDocumentName, pages, setPages, selectedPages, setSelectedPages,
      copies, setCopies, colorType, setColorType, sideType, setSideType, paperSize, setPaperSize,
      pagesPerSheet, setPagesPerSheet, orientation, setOrientation, printDpi, setPrintDpi,
      scaleMode, setScaleMode, marginMode, setMarginMode, watermark, setWatermark,
      watermarkType, setWatermarkType, watermarkText, setWatermarkText, watermarkPosition, setWatermarkPosition,
      watermarkOpacity, setWatermarkOpacity, watermarkFontSize, setWatermarkFontSize, watermarkRotation, setWatermarkRotation,
      preparePayment, paymentLoading, paymentError, reprintSourceDocuments, setReprintSourceDocuments, reprintDocumentExpired,
      pendingPayment, paymentMethod, setPaymentMethod, upiQr, handlePayment, handleVerifyDemoPayment,
      demoPaymentEnabled, order, updateOrderStatus,
      hubOrders, currentHub, updateCentrePrice, updateCentrePayment, updateCentreAfterOrderSettings, updateProfile,
      startDirectUpload, orders, centres, startRazorpayForExistingOrder, createUpiQrForExistingOrder, openPaymentRequest,
      reprintWithSettings, reprintWithSameSettings,
      prioritizedCentres, selectCentreAndUpload, selectCentreByCode, loadOrdersForSession, applySavedOrderUpdate,
      generateStrongPassword, approvalReturnPath, documentFile, setDocumentFile, setReprintDocumentExpired,
      pricePerPage, estimatedSelectedPageCount, totalAmount, backendPrice, setBackendPrice, refreshActivePaymentOrder, lastOrdersUpdatedAt
    }} />
  );
}
