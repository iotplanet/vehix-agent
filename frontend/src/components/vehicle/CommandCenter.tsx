import { useState } from "react";
import { Card, CardContent, CardHeader, Button } from "@heroui/react";
import { Unlock, Snowflake, Plug, Zap, Trash2, AlertTriangle } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { toast } from "@heroui/react";

interface Props { vin: string }

const COMMANDS = [
  { key: "unlock_door", label: "远程解锁", icon: Unlock, risk: "low", variant: "secondary" as const, color: "default" as const },
  { key: "start_hvac", label: "启动空调", icon: Snowflake, risk: "low", variant: "secondary" as const, color: "default" as const },
  { key: "charge_control", label: "充电控制", icon: Plug, risk: "low", variant: "secondary" as const, color: "default" as const },
  { key: "limit_power", label: "限制功率", icon: Zap, risk: "medium", variant: "ghost" as const, color: "warning" as const },
  { key: "clear_dtc", label: "清除故障码", icon: Trash2, risk: "medium", variant: "ghost" as const, color: "warning" as const },
  { key: "remote_shutdown", label: "紧急断电", icon: AlertTriangle, risk: "critical", variant: "danger" as const, color: "danger" as const },
];
const RISK_LABELS: Record<string, string> = { low: "低风险", medium: "中风险", critical: "严重风险" };

export default function CommandCenter({ vin }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  const sendCommand = async (command: string) => {
    setLoading(command);
    try {
      const res = await apiFetch(`/api/vehicles/${vin}/commands`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      if (data.approval_required) {
        toast.warning?.(`需要审批 — ID: ${data.approval_id}`, { description: "请在 Agent 控制台中审批" });
      } else {
        toast.success?.(data.description || `命令已下发: ${command}`);
      }
    } catch {
      toast.danger?.("发送失败", { description: "请检查网络连接后重试" });
    }
    finally { setLoading(null); }
  };

  return (
    <Card className="bg-content1 border-divider">
      <CardHeader><h3 className="text-sm font-medium text-default-500">远程车控台</h3></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          {COMMANDS.map((cmd) => (
            <Button
              key={cmd.key}
              variant={cmd.variant}
              isDisabled={loading === cmd.key}
              onPress={() => sendCommand(cmd.key)}
              className={`h-16 flex-col gap-1 ${cmd.color === "warning" ? "text-warning-500" : ""}`}
              aria-label={`${cmd.label} (${RISK_LABELS[cmd.risk]})`}
            >
              <cmd.icon size={18} />
              <span className="text-xs">{cmd.label}</span>
              <span className="text-[10px] text-default-400">{RISK_LABELS[cmd.risk]}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
