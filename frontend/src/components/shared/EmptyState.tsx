/**
 * EmptyState — placeholder for empty data views.
 */
import { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
      <div className="mb-3 text-default-400 opacity-70">
        {icon ?? <Inbox size={32} strokeWidth={1.5} />}
      </div>
      <div className="text-sm font-medium text-default-400">{title}</div>
      {description && <div className="text-xs text-default-500 mt-1 max-w-xs">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
