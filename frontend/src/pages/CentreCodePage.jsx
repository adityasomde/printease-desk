import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Search, Map } from "lucide-react";
import Card from "../components/Card";
import CentrePriceCard from "../components/CentrePriceCard";
import CentreScannerTile from "../components/CentreScannerTile";

// Lazy-load the map modal — only downloaded when user clicks "Map" for the first time.
// This keeps the desktop bundle untouched since DesktopAgentPage never imports this component.
const CentreMapModal = lazy(() => import("../components/CentreMapModal"));

export default function CentreCodePage({
  centreCode,
  setCentreCode,
  handleCentreCode,
  selectCentreByCode,
  centres,
  selectCentreAndUpload,
  lookupLoading,
  lookupError,
  autoStartScanner = false,
}) {
  const [mapOpen, setMapOpen] = useState(false);

  const handleScan = useCallback(async (code) => {
    setCentreCode(code);
    await selectCentreByCode(code);
  }, [selectCentreByCode, setCentreCode]);

  const filteredCentres = useMemo(() => {
    const query = String(centreCode || "").trim().toLowerCase();
    if (!query) return centres;

    return centres.filter((centre) =>
      [centre.name, centre.code, centre.owner, centre.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [centreCode, centres]);

  const mappableCentres = useMemo(
    () => centres.filter((c) => c.locationEnabled && c.latitude != null && c.longitude != null),
    [centres]
  );

  function openMapForCentre() {
    setMapOpen(true);
  }

  return (
    <div className="space-y-8">
      <Card className="text-center sm:text-left sm:p-8">
        <h2 className="text-3xl font-bold text-slate-900">Find a Printing Centre</h2>

        <div className="mt-6 grid gap-6 md:grid-cols-[45%_1fr]">
          <CentreScannerTile
            onScan={handleScan}
            minHeightClass="min-h-[185px]"
            iconSize={54}
            idleLabel="Scan QR"
            activeLabel="Point at centre QR"
            idleHint="Tap to scan inside this card."
            autoStart={autoStartScanner}
          />

          <div className="flex flex-col gap-4 justify-center">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={22} />
              <input
                value={centreCode}
                onChange={(e) => setCentreCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCentreCode();
                  }
                }}
                placeholder="Search by name or code (e.g. 2045)"
                className="w-full rounded-2xl border bg-slate-50 py-4 pl-14 pr-6 text-lg outline-none focus:bg-white focus:ring-2 focus:ring-slate-300 transition-all"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCentreCode}
                disabled={lookupLoading || !String(centreCode).trim()}
                className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-2xl bg-slate-900 px-8 py-4 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                Search Online
              </button>
              {mappableCentres.length > 0 && (
                <button
                  onClick={openMapForCentre}
                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                >
                  <Map size={18} /> View Map
                </button>
              )}
            </div>
          </div>
        </div>

        {lookupError && <p className="mt-4 text-sm font-medium text-red-600">{lookupError}</p>}
        {lookupLoading && <p className="mt-4 text-sm text-slate-500">Checking centre code online...</p>}
      </Card>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold">Centre List With Prices</h3>
            <p className="text-sm text-slate-600">Frequently used centres appear first.</p>
          </div>
          {mappableCentres.length > 0 && (
            <button
              onClick={openMapForCentre}
              className="hidden sm:flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition"
            >
              <Map size={15} />
              {mappableCentres.length} centre{mappableCentres.length !== 1 ? "s" : ""} on map
            </button>
          )}
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredCentres.map((centre) => (
            <CentrePriceCard
              key={centre.id}
              centre={centre}
              onUpload={() => selectCentreAndUpload(centre)}
              onOpenMap={openMapForCentre}
            />
          ))}
        </div>
        {filteredCentres.length === 0 && (
          <div className="mt-6 rounded-3xl border border-dashed bg-slate-50 p-12 text-center">
            <Search className="mx-auto text-slate-400 mb-3" size={40} />
            <p className="text-lg font-medium text-slate-700">No centre matches locally</p>
            <p className="text-sm text-slate-500 mt-1">If you have an exact code, click "Search Online".</p>
          </div>
        )}
      </div>

      {/* Lazy-loaded map modal — only rendered when opened */}
      {mapOpen && (
        <Suspense fallback={null}>
          <CentreMapModal
            centres={filteredCentres.length > 0 ? filteredCentres : centres}
            onClose={() => setMapOpen(false)}
            onSelectCentre={(centre) => selectCentreAndUpload(centre)}
          />
        </Suspense>
      )}
    </div>
  );
}
