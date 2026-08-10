import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, Chip, ChipLabel } from "@heroui/react";
import { useVehicleStore } from "../../store/vehicleStore";
import * as echarts from "echarts";

const METRICS = [
  { key: "soc", label: "SOC" }, { key: "soh", label: "SOH" },
  { key: "speed", label: "车速" }, { key: "max_cell_temp", label: "电芯温度" },
  { key: "motor_temp", label: "电机温度" }, { key: "battery_voltage", label: "电池电压" },
  { key: "insulation_resistance", label: "绝缘电阻" },
];

interface Props { vin: string }

export default function TelemetryCharts({ vin }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState("soc");
  const telemetry = useVehicleStore((s) => s.telemetry);
  const fetchTelemetry = useVehicleStore((s) => s.fetchTelemetry);
  const chartInst = useRef<echarts.ECharts | null>(null);

  useEffect(() => { fetchTelemetry(vin, metric, 24); }, [vin, metric]);

  useEffect(() => {
    if (!chartRef.current) return;
    if (!chartInst.current) chartInst.current = echarts.init(chartRef.current, "dark");
    const c = chartInst.current;
    const points = telemetry.points || [];
    c.setOption({
      tooltip: { trigger: "axis" },
      grid: { left: 50, right: 16, top: 16, bottom: 32 },
      xAxis: { type: "time", axisLabel: { fontSize: 10, color: "#a1a1aa" } },
      yAxis: { type: "value", axisLabel: { fontSize: 10, color: "#a1a1aa" }, splitLine: { lineStyle: { color: "#27272a" } } },
      series: [{
        type: "line", data: points.map((p) => [p.timestamp, p.value]),
        smooth: true, showSymbol: false,
        lineStyle: { color: "#60a5fa", width: 2 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "rgba(96,165,250,0.25)" }, { offset: 1, color: "rgba(96,165,250,0.02)" }]) },
      }],
    });
    const resize = () => c.resize();
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); };
  }, [telemetry]);

  useEffect(() => { return () => { chartInst.current?.dispose(); chartInst.current = null; }; }, []);

  return (
    <Card className="bg-content1 border-divider">
      <CardHeader>
        <div className="flex gap-1.5 flex-wrap">
          {METRICS.map((m) => (
            <Chip key={m.key} size="sm" variant={metric === m.key ? "primary" : "secondary"} onClick={() => setMetric(m.key)} className="cursor-pointer">
              <ChipLabel>{m.label}</ChipLabel>
            </Chip>
          ))}
        </div>
      </CardHeader>
      <CardContent><div ref={chartRef} className="h-[350px]" /></CardContent>
    </Card>
  );
}
