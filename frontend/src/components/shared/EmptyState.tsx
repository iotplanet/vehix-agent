/**
 * EmptyState — placeholder for empty data views.
 *
 * Usage:
 *   <EmptyState icon="🗺️" title="暂无车辆数据" />
 *   <EmptyState icon="📦" title="暂无OTA任务" action={<Button>创建任务</Button>} />
 */

import { ReactNode } from "react";

interface Props {
  icon?: string;            // emoji icon
  title: string;
  description?: string;
  action?: ReactNode;       // optional action button/link
}

export default function EmptyState({ icon = "📭", title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-3xl mb-3 opacity-60">{icon}</div>
      <div className="text-sm font-medium text-default-400">{title}</div>
      {description && <div className="text-xs text-default-500 mt-1">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
