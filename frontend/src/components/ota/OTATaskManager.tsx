import { useCallback, useEffect, useState } from "react";
import {
  Card, CardContent, Button, Modal, ProgressBar, Badge, BadgeLabel,
  Skeleton, Chip, ChipLabel, Label, Input, TextArea, Select, ListBox,
} from "@heroui/react";
import { Plus, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import EmptyState from "../shared/EmptyState";
import { apiFetch } from "../../lib/api";
import { useVehicleStore } from "../../store/vehicleStore";

interface BatchPlan {
  batch_no: number;
  size: number;
  status: string;
}

interface OTATask {
  id: number;
  name: string;
  software_version: string;
  strategy: string;
  status: string;
  target_vins: string[];
  completed_vins: string[];
  batch_plan: BatchPlan[];
  vehicle_progress: Record<string, string>;
  progress_percent: number;
  current_batch: number;
  created_at: string | null;
  completed_at: string | null;
}

const STATUS_MAP: Record<string, { color: "success" | "warning" | "danger" | "default"; label: string }> = {
  created: { color: "default", label: "已创建" },
  in_progress: { color: "warning", label: "进行中" },
  completed: { color: "success", label: "已完成" },
  failed: { color: "danger", label: "失败" },
  rolled_back: { color: "danger", label: "已回滚" },
};

const STRATEGY_MAP: Record<string, string> = {
  gray_release: "灰度发布",
  batch: "分批发布",
  full: "全量发布",
};

const BATCH_STATUS: Record<string, { color: "success" | "warning" | "default"; label: string }> = {
  active: { color: "warning", label: "进行中" },
  pending: { color: "default", label: "待开始" },
  completed: { color: "success", label: "已完成" },
};

const STAGE_MAP: Record<string, { color: "success" | "warning" | "danger" | "default"; label: string }> = {
  notified: { color: "default", label: "已通知" },
  downloading: { color: "warning", label: "下载中" },
  installing: { color: "warning", label: "安装中" },
  completed: { color: "success", label: "已完成" },
  failed: { color: "danger", label: "失败" },
};

/** 任务是否仍在推进中（需轮询刷新） */
const isActive = (t: OTATask) => t.status === "created" || t.status === "in_progress";

export default function OTATaskManager() {
  const [tasks, setTasks] = useState<OTATask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [strategy, setStrategy] = useState("gray_release");
  const [vinsText, setVinsText] = useState("");

  // VIN → 车牌 映射
  const vehicles = useVehicleStore((s) => s.vehicles);
  const fetchVehicles = useVehicleStore((s) => s.fetchVehicles);

  const loadTasks = useCallback(async () => {
    const res = await apiFetch("/api/ota/tasks");
    if (!res.ok) throw new Error(`加载失败: ${res.status}`);
    const data = await res.json();
    setTasks(data.tasks || []);
  }, []);

  // 首次加载
  useEffect(() => {
    loadTasks()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    if (vehicles.length === 0) fetchVehicles().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 有活跃任务时每 5s 轮询（后端同一节奏推进每车阶段）
  const hasActive = tasks.some(isActive);
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => {
      loadTasks().catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [hasActive, loadTasks]);

  const resetForm = () => {
    setName("");
    setVersion("");
    setStrategy("gray_release");
    setVinsText("");
    setFormError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !version.trim()) {
      setFormError("请填写任务名称和软件版本");
      return;
    }
    const vins = vinsText.split(/[\s,，;]+/).map((s) => s.trim()).filter(Boolean);
    setCreating(true);
    try {
      const res = await apiFetch("/api/ota/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          software_version: version.trim(),
          strategy,
          target_vins: vins,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || `创建失败: ${res.status}`);
      setShowCreate(false);
      resetForm();
      await loadTasks();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleRollback = async (task: OTATask) => {
    if (!window.confirm(`确认回滚任务「${task.name}」？正在升级的车辆将停止升级。`)) return;
    try {
      const res = await apiFetch(`/api/ota/tasks/${task.id}/rollback`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || `回滚失败: ${res.status}`);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const plateOf = (vin: string) => {
    const v = vehicles.find((x) => x.vin === vin);
    return v ? v.plate_no : vin;
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold">OTA 任务管理</h1>
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4">
        <h1 className="text-xl font-bold">OTA 任务管理</h1>
        <Button variant="primary" size="sm" className="sm:h-10" onPress={() => setShowCreate(true)}><Plus size={18} className="mr-1" /><span className="hidden sm:inline">创建 OTA 任务</span><span className="sm:hidden">创建任务</span></Button>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">{error}</div>
      )}

      {tasks.length === 0 && (
        <EmptyState
          icon="📦"
          title="暂无 OTA 任务"
          description="创建第一个远程升级任务"
          action={<Button variant="primary" size="sm" onPress={() => setShowCreate(true)}><Plus size={14} className="mr-1" />创建任务</Button>}
        />
      )}

      <Modal.Backdrop isOpen={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); resetForm(); } }}>
        <Modal.Container>
          <Modal.Dialog className="bg-content1 border border-divider mx-4 sm:mx-0">
            <Modal.Header className="flex items-center justify-between">
              <Modal.Heading className="text-foreground">创建 OTA 升级任务</Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>
            <Modal.Body>
              <form className="space-y-4" onSubmit={handleCreate}>
                <div className="flex flex-col gap-1">
                  <Label>任务名称</Label>
                  <Input placeholder="例如：BMS 固件升级" variant="secondary" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>软件版本</Label>
                  <Input placeholder="例如：BMS 2.3.1" variant="secondary" value={version} onChange={(e) => setVersion(e.target.value)} />
                </div>
                <Select selectedKey={strategy} onSelectionChange={(key) => setStrategy(String(key))} fullWidth>
                  <Label>发布策略</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="gray_release" textValue="灰度发布">灰度发布</ListBox.Item>
                      <ListBox.Item id="batch" textValue="分批发布">分批发布</ListBox.Item>
                      <ListBox.Item id="full" textValue="全量发布">全量发布</ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
                <div className="flex flex-col gap-1">
                  <Label>目标 VIN</Label>
                  <TextArea placeholder="逗号或换行分隔的 VIN 列表" rows={3} variant="secondary" value={vinsText} onChange={(e) => setVinsText(e.target.value)} />
                  <span className="text-xs text-default-400">留空表示全量目标车辆</span>
                </div>
                {formError && (
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">{formError}</div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onPress={() => { setShowCreate(false); resetForm(); }}>取消</Button>
                  <Button variant="primary" type="submit" isDisabled={creating}>{creating ? "创建中..." : "创建任务"}</Button>
                </div>
              </form>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <div className="space-y-3">
        {tasks.map((task) => {
          const st = STATUS_MAP[task.status] || STATUS_MAP.created;
          const expanded = expandedId === task.id;
          return (
            <Card key={task.id} className="bg-content1 border-divider">
              <CardContent>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-medium text-foreground">{task.name}</h3>
                    <div className="text-xs text-default-400 mt-1">
                      {task.software_version} · {STRATEGY_MAP[task.strategy] || task.strategy}
                      {task.created_at && <> · {new Date(task.created_at).toLocaleDateString()}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive(task) && (
                      <Button variant="secondary" size="sm" onPress={() => handleRollback(task)}>
                        <RotateCcw size={14} className="mr-1" />回滚
                      </Button>
                    )}
                    <Badge variant="soft" color={st.color}><BadgeLabel>{st.label}</BadgeLabel></Badge>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <ProgressBar value={task.progress_percent} className="flex-1" />
                  <span className="text-xs text-default-400 min-w-[80px] text-right">{task.completed_vins.length}/{task.target_vins.length} ({task.progress_percent.toFixed(1)}%)</span>
                </div>

                {/* ── 批次计划 + 每车阶段（展开） ── */}
                <Button variant="secondary" size="sm" className="mt-3 w-full justify-center" onPress={() => setExpandedId(expanded ? null : task.id)}>
                  {expanded ? <ChevronUp size={14} className="mr-1" /> : <ChevronDown size={14} className="mr-1" />}
                  {expanded ? "收起详情" : "查看批次与车辆进度"}
                </Button>

                {expanded && (
                  <div className="mt-3 space-y-3">
                    {/* 批次计划 */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-default-400">批次计划：</span>
                      {task.batch_plan.map((b) => {
                        const bs = BATCH_STATUS[b.status] || BATCH_STATUS.pending;
                        return (
                          <Chip key={b.batch_no} size="sm" variant="secondary">
                            <ChipLabel className="flex items-center gap-1">
                              <span>第 {b.batch_no} 批 · {b.size} 台</span>
                              <Badge variant="soft" color={bs.color} className="scale-90 origin-left"><BadgeLabel>{bs.label}</BadgeLabel></Badge>
                            </ChipLabel>
                          </Chip>
                        );
                      })}
                    </div>

                    {/* 每车阶段 */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {task.target_vins.map((vin) => {
                        const stage = task.vehicle_progress[vin];
                        const sm = stage ? (STAGE_MAP[stage] || STAGE_MAP.notified) : STAGE_MAP.notified;
                        return (
                          <div key={vin} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-default/40 border border-divider">
                            <span className="text-xs text-default-400 truncate">{plateOf(vin)}</span>
                            <Badge variant="soft" color={sm.color}><BadgeLabel>{sm.label}</BadgeLabel></Badge>
                          </div>
                        );
                      })}
                    </div>
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
