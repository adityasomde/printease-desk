import { Component, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { clearStoredAuth, isDesktop, saveStoredAuth } from "./desktopBridge";

const ROUTES = {
  home: "/",
  auth: "/auth",
  userDashboard: "/user/dashboard",
  hubDashboard: "/hub/dashboard",
  hubPricing: "/hub/pricing",
  hubPrinters: "/hub/printers",
  conversion: "/hub/conversion",
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
  const rawStatusKey = String(rawStatus).toLowerCase();
  const pricingPending = Boolean(
    rawStatusKey !== "bill_confirmed" &&
    (
      order.pricingPending ||
      order.pricing_pending ||
      priceSnapshot?.pricingPending ||
      rawStatusKey === "awaiting_hub_bill_confirmation" ||
      String(rawBillStatus).toLowerCase() === "awaiting_hub_confirmation"
    )
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
    documents: order.documents || [],
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


export { persistAuthSession, RouteErrorBoundary, getPageFromPath, RouteNotice, formatStatus, buildPrintOptions, normalizeCentre, normalizeReprintSourceDocument, upsertCentre, toFrontendRole, findCentreForUser, toCurrentUser, toDisplayLabel, normalizeUsername, getUsernameBaseCandidates, getSupabaseDisplayName, generateStrongPasswordValue, formatOrderDate, extractCustomerName, normalizeOrder, upsertOrder, clearAuthSession, ROUTES };
