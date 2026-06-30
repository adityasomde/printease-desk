import React, { Suspense } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import BackendStatus from "./components/BackendStatus";
const HomePage = React.lazy(() => import("./pages/HomePage"));
const AuthPage = React.lazy(() => import("./pages/AuthPage"));
const UserDashboard = React.lazy(() => import("./pages/UserDashboard"));
const HubDashboard = React.lazy(() => import("./pages/HubDashboard"));
const ProfilePage = React.lazy(() => import("./pages/ProfilePage"));
const HubPricingPage = React.lazy(() => import("./pages/HubPricingPage"));
const HubPrinterAgentPage = React.lazy(() => import("./pages/HubPrinterAgentPage"));
const ConversionPage = React.lazy(() => import("./pages/ConversionPage"));
const ApproveAgentPage = React.lazy(() => import("./pages/ApproveAgentPage"));
const DesktopAgentPage = React.lazy(() => import("./pages/DesktopAgentPage"));
const CentreCodePage = React.lazy(() => import("./pages/CentreCodePage"));
const UploadPage = React.lazy(() => import("./pages/UploadPage"));
const PaymentPage = React.lazy(() => import("./pages/PaymentPage"));
const TrackPage = React.lazy(() => import("./pages/TrackPage"));
const HistoryPage = React.lazy(() => import("./pages/HistoryPage"));
const PlatformStatsPage = React.lazy(() => import("./pages/PlatformStatsPage"));
import { ROUTES, RouteErrorBoundary, RouteNotice } from "./utils/appHelpers.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";

const HubHistoryPage = React.lazy(() => import("./pages/HubHistoryPage"));

export default function AppRouter(props) {
  const {
    page, navigate, profileOpen, setProfileOpen, currentUser, desktopAvailable,
    logout, openProfile, authMode, authRole, changeAuthMode, changeAuthRole,
    authError, authLoading, handleAuthSubmit, handleGoogleLogin, email, updateEmail,
    password, setPassword, name, updateName, mobile, setMobile,
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
  } = props;

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
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route
              path={ROUTES.home}
              element={
                <HomePage
                  currentUser={currentUser}
                  navigate={navigate}
                  centres={prioritizedCentres}
                  startLogin={startLogin}
                  startRegister={startRegister}
                  startDirectUpload={startDirectUpload}
                  selectCentreAndUpload={selectCentreAndUpload}
                  selectCentreByCode={selectCentreByCode}
                  currentHub={currentHub}
                  hubOrders={hubOrders}
                  updateOrderStatus={updateOrderStatus}
                  refreshOrders={() => loadOrdersForSession(currentUser, centres)}
                  onOrderSaved={applySavedOrderUpdate}
                  orders={orders}
                />
              }
            />
            
            <Route path={ROUTES.platformStats} element={<PlatformStatsPage />} />

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
                usernameStatus={usernameStatus}
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
            path={ROUTES.profile}
            element={
              currentUser ? (
                <ProfilePage currentUser={currentUser} updateProfile={updateProfile} navigate={navigate} />
              ) : (
                <RouteNotice title="Login Required" message="Please login to view your profile." actionLabel="Login" onAction={() => startLogin("user")} />
              )
            }
          />

          <Route
            path={ROUTES.userDashboard}
            element={
              currentUser?.role === "user" ? (
                <UserDashboard currentUser={currentUser} navigate={navigate} orders={orders} openProfile={openProfile} />
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
                  onOrderSaved={applySavedOrderUpdate}
                  onAfterOrderSettingsUpdate={updateCentreAfterOrderSettings}
                  navigate={navigate}
                  openProfile={openProfile}
                />
              ) : (
                <RouteNotice title="Print Hub Login Required" message="Please login as a print hub to view this dashboard." actionLabel="Login as Print Hub" onAction={() => startLogin("hub")} />
              )
            }
          />
          <Route
            path={ROUTES.hubHistory}
            element={
              currentUser?.role === "hub" ? (
                <Suspense fallback={<div className="text-center py-10 font-medium text-slate-500">Loading Hub History...</div>}>
                  <HubHistoryPage
                    currentHub={currentHub}
                    hubOrders={hubOrders}
                    updateOrderStatus={updateOrderStatus}
                    refreshOrders={() => loadOrdersForSession(currentUser, centres)}
                    onOrderSaved={applySavedOrderUpdate}
                    navigate={navigate}
                  />
                </Suspense>
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
            path={ROUTES.conversion}
            element={
              currentUser?.role === "hub" ? (
                <ConversionPage navigate={navigate} />
              ) : (
                <RouteNotice title="Print Hub Login Required" message="Please login as a print hub to view conversion diagnostics." actionLabel="Login as Print Hub" onAction={() => startLogin("hub")} />
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
                <PaymentPage currentUser={currentUser} startLogin={startLogin} selectedCentre={selectedCentre} documentName={documentName} pages={pages} copies={copies} backendPrice={backendPrice} order={order} refreshActivePaymentOrder={refreshActivePaymentOrder} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} handlePayment={handlePayment} paymentLoading={paymentLoading} paymentError={paymentError} />
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
