/**
 * StatusBadge — inline soft status chip (alarm / severity / online / workflow).
 *
 * Uses HeroUI Chip (not Badge). Badge defaults to placement="top-right" with
 * absolute + translate, which overflows parents when used as a standalone label.
 */

import { Chip, ChipLabel } from "@heroui/react";
import type { BadgeTone } from "../../lib/statusTheme";
import { ALARM_LABELS, alarmTone } from "../../lib/statusTheme";

const SEVERITY_COLORS: Record<string, BadgeTone> = {
  info: "default",
  warning: "warning",
  critical: "danger",
};
const SEVERITY_LABELS: Record<string, string> = {
  info: "信息",
  warning: "警告",
  critical: "严重",
};

const ONLINE_COLORS: Record<string, BadgeTone> = {
  online: "success",
  offline: "default",
};
const ONLINE_LABELS: Record<string, string> = {
  online: "在线",
  offline: "离线",
};

interface Props {
  level?: number;
  severity?: string;
  status?: string;
  /** Explicit tone when using a custom label (workflow states). */
  tone?: BadgeTone;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export default function StatusBadge({
  level,
  severity,
  status,
  tone,
  label,
  size = "sm",
  className,
}: Props) {
  let color: BadgeTone = tone || "default";
  let text: string | undefined = label;

  if (level != null) {
    color = alarmTone(level);
    text = text ?? (ALARM_LABELS[level] || `${level}`);
  } else if (severity) {
    color = SEVERITY_COLORS[severity] || "warning";
    text = text ?? (SEVERITY_LABELS[severity] || severity);
  } else if (status) {
    color = ONLINE_COLORS[status] || "default";
    text = text ?? (ONLINE_LABELS[status] || status);
  }

  if (!text) return null;

  return (
    <Chip
      variant="soft"
      color={color}
      size={size}
      className={`max-w-full align-middle ${className ?? ""}`}
    >
      <ChipLabel className="truncate">{text}</ChipLabel>
    </Chip>
  );
}
