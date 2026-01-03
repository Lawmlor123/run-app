import React, { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  GeoJSON,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// 💡 Configure Leaflet markers
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

// 🔹 Helper function for round-trip (loop) routes
async function generateRoundTripRoute(lat, lng, distanceMeters, seedOffset = 0, ORS_API_KEY) {
  const url =
    "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";
  const body = {
    coordinates: [[lng, lat]],
    round_trip: {
      length: distanceMeters,
      points: 4 + seedOffset, // vary shape slightly
      seed: Date.now() + seedOffset,
    },
    format: "geojson",
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: ORS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error("ORS round trip request failed");
  const data = await response.json();
  return data;
}

function App() {
  const [position, setPosition] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [distance, setDistance] = useState(1);
  const [loading, setLoading] = useState(true);

  // ⚠️ Replace this with your real key (or .env variable)
  const ORS_API_KEY = process.env.REACT_APP_ORS_KEY;

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
        alert("Could not access GPS — using NYC as example.");
        setPosition([40.7128, -74.006]);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  // 🔁 Generate 4 loop routes
  const generateRoutes = async () => {
    if (!position) return;
    setLoading(true);
    setRoutes([]);

    try {
      const distanceMeters = distance * 1609.34; // miles ➜ meters

      const loops = await Promise.all([
        generateRoundTripRoute(position[0], position[1], distanceMeters, 1, ORS_API_KEY),
        generateRoundTripRoute(position[0], position[1], distanceMeters, 2, ORS_API_KEY),
        generateRoundTripRoute(position[0], position[1], distanceMeters, 3, ORS_API_KEY),
        generateRoundTripRoute(position[0], position[1], distanceMeters, 4, ORS_API_KEY),
      ]);

      setRoutes(loops);
      setSelectedRoute(0);
    } catch (error) {
      console.error("Error generating loop routes:", error);
      alert("Could not generate loop routes. Please try again later.");
    } finally {
      setLoading(false);
    }
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
            Generate Loop Routes
          </button>
        </div>

        {/* Route selection buttons */}
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
                Loop {idx + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Map */}
      <MapContainer
        center={position}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {position && (
          <>
            <ChangeView center={position} />
            <Marker position={position}>
              <Popup>Start / End Point</Popup>
            </Marker>
          </>
        )}

        {routes.length > 0 && (
          <>
            {routes.map((route, idx) => (
              <GeoJSON
                key={idx}
                data={route}
                style={{
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