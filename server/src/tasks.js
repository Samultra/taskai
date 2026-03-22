import express from "express";
import { authMiddleware } from "./auth.js";
import { query } from "./db.js";
import { statusImpliesCompleted } from "./taskStatus.js";
import {
  coerceTaskStatusForDb,
  hasTasksDocumentationColumn,
  sqlTasksDocumentationSelect,
} from "./schemaFeatures.js";

const router = express.Router();

router.use(authMiddleware);

function normCategory(cat) {
  return String(cat ?? "")
    .trim()
    .replace(/\u00a0/g, " ");
}

function isTeamCategory(cat) {
  return normCategory(cat) === "Команда";
}

function sameProfileId(a, b) {
  return String(a ?? "") === String(b ?? "");
}

router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const docSql = sqlTasksDocumentationSelect("t");
    const result = await query(
      `SELECT t.id,
              t.title,
              t.description,
              ${docSql},
              t.completed,
              t.priority,
              t.category,
              t.due_date,
              t.created_at,
              t.owner_profile_id,
              t.project_id,
              t.status,
              p.email AS owner_email,
              (
                CASE
                  WHEN t.project_id IS NULL THEN (
                    t.owner_profile_id = $1
                    OR (
                      TRIM(t.category) = 'Команда'
                      AND EXISTS (
                        SELECT 1
                        FROM department_members dm_self
                        INNER JOIN department_members dm_owner
                          ON dm_self.department_id = dm_owner.department_id
                        WHERE dm_self.profile_id = $1
                          AND dm_owner.profile_id = t.owner_profile_id
                      )
                    )
                  )
                  ELSE (
                    t.assignee_profile_id = $1
                    OR EXISTS (SELECT 1 FROM projects pr WHERE pr.id = t.project_id AND pr.owner_profile_id = $1)
                    OR EXISTS (
                      SELECT 1 FROM project_members pm
                      WHERE pm.project_id = t.project_id AND pm.profile_id = $1
                    )
                    OR EXISTS (
                      SELECT 1
                      FROM project_departments pd
                      INNER JOIN department_members dm
                        ON dm.department_id = pd.department_id AND dm.profile_id = $1
                      WHERE pd.project_id = t.project_id
                    )
                  )
                END
              ) AS can_edit
       FROM tasks t
       JOIN profiles p ON p.id = t.owner_profile_id
       WHERE (
         (
           t.project_id IS NULL
           AND (
             t.owner_profile_id = $1
             OR (
               TRIM(t.category) = 'Команда'
               AND EXISTS (
                 SELECT 1
                 FROM department_members dm_self
                 INNER JOIN department_members dm_owner
                   ON dm_self.department_id = dm_owner.department_id
                 WHERE dm_self.profile_id = $1
                   AND dm_owner.profile_id = t.owner_profile_id
               )
             )
           )
         )
         OR (
           t.project_id IS NOT NULL
           AND t.assignee_profile_id = $1
         )
       )
       ORDER BY t.created_at DESC`,
      [userId],
    );
    const rows = result.rows.map((row) => ({
      ...row,
      is_owner: sameProfileId(row.owner_profile_id, userId),
    }));
    return res.json({ tasks: rows });
  } catch (err) {
    console.error("Get tasks error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      title,
      description,
      documentation,
      completed,
      priority,
      category,
      due_date,
      project_id,
      status,
      complexity,
      task_type,
      assignee_profile_id,
    } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const st = coerceTaskStatusForDb(status ?? "backlog");
    const done = completed ?? statusImpliesCompleted(st);

    let result;
    if (hasTasksDocumentationColumn()) {
      result = await query(
        `INSERT INTO tasks (
         title,
         description,
         documentation,
         completed,
         priority,
         category,
         due_date,
         project_id,
         status,
         complexity,
         task_type,
         assignee_profile_id,
         owner_profile_id
       )
       VALUES ($1, $2, $3, COALESCE($4, false), $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, title, description, documentation, completed, priority, category, due_date, created_at, project_id, status, complexity, task_type, assignee_profile_id`,
        [
          title,
          description ?? null,
          documentation?.trim() || null,
          done,
          priority ?? "medium",
          category ?? "Личное",
          due_date ?? null,
          project_id ?? null,
          st,
          complexity ?? null,
          task_type ?? null,
          assignee_profile_id ?? null,
          req.user.id,
        ],
      );
    } else {
      result = await query(
        `INSERT INTO tasks (
         title,
         description,
         completed,
         priority,
         category,
         due_date,
         project_id,
         status,
         complexity,
         task_type,
         assignee_profile_id,
         owner_profile_id
       )
       VALUES ($1, $2, COALESCE($3, false), $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, title, description, completed, priority, category, due_date, created_at, project_id, status, complexity, task_type, assignee_profile_id`,
        [
          title,
          description ?? null,
          done,
          priority ?? "medium",
          category ?? "Личное",
          due_date ?? null,
          project_id ?? null,
          st,
          complexity ?? null,
          task_type ?? null,
          assignee_profile_id ?? null,
          req.user.id,
        ],
      );
      result.rows[0] = { ...result.rows[0], documentation: null };
    }

    return res.status(201).json({ task: result.rows[0] });
  } catch (err) {
    console.error("Create task error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

async function assertTaskOwner(taskId, userId) {
  const r = await query(`SELECT owner_profile_id FROM tasks WHERE id = $1`, [taskId]);
  if (r.rowCount === 0) return { ok: false, status: 404 };
  if (!sameProfileId(r.rows[0].owner_profile_id, userId)) return { ok: false, status: 403 };
  return { ok: true };
}

/** Владелец или коллега по отделу для задачи с категорией «Команда» */
async function assertPersonalTaskEditable(taskId, userId) {
  const r = await query(
    `SELECT owner_profile_id, category, project_id FROM tasks WHERE id = $1`,
    [taskId],
  );
  if (r.rowCount === 0) return { ok: false, status: 404, isOwner: false };
  const row = r.rows[0];
  if (row.project_id != null) return { ok: false, status: 404, isOwner: false };
  if (sameProfileId(row.owner_profile_id, userId)) return { ok: true, isOwner: true };
  if (isTeamCategory(row.category)) {
    const dm = await query(
      `SELECT 1
       FROM department_members dm_self
       INNER JOIN department_members dm_owner ON dm_self.department_id = dm_owner.department_id
       WHERE dm_self.profile_id = $1 AND dm_owner.profile_id = $2
       LIMIT 1`,
      [userId, row.owner_profile_id],
    );
    if (dm.rowCount > 0) return { ok: true, isOwner: false };
  }
  return { ok: false, status: 403, isOwner: false };
}

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let edit;
    if (req.user?.role === "admin") {
      const exists = await query(`SELECT id FROM tasks WHERE id = $1`, [id]);
      if (exists.rowCount === 0) {
        return res.status(404).json({ error: "Not found" });
      }
      edit = { ok: true, isOwner: true };
    } else {
      edit = await assertPersonalTaskEditable(id, req.user.id);
      if (!edit.ok) {
        return res.status(edit.status).json({
          error: edit.status === 403 ? "Нет прав на изменение задачи" : "Not found",
        });
      }
    }
    const {
      title,
      description,
      documentation,
      completed,
      priority,
      category,
      due_date,
      status,
      assignee_profile_id,
      task_type,
      complexity,
    } = req.body || {};

    const bodyKeys = Object.keys(req.body || {});
    if (!edit.isOwner) {
      const allowedForCollaborator = new Set(["status", "documentation", "completed", "priority", "due_date"]);
      const forbidden = bodyKeys.filter((k) => !allowedForCollaborator.has(k));
      if (forbidden.length > 0) {
        return res.status(403).json({
          error: "Только автор может менять название, описание, категорию и исполнителя",
          fields: forbidden,
        });
      }
    }

    const fields = [];
    const values = [];
    let idx = 1;

    const pushField = (name, value) => {
      fields.push(`${name} = $${idx}`);
      values.push(value);
      idx += 1;
    };

    if (title !== undefined) pushField("title", title);
    if (description !== undefined) pushField("description", description);
    if (documentation !== undefined && hasTasksDocumentationColumn()) {
      pushField("documentation", documentation?.trim() || null);
    }
    if (completed !== undefined) pushField("completed", completed);
    if (priority !== undefined) pushField("priority", priority);
    if (category !== undefined) pushField("category", category);
    if (due_date !== undefined) pushField("due_date", due_date);
    if (status !== undefined) {
      const st = coerceTaskStatusForDb(status);
      pushField("status", st);
      pushField("completed", statusImpliesCompleted(st));
    }
    if (assignee_profile_id !== undefined) pushField("assignee_profile_id", assignee_profile_id);
    if (task_type !== undefined) pushField("task_type", task_type);
    if (complexity !== undefined) pushField("complexity", complexity);

    if (!fields.length) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(id);

    const retDoc = hasTasksDocumentationColumn() ? "documentation, " : "";
    const result = await query(
      `UPDATE tasks
       SET ${fields.join(", ")}
       WHERE id = $${idx}
       RETURNING id, title, description, ${retDoc}completed, priority, category, due_date, created_at, project_id, status, complexity, task_type, assignee_profile_id`,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    const row = result.rows[0];
    if (!hasTasksDocumentationColumn()) {
      row.documentation = null;
    }
    let assigneeEmail = null;
    if (row.assignee_profile_id) {
      const prof = await query(`SELECT email FROM profiles WHERE id = $1`, [row.assignee_profile_id]);
      assigneeEmail = prof.rows[0]?.email ?? null;
    }
    return res.json({ task: { ...row, assignee_email: assigneeEmail } });
  } catch (err) {
    console.error("Update task error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user?.role !== "admin") {
      const own = await assertTaskOwner(id, req.user.id);
      if (!own.ok) {
        return res.status(own.status).json({ error: own.status === 403 ? "Only owner can delete" : "Not found" });
      }
    }
    const result = await query("DELETE FROM tasks WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Task not found" });
    }
    return res.status(204).send();
  } catch (err) {
    console.error("Delete task error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
