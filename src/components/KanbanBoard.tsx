import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { FileText, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { KANBAN_COLUMNS, normalizeKanbanStatus, type KanbanColumnId } from "@/lib/kanban";

export interface KanbanTaskItem {
  id: string | number;
  title: string;
  description?: string | null;
  documentation?: string | null;
  status: string;
  priority?: string | null;
  assigneeLabel?: string | null;
  readOnly?: boolean;
  /** Если задано — обновление статуса/доков через API проекта */
  projectId?: number;
}

function taskDragId(id: string | number) {
  return `task-${id}`;
}

function KanbanColumnDropZone({
  columnId,
  title,
  count,
  children,
  wide,
}: {
  columnId: KanbanColumnId;
  title: string;
  count: number;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${columnId}`,
    data: { type: "column" as const, columnId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-xl border border-border/80 bg-card/40 p-3 shadow-sm",
        wide ? "min-w-0 w-full min-h-[220px]" : "min-w-[240px] max-w-[280px]",
        isOver && "ring-2 ring-primary/50 bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-3 px-0.5">
        <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          {count}
        </Badge>
      </div>
      <div className="flex flex-col gap-2 flex-1 min-h-[140px]">{children}</div>
    </div>
  );
}

function KanbanDraggableCard({
  task,
  columnId,
  onOpenDocs,
  showDocsButton,
  actions,
}: {
  task: KanbanTaskItem;
  columnId: KanbanColumnId;
  onOpenDocs: (task: KanbanTaskItem) => void;
  showDocsButton: boolean;
  actions?: ReactNode;
}) {
  const disabled = Boolean(task.readOnly);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: taskDragId(task.id),
    disabled,
    data: { type: "task" as const, columnId, task },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  const pri = task.priority;
  const priClass =
    pri === "high"
      ? "border-destructive/40 text-destructive"
      : pri === "medium"
        ? "border-warning/50 text-warning"
        : "border-muted-foreground/30 text-muted-foreground";

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-3 shadow-sm border-border/90 bg-background/95",
        isDragging && "opacity-40",
        disabled && "opacity-75",
      )}
    >
      <div className="flex gap-2">
        {!disabled && (
          <button
            type="button"
            className="mt-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none p-0.5 rounded"
            aria-label="Перетащить"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium leading-snug">{task.title}</p>
          {task.description ? (
            <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {pri && (
              <Badge variant="outline" className={cn("text-[10px] uppercase", priClass)}>
                {pri}
              </Badge>
            )}
            {task.assigneeLabel && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={task.assigneeLabel}>
                {task.assigneeLabel}
              </span>
            )}
            {showDocsButton && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs ml-auto"
                onClick={() => onOpenDocs(task)}
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                Доки
              </Button>
            )}
          </div>
        </div>
      </div>
      {actions ? <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap justify-end gap-1">{actions}</div> : null}
    </Card>
  );
}

function overlayPriClass(pri: string | null | undefined) {
  if (pri === "high") return "border-destructive/40 text-destructive";
  if (pri === "medium") return "border-warning/50 text-warning";
  return "border-muted-foreground/30 text-muted-foreground";
}

export interface KanbanBoardProps {
  tasks: KanbanTaskItem[];
  onStatusChange: (taskId: string | number, status: KanbanColumnId) => void | Promise<void>;
  /** Если задан — доступна кнопка «Сохранить» в шите (при правах на задачу). */
  onSaveDocumentation?: (taskId: string | number, documentation: string | null) => void | Promise<void>;
  documentationReadOnly?: boolean;
  /** Показывать кнопку «Доки» и шит (просмотр; сохранение — если передан onSaveDocumentation). */
  documentationEnabled?: boolean;
  taskActions?: (task: KanbanTaskItem) => ReactNode;
  /** Сетка на всю ширину (5 колонок на xl), без горизонтального скролла на больших экранах */
  wide?: boolean;
}

export function KanbanBoard({
  tasks,
  onStatusChange,
  onSaveDocumentation,
  documentationReadOnly,
  documentationEnabled = true,
  taskActions,
  wide = false,
}: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<KanbanTaskItem | null>(null);
  const [docTask, setDocTask] = useState<KanbanTaskItem | null>(null);
  const [docDraft, setDocDraft] = useState("");
  const [docSaving, setDocSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const grouped = useMemo(() => {
    const map = new Map<KanbanColumnId, KanbanTaskItem[]>();
    for (const c of KANBAN_COLUMNS) {
      map.set(c.id, []);
    }
    for (const t of tasks) {
      const col = normalizeKanbanStatus(t.status);
      map.get(col)!.push(t);
    }
    return map;
  }, [tasks]);

  const resolveTargetColumn = (overId: string | null | undefined, overData: { type?: string; columnId?: KanbanColumnId } | undefined) => {
    if (!overData) return null;
    if (overData.type === "column" && overData.columnId) return overData.columnId;
    if (overData.type === "task" && overData.columnId) return overData.columnId;
    if (overId?.startsWith("column-")) {
      return overId.replace("column-", "") as KanbanColumnId;
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    if (!id.startsWith("task-")) return;
    const rawId = id.slice(5);
    const task = tasks.find((t) => String(t.id) === rawId);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    if (!activeId.startsWith("task-")) return;
    const taskIdRaw = activeId.slice(5);
    const task = tasks.find((t) => String(t.id) === taskIdRaw);
    if (!task || task.readOnly) return;

    const overData = over.data.current as { type?: string; columnId?: KanbanColumnId } | undefined;
    const target = resolveTargetColumn(String(over.id), overData);
    if (!target) return;

    const current = normalizeKanbanStatus(task.status);
    if (current === target) return;

    await onStatusChange(task.id, target);
  };

  const openDocs = (t: KanbanTaskItem) => {
    setDocTask(t);
    setDocDraft(t.documentation ?? "");
  };

  const saveDocs = async () => {
    if (!docTask || !onSaveDocumentation) return;
    if (documentationReadOnly || docTask.readOnly) return;
    setDocSaving(true);
    try {
      const trimmed = docDraft.trim();
      await onSaveDocumentation(docTask.id, trimmed.length ? trimmed : null);
      setDocTask(null);
    } finally {
      setDocSaving(false);
    }
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className={cn(
            wide
              ? "grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:gap-4"
              : "flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin min-w-0",
          )}
        >
          {KANBAN_COLUMNS.map((col) => {
            const colTasks = grouped.get(col.id) ?? [];
            return (
              <KanbanColumnDropZone key={col.id} columnId={col.id} title={col.title} count={colTasks.length} wide={wide}>
                {colTasks.map((task) => (
                  <KanbanDraggableCard
                    key={String(task.id)}
                    task={task}
                    columnId={col.id}
                    onOpenDocs={openDocs}
                    showDocsButton={documentationEnabled}
                    actions={taskActions?.(task)}
                  />
                ))}
              </KanbanColumnDropZone>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <Card className="p-3 w-[260px] shadow-lg border-primary/30 bg-background">
              <p className="text-sm font-medium">{activeTask.title}</p>
              {activeTask.priority && (
                <Badge variant="outline" className={cn("text-[10px] mt-2", overlayPriClass(activeTask.priority))}>
                  {activeTask.priority}
                </Badge>
              )}
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Sheet open={Boolean(docTask)} onOpenChange={(o) => !o && setDocTask(null)}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader>
            <SheetTitle>Документация к задаче</SheetTitle>
            {docTask && <p className="text-sm text-muted-foreground font-normal line-clamp-2">{docTask.title}</p>}
          </SheetHeader>
          <div className="flex-1 flex flex-col gap-3 py-4 min-h-0">
            <Textarea
              value={docDraft}
              onChange={(e) => setDocDraft(e.target.value)}
              placeholder="ТЗ, ссылки, заметки для команды…"
              className="min-h-[240px] flex-1 resize-y"
              readOnly={documentationReadOnly || docTask?.readOnly || !onSaveDocumentation}
            />
          </div>
          <SheetFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDocTask(null)}>
              Закрыть
            </Button>
            {onSaveDocumentation && !documentationReadOnly && !docTask?.readOnly && (
              <Button type="button" onClick={saveDocs} disabled={docSaving}>
                {docSaving ? "Сохранение…" : "Сохранить"}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
