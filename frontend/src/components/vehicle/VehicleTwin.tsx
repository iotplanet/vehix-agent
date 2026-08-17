import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, Tabs, TabList, Tab, TabPanel, Skeleton, Button } from "@heroui/react";
import { Activity, Wrench, Radio, Trash2 } from "lucide-react";
import { useVehicleStore } from "../../store/vehicleStore";
import { useAuthStore } from "../../store/authStore";
import TelemetryCharts from "./TelemetryCharts";
import DTCList from "./DTCList";
import CommandCenter from "./CommandCenter";
import KpiCard from "../shared/KpiCard";
import StatusBadge from "../shared/StatusBadge";

export default function VehicleTwin() {
  const { vin } = useParams<{ vin: string }>();
  const navigate = useNavigate();
  const twin = useVehicleStore((s) => s.twin);
  const fetchTwin = useVehicleStore((s) => s.fetchTwin);
  const vehicles = useVehicleStore((s) => s.vehicles);
  const fetchVehicles = useVehicleStore((s) => s.fetchVehicles);
  const deleteVehicle = useVehicleStore((s) => s.deleteVehicle);
  const storeError = useVehicleStore((s) => s.error);
  const role = useAuthStore((s) => s.user?.role);
  const canDelete = role === "admin" || role === "superuser";
  const vehicle = vehicles.find((v) => v.vin === vin);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchVehicles();
      if (vin) await fetchTwin(vin);
      setLoading(false);
    };
    load();
    if (vin) {
      const interval = setInterval(() => fetchTwin(vin), 3000);
      return () => clearInterval(interval);
    }
  }, [vin]);

  const handleDelete = async () => {
    if (!vin) return;
    if (!window.confirm(`确认删除车辆 ${vehicle?.plate_no || vin}？此操作不可恢复。`)) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteVehicle(vin);
      navigate("/fleet", { replace: true });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-48 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!twin && !vehicle) {
    return <Card className="bg-content1 border-divider"><CardContent className="p-8 text-center text-default-400">未找到车辆数据{storeError ? `：${storeError}` : ""}</CardContent></Card>;
  }

  const alarmLevel = twin?.alarm_level || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h1 className="page-title truncate">{vehicle?.plate_no || vin} — 数字孪生</h1>
          <StatusBadge level={alarmLevel} />
        </div>
        {canDelete && (
          <Button
            variant="secondary"
            size="sm"
            className="self-start sm:ml-auto text-danger"
            isDisabled={deleting}
            onPress={handleDelete}
          >
            <Trash2 size={14} className="mr-1" />{deleting ? "删除中..." : "删除车辆"}
          </Button>
        )}
      </div>

      {(storeError || actionError) && (
        <div className="p-3 rounded-lg border text-sm bg-danger/10 border-danger/30 text-danger">
          {actionError || storeError}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {vehicle?.protocol_type === "gb32960" ? (
          <>
            <KpiCard label="SOC" value={twin?.soc} unit="%" tone="ok" />
            <KpiCard label="SOH" value={twin?.soh} unit="%" tone={twin?.soh && twin.soh < 90 ? "warn" : "ok"} />
            <KpiCard label="车速" value={twin?.speed} unit="km/h" tone="info" />
            <KpiCard label="总里程" value={twin?.mileage ? (twin.mileage / 10000).toFixed(1) : null} unit="万km" tone="neutral" />
            <KpiCard label="最高电芯温度" value={twin?.max_cell_temp} unit="°C" tone={twin?.max_cell_temp && twin.max_cell_temp > 50 ? "critical" : "neutral"} />
            <KpiCard label="电机温度" value={twin?.motor_temp} unit="°C" tone={twin?.motor_temp && twin.motor_temp > 140 ? "critical" : "neutral"} />
            <KpiCard label="绝缘电阻" value={twin?.insulation_resistance} unit="kΩ" tone={twin?.insulation_resistance && twin.insulation_resistance < 150 ? "critical" : "neutral"} />
            <KpiCard label="告警等级" value={`${alarmLevel}`} unit="/3" tone={alarmLevel >= 2 ? "critical" : alarmLevel >= 1 ? "warn" : "neutral"} />
          </>
        ) : (
          <>
            <KpiCard label="油量" value={twin?.fuel_level} unit="%" tone={twin?.fuel_level && twin.fuel_level < 20 ? "critical" : "ok"} />
            <KpiCard label="车速" value={twin?.speed} unit="km/h" tone="info" />
            <KpiCard label="发动机转速" value={twin?.engine_rpm} unit="rpm" tone={twin?.engine_rpm && twin.engine_rpm > 3000 ? "warn" : "neutral"} />
            <KpiCard label="冷却液温度" value={twin?.coolant_temp} unit="°C" tone={twin?.coolant_temp && twin.coolant_temp > 100 ? "critical" : "neutral"} />
            <KpiCard label="机油压力" value={twin?.oil_pressure} unit="bar" tone={twin?.oil_pressure && twin.oil_pressure < 1.5 ? "critical" : "neutral"} />
            <KpiCard label="瞬时油耗" value={twin?.fuel_consumption} unit="L/100km" tone="neutral" />
            <KpiCard label="载货状态" value={twin?.cargo_status === "loaded" ? "满载" : twin?.cargo_status === "empty" ? "空载" : "—"} tone={twin?.cargo_status === "loaded" ? "warn" : "neutral"} />
            <KpiCard label="告警等级" value={`${alarmLevel}`} unit="/3" tone={alarmLevel >= 2 ? "critical" : alarmLevel >= 1 ? "warn" : "neutral"} />
          </>
        )}
      </div>

      <Card className="bg-content1 border-divider">
        <CardHeader><h3 className="text-sm font-medium text-default-500">车辆信息</h3></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Info label="VIN" value={twin?.vin || vin || "—"} mono />
            <Info label="协议类型" value={vehicle?.protocol_type === "jtt808" ? "JT/T 808" : vehicle?.protocol_type === "jtt1078" ? "JT/T 1078" : "GB/T 32960"} />
            {vehicle?.protocol_type === "gb32960" ? (
              <>
                <Info label="电池电压" value={twin?.battery_voltage != null ? `${twin.battery_voltage} V` : "—"} />
                <Info label="电池电流" value={twin?.battery_current != null ? `${twin.battery_current} A` : "—"} />
                <Info label="电机转速" value={twin?.motor_speed != null ? `${twin.motor_speed} rpm` : "—"} />
              </>
            ) : (
              <>
                <Info label="车辆类别" value={vehicle?.vehicle_category === "truck" ? "货车" : vehicle?.vehicle_category === "bus" ? "客车" : vehicle?.vehicle_category === "taxi" ? "出租车" : vehicle?.vehicle_category || "—"} />
                <Info label="燃料类型" value={vehicle?.fuel_type === "diesel" ? "柴油" : vehicle?.fuel_type === "gasoline" ? "汽油" : vehicle?.fuel_type === "cng" ? "天然气" : vehicle?.fuel_type || "—"} />
                <Info label="驾驶员" value={vehicle?.driver_name || twin?.driver_name || "—"} />
                <Info label="ACC" value={twin?.acc_status === "on" ? "✅ 开启" : "⚫ 关闭"} />
                <Info label="视频通道" value={twin?.video_channels ? `${twin.video_channels} 路` : "无"} />
              </>
            )}
            <Info label="活跃故障码" value={twin?.active_dtcs?.length ? twin.active_dtcs.join(", ") : "无"} />
            <Info label="最后上报" value={twin?.last_report_at ? new Date(twin.last_report_at).toLocaleString() : "—"} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultSelectedKey="telemetry">
        <TabList className="bg-content1 border border-divider rounded-lg p-1 w-full overflow-x-auto">
          <Tab key="telemetry" id="telemetry" className="text-default-500 data-[selected]:text-primary text-xs sm:text-sm whitespace-nowrap">
            <Activity size={14} className="inline mr-1" /><span className="sm:hidden">遥测</span><span className="hidden sm:inline">遥测曲线</span>
          </Tab>
          <Tab key="dtc" id="dtc" className="text-default-500 data-[selected]:text-primary text-xs sm:text-sm whitespace-nowrap">
            <Wrench size={14} className="inline mr-1" /><span className="sm:hidden">故障</span><span className="hidden sm:inline">故障码</span>
          </Tab>
          <Tab key="commands" id="commands" className="text-default-500 data-[selected]:text-primary text-xs sm:text-sm whitespace-nowrap">
            <Radio size={14} className="inline mr-1" /><span className="sm:hidden">车控</span><span className="hidden sm:inline">远程车控</span>
          </Tab>
        </TabList>
        <TabPanel key="telemetry" id="telemetry">{vin && <TelemetryCharts vin={vin} />}</TabPanel>
        <TabPanel key="dtc" id="dtc">{vin && <DTCList vin={vin} />}</TabPanel>
        <TabPanel key="commands" id="commands">{vin && <CommandCenter vin={vin} />}</TabPanel>
      </Tabs>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div><span className="text-default-400 text-xs">{label}</span><div className={`text-foreground mt-0.5 ${mono ? "font-mono text-xs" : ""}`}>{value}</div></div>;
}
