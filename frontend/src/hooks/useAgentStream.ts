/**
 * Hook: consume agent SSE stream via POST + ReadableStream.
 *
 * Usage:
 *   const { send, isStreaming, pendingApproval, approve } = useAgentStream();
 *   send("诊断京A·D1024的温度异常");
 */
import { useCallback } from "react";
import { useAgentStore } from "../store/agentStore";

export function useAgentStream() {
  const sendMessage = useAgentStore((s) => s.sendMessage);
  const approveCommand = useAgentStore((s) => s.approveCommand);
  const status = useAgentStore((s) => s.status);
  const pendingApproval = useAgentStore((s) => s.pendingApproval);
  const messages = useAgentStore((s) => s.messages);
  const thoughtSteps = useAgentStore((s) => s.thoughtSteps);
  const toolCalls = useAgentStore((s) => s.toolCalls);
  const partialResponse = useAgentStore((s) => s.partialResponse);
  const error = useAgentStore((s) => s.error);

  const send = useCallback(
    (message: string) => {
      sendMessage(message);
    },
    [sendMessage]
  );

  const approve = useCallback(
    (decision: "approve" | "reject") => {
      approveCommand(decision);
    },
    [approveCommand]
  );

  return {
    send,
    approve,
    isStreaming: status === "streaming",
    isWaitingApproval: status === "waiting_approval",
    pendingApproval,
    messages,
    thoughtSteps,
    toolCalls,
    partialResponse,
    error,
  };
}
