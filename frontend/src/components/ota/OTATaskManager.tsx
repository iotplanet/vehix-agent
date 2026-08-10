import { useState } from "react";
import { Card, CardContent, Button, Modal, ModalDialog, ModalHeader, ModalBody, ModalFooter, ProgressBar, Badge, BadgeLabel } from "@heroui/react";
import { Plus } from "lucide-react";

interface OTATask {
  id: number; name: string; software_version: string; strategy: string;
  status: string; target_count: number; completed_count: number; progress_percent: number; created_at: string;
}

const MOCK_TASKS: OTATask[] = [
  { id: 1, name: "BMS 固件升级", software_version: "BMS 2.3.1", strategy: "gray_release", status: "in_progress", target_count: 12, completed_count: 2, progress_percent: 16.7, created_at: "2026-08-07T08:00:00" },
  { id: 2, name: "MCU 优化更新", software_version: "MCU 1.5.0", strategy: "batch", status: "completed", target_count: 50, completed_count: 50, progress_percent: 100, created_at: "2026-08-05T10:00:00" },
];
const STATUS_MAP: Record<string, { color: "success" | "warning" | "danger" | "default"; label: string }> = {
  created: { color: "default", label: "已创建" }, in_progress: { color: "warning", label: "进行中" },
  completed: { color: "success", label: "已完成" }, failed: { color: "danger", label: "失败" }, rolled_back: { color: "danger", label: "已回滚" },
};

export default function OTATaskManager() {
  const [tasks] = useState<OTATask[]>(MOCK_TASKS);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">OTA 任务管理</h1>
        <Button variant="primary" onPress={() => setShowCreate(true)}><Plus size={18} className="mr-1" />创建 OTA 任务</Button>
      </div>

      <Modal isOpen={showCreate} onOpenChange={() => setShowCreate(false)}>
        <ModalDialog className="bg-content1 border border-divider">
          <ModalHeader className="text-foreground">创建 OTA 升级任务</ModalHeader>
          <ModalBody>
            <div className="space-y-3">
              <input placeholder="任务名称" className="w-full p-2.5 rounded-lg bg-content2 border border-divider text-foreground text-sm" />
              <input placeholder="软件版本 (如 BMS 2.3.1)" className="w-full p-2.5 rounded-lg bg-content2 border border-divider text-foreground text-sm" />
              <select className="w-full p-2.5 rounded-lg bg-content2 border border-divider text-foreground text-sm">
                <option>灰度发布</option><option>分批发布</option><option>全量发布</option>
              </select>
              <input placeholder="目标 VIN 列表 (逗号分隔)" className="w-full p-2.5 rounded-lg bg-content2 border border-divider text-foreground text-sm" />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setShowCreate(false)}>取消</Button>
            <Button variant="primary">创建任务</Button>
          </ModalFooter>
        </ModalDialog>
      </Modal>

      <div className="space-y-3">
        {tasks.map((task) => {
          const st = STATUS_MAP[task.status] || STATUS_MAP.created;
          return (
            <Card key={task.id} className="bg-content1 border-divider">
              <CardContent>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-medium text-foreground">{task.name}</h3>
                    <div className="text-xs text-default-400 mt-1">{task.software_version} · {task.strategy === "gray_release" ? "灰度发布" : task.strategy} · {new Date(task.created_at).toLocaleDateString()}</div>
                  </div>
                  <Badge variant="soft" color={st.color}><BadgeLabel>{st.label}</BadgeLabel></Badge>
                </div>
                <div className="flex items-center gap-3">
                  <ProgressBar value={task.progress_percent} className="flex-1" />
                  <span className="text-xs text-default-400 min-w-[80px] text-right">{task.completed_count}/{task.target_count} ({task.progress_percent.toFixed(1)}%)</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
