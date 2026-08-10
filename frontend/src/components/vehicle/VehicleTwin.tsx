import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, Tabs, TabList, Tab, TabPanel, Badge, BadgeLabel } from "@heroui/react";
import { Activity, Wrench, Radio } from "lucide-react";
import { useVehicleStore } from "../../store/vehicleStore";
import TelemetryCharts from "./TelemetryCharts";
import DTCList from "./DTCList";
import CommandCenter from "./CommandCenter";

export default function VehicleTwin() {
  const { vin } = useParams<{ vin: string }>();
  const twin = useVehicleStore((s) => s.twin);
  const fetchTwin = useVehicleStore((s) => s.fetchTwin);
  const vehicles = useVehicleStore((s) => s.vehicles);
  const fetchVehicles = useVehicleStore((s) => s.fetchVehicles);
  const vehicle = vehicles.find((v) => v.vin === vin);

  useEffect(() => {
    fetchVehicles();
    if (vin) {
      fetchTwin(vin);
      const interval = setInterval(() => fetchTwin(vin), 3000);
      return () => clearInterval(interval);
    }
  }, [vin]);

  if (!twin && !vehicle) {
    return <Card className="bg-content1 border-divider"><CardContent className="p-8 text-center text-default-400">加载中...</CardContent></Card>;
  }

  const alarmLevel = twin?.alarm_level || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">{vehicle?.plate_no || vin} — 数字孪生</h1>
        <Badge color={alarmLevel >= 3 ? "danger" : alarmLevel >= 2 ? "warning" : alarmLevel >= 1 ? "accent" : "success"} variant="soft" size="sm">
          <BadgeLabel>{alarmLevel >= 3 ? "严重" : alarmLevel >= 2 ? "警告" : alarmLevel >= 1 ? "注意" : "正常"}</BadgeLabel>
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(vehicle?.protocol_type === "gb32960" ? [
          { label: "SOC", value: twin?.soc, unit: "%", color: "text-green-400" },
          { label: "SOH", value: twin?.soh, unit: "%", color: twin?.soh && twin.soh < 90 ? "text-yellow-400" : "text-green-400" },
          { label: "车速", value: twin?.speed, unit: " km/h", color: "text-blue-400" },
          { label: "总里程", value: twin?.mileage ? (twin.mileage / 10000).toFixed(1) : null, unit: " 万km", color: "text-foreground" },
          { label: "最高电芯温度", value: twin?.max_cell_temp, unit: "°C", color: twin?.max_cell_temp && twin.max_cell_temp > 50 ? "text-red-400" : "text-foreground" },
          { label: "电机温度", value: twin?.motor_temp, unit: "°C", color: twin?.motor_temp && twin.motor_temp > 140 ? "text-red-400" : "text-foreground" },
          { label: "绝缘电阻", value: twin?.insulation_resistance, unit: " kΩ", color: twin?.insulation_resistance && twin.insulation_resistance < 150 ? "text-red-400" : "text-foreground" },
          { label: "告警等级", value: `${alarmLevel}`, unit: "/3", color: alarmLevel >= 2 ? "text-red-400" : "text-foreground" },
        ] : [
          { label: "油量", value: twin?.fuel_level, unit: "%", color: twin?.fuel_level && twin.fuel_level < 20 ? "text-red-400" : "text-green-400" },
          { label: "车速", value: twin?.speed, unit: " km/h", color: "text-blue-400" },
          { label: "发动机转速", value: twin?.engine_rpm, unit: " rpm", color: twin?.engine_rpm && twin.engine_rpm > 3000 ? "text-yellow-400" : "text-foreground" },
          { label: "冷却液温度", value: twin?.coolant_temp, unit: "°C", color: twin?.coolant_temp && twin.coolant_temp > 100 ? "text-red-400" : "text-foreground" },
          { label: "机油压力", value: twin?.oil_pressure, unit: " bar", color: twin?.oil_pressure && twin.oil_pressure < 1.5 ? "text-red-400" : "text-foreground" },
          { label: "瞬时油耗", value: twin?.fuel_consumption, unit: " L/100km", color: "text-foreground" },
          { label: "载货状态", value: twin?.cargo_status === "loaded" ? "满载" : twin?.cargo_status === "empty" ? "空载" : "—", unit: "", color: twin?.cargo_status === "loaded" ? "text-yellow-400" : "text-foreground" },
          { label: "告警等级", value: `${alarmLevel}`, unit: "/3", color: alarmLevel >= 2 ? "text-red-400" : "text-foreground" },
        ]).map((kpi) => (
          <Card key={kpi.label} className="bg-content1 border-divider">
            <CardContent className="p-4 text-center">
              <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value != null ? kpi.value : "—"}<span className="text-xs font-normal text-default-400">{kpi.unit}</span></div>
              <div className="text-xs text-default-400 mt-1">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
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
        <TabList className="bg-content1 border border-divider rounded-lg p-1">
          <Tab key="telemetry" id="telemetry" className="text-default-500 data-[selected]:text-blue-400"><Activity size={16} className="inline mr-1" />遥测曲线</Tab>
          <Tab key="dtc" id="dtc" className="text-default-500 data-[selected]:text-blue-400"><Wrench size={16} className="inline mr-1" />故障码</Tab>
          <Tab key="commands" id="commands" className="text-default-500 data-[selected]:text-blue-400"><Radio size={16} className="inline mr-1" />远程车控</Tab>
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
