export type KanbanColumnId = "backlog" | "analytics" | "ready_for_dev" | "testing" | "release_ready";

export const KANBAN_COLUMNS: { id: KanbanColumnId; title: string }[] = [
  { id: "backlog", title: "Бэклог" },
  { id: "analytics", title: "Аналитика" },
  { id: "ready_for_dev", title: "Готово к разработке" },
  { id: "testing", title: "Тестирование" },
  { id: "release_ready", title: "Готово к релизу" },
];

export function normalizeKanbanStatus(raw: string | null | undefined): KanbanColumnId {
  const s = String(raw || "");
  const map: Record<string, KanbanColumnId> = {
    backlog: "backlog",
    analytics: "analytics",
    ready_for_dev: "ready_for_dev",
    testing: "testing",
    release_ready: "release_ready",
    todo: "backlog",
    blocked: "backlog",
    in_progress: "ready_for_dev",
    done: "release_ready",
  };
  return map[s] ?? "backlog";
}
