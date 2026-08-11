import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, CardContent, CardHeader, Skeleton, Table, Chip, ChipLabel,
} from "@heroui/react";
import AMapLoader from "@amap/amap-jsapi-loader";
import { useVehicleStore } from "../../store/vehicleStore";
import { useFleetStore } from "../../store/fleetStore";
import KpiCard from "../shared/KpiCard";
import StatusBadge from "../shared/StatusBadge";

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || "";

// ── Module-level AMap singleton to survive StrictMode double-mount ──
let amapPromise: Promise<any> | null = null;
let amapLoaded = false;

function loadAMapOnce(): Promise<any> {
  if (amapLoaded && (window as any).AMap) return Promise.resolve((window as any).AMap);
  if (amapPromise) return amapPromise;
  amapPromise = AMapLoader.load({ key: AMAP_KEY, version: "2.0" })
    .then((AMap) => { amapLoaded = true; return AMap; });
  return amapPromise;
}

export default function FleetMap() {
  const vehicles = useVehicleStore((s) => s.vehicles);
  const fetchVehicles = useVehicleStore((s) => s.fetchVehicles);
  const stats = useFleetStore((s) => s.stats);
  const fetchStats = useFleetStore((s) => s.fetchStats);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const mapRef = useRef<AMap.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<AMap.Marker[]>([]);
  const infoWindowRef = useRef<AMap.InfoWindow | null>(null);
  const [mapError, setMapError] = useState(false);

  // ── Init AMap after container is ready (not during skeleton) ──
  const mapReady = !loading && !!containerRef.current && !!AMAP_KEY;

  useEffect(() => {
    if (!mapReady) return;
    if (mapRef.current) return; // already initialized

    loadAMapOnce()
      .then((AMap) => {
        if (mapRef.current || !containerRef.current) return;
        const map = new AMap.Map(containerRef.current, {
          zoom: 12,
          center: [116.397, 39.909],
          viewMode: "2D",
          mapStyle: "amap://styles/dark",
          resizeEnable: true,
        });
        mapRef.current = map;
        infoWindowRef.current = new AMap.InfoWindow({ offset: { x: 0, y: -30 } });
      })
      .catch(() => setMapError(true));

    return () => {
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [mapReady]);

  // ── Fetch vehicle data ────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchVehicles(), fetchStats()]);
      setLoading(false);
    };
    load();
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

  return (
    <div className="space-y-4">
      <h1 className="text-lg sm:text-xl font-bold">车队地图</h1>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          <KpiCard label="车辆总数" value={stats.total_vehicles} unit="台" />
          <KpiCard label="在线" value={stats.online_vehicles} unit="台" color="text-green-400" />
          <KpiCard label="离线" value={stats.offline_vehicles} unit="台" color="text-default-500" />
          <KpiCard label="平均 SOC" value={stats.avg_soc} unit="%" />
          <KpiCard label="平均 SOH" value={stats.avg_soh} unit="%" />
        </div>
      )}

      {/* AMap */}
      <Card className="relative">
        <CardContent className="p-0">
          <div ref={containerRef} className="w-full h-[360px] sm:h-[460px] rounded-lg overflow-hidden" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-content1 rounded-lg">
              <Skeleton className="w-full h-full rounded-lg" />
            </div>
          )}
          {(!AMAP_KEY || mapError) && (
            <div className="absolute inset-0 flex items-center justify-center bg-content1/80 rounded-lg">
              <div className="text-center text-default-400">
                <div className="text-lg mb-2">🗺️</div>
                {!AMAP_KEY ? (
                  <>
                    <div>请配置高德地图 Key</div>
                    <div className="text-xs mt-1">在 frontend/.env 中设置 VITE_AMAP_KEY</div>
                  </>
                ) : (
                  <>
                    <div>地图加载失败</div>
                    <div className="text-xs mt-1">请检查 Key 是否有效或网络连接</div>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vehicle table */}
      <Card className="">
        <CardHeader className="pb-0 pt-4 px-4"><h3 className="text-sm font-medium text-foreground">车辆列表</h3></CardHeader>
        <CardContent className="p-0">
          <Table variant="secondary" aria-label="车辆列表">
            <Table.ScrollContainer>
              <Table.Content className="min-w-[600px]">
                <Table.Header>
                  <Table.Column isRowHeader className="text-xs">车牌</Table.Column>
                  <Table.Column className="text-xs">协议</Table.Column>
                  <Table.Column className="text-xs">车型</Table.Column>
                  <Table.Column className="text-xs">SOC/油量</Table.Column>
                  <Table.Column className="text-xs">SOH/水温</Table.Column>
                  <Table.Column className="text-xs">告警</Table.Column>
                  <Table.Column className="text-xs">状态</Table.Column>
                </Table.Header>
                <Table.Body
                  items={vehicles}
                  renderEmptyState={() => (
                    <div className="py-8 text-center text-default-400">暂无车辆数据</div>
                  )}
                >
                  {(v) => (
                    <Table.Row key={v.vin} id={v.vin} className="cursor-pointer" onClick={() => navigate(`/vehicle/${v.vin}`)}>
                      <Table.Cell className="font-semibold">{v.plate_no}</Table.Cell>
                      <Table.Cell>
                        <Chip size="sm" color={v.protocol_type === "jtt808" ? "warning" : v.protocol_type === "jtt1078" ? "danger" : "accent"}>
                          <ChipLabel>{v.protocol_type === "gb32960" ? "GB/T 32960" : v.protocol_type.toUpperCase()}</ChipLabel>
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className="text-xs">{v.oem} {v.model}</Table.Cell>
                      <Table.Cell>
                        {v.protocol_type === "gb32960"
                          ? (v.twin?.soc != null ? `${v.twin.soc}%` : "—")
                          : (v.twin?.fuel_level != null ? `${v.twin.fuel_level}%` : "—")}
                      </Table.Cell>
                      <Table.Cell>
                        {v.protocol_type === "gb32960"
                          ? (v.twin?.soh != null ? `${v.twin.soh}%` : "—")
                          : (v.twin?.coolant_temp != null ? `${v.twin.coolant_temp}°C` : "—")}
                      </Table.Cell>
                      <Table.Cell>
                        <StatusBadge level={v.twin?.alarm_level || 0} />
                      </Table.Cell>
                      <Table.Cell>
                        <StatusBadge status={v.online_status} />
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
