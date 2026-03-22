import { query } from "./db.js";

let tasksHasDocumentation = false;
/** @type {Set<string>} */
let taskStatusEnumLabels = new Set();

const LEGACY_ENUM = ["todo", "in_progress", "done", "blocked"];

/** Канбан-статусы → значения старого enum, если расширения нет */
const KANBAN_TO_LEGACY = {
  backlog: "todo",
  analytics: "todo",
  ready_for_dev: "in_progress",
  testing: "in_progress",
  release_ready: "done",
};

export function hasTaskStatusEnumValue(label) {
  return taskStatusEnumLabels.has(String(label));
}

/**
 * Вызывать до ensureSchema и app.listen. Достаточно прав SELECT (information_schema, pg_enum).
 */
export async function loadSchemaFeatures() {
  tasksHasDocumentation = false;
  taskStatusEnumLabels = new Set();

  if (!process.env.DATABASE_URL) {
    console.warn("schemaFeatures: DATABASE_URL не задан");
    return;
  }

  try {
    const r = await query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'tasks'
          AND column_name = 'documentation'
      ) AS ok`,
    );
    tasksHasDocumentation = Boolean(r.rows[0]?.ok);
  } catch (e) {
    console.warn("schemaFeatures: проверка tasks.documentation", e.message || e);
  }

  try {
    const r = await query(
      `SELECT e.enumlabel AS label
       FROM pg_enum e
       INNER JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'task_status'`,
    );
    for (const row of r.rows) {
      taskStatusEnumLabels.add(String(row.label));
    }
  } catch (e) {
    console.warn("schemaFeatures: чтение pg_enum task_status", e.message || e);
  }

  if (taskStatusEnumLabels.size === 0) {
    taskStatusEnumLabels = new Set(LEGACY_ENUM);
  }

  console.log(
    `schemaFeatures: documentation_column=${tasksHasDocumentation}; task_status=[${[...taskStatusEnumLabels].sort().join(", ")}]`,
  );
}

export function hasTasksDocumentationColumn() {
  return tasksHasDocumentation;
}

/** Фрагмент SELECT: реальная колонка или NULL, если колонки нет */
export function sqlTasksDocumentationSelect(alias = "t") {
  return hasTasksDocumentationColumn() ? `${alias}.documentation` : `NULL::text AS documentation`;
}

/**
 * Подставляет в INSERT/UPDATE значение enum, допустимое в текущей БД.
 */
export function coerceTaskStatusForDb(status) {
  const raw = status == null || status === "" ? "todo" : String(status);
  if (taskStatusEnumLabels.has(raw)) return raw;
  const mapped = KANBAN_TO_LEGACY[raw];
  if (mapped && taskStatusEnumLabels.has(mapped)) return mapped;
  if (taskStatusEnumLabels.has("todo")) return "todo";
  const first = taskStatusEnumLabels.values().next().value;
  return first || "todo";
}
