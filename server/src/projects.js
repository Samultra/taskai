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

/** Доступ: админ — ко всем; иначе владелец, project_members, или отдел проекта (project_departments + department_members) */
async function getProjectAccess(req, projectId) {
  const userId = req.user.id;
  const role = req.user.role;

  if (role === "admin") {
    const proj = await query(`SELECT id FROM projects WHERE id = $1`, [projectId]);
    if (proj.rowCount === 0) return { ok: false, status: 404 };
    return { ok: true, access: "admin" };
  }

  const proj = await query(
    `SELECT id, owner_profile_id FROM projects WHERE id = $1`,
    [projectId],
  );
  if (proj.rowCount === 0) return { ok: false, status: 404 };

  const ownerId = proj.rows[0].owner_profile_id;
  if (ownerId === userId) {
    return { ok: true, access: "owner" };
  }

  const mem = await query(
    `SELECT 1 FROM project_members WHERE project_id = $1 AND profile_id = $2`,
    [projectId, userId],
  );
  if (mem.rowCount > 0) {
    return { ok: true, access: "member" };
  }

  const deptAccess = await query(
    `SELECT 1
     FROM project_departments pd
     INNER JOIN department_members dm ON dm.department_id = pd.department_id AND dm.profile_id = $2
     WHERE pd.project_id = $1`,
    [projectId, userId],
  );
  if (deptAccess.rowCount > 0) {
    return { ok: true, access: "department" };
  }

  const assigneeAccess = await query(
    `SELECT 1 FROM tasks WHERE project_id = $1 AND assignee_profile_id = $2 LIMIT 1`,
    [projectId, userId],
  );
  if (assigneeAccess.rowCount > 0) {
    return { ok: true, access: "assignee" };
  }

  return { ok: false, status: 403 };
}

async function getTaskProjectId(taskId) {
  const r = await query(`SELECT project_id FROM tasks WHERE id = $1`, [taskId]);
  if (r.rowCount === 0) return null;
  return r.rows[0].project_id;
}

