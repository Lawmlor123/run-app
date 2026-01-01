import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import axios from "axios";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function ChangeView({ center }) {
  const map = useMap();
  map.setView(center, 15);
  return null;
}

function App() {
  const [position, setPosition] = useState(null);
  const [routes, setRoutes] = useState([]);         // 🔹 multiple routes
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [distance, setDistance] = useState(1);
  const [loading, setLoading] = useState(true);

  const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6Ijc0YmI3ODc4MGI2MzRlZjliNWRjYmNiOTJlZjcyOWZmIiwiaCI6Im11cm11cjY0In0=";

  useEffect(() => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPosition([latitude, longitude]);
        setLoading(false);
      },
      (err) => {
        console.error("Location error:", err);
        alert("Could not access GPS. Showing NYC as example.");
        setPosition([40.7128, -74.006]);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  // 🔹 Generate multiple alternate routes
  const generateRoutes = async () => {
    if (!position) return;

    const offset = distance / 100;
    const url =
      "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";

    // We'll create a few “targets” in different directions
    const offsets = [
      [offset, offset],
      [-offset, offset],
      [offset, -offset],
      [-offset, -offset],
    ];

    const results = [];

    for (let i = 0; i < offsets.length; i++) {
      try {
        const res = await axios.post(
          url,
          {
            coordinates: [
              [position[1], position[0]],
              [position[1] + offsets[i][0], position[0] + offsets[i][1]],
              [position[1], position[0]],
            ],
          },
          {
            headers: {
              Authorization: ORS_API_KEY,
              "Content-Type": "application/json",
            },
          }
        );

        const coords = res.data.features[0].geometry.coordinates.map((c) => [
          c[1],
          c[0],
        ]);

        results.push(coords);
      } catch (err) {
        console.error("Route error:", err);
      }
    }

    setRoutes(results);
    setSelectedRoute(0);
  };

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f5f5",
          color: "#333",
          fontSize: "1.5rem",
        }}
      >
        <div
          style={{
            border: "6px solid #ddd",
            borderTop: "6px solid #007bff",
            borderRadius: "50%",
            width: "50px",
            height: "50px",
            animation: "spin 1s linear infinite",
            marginBottom: "20px",
          }}
        ></div>
        Finding your location…
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      {/* Control Panel */}
      <div
        style={{
          position: "absolute",
          zIndex: 1000,
          background: "#fff",
          padding: "10px",
          borderRadius: "8px",
          top: "10px",
          left: "10px",
          boxShadow: "0 0 5px rgba(0,0,0,0.3)",
          width: "fit-content",
        }}
      >
        <div style={{ marginBottom: "8px" }}>
          <label htmlFor="distance">Route length (miles): </label>
          <input
            id="distance"
            type="number"
            value={distance}
            min="0.2"
            step="0.1"
            onChange={(e) => setDistance(parseFloat(e.target.value))}
            style={{ width: "80px", marginRight: "10px" }}
          />
          <button
            onClick={generateRoutes}
            style={{
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "6px",
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Generate Routes
          </button>
        </div>

        {/* 🔹 If multiple routes, show choice buttons */}
        {routes.length > 1 && (
          <div>
            {routes.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedRoute(idx)}
                style={{
                  marginRight: "6px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border:
                    idx === selectedRoute
                      ? "2px solid #007bff"
                      : "1px solid #ccc",
                  backgroundColor:
                    idx === selectedRoute ? "#e6f0ff" : "white",
                  cursor: "pointer",
                }}
              >
                Route {idx + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <MapContainer center={position} zoom={14} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {position && (
          <>
            <ChangeView center={position} />
            <Marker position={position}>
              <Popup>You are here</Popup>
            </Marker>
          </>
        )}
        {routes.length > 0 && (
          <>
            {routes.map((r, idx) => (
              <Polyline
                key={idx}
                positions={r}
                pathOptions={{
                  color: idx === selectedRoute ? "#ff3b3b" : "#888",
                  weight: idx === selectedRoute ? 7 : 4,
                  opacity: idx === selectedRoute ? 0.95 : 0.6,
                }}
              />
            ))}
          </>
        )}
      </MapContainer>
    </div>
  );
}

export default App;