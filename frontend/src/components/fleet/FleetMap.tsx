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
import AlertBanner from "../shared/AlertBanner";
import { ALARM_HEX, ALARM_LABELS, PROTOCOL_CHIP } from "../../lib/statusTheme";

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || "";

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
  const vehicleError = useVehicleStore((s) => s.error);
  const stats = useFleetStore((s) => s.stats);
  const fetchStats = useFleetStore((s) => s.fetchStats);
  const fleetError = useFleetStore((s) => s.error);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const mapRef = useRef<AMap.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<AMap.Marker[]>([]);
  const infoWindowRef = useRef<AMap.InfoWindow | null>(null);
  const [mapError, setMapError] = useState(false);

  const mapReady = !loading && !!containerRef.current && !!AMAP_KEY;

  useEffect(() => {
    if (!mapReady) return;
    if (mapRef.current) return;

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

  useEffect(() => {
    const map = mapRef.current;
    const AMap = (window as any).AMap;
    if (!map || !AMap) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    vehicles.forEach((v) => {
      const t = v.twin;
      if (!t?.gps_lng || !t?.gps_lat) return;

      const level = t.alarm_level || 0;
      const baseColor = ALARM_HEX[level] || ALARM_HEX[0];
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
              <span>SOC <b style="color:${ALARM_HEX[0]}">${t.soc}%</b></span>
              <span>${t.speed}km/h</span>
            </div>
            <div style="margin-top:6px">
              <span style="
                display:inline-block;padding:2px 8px;border-radius:999px;
                background:${baseColor}22;color:${baseColor};font-size:11px;font-weight:500
              ">${ALARM_LABELS[level] || "正常"}</span>
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

  useEffect(() => {
    (window as any).__vehixNav = (vin: string) => navigate(`/vehicle/${vin}`);
    return () => { delete (window as any).__vehixNav; };
  }, [navigate]);

  return (
    <div className="space-y-5">
      <h1 className="page-title">车队地图</h1>

      {(vehicleError || fleetError) && (
        <AlertBanner>{vehicleError || fleetError}</AlertBanner>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[1.25rem]" />
          ))}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <KpiCard label="车辆总数" value={stats.total_vehicles} unit="台" />
          <KpiCard label="在线" value={stats.online_vehicles} unit="台" />
          <KpiCard label="离线" value={stats.offline_vehicles} unit="台" />
          <KpiCard label="平均 SOC" value={stats.avg_soc} unit="%" />
          <KpiCard label="平均 SOH" value={stats.avg_soh} unit="%" />
        </div>
      )}

      <Card className="relative overflow-hidden bg-content1 border-divider">
        <CardContent className="p-2 sm:p-3">
          <div ref={containerRef} className="w-full h-[280px] sm:h-[400px] lg:h-[460px] rounded-2xl overflow-hidden" />
          {loading && (
            <div className="absolute inset-2 sm:inset-3 flex items-center justify-center bg-content1 rounded-2xl">
              <Skeleton className="w-full h-full rounded-2xl" />
            </div>
          )}
          {(!AMAP_KEY || mapError) && (
            <div className="absolute inset-2 sm:inset-3 flex items-center justify-center bg-content1/90 rounded-2xl">
              <div className="text-center text-default-400 px-4">
                <div className="text-sm font-medium mb-1">{!AMAP_KEY ? "请配置高德地图 Key" : "地图加载失败"}</div>
                <div className="text-xs">
                  {!AMAP_KEY ? "在 frontend/.env 中设置 VITE_AMAP_KEY" : "请检查 Key 是否有效或网络连接"}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-content1 border-divider">
        <CardHeader className="pb-0 pt-5 px-5">
          <h3 className="text-base font-semibold text-foreground">车辆列表</h3>
        </CardHeader>
        <CardContent className="p-0">
          <Table variant="secondary" aria-label="车辆列表">
            <Table.ScrollContainer>
              <Table.Content className="min-w-[560px]">
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
                  {(v) => {
                    const proto = PROTOCOL_CHIP[v.protocol_type] || PROTOCOL_CHIP.gb32960;
                    return (
                      <Table.Row key={v.vin} id={v.vin} className="cursor-pointer" onClick={() => navigate(`/vehicle/${v.vin}`)}>
                        <Table.Cell className="font-semibold">{v.plate_no}</Table.Cell>
                        <Table.Cell>
                          <Chip size="sm" variant="soft" color={proto.tone}>
                            <ChipLabel>{proto.label}</ChipLabel>
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
                    );
                  }}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
