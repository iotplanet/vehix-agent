import { useState } from "react";
import {
  Card, CardContent, Button, Modal, ModalDialog, ModalHeader, ModalBody,
  ProgressBar, Badge, BadgeLabel, Skeleton,
  TextField, Label, Input, TextArea, Select, ListBox, Form, FieldError, Description,
} from "@heroui/react";
import { Plus } from "lucide-react";
import EmptyState from "../shared/EmptyState";

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
  const [loading] = useState(false); // placeholder for future API integration

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
      {tasks.length === 0 && (
        <EmptyState
          icon="📦"
          title="暂无 OTA 任务"
          description="创建第一个远程升级任务"
          action={<Button variant="primary" size="sm" onPress={() => setShowCreate(true)}><Plus size={14} className="mr-1" />创建任务</Button>}
        />
      )}

      <Modal isOpen={showCreate} onOpenChange={() => setShowCreate(false)}>
        <ModalDialog className="bg-content1 border border-divider mx-4 sm:mx-0">
          <ModalHeader className="text-foreground">创建 OTA 升级任务</ModalHeader>
          <ModalBody>
            <Form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setShowCreate(false); }}>
              <TextField isRequired name="name">
                <Label>任务名称</Label>
                <Input placeholder="例如：BMS 固件升级" variant="secondary" />
                <FieldError />
              </TextField>
              <TextField isRequired name="version">
                <Label>软件版本</Label>
                <Input placeholder="例如：BMS 2.3.1" variant="secondary" />
                <FieldError />
              </TextField>
              <Select name="strategy" defaultSelectedKey="gray_release">
                <Label>发布策略</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="gray_release">灰度发布</ListBox.Item>
                    <ListBox.Item id="batch">分批发布</ListBox.Item>
                    <ListBox.Item id="full">全量发布</ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
              <TextField name="vins">
                <Label>目标 VIN</Label>
                <TextArea placeholder="逗号分隔的 VIN 列表" rows={3} variant="secondary" />
                <Description>留空表示全量目标</Description>
              </TextField>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onPress={() => setShowCreate(false)}>取消</Button>
                <Button variant="primary" type="submit">创建任务</Button>
              </div>
            </Form>
          </ModalBody>
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
