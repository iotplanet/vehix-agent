import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, Button, Skeleton } from "@heroui/react";
import EmptyState from "../shared/EmptyState";
import StatusBadge from "../shared/StatusBadge";
import AlertBanner from "../shared/AlertBanner";
import { apiFetch, ensureOk } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { WO_PRIORITY, WO_STATUS } from "../../lib/statusTheme";

interface WorkOrder {
  id: number;
  vin: string;
  plate_no: string;
  status: string;
  title: string;
  diagnosis_result: string | null;
  priority: string;
  assigned_to: string | null;
  station: string | null;
  created_at: string | null;
  completed_at: string | null;
}

const NEXT_ACTIONS: Record<string, { status: string; label: string }[]> = {
  pending: [
    { status: "assigned", label: "分配给我" },
    { status: "in_progress", label: "开始处理" },
    { status: "cancelled", label: "取消" },
  ],
  assigned: [
    { status: "in_progress", label: "开始处理" },
    { status: "cancelled", label: "取消" },
  ],
  in_progress: [
    { status: "completed", label: "完成" },
    { status: "cancelled", label: "取消" },
  ],
};

export default function WorkOrderList() {
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const role = useAuthStore((s) => s.user?.role);
  const canUpdate = role === "operator" || role === "admin" || role === "superuser";

  const load = useCallback(async () => {
    const res = await ensureOk(await apiFetch("/api/workorders"));
    const data = await res.json();
    setItems(data.workorders || []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [load]);

  const updateStatus = async (id: number, status: string) => {
    setError(null);
    try {
      const res = await ensureOk(await apiFetch(`/api/workorders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }));
      const updated = await res.json();
      setItems((prev) => prev.map((w) => (w.id === id ? updated : w)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <h1 className="page-title">工单管理</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title mb-4">工单管理</h1>

      {error && (
        <div className="mb-3"><AlertBanner>{error}</AlertBanner></div>
      )}

      {items.length === 0 && (
        <EmptyState
          title="暂无工单"
          description="诊断流程创建的维修工单会显示在这里"
        />
      )}

      <div className="space-y-3">
        {items.map((wo) => {
          const st = WO_STATUS[wo.status] || WO_STATUS.pending;
          const pri = WO_PRIORITY[wo.priority] || WO_PRIORITY.medium;
          const actions = canUpdate ? (NEXT_ACTIONS[wo.status] || []) : [];
          return (
            <Card key={wo.id} className="bg-content1 border-divider">
              <CardContent className="space-y-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start">
                  <div className="min-w-0">
                    <h3 className="font-medium text-foreground">
                      WO-{String(wo.id).padStart(4, "0")} · {wo.title || "未命名工单"}
                    </h3>
                    <div className="text-xs text-default-400 mt-1 flex flex-wrap gap-x-2 gap-y-1">
                      <span>{wo.plate_no || wo.vin}</span>
                      {wo.assigned_to && <span>负责人 {wo.assigned_to}</span>}
                      {wo.station && <span>站点 {wo.station}</span>}
                      {wo.created_at && <span>{new Date(wo.created_at).toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={pri.tone} label={`优先级 ${pri.label}`} />
                    <StatusBadge tone={st.tone} label={st.label} />
                  </div>
                </div>
                {wo.diagnosis_result && (
                  <p className="text-sm text-default-500 line-clamp-2">{wo.diagnosis_result}</p>
                )}
                {actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {actions.map((a) => (
                      <Button key={a.status} variant="secondary" size="sm" onPress={() => updateStatus(wo.id, a.status)}>
                        {a.label}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
