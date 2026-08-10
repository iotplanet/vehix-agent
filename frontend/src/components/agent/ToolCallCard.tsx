import { Card, CardContent, CardHeader, Disclosure } from "@heroui/react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

import type { ToolCall } from "../../store/agentStore";

interface Props { calls: ToolCall[] }

export default function ToolCallCard({ calls }: Props) {
  return (
    <Card className="bg-content1 border-divider">
      <CardHeader><h3 className="text-xs font-medium text-default-400">工具调用</h3></CardHeader>
      <CardContent>
        {calls.map((call, i) => (
          <Disclosure key={i} className="border-b border-divider last:border-0 py-1">
            <Disclosure.Trigger className="flex items-center gap-2 text-sm py-2 w-full cursor-pointer">
              {call.status === "running" && <Loader2 size={14} className="text-blue-400 animate-spin" />}
              {call.status === "success" && <CheckCircle2 size={14} className="text-green-400" />}
              {call.status === "error" && <XCircle size={14} className="text-red-400" />}
              <span className="font-mono text-xs text-foreground">{call.tool}</span>
            </Disclosure.Trigger>
            <Disclosure.Content className="text-xs font-mono text-default-400 space-y-2 pb-2">
              <div><div className="text-default-400 mb-1">Args:</div>
                <pre className="text-default-500 whitespace-pre-wrap">{JSON.stringify(call.args, null, 2)}</pre>
              </div>
              <div><div className="text-default-400 mb-1">Result:</div>
                <pre className="text-default-500 whitespace-pre-wrap">{JSON.stringify(call.result, null, 2)}</pre>
              </div>
            </Disclosure.Content>
          </Disclosure>
        ))}
      </CardContent>
    </Card>
  );
}
