/**
 * AgentSidePanel — the right-side panel content (thought chain, tool calls, quick prompts).
 * Reusable on both desktop (inline, scrollable sections) and mobile (inside Drawer, full-height).
 */
import { Card, CardContent, CardHeader, Chip, ChipLabel, ScrollShadow } from "@heroui/react";
import { Brain, Wrench } from "lucide-react";
import ThoughtTimeline from "./ThoughtTimeline";
import ToolCallCard from "./ToolCallCard";
import type { ThoughtStep, ToolCall } from "../../store/agentStore";

const QUICK_PROMPTS = [
  "列出所有在线车辆",
  "京A·D1024 有什么故障？",
  "诊断京A·D1024 的温度异常",
  "限制京A·D1024 功率至 70%",
  "给 SOH 低于 90% 的车推送 BMS 2.3.1",
];

interface Props {
  thoughtSteps: ThoughtStep[];
  toolCalls: ToolCall[];
  isStreaming: boolean;
  isWaitingApproval: boolean;
  onPromptClick: (prompt: string) => void;
  /** If true, render quick prompts as horizontal scroll (mobile mode) */
  compact?: boolean;
}

export default function AgentSidePanel({
  thoughtSteps,
  toolCalls,
  isStreaming,
  isWaitingApproval,
  onPromptClick,
  compact,
}: Props) {
  const hasActivity = thoughtSteps.length > 0 || toolCalls.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* ── Thought chain ── */}
      {thoughtSteps.length > 0 && (
        <ScrollShadow className={compact ? "" : "max-h-[35%]"}>
          <ThoughtTimeline steps={thoughtSteps} />
        </ScrollShadow>
      )}

      {/* ── Tool calls ── */}
      {toolCalls.length > 0 && (
        <ScrollShadow className={compact ? "" : "max-h-[45%]"}>
          <ToolCallCard calls={toolCalls} />
        </ScrollShadow>
      )}

      {/* ── Empty state when no activity ── */}
      {!hasActivity && !compact && (
        <Card className="bg-content1 border-divider">
          <CardContent className="p-6 text-center">
            <Brain size={28} className="mx-auto mb-2 text-default-300" />
            <p className="text-xs text-default-400">发送指令后，这里会展示</p>
            <p className="text-xs text-default-500 mt-0.5">Agent 的思考链和工具调用</p>
          </CardContent>
        </Card>
      )}

      {/* ── Quick prompts ── */}
      <Card className="bg-content1 border-divider">
        <CardHeader className="pb-2">
          <h3 className="text-xs font-medium text-default-400">
            <Wrench size={12} className="inline mr-1" />
            试试这些
          </h3>
        </CardHeader>
        <CardContent className={compact ? "flex flex-row flex-wrap gap-1.5" : "flex flex-col gap-1.5"}>
          {QUICK_PROMPTS.map((p) => (
            <Chip
              key={p} size="sm" variant="secondary"
              className="cursor-pointer text-xs text-default-500 hover:text-foreground hover:bg-default-100 transition-colors"
              onClick={() => { if (!isStreaming && !isWaitingApproval) onPromptClick(p); }}
            >
              <ChipLabel>{p}</ChipLabel>
            </Chip>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
