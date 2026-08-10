import { useEffect } from "react";
import { Card, CardContent, CardHeader } from "@heroui/react";
import { useVehicleStore } from "../../store/vehicleStore";

interface Props { vin: string }

const SEVERITY_MAP: Record<string, string> = {
  info: "bg-zinc-500/15 text-default-500", warning: "bg-yellow-500/15 text-yellow-400", critical: "bg-red-500/15 text-red-400",
};
const SEV_LABEL: Record<string, string> = { info: "信息", warning: "警告", critical: "严重" };
const CATEGORY_LABELS: Record<string, string> = { P: "动力系统", C: "底盘", B: "车身", U: "网络通信" };

// Common DTC descriptions (mirrors backend dtc_database.py)
const DTC_DESC: Record<string, string> = {
  P0A1F: "高压电池低电量", P0A80: "高压电池绝缘故障", P0A7A: "电池单体电压不平衡",
  P0A7C: "电池温度传感器故障", P0AAC: "电池温度过高", P0ABF: "电池电流传感器故障",
  P0AC0: "电池充电过流", P0B0A: "电池冷却液泵故障", P0B3D: "电池SOH衰减超限",
  P0A2A: "驱动电机温度过高", P0A2B: "驱动电机转速传感器故障", P0A3F: "驱动电机位置传感器故障",
  P0A43: "驱动电机控制器温度过高", P0A44: "驱动电机控制器内部故障", P0A4B: "电机冷却液温度过高",
  P0A94: "DC-DC转换器故障", P0A95: "逆变器温度过高", P0A98: "逆变器IGBT故障",
  P0C73: "电池冷却系统效能不足", P0C74: "空调压缩机故障", P0C77: "冷却风扇故障",
  C0040: "ABS泵电机故障", C0045: "轮速传感器故障", C0051: "电动助力转向故障",
  C0080: "制动助力器故障", C0085: "电子手刹故障",
  B1000: "安全气囊控制单元故障", B1342: "空调压力传感器故障", B1400: "前照灯控制模块故障",
  B1500: "雨量传感器故障", B1800: "TPMS轮胎压力传感器故障",
  U0100: "与ECM失去通信", U0121: "与ABS模块失去通信", U0140: "与BCM失去通信",
  U0293: "与BMS失去通信", U0294: "与MCU失去通信", U0416: "接收到的车速数据无效",
};

export default function DTCList({ vin }: Props) {
  const twin = useVehicleStore((s) => s.twin);
  const fetchTwin = useVehicleStore((s) => s.fetchTwin);

  useEffect(() => {
    fetchTwin(vin);
    const interval = setInterval(() => fetchTwin(vin), 5000);
    return () => clearInterval(interval);
  }, [vin]);

  const dtcCodes = twin?.active_dtcs || [];

  return (
    <Card className="bg-content1 border-divider">
      <CardHeader><h3 className="text-sm font-medium text-default-500">故障码列表</h3></CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-divider">
              <th className="text-left text-default-500 text-xs font-medium p-3">故障码</th>
              <th className="text-left text-default-500 text-xs font-medium p-3">类别</th>
              <th className="text-left text-default-500 text-xs font-medium p-3">描述</th>
              <th className="text-left text-default-500 text-xs font-medium p-3">严重度</th>
            </tr>
          </thead>
          <tbody>
            {dtcCodes.length === 0 ? (
              <tr><td colSpan={4} className="py-8 text-center text-default-400">✅ 无活跃故障码</td></tr>
            ) : dtcCodes.map((code) => {
              const cat = code[0] || "?";
              const sev = cat === "U" ? "critical" : code.startsWith("P0A8") ? "critical" : "warning";
              return (
                <tr key={code} className="border-b border-divider">
                  <td className="font-mono font-semibold text-foreground p-3">{code}</td>
                  <td className="p-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/15 text-blue-400">
                      {CATEGORY_LABELS[cat] || cat}
                    </span>
                  </td>
                  <td className="text-xs text-foreground p-3">{DTC_DESC[code] || code}</td>
                  <td className="p-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${SEVERITY_MAP[sev] || SEVERITY_MAP.warning}`}>
                      {SEV_LABEL[sev] || "警告"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
