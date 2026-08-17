/**
 * Agent conversation state — messages, thought chain, tool calls, streaming.
 */
import { create } from "zustand";
import { parseSSEFrames } from "../lib/sse";
import { apiFetch } from "../lib/api";

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  status: "running" | "success" | "error";
}

export interface ThoughtStep {
  node: string; timestamp: string; detail?: string;
}

export interface ApprovalRequest {
  approval_id: string;
  vin: string;
  command: string;
  params: Record<string, unknown>;
  risk_level: string;
  operator?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "approval" | "approval_result";
  content: string;
  timestamp: string;
  approval?: ApprovalRequest;
  approved?: boolean;
}

export type AgentStatus = "idle" | "streaming" | "waiting_approval" | "done" | "error";

function newThreadId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

interface AgentState {
  threadId: string;
  messages: ChatMessage[];
  thoughtSteps: ThoughtStep[];
  toolCalls: ToolCall[];
  status: AgentStatus;
  pendingApproval: ApprovalRequest | null;
  partialResponse: string;
  error: string | null;

  sendMessage: (message: string) => Promise<void>;
  approveCommand: (decision: "approve" | "reject") => Promise<void>;
  clearConversation: () => void;
}

let abortController: AbortController | null = null;

const SYSTEM_MSG: ChatMessage = {
  role: "system",
  content: "你好！我是维克斯（Vehix），你的智能车队运维助手。可以帮你查询车辆状态、诊断故障、下发车控命令、管理 OTA 升级。",
  timestamp: new Date().toISOString(),
};

export const useAgentStore = create<AgentState>((set, get) => ({
  threadId: newThreadId(),
  messages: [{ ...SYSTEM_MSG, timestamp: new Date().toISOString() }],
  thoughtSteps: [],
  toolCalls: [],
  status: "idle",
  pendingApproval: null,
  partialResponse: "",
  error: null,

  sendMessage: async (message: string) => {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    const userMsg: ChatMessage = {
      role: "user", content: message, timestamp: new Date().toISOString(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      status: "streaming",
      thoughtSteps: [],
      toolCalls: [],
      partialResponse: "",
      error: null,
      pendingApproval: null,
    }));

    try {
      const response = await apiFetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, thread_id: get().threadId }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        const msg = response.status === 401
          ? "登录已过期，请重新登录"
          : `Agent error: ${response.status}`;
        throw new Error(msg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedMessage = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSSEFrames(buffer);
        buffer = remainder;

        for (const { event, data: raw } of events) {
          try {
            const data = JSON.parse(raw);
            switch (event) {
              case "node_start":
              case "node_end":
                if (data.node) {
                  set((s) => ({ thoughtSteps: [...s.thoughtSteps, { node: data.node, timestamp: data.ts || new Date().toISOString() }] }));
                }
                break;
              case "tool_call":
                set((s) => ({ toolCalls: [...s.toolCalls, { tool: data.tool, args: data.args || {}, result: data.result || {}, status: "success" as const }] }));
                break;
              case "approval": {
                const approval: ApprovalRequest = data as ApprovalRequest;
                const approvalMsg: ChatMessage = { role: "approval", content: "", timestamp: new Date().toISOString(), approval };
                set((s) => ({ messages: [...s.messages, approvalMsg], status: "waiting_approval", pendingApproval: approval }));
                break;
              }
              case "message": {
                receivedMessage = true;
                const msg: ChatMessage = { role: "assistant", content: data.content || "", timestamp: new Date().toISOString() };
                set((s) => ({ messages: [...s.messages, msg] }));
                break;
              }
              case "token":
                if (data.text) set((s) => ({ partialResponse: s.partialResponse + data.text }));
                break;
              case "error":
                set({ error: data.message || "未知错误" });
                break;
            }
          } catch { /* partial chunk */ }
        }
      }

      // Stream done — final message already added via 'message' event
      const currentStatus = get().status;
      if (currentStatus !== "waiting_approval") {
        if (!receivedMessage && !get().partialResponse) {
          const msg: ChatMessage = { role: "assistant", content: "处理完成", timestamp: new Date().toISOString() };
          set((s) => ({ messages: [...s.messages, msg] }));
        }
        set({ status: "done", partialResponse: "" });
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      set({ status: "error", error: String(e) });
    }
  },

  approveCommand: async (decision: "approve" | "reject") => {
    const approval = get().pendingApproval;
    if (!approval) return;

    try {
      await apiFetch(
        `/api/commands/approve/${approval.approval_id}?decision=${decision}`,
        { method: "POST" }
      );

      // Replace approval card with result
      const resultMsg: ChatMessage = {
        role: "approval_result",
        content: decision === "approve"
          ? `✅ 命令 **${approval.command}** 已批准执行`
          : `❌ 命令 **${approval.command}** 已拒绝`,
        timestamp: new Date().toISOString(),
        approved: decision === "approve",
      };

      set((s) => ({
        messages: s.messages.map((m) =>
          m.role === "approval" ? resultMsg : m
        ),
        status: "done",
        pendingApproval: null,
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  clearConversation: () => {
    if (abortController) abortController.abort();
    set({
      threadId: newThreadId(),
      messages: [{ ...SYSTEM_MSG, timestamp: new Date().toISOString() }],
      thoughtSteps: [], toolCalls: [],
      status: "idle", pendingApproval: null,
      partialResponse: "", error: null,
    });
  },
}));
