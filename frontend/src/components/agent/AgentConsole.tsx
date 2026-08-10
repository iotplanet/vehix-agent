import { useState, useRef, useEffect } from "react";
import {
  Card, CardContent, CardHeader,
  Button, Input,
  Chip, ChipLabel,
} from "@heroui/react";
import { Send, ShieldAlert, ShieldCheck, ShieldX, Mic } from "lucide-react";
import { useAgentStream } from "../../hooks/useAgentStream";
import ThoughtTimeline from "./ThoughtTimeline";
import ToolCallCard from "./ToolCallCard";
import Markdown from "./Markdown";

const QUICK_PROMPTS = [
  "列出所有在线车辆",
  "京A·D1024 有什么故障？",
  "诊断京A·D1024 的温度异常",
  "限制京A·D1024 功率至 70%",
  "给 SOH 低于 90% 的车推送 BMS 2.3.1",
];

export default function AgentConsole() {
  const [input, setInput] = useState("");
  const {
    send, isStreaming, isWaitingApproval,
    messages, thoughtSteps, toolCalls, partialResponse,
    approve, error,
  } = useAgentStream();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, partialResponse]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || isWaitingApproval) return;
    send(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-56px)] lg:h-[calc(100vh-48px)]">
      {/* ── Chat Panel ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <h1 className="text-xl font-bold mb-4">Agent 控制台</h1>

        <Card className="flex-1 mb-3 bg-content1 border-divider overflow-hidden">
          <CardContent className="overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => {
              // ── Inline approval card ──
              if (msg.role === "approval" && msg.approval) {
                return (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl border border-yellow-500/30 bg-yellow-500/5 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 bg-yellow-500/10 border-b border-yellow-500/20">
                        <ShieldAlert size={18} className="text-yellow-400" />
                        <span className="text-sm font-medium text-yellow-400">需要审批</span>
                      </div>
                      <div className="p-4 space-y-2 text-sm">
                        <Row label="命令" value={msg.approval.command} />
                        <Row label="车辆" value={msg.approval.vin} mono />
                        <Row label="发起人" value={msg.approval.operator || "—"} />
                        <Row label="风险" value={msg.approval.risk_level} warn />
                      </div>
                      <div className="flex gap-2 px-4 pb-4">
                        <Button
                          size="sm"
                          variant="danger-soft"
                          onPress={() => approve("reject")}
                          isDisabled={!isWaitingApproval}
                        >
                          <ShieldX size={15} /> 拒绝
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onPress={() => approve("approve")}
                          isDisabled={!isWaitingApproval}
                        >
                          <ShieldCheck size={15} /> 批准执行
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }

              // ── Approval result ──
              if (msg.role === "approval_result") {
                return (
                  <div key={i} className="flex justify-start">
                    <div className={`max-w-[90%] lg:max-w-[80%] rounded-xl px-4 py-3 text-sm border ${
                      msg.approved
                        ? "bg-green-500/10 border-green-500/30 text-green-400"
                        : "bg-red-500/10 border-red-500/30 text-red-400"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // ── Normal messages ──
              if (msg.role === "system") return null; // hide system greeting from chat
              return (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[90%] lg:max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-content2 text-foreground"
                  }`}>
                    {msg.role !== "user" && (
                      <div className="text-xs text-blue-400 mb-1 font-medium">Vehix Agent</div>
                    )}
                    <Markdown content={msg.content} className="leading-relaxed" />
                  </div>
                </div>
              );
            })}

            {/* Streaming */}
            {/* Thinking indicator — shows current node status */}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[90%] lg:max-w-[80%] rounded-xl px-4 py-3 text-sm bg-content2/50 text-default-500">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    <span>
                      {thoughtSteps.length === 0 && "正在理解意图..."}
                      {thoughtSteps.length >= 1 && thoughtSteps[thoughtSteps.length - 1].node === "router" && "正在分析意图..."}
                      {thoughtSteps.length >= 1 && thoughtSteps[thoughtSteps.length - 1].node === "planner" && "正在规划任务..."}
                      {thoughtSteps.length >= 2 && thoughtSteps[thoughtSteps.length - 1].node === "executor" && "正在执行工具调用..."}
                      {thoughtSteps.some(s => s.node === "approver") && "等待审批确认..."}
                      {thoughtSteps.some(s => s.node === "summarizer") && "正在生成回复..."}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Streaming: progressive Markdown render. Done: final Markdown. */}
            {partialResponse && (
              <div className="flex justify-start">
                <div className="max-w-[90%] lg:max-w-[80%] rounded-xl px-4 py-3 text-sm bg-content2 text-foreground">
                  <div className="text-xs text-blue-400 mb-1 font-medium">Vehix Agent</div>
                  <Markdown content={partialResponse} className="leading-relaxed" />
                  {isStreaming && <span className="animate-blink text-blue-400">|</span>}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </CardContent>
        </Card>

        {error && (
          <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">{error}</div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isWaitingApproval ? "请先处理审批..." : "输入指令，如：京A·D1024 有什么故障？"}
            disabled={isStreaming || isWaitingApproval}
            className="flex-1 bg-content1 border-divider text-foreground rounded-xl"
          />
          <Button
            type="button"
            variant="secondary"
            isIconOnly
            isDisabled
            aria-label="语音交互即将支持"
          >
            <Mic size={18} />
          </Button>
          <Button
            type="submit"
            variant="primary"
            isIconOnly
            isDisabled={!input.trim() || isStreaming || isWaitingApproval}
          >
            <Send size={18} />
          </Button>
        </form>
      </div>

      {/* ── Right Panel (hidden on mobile unless active) ────── */}
      <div className="hidden lg:flex lg:w-80 flex-shrink-0 flex-col space-y-3 min-h-0">
        {thoughtSteps.length > 0 && (
          <div className="max-h-[35%] overflow-y-auto">
            <ThoughtTimeline steps={thoughtSteps} />
          </div>
        )}
        {toolCalls.length > 0 && (
          <div className="max-h-[45%] overflow-y-auto">
            <ToolCallCard calls={toolCalls} />
          </div>
        )}

        <Card className="bg-content1 border-divider">
          <CardHeader><h3 className="text-xs font-medium text-default-400">试试这些</h3></CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {QUICK_PROMPTS.map((p) => (
              <Chip
                key={p} size="sm" variant="secondary"
                className="cursor-pointer text-xs text-default-500 hover:text-foreground"
                onClick={() => { if (!isStreaming && !isWaitingApproval) setInput(p); }}
              >
                <ChipLabel>{p}</ChipLabel>
              </Chip>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Single row in approval card */
function Row({ label, value, mono, warn }: { label: string; value: string; mono?: boolean; warn?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-default-400">{label}</span>
      <span className={`${mono ? "font-mono text-xs" : "font-medium"} ${warn ? "text-yellow-400" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
