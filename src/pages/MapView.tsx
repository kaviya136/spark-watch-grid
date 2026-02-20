import { useEffect, useRef, useMemo } from "react";
import { useDevices } from "@/hooks/useDevices";
import { useSensorReadings } from "@/hooks/useRealtimeReadings";
import "leaflet/dist/leaflet.css";

function computeDeviceStatus(readings: any[]) {
  if (readings.length === 0) return { label: "Unknown", color: "#6b7280", theftProb: 0 };
  const latest = readings[readings.length - 1];
  const powers = readings.map((r) => r.power || 0);
  const avgPower = powers.reduce((a, b) => a + b, 0) / powers.length;
  const power = latest.power || 0;
  const pir = latest.pir || 0;

  let theftProb = 0;
  if (power === 0 && pir === 1) theftProb = 90;
  else if (power < avgPower * 0.5) theftProb = 70;
  else if (power < avgPower * 0.7) theftProb = 45;
  else theftProb = Math.max(0, Math.round((1 - power / avgPower) * 50));
  theftProb = Math.min(100, Math.max(0, theftProb));

  if (power === 0 && pir === 1) return { label: "Theft Attempt", color: "#ef4444", theftProb };
  if (power < avgPower * 0.6) return { label: "Suspicious", color: "#f59e0b", theftProb };
  return { label: "Stable", color: "#22c55e", theftProb };
}

export default function MapView() {
  const { data: devices = [] } = useDevices();
  // We'll use the first device's readings for intelligence coloring
  const firstDeviceId = devices[0]?.id || null;
  const { data: readings = [] } = useSensorReadings(firstDeviceId);
  const deviceIntel = useMemo(() => computeDeviceStatus(readings), [readings]);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    import("leaflet").then((L) => {
      const map = L.map(mapRef.current!, { center: [20.5937, 78.9629], zoom: 5 });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      }).addTo(map);
      mapInstanceRef.current = map;
    });
    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || devices.length === 0) return;
    import("leaflet").then((L) => {
      const map = mapInstanceRef.current;
      map.eachLayer((layer: any) => { if (layer instanceof L.CircleMarker) map.removeLayer(layer); });

      devices.forEach((device) => {
        if (!device.lat || !device.lng) return;
        // Use intelligence-based colors for assigned device, fallback to status for others
        const isIntelDevice = device.id === firstDeviceId;
        const statusColor = isIntelDevice ? deviceIntel.color :
          device.status === "online" ? "#22c55e" :
          device.status === "alert" ? "#ef4444" :
          device.status === "maintenance" ? "#f59e0b" : "#6b7280";
        const statusLabel = isIntelDevice ? deviceIntel.label : (device.status?.toUpperCase() || "OFFLINE");

        const latestPower = isIntelDevice && readings.length > 0 ? readings[readings.length - 1].power : null;

        L.circleMarker([device.lat, device.lng], {
          radius: 10, fillColor: statusColor, color: statusColor,
          weight: 2, opacity: 0.8, fillOpacity: 0.4,
        }).addTo(map).bindPopup(`
          <div style="font-family: monospace; font-size: 12px;">
            <strong>${device.name}</strong><br/>
            <span style="color: ${statusColor};">● ${statusLabel}</span><br/>
            Code: ${device.device_code}<br/>
            ${latestPower !== null ? `Live Power: ${latestPower.toFixed(1)} W<br/>` : ""}
            ${isIntelDevice ? `Theft Prob: ${deviceIntel.theftProb}%<br/>` : ""}
            ${device.zone ? `Zone: ${device.zone}<br/>` : ""}
            ${device.location || ""}
          </div>
        `);
      });

      const coords = devices.filter((d) => d.lat && d.lng).map((d) => [d.lat!, d.lng!] as [number, number]);
      if (coords.length > 0) map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
    });
  }, [devices, deviceIntel, readings, firstDeviceId]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Smart City Map</h1>
        <p className="text-sm text-muted-foreground">Live device locations with intelligence status</p>
      </div>
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-success" /> Stable</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-warning" /> Suspicious</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Theft Attempt</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-muted-foreground" /> Offline</span>
      </div>
      <div ref={mapRef} className="h-[calc(100vh-220px)] rounded-xl border border-border overflow-hidden" />
    </div>
  );
}
