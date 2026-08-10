import { Card, CardContent, CardHeader } from "@heroui/react";
import { Search, ClipboardList, Wrench, ShieldCheck, FileText } from "lucide-react";

import type { ThoughtStep } from "../../store/agentStore";

interface Props { steps: ThoughtStep[] }

const NODE_META: Record<string, { icon: typeof Search; label: string }> = {
  router: { icon: Search, label: "意图识别" },
  planner: { icon: ClipboardList, label: "任务规划" },
  executor: { icon: Wrench, label: "工具执行" },
  approver: { icon: ShieldCheck, label: "审批门禁" },
  summarizer: { icon: FileText, label: "结果汇总" },
};

export default function ThoughtTimeline({ steps }: Props) {
  return (
    <Card className="bg-content1 border-divider">
      <CardHeader><h3 className="text-xs font-medium text-default-400">思考链</h3></CardHeader>
      <CardContent>
        <div className="relative pl-6">
          <div className="absolute left-[7px] top-1 bottom-1 w-px bg-zinc-800" />
          {steps.map((step, i) => {
            const meta = NODE_META[step.node] || { icon: FileText, label: step.node };
            const Icon = meta.icon;
            return (
              <div key={i} className={`relative mb-4 ${i === steps.length - 1 ? "mb-0" : ""}`}>
                <div className="absolute -left-[19px] top-1 w-3.5 h-3.5 rounded-full bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                </div>
                <div className="text-[13px] font-medium text-foreground flex items-center gap-1.5">
                  <Icon size={13} className="text-blue-400" />{meta.label}
                </div>
                <div className="text-[11px] text-default-400 mt-0.5">
                  {new Date(step.timestamp).toLocaleTimeString()}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
