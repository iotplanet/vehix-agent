import { useEffect } from "react";
import { Card, CardContent, CardHeader, Chip, ChipLabel, Table } from "@heroui/react";
import { useVehicleStore } from "../../store/vehicleStore";
import StatusBadge from "../shared/StatusBadge";

interface Props { vin: string }

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
      <CardContent className="p-0">
        <Table variant="secondary" aria-label="故障码列表">
          <Table.ScrollContainer>
            <Table.Content className="min-w-[500px]">
              <Table.Header>
                <Table.Column isRowHeader className="text-xs">故障码</Table.Column>
                <Table.Column className="text-xs">类别</Table.Column>
                <Table.Column className="text-xs">描述</Table.Column>
                <Table.Column className="text-xs">严重度</Table.Column>
              </Table.Header>
              <Table.Body
                items={dtcCodes.map((code) => ({ code, cat: code[0] || "?", sev: code.startsWith("U") ? "critical" : code.startsWith("P0A8") ? "critical" : "warning" }))}
                renderEmptyState={() => (
                  <div className="py-8 text-center text-default-400">✅ 无活跃故障码</div>
                )}
              >
                {(item) => (
                  <Table.Row key={item.code} id={item.code}>
                    <Table.Cell className="font-mono font-semibold">{item.code}</Table.Cell>
                    <Table.Cell>
                      <Chip size="sm" variant="soft" color="accent">
                        <ChipLabel>{CATEGORY_LABELS[item.cat] || item.cat}</ChipLabel>
                      </Chip>
                    </Table.Cell>
                    <Table.Cell className="text-xs">{DTC_DESC[item.code] || item.code}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge severity={item.sev} />
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </CardContent>
    </Card>
  );
}
