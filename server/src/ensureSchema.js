import { query } from "./db.js";
import { hasTasksDocumentationColumn, hasTaskStatusEnumValue } from "./schemaFeatures.js";

const KANBAN_ENUM_VALUES = ["backlog", "analytics", "ready_for_dev", "testing", "release_ready"];

async function addTaskStatusEnumValue(label) {
  try {
    await query(`ALTER TYPE task_status ADD VALUE IF NOT EXISTS '${label}'`);
    return;
  } catch (e) {
    const msg = String(e.message || "");
    const syntax = e.code === "42601" || /syntax error/i.test(msg);
    if (!syntax) {
      if (e.code === "42710" || /already exists/i.test(msg)) return;
      if (e.code === "42501" || /владельцем|permission denied/i.test(msg)) {
        console.warn(`ensureSchema: нет прав добавить enum "${label}" (нужен владелец типа/superuser)`);
        return;
      }
      console.warn(`ensureSchema: enum "${label}"`, msg);
      return;
    }
  }
  try {
    await query(`ALTER TYPE task_status ADD VALUE '${label}'`);
  } catch (e) {
    const msg = String(e.message || "");
    if (e.code === "42710" || /already exists/i.test(msg)) return;
    if (e.code === "42501" || /владельцем|permission denied/i.test(msg)) {
      console.warn(`ensureSchema: нет прав добавить enum "${label}"`);
      return;
    }
    console.warn(`ensureSchema: enum "${label}"`, msg);
  }
}

/**
 * Добавляет в БД только то, чего ещё нет (после loadSchemaFeatures).
 * Если миграцию уже сделали в pgAdmin — лишних ALTER и предупреждений не будет.
 */
export async function ensureSchema() {
  if (!process.env.DATABASE_URL) {
    console.warn("ensureSchema: DATABASE_URL не задан, пропуск");
    return;
  }

  if (!hasTasksDocumentationColumn()) {
    try {
      await query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS documentation TEXT`);
    } catch (e) {
      if (e.code === "42501" || /владельцем|permission denied/i.test(String(e.message))) {
        console.warn(
          "ensureSchema: нет прав ALTER TABLE tasks — добавьте колонку documentation владельцем БД (см. migrations/).",
        );
      } else {
        console.warn("ensureSchema: ALTER TABLE tasks", e.message || e);
      }
    }
  }

  for (const v of KANBAN_ENUM_VALUES) {
    if (hasTaskStatusEnumValue(v)) continue;
    await addTaskStatusEnumValue(v);
  }

  console.log("ensureSchema: готово (пропущено то, что уже есть в схеме)");
}
