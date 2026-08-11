/**
 * KpiCard — reusable stat/KPI card used across FleetMap and VehicleTwin.
 *
 * Usage:
 *   <KpiCard label="SOC" value={twin?.soc} unit="%" color="text-green-400" />
 *   <KpiCard label="车辆总数" value={stats.total_vehicles} unit="台" />
 */
import { Card, CardContent } from "@heroui/react";

interface Props {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  color?: string; // Tailwind text color class, e.g. "text-green-400"
}

export default function KpiCard({ label, value, unit, color = "text-blue-400" }: Props) {
  const displayValue = value != null ? String(value) : "—";

  return (
    <Card className="bg-content1 border-divider">
      <CardContent className="p-4 text-center">
        <div className={`text-2xl font-bold ${color}`}>
          {displayValue}
          {unit && <span className="text-xs font-normal text-default-400 ml-0.5">{unit}</span>}
        </div>
        <div className="text-xs text-default-400 mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}
