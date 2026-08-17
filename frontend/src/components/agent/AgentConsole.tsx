import { useState, useRef, useEffect, useCallback } from "react";
import {
  Card, CardContent,
  Button, Input, Drawer, Chip, ChipLabel, ScrollShadow,
} from "@heroui/react";
import { Send, ShieldAlert, ShieldCheck, ShieldX, Mic, Brain } from "lucide-react";
import { motion, useAnimationControls } from "framer-motion";
import { useAgentStream } from "../../hooks/useAgentStream";
import AgentSidePanel from "./AgentSidePanel";
import Markdown from "./Markdown";
import StreamingMarkdown from "./StreamingMarkdown";

// Sub-path deployment: prefix public assets so they resolve under /vehix/.
const BASE_URL = import.meta.env.VITE_BASE_URL || "/";

const QUICK_PROMPTS = [
  "列出所有在线车辆",
  "京A·D1024 有什么故障？",
  "诊断京A·D1024 的温度异常",
  "限制京A·D1024 功率至 70%",
  "给 SOH 低于 90% 的车推送 BMS 2.3.1",
  "查看车队整体健康状况",
  "京B·E5678 的电池SOH是多少？",
  "帮我分析最近一周的充电效率",
];

export default function AgentConsole() {
  const [input, setInput] = useState("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const scrollControls = useAnimationControls();

  useEffect(() => {
    scrollControls.start({
      y: ["0%", "-50%"],
    }, {
      duration: 30,
      repeat: Infinity,
      ease: "linear",
    });
  }, [scrollControls]);
  const {
    send, isStreaming, isWaitingApproval,
    messages, thoughtSteps, toolCalls, partialResponse,
    approve, error,
  } = useAgentStream();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isEmpty = messages.filter(m => m.role !== "system").length === 0 && !isStreaming;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, partialResponse]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || isWaitingApproval) return;
    send(input.trim());
    setInput("");
  };

  const handlePromptClick = useCallback((prompt: string) => {
    if (isStreaming || isWaitingApproval) return;
    setInput(prompt);
  }, [isStreaming, isWaitingApproval]);

  return (
    <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 h-[calc(100dvh-7.5rem)] sm:h-[calc(100dvh-6.5rem)] lg:h-[calc(100dvh-3rem)] min-h-[420px]">
      {/* ── Chat Panel ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 safe-pb">
        <h1 className="page-title mb-3 sm:mb-4">Agent 控制台</h1>

        <Card className="flex-1 mb-3 overflow-hidden bg-content1 border-divider">
          <CardContent className={`p-4 ${isEmpty ? "h-full flex items-center justify-center overflow-hidden" : "overflow-y-auto space-y-3"}`}>
            {isEmpty ? (
              /* ── Empty state: greeting + auto-scrolling quick prompts ── */
              <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto gap-6">
                {/* Greeting */}
                <div className="text-center">
                  <img src={`${BASE_URL}vehix-assistant.svg`} alt="" className="w-12 h-12 mx-auto mb-3 rounded-full opacity-90" />
                  <h2 className="text-lg font-semibold text-foreground mb-1">你好，我是维克斯</h2>
                  <p className="text-sm text-default-400">有什么可以帮你的？</p>
                </div>

                {/* Scrolling prompts */}
                <div
                  className="relative w-full h-48 overflow-hidden"
                  onMouseEnter={() => scrollControls.stop()}
                  onMouseLeave={() => scrollControls.start({ y: ["0%", "-50%"] }, { duration: 30, repeat: Infinity, ease: "linear" })}
                >
                  <ScrollShadow className="h-full">
                    <motion.div
                      className="flex flex-col items-center gap-2 py-6 px-4"
                      animate={scrollControls}
                      style={{ willChange: "transform" }}
                    >
                      {[...QUICK_PROMPTS, ...QUICK_PROMPTS].map((prompt, i) => (
                        <Chip
                          key={`${prompt}-${i}`}
                          size="sm"
                          variant="secondary"
                          className="cursor-pointer text-xs sm:text-sm text-default-400 hover:text-foreground hover:bg-default-100 transition-colors max-w-full"
                          onClick={() => handlePromptClick(prompt)}
                        >
                          <ChipLabel>{prompt}</ChipLabel>
                        </Chip>
                      ))}
                    </motion.div>
                  </ScrollShadow>

                  {/* Click hint at bottom */}
                  <div className="absolute bottom-1 left-0 right-0 text-center pointer-events-none z-20">
                    <span className="text-[10px] text-default-400">点击快捷指令开始对话 ↑</span>
                  </div>
                </div>
              </div>
            ) : (
              <>{messages.map((msg, i) => {
              // ── Inline approval card ──
              if (msg.role === "approval" && msg.approval) {
                return (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl border border-warning/30 bg-warning/5 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 bg-warning/10 border-b border-warning/20">
                        <ShieldAlert size={18} className="text-warning" />
                        <span className="text-sm font-medium text-warning">需要审批</span>
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
                        ? "bg-success/10 border-success/30 text-success"
                        : "bg-danger/10 border-danger/30 text-danger"
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
                      ? "bg-primary text-white border border-primary"
                      : "bg-content2 border border-divider text-foreground"
                  }`}>
                    {msg.role !== "user" && (
                      <div className="flex items-center gap-1.5 text-xs text-primary mb-1 font-medium">
                        <img src={`${BASE_URL}vehix-assistant.svg`} alt="维克斯" className="w-4 h-4 rounded-full" />
                        维克斯
                      </div>
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
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
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
                    <div className="flex items-center gap-1.5 text-xs text-primary mb-1 font-medium">
                      <img src={`${BASE_URL}vehix-assistant.svg`} alt="维克斯" className="w-4 h-4 rounded-full" />
                      维克斯
                    </div>
                    <StreamingMarkdown content={partialResponse} className="leading-relaxed" />
                  </div>
                </div>
              )}
            </>)}
            <div ref={messagesEndRef} />
          </CardContent>
        </Card>

        {error && (
          <div className="mb-3 p-3 rounded-lg border text-sm bg-danger/10 border-danger/30 text-danger">{error}</div>
        )}

        {/* Mobile: quick prompts row + action bar */}
        <div className="lg:hidden flex flex-col gap-2 mb-2">
          {isEmpty && (
            <ScrollShadow orientation="horizontal" className="flex gap-1.5 pb-1 -mx-1 px-1">
              {QUICK_PROMPTS.slice(0, 5).map((p) => (
                <Chip
                  key={p} size="sm" variant="secondary"
                  className="cursor-pointer whitespace-nowrap text-xs text-default-500 hover:text-foreground flex-shrink-0"
                  onClick={() => handlePromptClick(p)}
                >
                  <ChipLabel>{p.length > 14 ? `${p.slice(0, 14)}…` : p}</ChipLabel>
                </Chip>
              ))}
            </ScrollShadow>
          )}
          {/* Action bar button */}
          {(thoughtSteps.length > 0 || toolCalls.length > 0) && (
            <Button
              variant="secondary" size="sm" className="self-start"
              onPress={() => setMobilePanelOpen(true)}
            >
              <Brain size={14} className="mr-1" />
              Agent 执行过程 ({thoughtSteps.length + toolCalls.length})
            </Button>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2 items-stretch">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isWaitingApproval ? "请先处理审批..." : "输入指令…"}
            disabled={isStreaming || isWaitingApproval}
            className="flex-1 min-w-0 bg-content1 border-divider text-foreground rounded-xl text-base"
          />
          <Button
            type="button"
            variant="secondary"
            isIconOnly
            isDisabled
            aria-label="语音交互即将支持"
            className="flex-shrink-0"
          >
            <Mic size={18} />
          </Button>
          <Button
            type="submit"
            variant="primary"
            isIconOnly
            isDisabled={!input.trim() || isStreaming || isWaitingApproval}
            className="flex-shrink-0"
            aria-label="发送"
          >
            <Send size={18} />
          </Button>
        </form>
      </div>

      {/* ── Desktop right panel ───────────────────────────────── */}
      <div className="hidden lg:flex lg:w-80 flex-shrink-0 min-h-0">
        <AgentSidePanel
          thoughtSteps={thoughtSteps}
          toolCalls={toolCalls}
          isStreaming={isStreaming}
          isWaitingApproval={isWaitingApproval}
          onPromptClick={setInput}
        />
      </div>

      {/* ── Mobile bottom Drawer ─────────────────────────────── */}
      <Drawer.Backdrop isOpen={mobilePanelOpen} onOpenChange={setMobilePanelOpen} variant="blur">
        <Drawer.Content placement="bottom">
          <Drawer.Dialog className="bg-content1 max-h-[75dvh]">
            <Drawer.Handle />
            <Drawer.CloseTrigger />
            <Drawer.Header className="pb-2">
              <Drawer.Heading className="text-base font-semibold text-foreground">Agent 执行过程</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body className="overflow-y-auto px-4 pb-6">
              <AgentSidePanel
                thoughtSteps={thoughtSteps}
                toolCalls={toolCalls}
                isStreaming={isStreaming}
                isWaitingApproval={isWaitingApproval}
                onPromptClick={(p) => { setInput(p); setMobilePanelOpen(false); }}
                compact
              />
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  );
}

/** Single row in approval card */
function Row({ label, value, mono, warn }: { label: string; value: string; mono?: boolean; warn?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-default-400">{label}</span>
      <span className={`${mono ? "font-mono text-xs" : "font-medium"} ${warn ? "text-warning" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
