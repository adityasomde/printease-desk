const fs = require('fs');
const code = fs.readFileSync('src/App.jsx', 'utf8');

const returnStart = code.indexOf('  return (\n    <div className="min-h-screen');
if (returnStart === -1) throw new Error("Could not find start");

const routerCode = code.slice(returnStart + 2); // skip '  '
const topCode = code.slice(0, returnStart);

const imports = `import { Suspense } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import BackendStatus from "./components/BackendStatus";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import UserDashboard from "./pages/UserDashboard";
import HubDashboard from "./pages/HubDashboard";
import ProfilePage from "./pages/ProfilePage";
import HubPricingPage from "./pages/HubPricingPage";
import HubPrinterAgentPage from "./pages/HubPrinterAgentPage";
import ApproveAgentPage from "./pages/ApproveAgentPage";
import DesktopAgentPage from "./pages/DesktopAgentPage";
import CentreCodePage from "./pages/CentreCodePage";
import UploadPage from "./pages/UploadPage";
import PaymentPage from "./pages/PaymentPage";
import TrackPage from "./pages/TrackPage";
import HistoryPage from "./pages/HistoryPage";
import PlatformStatsPage from "./pages/PlatformStatsPage";
import { ROUTES } from "./utils/appHelpers.jsx";

const HubHistoryPage = React.lazy(() => import("./pages/HubHistoryPage"));

export default function AppRouter(props) {
  const {
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
    reprintWithSettings, reprintWithSameSettings
  } = props;

`;

fs.writeFileSync('src/AppRouter.jsx', imports + routerCode + '\n');

const appFooter = `
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
      reprintWithSettings, reprintWithSameSettings
    }} />
  );
}
`;

const updatedApp = topCode.replace(/import \{ Component, useEffect/g, 'import AppRouter from "./AppRouter";\nimport { Component, useEffect') + appFooter;
fs.writeFileSync('src/App.jsx', updatedApp);

console.log("Router Extracted");