/** Список проектов (регистрируется в index.js как GET /api/projects — см. комментарий там) */
export async function listProjects(req, res) {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let result;
    if (role === "admin") {
      result = await query(
        `SELECT id, name, code, description, color, owner_profile_id, is_archived, created_at
         FROM projects
         ORDER BY created_at DESC`,
      );
    } else {
      result = await query(
        `SELECT DISTINCT p.id, p.name, p.code, p.description, p.color, p.owner_profile_id, p.is_archived, p.created_at
         FROM projects p
         WHERE p.owner_profile_id = $1
            OR EXISTS (
              SELECT 1 FROM project_members pm
              WHERE pm.project_id = p.id AND pm.profile_id = $1
            )
            OR EXISTS (
              SELECT 1
              FROM project_departments pd
              INNER JOIN department_members dm ON dm.department_id = pd.department_id AND dm.profile_id = $1
              WHERE pd.project_id = p.id
            )
         ORDER BY p.created_at DESC`,
        [userId],
      );
    }

    res.json({ projects: result.rows });
  } catch (err) {
    console.error("Project list error", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

router.get("/:id/detail", async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: "Invalid project id" });

    const access = await getProjectAccess(req, projectId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.status === 403 ? "No access to project" : "Project not found" });
    }

    const docSel = sqlTasksDocumentationSelect("t");
    const [proj, memberRows, tasks] = await Promise.all([
      query(
        `SELECT id, name, code, description, color, owner_profile_id, is_archived, created_at
         FROM projects
         WHERE id = $1`,
        [projectId],
      ),
      query(
        `SELECT pr.id, pr.email, pr.full_name, pm.role AS member_role
         FROM project_members pm
         INNER JOIN profiles pr ON pr.id = pm.profile_id
         WHERE pm.project_id = $1`,
        [projectId],
      ),
      query(
        `SELECT t.id,
                t.title,
                t.description,
                ${docSel},
                t.task_type,
                t.complexity,
                t.status,
                t.priority,
                t.due_date,
                t.assignee_profile_id,
                t.owner_profile_id,
                t.project_id,
                t.category,
                p.email AS assignee_email
         FROM tasks t
         LEFT JOIN profiles p ON p.id = t.assignee_profile_id
         WHERE t.project_id = $1
            OR (
              t.project_id IS NULL
              AND TRIM(COALESCE(t.category, '')) = 'Команда'
              AND EXISTS (
                SELECT 1
                FROM project_departments pd
                INNER JOIN department_members dm
                  ON dm.department_id = pd.department_id AND dm.profile_id = t.owner_profile_id
                WHERE pd.project_id = $1
              )
            )
         ORDER BY t.due_date ASC NULLS LAST, t.id ASC`,
        [projectId],
      ),
    ]);

    if (proj.rowCount === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const projectRow = proj.rows[0];
    const byId = new Map();
    for (const m of memberRows.rows) {
      byId.set(m.id, m);
    }
    const ownerId = projectRow.owner_profile_id;
    if (ownerId) {
      const existing = byId.get(ownerId);
      if (!existing) {
        const own = await query(
          `SELECT id, email, full_name FROM profiles WHERE id = $1`,
          [ownerId],
        );
        if (own.rowCount > 0) {
          byId.set(ownerId, {
            ...own.rows[0],
            member_role: "owner",
          });
        }
      } else if (existing.member_role !== "owner") {
        byId.set(ownerId, { ...existing, member_role: "owner" });
      }
    }
    const membersList = Array.from(byId.values()).sort((a, b) =>
      String(a.email).localeCompare(String(b.email)),
    );

    let assigneeProfiles = null;
    if (req.user?.role === "admin") {
      const allProf = await query(
        `SELECT id, email, full_name
         FROM profiles
         WHERE COALESCE(is_blocked, false) = false
         ORDER BY email ASC`,
      );
      assigneeProfiles = allProf.rows;
    }

    res.json({
      project: projectRow,
      members: membersList,
      tasks: tasks.rows,
      ...(assigneeProfiles && { assigneeProfiles }),
    });
  } catch (err) {
    console.error("Project detail error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/tasks", async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: "Invalid project id" });

    const access = await getProjectAccess(req, projectId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.status === 403 ? "No access to project" : "Project not found" });
    }

    const {
      title,
      description,
      documentation,
      task_type,
      complexity,
      status,
      priority,
      due_date,
      assignee_profile_id,
    } = req.body || {};

    if (!title) return res.status(400).json({ error: "title is required" });

    const st = coerceTaskStatusForDb(status || "backlog");
    const done = statusImpliesCompleted(st);

    let result;
    if (hasTasksDocumentationColumn()) {
      result = await query(
        `INSERT INTO tasks (
         project_id,
         title,
         description,
         documentation,
         task_type,
         complexity,
         status,
         priority,
         due_date,
         assignee_profile_id,
         owner_profile_id,
         completed,
         category
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Проект')
       RETURNING id, title, description, documentation, task_type, complexity, status, priority, due_date, assignee_profile_id, owner_profile_id`,
        [
          projectId,
          title.trim(),
          description?.trim() || null,
          documentation?.trim() || null,
          task_type || null,
          complexity || null,
          st,
          priority || "medium",
          due_date || null,
          assignee_profile_id || null,
          req.user.id,
          done,
        ],
      );
    } else {
      result = await query(
        `INSERT INTO tasks (
         project_id,
         title,
         description,
         task_type,
         complexity,
         status,
         priority,
         due_date,
         assignee_profile_id,
         owner_profile_id,
         completed,
         category
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Проект')
       RETURNING id, title, description, task_type, complexity, status, priority, due_date, assignee_profile_id, owner_profile_id`,
        [
          projectId,
          title.trim(),
          description?.trim() || null,
          task_type || null,
          complexity || null,
          st,
          priority || "medium",
          due_date || null,
          assignee_profile_id || null,
          req.user.id,
          done,
        ],
      );
      result.rows[0] = { ...result.rows[0], documentation: null };
    }

    const created = result.rows[0];
    let assigneeEmail = null;
    if (created.assignee_profile_id) {
      const prof = await query(`SELECT email FROM profiles WHERE id = $1`, [created.assignee_profile_id]);
      assigneeEmail = prof.rows[0]?.email ?? null;
    }

    res.status(201).json({
      task: {
        ...created,
        assignee_email: assigneeEmail,
      },
    });
  } catch (err) {
    console.error("Project create task error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user?.role !== "admin") {
      const projectId = await getTaskProjectId(id);
      if (projectId == null) return res.status(404).json({ error: "Task not found" });

      const access = await getProjectAccess(req, projectId);
      if (!access.ok) {
        return res.status(access.status).json({ error: access.status === 403 ? "No access to project" : "Not found" });
      }
    } else {
      const ex = await query(`SELECT id FROM tasks WHERE id = $1`, [id]);
      if (ex.rowCount === 0) return res.status(404).json({ error: "Task not found" });
    }

    const {
      title,
      description,
      documentation,
      task_type,
      complexity,
      status,
      priority,
      assignee_profile_id,
      due_date,
    } = req.body || {};

    const payload = {};
    if (title !== undefined) payload.title = title;
    if (description !== undefined) payload.description = description;
    if (documentation !== undefined && hasTasksDocumentationColumn()) {
      payload.documentation = documentation?.trim() || null;
    }
    if (task_type !== undefined) payload.task_type = task_type;
    if (complexity !== undefined) payload.complexity = complexity;
    if (status !== undefined) {
      const st = coerceTaskStatusForDb(status);
      payload.status = st;
      payload.completed = statusImpliesCompleted(st);
    }
    if (priority !== undefined) payload.priority = priority;
    if (assignee_profile_id !== undefined) payload.assignee_profile_id = assignee_profile_id || null;
    if (due_date !== undefined) payload.due_date = due_date || null;

    const fields = [];
    const values = [];
    let idx = 1;
    Object.entries(payload).forEach(([k, v]) => {
      fields.push(`${k} = $${idx}`);
      values.push(v);
      idx += 1;
    });
    if (!fields.length) return res.status(400).json({ error: "No fields" });
    values.push(id);
    const retDoc = hasTasksDocumentationColumn() ? "documentation, " : "";
    const result = await query(
      `UPDATE tasks
       SET ${fields.join(", ")}
       WHERE id = $${idx}
       RETURNING id, title, description, ${retDoc}task_type, complexity, status, priority, due_date, assignee_profile_id, owner_profile_id`,
      values,
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Task not found" });
    const updated = result.rows[0];
    if (!hasTasksDocumentationColumn()) {
      updated.documentation = null;
    }
    let assigneeEmail = null;
    if (updated.assignee_profile_id) {
      const prof = await query(`SELECT email FROM profiles WHERE id = $1`, [updated.assignee_profile_id]);
      assigneeEmail = prof.rows[0]?.email ?? null;
    }
    res.json({
      task: {
        ...updated,
        assignee_email: assigneeEmail,
      },
    });
  } catch (err) {
    console.error("Project update task error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user?.role === "admin") {
      const del = await query(`DELETE FROM tasks WHERE id = $1`, [id]);
      if (del.rowCount === 0) return res.status(404).json({ error: "Task not found" });
      return res.status(204).send();
    }

    const projectId = await getTaskProjectId(id);
    if (projectId == null) return res.status(404).json({ error: "Task not found" });

    const access = await getProjectAccess(req, projectId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.status === 403 ? "No access to project" : "Not found" });
    }

    await query(`DELETE FROM tasks WHERE id = $1`, [id]);
    res.status(204).send();
  } catch (err) {
    console.error("Project delete task error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
