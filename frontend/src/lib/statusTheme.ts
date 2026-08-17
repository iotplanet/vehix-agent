/**
 * Shared status / severity visual language for badges, KPIs, and map markers.
 * Keep HeroUI soft Badge colors and map hex in sync.
 */

export type BadgeTone = "success" | "accent" | "warning" | "danger" | "default";
export type KpiTone = "ok" | "warn" | "critical" | "info" | "muted" | "neutral";

/** Hex aligned with HeroUI soft badge hues (for AMap markers / InfoWindow). */
export const ALARM_HEX: Record<number, string> = {
  0: "#4ade80", // ~ HeroUI success
  1: "#60a5fa", // ~ HeroUI accent
  2: "#fbbf24", // ~ HeroUI warning
  3: "#f87171", // ~ HeroUI danger
};

export const ALARM_LABELS = ["正常", "注意", "警告", "严重"] as const;

export function alarmTone(level: number): BadgeTone {
  if (level >= 3) return "danger";
  if (level >= 2) return "warning";
  if (level >= 1) return "accent";
  return "success";
}

export const KPI_TONE_CLASS: Record<KpiTone, string> = {
  ok: "text-tone-ok",
  warn: "text-tone-warn",
  critical: "text-tone-critical",
  info: "text-tone-info",
  muted: "text-tone-muted",
  neutral: "text-foreground",
};

/** OTA task status → badge */
export const OTA_STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  created: { tone: "default", label: "已创建" },
  in_progress: { tone: "accent", label: "进行中" },
  paused: { tone: "warning", label: "已暂停" },
  completed: { tone: "success", label: "已完成" },
  failed: { tone: "danger", label: "失败" },
  rolled_back: { tone: "danger", label: "已回滚" },
};

export const OTA_BATCH: Record<string, { tone: BadgeTone; label: string }> = {
  active: { tone: "accent", label: "进行中" },
  pending: { tone: "default", label: "待开始" },
  completed: { tone: "success", label: "已完成" },
};

export const OTA_STAGE: Record<string, { tone: BadgeTone; label: string }> = {
  notified: { tone: "default", label: "已通知" },
  downloading: { tone: "accent", label: "下载中" },
  installing: { tone: "warning", label: "安装中" },
  completed: { tone: "success", label: "已完成" },
  failed: { tone: "danger", label: "失败" },
};

/** Work order status → badge */
export const WO_STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  pending: { tone: "default", label: "待处理" },
  assigned: { tone: "warning", label: "已分配" },
  in_progress: { tone: "accent", label: "处理中" },
  completed: { tone: "success", label: "已完成" },
  cancelled: { tone: "danger", label: "已取消" },
};

export const WO_PRIORITY: Record<string, { tone: BadgeTone; label: string }> = {
  low: { tone: "default", label: "低" },
  medium: { tone: "accent", label: "中" },
  high: { tone: "warning", label: "高" },
  critical: { tone: "danger", label: "紧急" },
};

export const PROTOCOL_CHIP: Record<string, { tone: BadgeTone; label: string }> = {
  gb32960: { tone: "accent", label: "GB/T 32960" },
  jtt808: { tone: "warning", label: "JT/T 808" },
  jtt1078: { tone: "danger", label: "JT/T 1078" },
};
