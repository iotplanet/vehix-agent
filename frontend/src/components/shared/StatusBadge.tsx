/**
 * StatusBadge — unified alarm/severity/status badge.
 *
 * Maps application-level severity levels to HeroUI Badge colors.
 * Used in FleetMap, VehicleTwin, DTCList to replace inline span badges.
 *
 * Usage:
 *   <StatusBadge level={3} />           // alarm_level → "严重" (danger)
 *   <StatusBadge severity="critical" />  // DTC severity → "严重" (danger)
 *   <StatusBadge status="online" />      // online/offline
 */

import { Badge, BadgeLabel } from "@heroui/react";

// ── Alarm level (0-3) ──────────────────────────────────────────
const ALARM_COLORS: Record<number, "success" | "accent" | "warning" | "danger"> = {
  0: "success",
  1: "accent",
  2: "warning",
  3: "danger",
};
const ALARM_LABELS = ["正常", "注意", "警告", "严重"];

// ── DTC severity ───────────────────────────────────────────────
const SEVERITY_COLORS: Record<string, "default" | "warning" | "danger"> = {
  info: "default",
  warning: "warning",
  critical: "danger",
};
const SEVERITY_LABELS: Record<string, string> = {
  info: "信息",
  warning: "警告",
  critical: "严重",
};

// ── Online status ──────────────────────────────────────────────
const STATUS_COLORS: Record<string, "success" | "default"> = {
  online: "success",
  offline: "default",
};
const STATUS_LABELS: Record<string, string> = {
  online: "在线",
  offline: "离线",
};

// ── Props ──────────────────────────────────────────────────────
interface Props {
  level?: number;           // alarm_level 0-3
  severity?: string;        // DTC severity: "info" | "warning" | "critical"
  status?: string;          // "online" | "offline"
  label?: string;           // custom label override
  size?: "sm" | "md";
}

export default function StatusBadge({ level, severity, status, label, size = "sm" }: Props) {
  let color: "success" | "accent" | "warning" | "danger" | "default" = "default";
  let text: string | undefined;

  if (level != null) {
    color = ALARM_COLORS[level] || "default";
    text = ALARM_LABELS[level] || `${level}`;
  } else if (severity) {
    color = SEVERITY_COLORS[severity] || "warning";
    text = SEVERITY_LABELS[severity] || severity;
  } else if (status) {
    color = STATUS_COLORS[status] || "default";
    text = STATUS_LABELS[status] || status;
  }

  if (label) text = label;

  return (
    <Badge variant="soft" color={color} size={size}>
      <BadgeLabel>{text}</BadgeLabel>
    </Badge>
  );
}
