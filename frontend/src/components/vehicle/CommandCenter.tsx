import { useState } from "react";
import { Card, CardContent, CardHeader, Button, Badge, BadgeLabel } from "@heroui/react";
import { Unlock, Snowflake, Plug, Zap, Trash2, AlertTriangle } from "lucide-react";
import { apiFetch } from "../../lib/api";

interface Props { vin: string }

const COMMANDS = [
  { key: "unlock_door", label: "远程解锁", icon: Unlock, risk: "low", color: "default" as const },
  { key: "start_hvac", label: "启动空调", icon: Snowflake, risk: "low", color: "primary" as const },
  { key: "charge_control", label: "充电控制", icon: Plug, risk: "low", color: "success" as const },
  { key: "limit_power", label: "限制功率", icon: Zap, risk: "medium", color: "warning" as const },
  { key: "clear_dtc", label: "清除故障码", icon: Trash2, risk: "medium", color: "warning" as const },
  { key: "remote_shutdown", label: "紧急断电", icon: AlertTriangle, risk: "critical", color: "danger" as const },
];
const RISK_LABELS: Record<string, string> = { low: "低风险", medium: "中风险", critical: "严重风险" };

export default function CommandCenter({ vin }: Props) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const sendCommand = async (command: string) => {
    setLoading(command); setResult(null);
    try {
      const res = await apiFetch(`/api/vehicles/${vin}/commands`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      if (data.approval_required) setResult(`⏳ 需要审批 — ID: ${data.approval_id}`);
      else setResult(`✅ 已下发: ${data.description || command}`);
    } catch { setResult("❌ 发送失败"); }
    finally { setLoading(null); }
  };

  return (
    <Card className="bg-content1 border-divider">
      <CardHeader><h3 className="text-sm font-medium text-default-500">远程车控台</h3></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {COMMANDS.map((cmd) => (
            <Button
              key={cmd.key}
              variant={cmd.color === "default" ? "secondary" : cmd.color === "success" ? "primary" : cmd.color === "warning" ? "secondary" : "danger"}
              isDisabled={loading === cmd.key}
              onPress={() => sendCommand(cmd.key)}
              className="h-auto py-4 flex-col gap-1"
            >
              <cmd.icon size={18} />
              <span>{cmd.label}</span>
              <Badge variant="soft" size="sm"><BadgeLabel>{RISK_LABELS[cmd.risk]}</BadgeLabel></Badge>
            </Button>
          ))}
        </div>
        {result && <div className="mt-4 p-3 rounded-lg bg-content2/50 text-sm text-foreground">{result}</div>}
      </CardContent>
    </Card>
  );
}
