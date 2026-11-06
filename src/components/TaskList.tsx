import { Check, Trash2 } from "lucide-react";
import type { Task } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TaskList({
  tasks,
  onToggle,
  onDelete,
}: {
  tasks: Task[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks yet — try the command bar above.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={task.done}
            aria-label={task.title}
            onClick={() => onToggle(task.id)}
            className={cn(
              // 20px box, 44px touch target: the pseudo-element grows the hit area without moving anything.
              "relative flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border transition-colors",
              "before:absolute before:-inset-3 before:content-['']",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              task.done && "bg-primary text-primary-foreground",
            )}
          >
            {task.done ? <Check className="h-3.5 w-3.5" /> : null}
          </button>
          <span className={cn("flex-1 text-sm", task.done && "text-muted-foreground line-through")}>{task.title}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label={`Delete "${task.title}"`}
            onClick={() => onDelete(task.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
