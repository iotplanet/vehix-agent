import { useState, useEffect } from "react";
import {
  Card, CardContent, CardHeader,
  Button, Input, Skeleton,
  TextField, Label,
} from "@heroui/react";
import { Wrench, ExternalLink, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { apiFetch } from "../../lib/api";
import StatusBadge from "../shared/StatusBadge";

interface LLMStatus {
  configured: boolean;
  source: string;
  model: string;
  base_url: string;
  key_preview: string | null;
}

interface TestResult {
  ok: boolean;
  model: string;
  latency_ms: number;
  error: string | null;
}

export default function SystemSettings() {
  const [status, setStatus] = useState<LLMStatus | null>(null);
  const [testKey, setTestKey] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    apiFetch("/api/llm/status")
      .then(async (r) => {
        if (!r.ok) throw new Error(`加载失败: ${r.status}`);
        return r.json();
      })
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const handleTest = async () => {
    if (!testKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: testKey,
          base_url: status?.base_url || "https://api.deepseek.com",
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, model: "", latency_ms: 0, error: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="page-title flex items-center gap-2">
        <Wrench size={18} className="text-default-400" /> 系统设置
      </h1>

      <Card className="bg-content1 border-divider">
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">LLM 配置</span>
            {status && (
              <StatusBadge
                tone={status.configured ? "success" : "danger"}
                label={status.configured ? "已配置" : "未配置"}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {status ? (
            <>
              <Info label="来源" value={status.source === "environment" ? "环境变量 (.env)" : status.source} />
              <Info label="模型" value={status.model} mono />
              <Info label="Base URL" value={status.base_url} mono />
              <Info label="Key" value={status.key_preview || "未设置"} mono />
            </>
          ) : (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full rounded-lg" />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-content1 border-divider">
        <CardHeader>
          <span className="text-sm font-medium text-foreground">测试连接</span>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-default-400">
            测试一个新的 LLM Key 是否有效。Key 不会被保存——测试通过后请更新 .env 文件。
          </p>
          <TextField name="testKey">
            <Label>API Key</Label>
            <Input
              placeholder="sk-your-api-key"
              value={testKey}
              onChange={(e) => setTestKey(e.target.value)}
              type="password"
              variant="secondary"
              className="font-mono text-xs"
            />
          </TextField>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <Button
              variant="primary"
              size="sm"
              onPress={handleTest}
              isDisabled={!testKey.trim() || testing}
              className="self-start"
            >
              {testing ? <Loader2 size={14} className="animate-spin mr-1" /> : <ExternalLink size={14} className="mr-1" />}
              测试连接
            </Button>
            {testResult && (
              <div className={`flex items-start gap-1.5 text-sm break-all ${testResult.ok ? "text-tone-ok" : "text-tone-critical"}`}>
                {testResult.ok ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <XCircle size={16} className="flex-shrink-0 mt-0.5" />}
                <span>
                  {testResult.ok
                    ? `连接成功 · ${testResult.latency_ms}ms`
                    : testResult.error || "连接失败"}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-3 text-sm">
      <span className="text-default-400 flex-shrink-0">{label}</span>
      <span className={`text-foreground break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
