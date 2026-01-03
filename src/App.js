import React, { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  GeoJSON,
  Polyline,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import * as turf from "@turf/turf";

// 💡 Set up marker icons
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

// --------------------------------------------------
// OpenRouteService helper
// --------------------------------------------------
async function generateRoundTripRoute(
  lat,
  lng,
  distanceMeters,
  seedOffset = 0,
  ORS_API_KEY
) {
  const url =
    "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";

  const body = {
    coordinates: [[lng, lat]],
    options: {
      round_trip: {
        length: distanceMeters,
        points: 4 + seedOffset,
        seed: Date.now() + seedOffset,
      },
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

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`ORS request failed: ${msg}`);
  }

  return await response.json();
}

function App() {
  const [position, setPosition] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [distance, setDistance] = useState(1);
  const [loading, setLoading] = useState(true);
  const ORS_API_KEY = process.env.REACT_APP_ORS_KEY;

  // 🆕 Live tracking states
  const [isTracking, setIsTracking] = useState(false);
  const [livePath, setLivePath] = useState([]);
  const [liveDistance, setLiveDistance] = useState(0);
  const [watchId, setWatchId] = useState(null);

  // 🕒 Timer + pace
  const [elapsedTime, setElapsedTime] = useState(0);
  const [timerId, setTimerId] = useState(null);
  const [pace, setPace] = useState(0);

  // 🏁 Milestone alerts
  const [nextMilestone, setNextMilestone] = useState(0.25);

  // --------------------------------------------------
  // Get initial position
  // --------------------------------------------------
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

  // --------------------------------------------------
  // Start / Stop tracking
  // --------------------------------------------------
  const startTracking = () => {
    if (!position || isTracking) return;

    setLivePath([]);
    setLiveDistance(0);
    setElapsedTime(0);
    setNextMilestone(0.25);

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLivePath((prev) => [...prev, [latitude, longitude]]);
      },
      (err) => console.error("watchPosition error:", err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
    setWatchId(id);
    setIsTracking(true);

    const start = Date.now();
    const tid = setInterval(() => {
      setElapsedTime((Date.now() - start) / 1000);
    }, 1000);
    setTimerId(tid);
  };

  const stopTracking = () => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    if (timerId) {
      clearInterval(timerId);
      setTimerId(null);
    }
    setIsTracking(false);
  };

  // --------------------------------------------------
  // Distance + pace recalculation (inside one effect)
  // --------------------------------------------------
  useEffect(() => {
    if (livePath.length < 2) return;

    // Distance
    let total = 0;
    for (let i = 1; i < livePath.length; i++) {
      const from = turf.point([livePath[i - 1][1], livePath[i - 1][0]]);
      const to = turf.point([livePath[i][1], livePath[i][0]]);
      total += turf.distance(from, to, { units: "miles" });
    }
    setLiveDistance(total);

    // Pace
    if (elapsedTime > 0 && total > 0) {
      setPace((elapsedTime / 60) / total);
    }

    // Milestone
    if (total >= nextMilestone) {
      const msg = `You've reached ${nextMilestone.toFixed(2)} miles`;
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(msg));
      alert(msg);
      setNextMilestone((n) => n + 0.25);
    }
  }, [livePath, elapsedTime, nextMilestone]);

  // --------------------------------------------------
  // Helper: format time
  // --------------------------------------------------
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // --------------------------------------------------
  // Generate routes
  // --------------------------------------------------
  const generateRoutes = async () => {
    if (!position) return;
    setLoading(true);
    setRoutes([]);

    try {
      const distanceMeters = distance * 1609.34;
      if (distanceMeters < 1600) {
        alert("Try at least 1 mile — too short for loops.");
        setLoading(false);
        return;
      }

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
      alert("Could not generate routes. Try again later.");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // Loading spinner
  // --------------------------------------------------
  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
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
          }}
        ></div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <p>Finding your location...</p>
      </div>
    );
  }

  // --------------------------------------------------
  // UI
  // --------------------------------------------------
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
          width: "260px",
        }}
      >
        {/* Route generator */}
        <div style={{ marginBottom: "8px" }}>
          <label>Route length (miles): </label>
          <input
            type="number"
            value={distance}
            min="0.2"
            step="0.1"
            onChange={(e) => setDistance(parseFloat(e.target.value))}
            style={{ width: "70px", marginRight: "10px" }}
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
            Generate
          </button>
        </div>

        {/* Run controls */}
        <div style={{ marginBottom: "8px" }}>
          {!isTracking ? (
            <button
              onClick={startTracking}
              style={{
                backgroundColor: "green",
                color: "white",
                borderRadius: "6px",
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Start Tracking
            </button>
          ) : (
            <button
              onClick={stopTracking}
              style={{
                backgroundColor: "red",
                color: "white",
                borderRadius: "6px",
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Stop Tracking
            </button>
          )}
        </div>

        {/* Live stats */}
        {isTracking && (
          <>
            <p>
              Distance: <strong>{liveDistance.toFixed(2)} mi</strong>
            </p>
            <p>
              Time: <strong>{formatTime(elapsedTime)}</strong>
            </p>
            <p>
              Pace: <strong>{pace ? pace.toFixed(2) : "–"} min/mi</strong>
            </p>
          </>
        )}

        {/* Route buttons */}
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
                }}
              >
                Loop {idx + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <MapContainer
        center={position}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <ChangeView center={position} />
        <Marker position={position}>
          <Popup>Start / End</Popup>
        </Marker>

        {routes.length > 0 &&
          routes.map((route, idx) => (
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

        {livePath.length > 1 && (
          <Polyline positions={livePath} color="lime" weight={6} />
        )}
      </MapContainer>
    </div>
  );
}

export default App;