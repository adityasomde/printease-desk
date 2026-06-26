import { useEffect, useRef, useState } from "react";
import { MapPin, X, Upload, Navigation, AlertCircle } from "lucide-react";
import "leaflet/dist/leaflet.css";

// Fix Leaflet's broken default icon path when bundled with Vite
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const availableIcon = new L.Icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: "leaflet-marker-available",
});

const unavailableIcon = new L.Icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: "leaflet-marker-unavailable",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeDomId(value) {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "-");
}

function buildPopupHtml(centre) {
  const statusColor = centre.printerOnline ? "#16a34a" : "#d97706";
  const statusLabel = centre.printerOnline ? "Available" : "Unavailable";
  const addrParts = [centre.addressText, centre.area, centre.city].filter(Boolean);
  const addr = addrParts.map(escapeHtml).join(", ");
  const safeName = escapeHtml(centre.name);
  const safeCode = escapeHtml(centre.code);
  const popupButtonId = `map-upload-${safeDomId(centre.id || centre.code)}`;

  return `
    <div style="min-width:200px;max-width:260px;font-family:inherit">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px">${safeName}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:6px">Code: <b>${safeCode}</b></div>
      <span style="display:inline-block;background:${statusColor}20;color:${statusColor};font-size:11px;font-weight:600;border-radius:999px;padding:2px 10px;margin-bottom:8px">${statusLabel}</span>
      ${addr ? `<div style="font-size:12px;color:#475569;margin-bottom:8px">📍 ${addr}</div>` : ""}
      <div style="background:#f8fafc;border-radius:8px;padding:8px;font-size:11px;color:#334155;margin-bottom:10px">
        <div>B/W Single: ₹${centre.bwSingle ?? "—"}/page</div>
        <div>B/W Double: ₹${centre.bwDouble ?? "—"}/page</div>
        <div>Color Single: ₹${centre.colorSingle ?? "—"}/page</div>
        <div>Color Double: ₹${centre.colorDouble ?? "—"}/page</div>
      </div>
      <a href="#upload-${safeCode}" id="${popupButtonId}" style="display:block;text-align:center;background:#0f172a;color:#fff;border-radius:8px;padding:7px 0;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer">
        ↑ Upload to this Centre
      </a>
    </div>
  `;
}

export default function CentreMapModal({ centres, onClose, onSelectCentre, focusCentre }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [locating, setLocating] = useState(false);

  const mappable = centres.filter(
    (c) => c.locationEnabled && c.latitude != null && c.longitude != null
  );

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Default centre — use first hub or India centre
    const defaultLat = mappable[0]?.latitude ?? 20.5937;
    const defaultLng = mappable[0]?.longitude ?? 78.9629;
    const defaultZoom = mappable.length > 0 ? 13 : 5;

    const map = L.map(mapRef.current, { zoomControl: true }).setView(
      [defaultLat, defaultLng],
      defaultZoom
    );
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Add hub markers
    mappable.forEach((centre) => {
      const icon = centre.printerOnline ? availableIcon : unavailableIcon;
      const marker = L.marker([centre.latitude, centre.longitude], { icon }).addTo(map);
      const popup = L.popup({ maxWidth: 280, className: "printease-popup" }).setContent(
        buildPopupHtml(centre)
      );
      marker.bindPopup(popup);

      // Listen for upload button click inside popup
      marker.on("popupopen", () => {
        setTimeout(() => {
          const btnId = `map-upload-${safeDomId(centre.id || centre.code)}`;
          const btn = document.getElementById(btnId);
          if (btn) {
            btn.addEventListener("click", (e) => {
              e.preventDefault();
              onSelectCentre(centre);
              onClose();
            });
          }
        }, 50);
      });
    });

    // Fit bounds to all markers if multiple
    if (mappable.length > 1) {
      const bounds = L.latLngBounds(mappable.map((c) => [c.latitude, c.longitude]));
      map.fitBounds(bounds, { padding: [48, 48] });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapInstanceRef.current || !focusCentre || focusCentre.latitude == null || focusCentre.longitude == null) return;
    mapInstanceRef.current.setView([focusCentre.latitude, focusCentre.longitude], 16);
  }, [focusCentre]);

  function locateMe() {
    if (!navigator.geolocation) {
      setLocationDenied(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation({ latitude, longitude });
        setLocating(false);
        const map = mapInstanceRef.current;
        if (!map) return;
        map.setView([latitude, longitude], 14);
        L.circleMarker([latitude, longitude], {
          radius: 8,
          color: "#2563eb",
          fillColor: "#3b82f6",
          fillOpacity: 0.8,
          weight: 2,
        })
          .addTo(map)
          .bindPopup("Your location")
          .openPopup();
      },
      () => {
        setLocating(false);
        setLocationDenied(true);
      }
    );
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* CSS for coloured markers via className */}
      <style>{`
        .leaflet-marker-unavailable { filter: hue-rotate(200deg) saturate(2); }
        .printease-popup .leaflet-popup-content-wrapper { border-radius: 12px; padding: 4px; }
        .printease-popup .leaflet-popup-content { margin: 10px 12px; }
      `}</style>

      <div className="relative m-auto flex w-[calc(100%-16px)] sm:w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
        style={{ height: "min(88dvh, 680px)" }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <MapPin size={20} className="text-slate-700" />
            <h2 className="text-lg font-bold text-slate-900">Nearby Print Centres</h2>
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {mappable.length} on map
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={locateMe}
              disabled={locating}
              title="Find my location"
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              <Navigation size={14} className={locating ? "animate-spin" : ""} />
              {locating ? "Locating…" : "My Location"}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-slate-100"
              aria-label="Close map"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Privacy note */}
        {locationDenied && (
          <div className="flex items-center gap-2 border-b bg-amber-50 px-5 py-2 text-sm text-amber-700">
            <AlertCircle size={14} />
            Location permission denied. Map still shows all public centres.
          </div>
        )}

        {/* Map container */}
        <div ref={mapRef} className="flex-1 w-full" />

        {/* Footer */}
        <div className="border-t bg-slate-50 px-5 py-2 text-xs text-slate-500">
          🔒 Your location is used only to show nearby print centres and is not saved. Map data © OpenStreetMap contributors.
          {mappable.length === 0 && (
            <span className="ml-2 font-semibold text-slate-600">
              No centres have shared their location yet.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
