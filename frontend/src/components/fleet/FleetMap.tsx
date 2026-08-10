import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, CardContent, CardHeader,
} from "@heroui/react";
import AMapLoader from "@amap/amap-jsapi-loader";
import { useVehicleStore } from "../../store/vehicleStore";
import { useFleetStore } from "../../store/fleetStore";

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || "";

export default function FleetMap() {
  const vehicles = useVehicleStore((s) => s.vehicles);
  const fetchVehicles = useVehicleStore((s) => s.fetchVehicles);
  const stats = useFleetStore((s) => s.stats);
  const fetchStats = useFleetStore((s) => s.fetchStats);
  const navigate = useNavigate();

  const mapRef = useRef<AMap.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<AMap.Marker[]>([]);
  const infoWindowRef = useRef<AMap.InfoWindow | null>(null);
  const loadedRef = useRef(false);

  // ── Init AMap ─────────────────────────────────────────────
  useEffect(() => {
    if (loadedRef.current || !containerRef.current) return;
    loadedRef.current = true;

    let map: AMap.Map | undefined;

    AMapLoader.load({
      key: AMAP_KEY,
      version: "2.0",
    })
      .then((AMap) => {
        map = new AMap.Map(containerRef.current!, {
          zoom: 12,
          center: [116.397, 39.909], // Beijing center
          viewMode: "2D",
          mapStyle: "amap://styles/dark",
          resizeEnable: true,
        });
        mapRef.current = map ?? null;
        infoWindowRef.current = new AMap.InfoWindow({ offset: { x: 0, y: -30 } });
      })
      .catch((e) => console.warn("AMap load failed — using fallback:", e));

    return () => {
      map?.destroy();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // ── Fetch vehicle data ────────────────────────────────────
  useEffect(() => {
    fetchVehicles();
    fetchStats();
    const interval = setInterval(fetchVehicles, 5000);
    return () => clearInterval(interval);
  }, []);

  // ── Update markers ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const AMap = (window as any).AMap;
    if (!map || !AMap) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    vehicles.forEach((v) => {
      const t = v.twin;
      if (!t?.gps_lng || !t?.gps_lat) return;

      const level = t.alarm_level || 0;
      const baseColor = level >= 3 ? "#f43f5e" : level >= 2 ? "#f59e0b" : level >= 1 ? "#6366f1" : "#22c55e";
      // Different shape for commercial vehicles
      const isCommercial = v.protocol_type === "jtt808" || v.protocol_type === "jtt1078";
      const shape = isCommercial
        ? `<div style="width:14px;height:14px;background:${baseColor};border:2px solid #fff;box-shadow: 0 0 6px ${baseColor}80;"></div>`
        : `<div style="width:14px;height:14px;border-radius:50%;background:${baseColor};border:2px solid #fff;box-shadow: 0 0 6px ${baseColor}80;"></div>`;

      const marker = new AMap.Marker({
        position: [t.gps_lng, t.gps_lat],
        content: shape,
        title: v.plate_no,
        offset: { x: -7, y: -7 },
        zIndex: level >= 2 ? 200 : 100,
      });

      marker.on("click", () => {
        const info = `
          <div style="padding:8px 12px;font-size:13px;color:#e4e6ed;min-width:160px">
            <div style="font-weight:600;margin-bottom:4px">${v.plate_no}</div>
            <div style="color:#9ca3af;font-size:11px">${v.oem} ${v.model}</div>
            <div style="margin-top:6px;display:flex;gap:12px">
              <span>SOC <b style="color:#22c55e">${t.soc}%</b></span>
              <span>${t.speed}km/h</span>
            </div>
            <div style="margin-top:6px">
              <span style="
                display:inline-block;padding:1px 6px;border-radius:4px;
                background:${baseColor}20;color:${baseColor};font-size:11px
              ">${["正常","注意","警告","严重"][level] || "正常"}</span>
            </div>
            <div style="margin-top:6px;font-size:11px;color:#60a5fa;cursor:pointer"
                 onclick="window.__vehixNav&&window.__vehixNav('${v.vin}')">
              查看详情 →
            </div>
          </div>`;
        infoWindowRef.current?.setContent(info);
        infoWindowRef.current?.open(map, [t.gps_lng, t.gps_lat]);
      });

      map.add(marker);
      markersRef.current.push(marker);
    });
  }, [vehicles]);

  // ── Global nav helper for InfoWindow clicks ───────────────
  useEffect(() => {
    (window as any).__vehixNav = (vin: string) => navigate(`/vehicle/${vin}`);
    return () => { delete (window as any).__vehixNav; };
  }, [navigate]);

  // ── Badge helpers ─────────────────────────────────────────
  const alarmStyles: Record<number, string> = {
    0: "bg-green-500/15 text-green-400",
    1: "bg-blue-500/15 text-blue-400",
    2: "bg-yellow-500/15 text-yellow-400",
    3: "bg-red-500/15 text-red-400",
  };
  const alarmLabel = (level: number) => ["正常","注意","警告","严重"][level] || "正常";

  const protoStyle = (pt: string) =>
    pt === "jtt808" ? "bg-yellow-500/15 text-yellow-400" :
    pt === "jtt1078" ? "bg-red-500/15 text-red-400" :
    "bg-blue-500/15 text-blue-400";

  const protoLabel = (pt: string) =>
    pt === "gb32960" ? "GB/T 32960" : pt.toUpperCase();

  if (vehicles.length === 0 && !stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">车队地图</h1>
        <div className="bg-content1 border border-divider rounded-xl p-12 text-center text-default-400">正在加载车辆数据...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">车队地图</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "车辆总数", value: stats.total_vehicles, unit: "台" },
            { label: "在线", value: stats.online_vehicles, unit: "台" },
            { label: "离线", value: stats.offline_vehicles, unit: "台" },
            { label: "平均 SOC", value: `${stats.avg_soc}`, unit: "%" },
            { label: "平均 SOH", value: `${stats.avg_soh}`, unit: "%" },
          ].map((s) => (
            <Card key={s.label} className="">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-400">{s.value}<span className="text-xs font-normal text-default-400 ml-0.5">{s.unit}</span></div>
                <div className="text-xs text-default-400 mt-1">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* AMap */}
      <Card className="">
        <CardContent className="p-0">
          <div ref={containerRef} className="w-full h-[460px] rounded-lg overflow-hidden" />
          {!AMAP_KEY && (
            <div className="absolute inset-0 flex items-center justify-center bg-content1/80 rounded-lg">
              <div className="text-center text-default-400">
                <div className="text-lg mb-2">🗺️</div>
                <div>请配置高德地图 Key</div>
                <div className="text-xs mt-1">在 frontend/.env 中设置 VITE_AMAP_KEY</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vehicle table */}
      <Card className="">
        <CardHeader className="pb-0 pt-4 px-4"><h3 className="text-sm font-medium text-foreground">车辆列表</h3></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-divider">
                <th className="text-left text-default-500 text-xs font-medium p-3">车牌</th>
                <th className="text-left text-default-500 text-xs font-medium p-3">协议</th>
                <th className="text-left text-default-500 text-xs font-medium p-3">车型</th>
                <th className="text-left text-default-500 text-xs font-medium p-3">SOC/油量</th>
                <th className="text-left text-default-500 text-xs font-medium p-3">SOH/水温</th>
                <th className="text-left text-default-500 text-xs font-medium p-3">告警</th>
                <th className="text-left text-default-500 text-xs font-medium p-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.vin} onClick={() => navigate(`/vehicle/${v.vin}`)} className="border-b border-divider cursor-pointer hover:bg-content2/50 transition-colors">
                  <td className="font-semibold text-foreground p-3">{v.plate_no}</td>
                  <td className="p-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${protoStyle(v.protocol_type)}`}>
                      {protoLabel(v.protocol_type)}
                    </span>
                  </td>
                  <td className="text-foreground p-3 text-xs">{v.oem} {v.model}</td>
                  <td className="text-foreground p-3">
                    {v.protocol_type === "gb32960"
                      ? (v.twin?.soc != null ? `${v.twin.soc}%` : "—")
                      : (v.twin?.fuel_level != null ? `${v.twin.fuel_level}%` : "—")}
                  </td>
                  <td className="text-foreground p-3">
                    {v.protocol_type === "gb32960"
                      ? (v.twin?.soh != null ? `${v.twin.soh}%` : "—")
                      : (v.twin?.coolant_temp != null ? `${v.twin.coolant_temp}°C` : "—")}
                  </td>
                  <td className="p-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${alarmStyles[v.twin?.alarm_level || 0]}`}>
                      {alarmLabel(v.twin?.alarm_level || 0)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${v.online_status === "online" ? "bg-green-500/15 text-green-400" : "bg-zinc-500/15 text-default-500"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${v.online_status === "online" ? "bg-green-400" : "bg-zinc-500"}`} />
                      {v.online_status === "online" ? "在线" : "离线"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
