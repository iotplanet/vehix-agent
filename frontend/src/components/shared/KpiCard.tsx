/**
 * KpiCard — bento metric tile (label top, large value, optional delta/tone).
 */
import { Card, CardContent } from "@heroui/react";
import type { KpiTone } from "../../lib/statusTheme";
import { KPI_TONE_CLASS } from "../../lib/statusTheme";

interface Props {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  /** @deprecated Prefer `tone` */
  color?: string;
  tone?: KpiTone;
  /** Optional trend, e.g. "+3.3%" or "-1.2%" */
  delta?: string;
}

export default function KpiCard({
  label,
  value,
  unit,
  color,
  tone = "neutral",
  delta,
}: Props) {
  const displayValue = value != null ? String(value) : "—";
  const unitText = unit?.trim() ? unit.trim() : "";
  const valueClass = color || (tone === "neutral" ? "text-foreground" : KPI_TONE_CLASS[tone]);
  const deltaPositive = delta?.trim().startsWith("+");
  const deltaNegative = delta?.trim().startsWith("-");

  return (
    <Card className="bg-content1 border-divider">
      <CardContent className="p-5">
        <div className="text-sm text-default-400 mb-3">{label}</div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className={`text-2xl sm:text-3xl font-bold tabular-nums tracking-tight leading-none ${valueClass}`}>
            {displayValue}
            {unitText && (
              <span className="text-sm font-medium text-default-400 ml-1">{unitText}</span>
            )}
          </div>
          {delta && (
            <span
              className={`text-xs font-medium mb-0.5 ${
                deltaPositive
                  ? "text-success"
                  : deltaNegative
                    ? "text-danger"
                    : "text-default-400"
              }`}
            >
              {deltaPositive ? "↑ " : deltaNegative ? "↓ " : ""}
              {delta.replace(/^[+-]\s*/, "")}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
