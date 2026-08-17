import { useCallback, useEffect, useState } from "react";
import {
  Card, CardContent, Button, Modal, ProgressBar,
  Skeleton, Label, Input, TextArea, Select, ListBox,
} from "@heroui/react";
import { Plus, RotateCcw, ChevronDown, ChevronUp, Pause, Play } from "lucide-react";
import EmptyState from "../shared/EmptyState";
import StatusBadge from "../shared/StatusBadge";
import AlertBanner from "../shared/AlertBanner";
import { apiFetch } from "../../lib/api";
import { useVehicleStore } from "../../store/vehicleStore";
import { OTA_BATCH, OTA_STAGE, OTA_STATUS } from "../../lib/statusTheme";

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

const STRATEGY_MAP: Record<string, string> = {
  gray_release: "灰度发布",
  batch: "分批发布",
  full: "全量发布",
};

const isActive = (t: OTATask) => t.status === "created" || t.status === "in_progress";
const canPause = (t: OTATask) => t.status === "created" || t.status === "in_progress";
const canResume = (t: OTATask) => t.status === "paused";
const canRollback = (t: OTATask) =>
  t.status === "created" || t.status === "in_progress" || t.status === "paused";

export default function OTATaskManager() {
  const [tasks, setTasks] = useState<OTATask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [strategy, setStrategy] = useState("gray_release");
  const [vinsText, setVinsText] = useState("");

  const vehicles = useVehicleStore((s) => s.vehicles);
  const fetchVehicles = useVehicleStore((s) => s.fetchVehicles);

  const loadTasks = useCallback(async () => {
    const res = await apiFetch("/api/ota/tasks");
    if (!res.ok) throw new Error(`加载失败: ${res.status}`);
    const data = await res.json();
    setTasks(data.tasks || []);
  }, []);

  useEffect(() => {
    loadTasks()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    if (vehicles.length === 0) fetchVehicles().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const postAction = async (path: string, failLabel: string) => {
    try {
      const res = await apiFetch(path, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || `${failLabel}: ${res.status}`);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRollback = async (task: OTATask) => {
    if (!window.confirm(`确认回滚任务「${task.name}」？正在升级的车辆将停止升级。`)) return;
    await postAction(`/api/ota/tasks/${task.id}/rollback`, "回滚失败");
  };

  const plateOf = (vin: string) => {
    const v = vehicles.find((x) => x.vin === vin);
    return v ? v.plate_no : vin;
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <h1 className="page-title">OTA 任务管理</h1>
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <h1 className="page-title">OTA 任务管理</h1>
        <Button variant="primary" size="sm" className="self-start sm:self-auto" onPress={() => setShowCreate(true)}>
          <Plus size={16} className="mr-1" />创建任务
        </Button>
      </div>

      {error && (
        <div className="mb-3"><AlertBanner>{error}</AlertBanner></div>
      )}

      {tasks.length === 0 && (
        <EmptyState
          title="暂无 OTA 任务"
          description="创建第一个远程升级任务"
          action={<Button variant="primary" size="sm" onPress={() => setShowCreate(true)}><Plus size={14} className="mr-1" />创建任务</Button>}
        />
      )}

      <Modal.Backdrop isOpen={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); resetForm(); } }}>
        <Modal.Container>
          <Modal.Dialog className="bg-content1 border border-divider mx-4 sm:mx-0 w-full max-w-md">
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
                {formError && <AlertBanner>{formError}</AlertBanner>}
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
          const st = OTA_STATUS[task.status] || OTA_STATUS.created;
          const expanded = expandedId === task.id;
          return (
            <Card key={task.id} className="bg-content1 border-divider">
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-foreground truncate">{task.name}</h3>
                      <StatusBadge tone={st.tone} label={st.label} />
                    </div>
                    <div className="text-xs text-default-400 mt-1">
                      {task.software_version} · {STRATEGY_MAP[task.strategy] || task.strategy}
                      {task.created_at && <> · {new Date(task.created_at).toLocaleDateString()}</>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {canPause(task) && (
                      <Button variant="secondary" size="sm" onPress={() => postAction(`/api/ota/tasks/${task.id}/pause`, "暂停失败")}>
                        <Pause size={14} className="mr-1" />暂停
                      </Button>
                    )}
                    {canResume(task) && (
                      <Button variant="secondary" size="sm" onPress={() => postAction(`/api/ota/tasks/${task.id}/resume`, "继续失败")}>
                        <Play size={14} className="mr-1" />继续
                      </Button>
                    )}
                    {canRollback(task) && (
                      <Button variant="secondary" size="sm" onPress={() => handleRollback(task)}>
                        <RotateCcw size={14} className="mr-1" />回滚
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <ProgressBar value={task.progress_percent} className="flex-1 min-w-0" />
                  <span className="text-xs text-default-400 tabular-nums whitespace-nowrap">
                    {task.completed_vins.length}/{task.target_vins.length}
                    <span className="hidden xs:inline sm:inline"> ({task.progress_percent.toFixed(0)}%)</span>
                  </span>
                </div>

                <Button variant="secondary" size="sm" className="w-full justify-center" onPress={() => setExpandedId(expanded ? null : task.id)}>
                  {expanded ? <ChevronUp size={14} className="mr-1" /> : <ChevronDown size={14} className="mr-1" />}
                  {expanded ? "收起详情" : "查看批次与车辆进度"}
                </Button>

                {expanded && (
                  <div className="space-y-3 pt-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-default-400 mr-1">批次：</span>
                      {task.batch_plan.map((b) => {
                        const bs = OTA_BATCH[b.status] || OTA_BATCH.pending;
                        return (
                          <div
                            key={b.batch_no}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-default/30 border border-divider text-xs text-default-500"
                          >
                            <span>第 {b.batch_no} 批 · {b.size} 台</span>
                            <StatusBadge tone={bs.tone} label={bs.label} />
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {task.target_vins.map((vin) => {
                        const stage = task.vehicle_progress[vin];
                        const sm = stage ? (OTA_STAGE[stage] || OTA_STAGE.notified) : OTA_STAGE.notified;
                        return (
                          <div key={vin} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-default/30 border border-divider">
                            <span className="text-xs text-default-400 truncate">{plateOf(vin)}</span>
                            <StatusBadge tone={sm.tone} label={sm.label} />
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
